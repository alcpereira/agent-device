---
'agent-device': patch
---

Answer `404` instead of `500` when an artifact download, upload ticket, uploaded artifact, or materialized path id was already consumed, has expired, or never existed. The error keeps `code: "COMMAND_FAILED"` and `details.reason: "RESOURCE_EXPIRED"`. Daemon HTTP REST error bodies, such as those on `/artifacts/*` and `/upload/*`, now also carry `reason` and `hint` when present.
