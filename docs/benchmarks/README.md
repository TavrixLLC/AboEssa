# Private evidence availability

The phase reports in this repository summarize timestamped QA and release-readiness work. Their relative links under `docs/benchmarks/` refer to **owner-controlled local evidence**, not files included in this public GitHub repository.

Raw benchmark bundles can contain private media, account or infrastructure metadata, traces, screenshots and recovery information. They have deliberately not been uploaded. The original files remain unchanged on the owner's computer; nothing was deleted by the GitHub handoff.

The next developer must request an owner-approved, sanitized evidence package through a secure channel, verify its original manifest/seal hashes, and distinguish historical results from newly performed validation. Do not copy the entire directory into Git or replace missing evidence with a claimed PASS. A seal is an integrity inventory, not an independent attestation.

See [the developer handoff](../REZONA_PHASE_9_DEVELOPER_HANDOFF.md) for the exact evidence namespaces and release artifact hashes. Credentials, signing keys, originals, database backups and DPAPI-protected files are never part of the source handoff.
