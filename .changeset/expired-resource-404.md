---
'agent-device': patch
---

Answer `404` instead of `500` when an artifact download, upload ticket, uploaded artifact, or materialized path id was already consumed, has expired, or never existed. The error keeps `code: "COMMAND_FAILED"` and `details.reason: "RESOURCE_EXPIRED"`. Daemon HTTP REST error bodies, such as those on `/artifacts/*` and `/upload/*`, now also carry `reason` when the error has one, and a `hint`. A host lease allocation on `/admin/leases` that a human-control hold refuses, and a `/rpc` call whose handler throws that refusal, now answer `423` instead of `500`, like a `/rpc` call that returns it.
