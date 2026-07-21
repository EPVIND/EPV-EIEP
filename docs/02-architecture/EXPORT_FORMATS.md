# Controlled Export Formats

Status: implemented contract for format schema version 1.

Every export is created asynchronously from an authorized, project-scoped record set. The job records its recipient organization, exact source identifiers and versions, correlation ID, manifest, UTF-8 byte count, media type, storage key, SHA-256 digest, completion time, and expiry. Download re-evaluates the recipient organization and every underlying record permission.

## JSON Lines version 1

- Media type: `application/x-ndjson`.
- Encoding: UTF-8.
- One canonical JSON object per line, terminated by LF.
- Object keys are serialized in lexical order so the same snapshot has a stable byte representation.
- Fields: `schemaVersion`, `recordType`, `recordId`, `projectId`, `label`, `state`, and `version`.

## CSV version 1

- Media type: `text/csv`.
- Encoding: UTF-8.
- Line ending: CRLF.
- Header: `schema_version,record_type,record_id,project_id,label,state,version`.
- Fields containing a comma, double quote, CR, or LF are double-quoted; embedded double quotes are escaped by doubling them, consistent with RFC 4180 conventions.

`recordId` is the stable source identifier, `projectId` preserves the owning-project relationship, and `version` identifies the exported source snapshot. A manifest entry has the stable form `<record-type>:<record-id>:v<version>`. Consumers must reject an unsupported `schemaVersion` rather than guessing field semantics.

The in-memory development adapter retains artifact text with the job. A production worker must write those exact bytes to governed object storage at `resultStorageKey`, then persist the byte count and digest before marking the job completed.
