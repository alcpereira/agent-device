import { promises as fs } from 'node:fs';

import path from 'node:path';
import { crc32, gzipSync } from 'node:zlib';
import * as tar from 'tar-stream';
import { runCmdSync } from './exec.ts';
import { mkdtempForTest } from './tmp-dir.fixtures.ts';

export async function createArchiveWorkspace(): Promise<{
  archivePath: string;
  outputRoot: string;
  root: string;
}> {
  const root = await mkdtempForTest('agent-device-archive-');
  const outputRoot = path.join(root, 'output');
  await fs.mkdir(outputRoot);
  return { archivePath: path.join(root, 'fixture.archive'), outputRoot, root };
}

export async function createTruncatedTgz(archivePath: string): Promise<void> {
  const pack = tar.pack();
  pack.entry({ name: 'payload.bin' }, Buffer.from('AB'));
  pack.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of pack) chunks.push(Buffer.from(chunk));
  const headerOnly = Buffer.concat(chunks).subarray(0, 512);
  await fs.writeFile(archivePath, gzipSync(headerOnly));
}

export async function createZipWithEncryptedSecondEntry(archivePath: string): Promise<void> {
  const staging = path.join(path.dirname(archivePath), 'zip-input');
  await fs.mkdir(staging);
  await fs.writeFile(path.join(staging, 'first.txt'), 'first');
  await fs.writeFile(path.join(staging, 'second.txt'), 'second');
  runCmdSync('zip', ['-q', archivePath, 'first.txt'], { cwd: staging });
  runCmdSync('zip', ['-q', '-P', 'secret', archivePath, 'second.txt'], { cwd: staging });
}

/** One stored zip entry; `mode` is the full Unix `st_mode`, file-type bits included. */
export type ZipFixtureEntry = { name: string; mode: number; data?: string };

/**
 * Writes a stored (uncompressed) zip whose names and Unix attributes are exactly as given, which
 * `zip` itself refuses to produce for links, special files, and escaping names.
 */
export async function writeZipFixture(
  archivePath: string,
  entries: readonly ZipFixtureEntry[],
): Promise<void> {
  const localRecords: Buffer[] = [];
  const centralRecords: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.from(entry.data ?? '', 'utf8');
    const checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE((entry.mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    localRecords.push(local, name, data);
    centralRecords.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralDirectory = Buffer.concat(centralRecords);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  await fs.writeFile(archivePath, Buffer.concat([...localRecords, centralDirectory, end]));
}

/** `pax` records are written as a PAX extended header; tar-stream's typings omit the field. */
export type TarFixtureEntry = {
  header: tar.Headers;
  pax?: Record<string, string>;
  data?: string;
};

export async function writeTarFixture(
  archivePath: string,
  entries: readonly TarFixtureEntry[],
): Promise<void> {
  const pack = tar.pack();
  for (const entry of entries) {
    const header: tar.Headers & { pax?: Record<string, string> } = entry.pax
      ? { ...entry.header, pax: entry.pax }
      : entry.header;
    pack.entry(header, Buffer.from(entry.data ?? ''));
  }
  pack.finalize();
  const chunks: Buffer[] = [];
  for await (const chunk of pack) chunks.push(Buffer.from(chunk));
  await fs.writeFile(archivePath, Buffer.concat(chunks));
}
