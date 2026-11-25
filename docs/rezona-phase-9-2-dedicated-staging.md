# REZONA Phase 9.2 — dedicated protected staging proposal

2026-11-25, Asia/Baghdad · evidence `acc6c8d1` · **INFRASTRUCTURE PROPOSAL COMPLETE / HOST APPROVAL PENDING**.

**Staging: FAIL / NOT PROVISIONED. Production: NO-GO.** The owner selected a separate staging server, but supplied no dedicated host or authorized provider/configuration/price. The spare-host question is pending; absence of an answer is not evidence that no spare exists. This phase therefore finishes the infrastructure proposal and stops before ordering or deployment, as expressly required by the Phase9.2 prompt.

No production connection, purchase, cloud account change, remote provisioning, migration, restart, storage/credential/DNS/firewall change, GitHub push, paid inference, APK build/install or publication occurred. Only public pricing reads and local proposal/evidence/document preparation were performed. Existing application source is unchanged. Completed Phase9.1 workloads were **not rerun** or relabeled as dedicated HTTPS staging.

## 1. Evidence reused, not repeated

- [Current staging ledger](rezona-protected-staging-acceptance.md), [Phase9 packet](rezona-phase-9-production-launch.md), [cutover checklist](rezona-phase-9-cutover-checklist.md), [monitoring specification](rezona-phase-9-post-launch-monitoring.md).
- [Phase9.1 immutable results](benchmarks/phase91-envelope/786dbfa4/final-validation.json), [measured envelope](benchmarks/phase91-envelope/786dbfa4/provisional-resource-envelope.json), [last live continuity](benchmarks/phase91-host/158d63fa/continuity.json).
- [Release-hardening report](rezona-admin-production-release-readiness.md), [backend artifact](benchmarks/admin-production-hardening/130f0653/backend-image-artifact.json), [signed Admin](benchmarks/admin-production-hardening/130f0653/signed-admin-artifact.json).

All files referenced by the Phase9.1 evidence seal and its prior canonical report were verified before preparation. The Phase9.1 report was archived without overwriting it: [exact prior report](benchmarks/phase92-infrastructure/acc6c8d1/prior-staging-acceptance-phase91.md). Current/historical status is distinguished in the canonical ledger.

## 2. Proposed host — not selected or certified

| Requirement | Proposed minimum / acceptance condition |
| --- | --- |
| CPU | Four vCPUs, Linux/amd64; shared-vCPU performance must be measured, not assumed dedicated cores |
| Memory | At least8GiB =8,589,934,592 bytes, verified after boot |
| Disk | At least100,000,000,000 persistent SSD bytes; prefer included160GiB when choosing the quoted plans |
| OS | Supported64-bit Ubuntu24.04LTS candidate; actual OS/kernel/security scan and updates before acceptance |
| Runtime | Docker Engine+Compose with verified cgroupv2 CPU/memory/swap/PID/log limits and storage controls |
| Network/access | Dedicated owner-controlled VM/address, provider firewall, restricted SSH, approved HTTPS/private access and mobile-compatible strong authentication |
| Recovery | Persistent volumes, restricted coordinated backups, separately approved encrypted off-machine destination and tested restore |
| Heavy workloads | ONNX/neural segmentation, fal/other paid dispatch, push/payment integrations and automatic promotional publishing OFF |

“Dedicated” means a separate VM devoted to staging, not a claim of bare-metal tenancy or dedicated physical CPUs. Do not choose ARM: the prepared backend is amd64. No provider, account, host/IP/user/fingerprint/DNS name is invented. If an existing spare is supplied, first assess ownership, actual hardware/architecture, current data/services, recovery access and permission scope **read-only**; do not reinstall, repartition or erase it to make it fit.

### Resource starting point from actual Phase9.1 measurements

| Component | Initial memory ceiling | CPU ceiling | Existing local evidence |
| --- | --- | --- | --- |
| API+in-process workers | 1024MiB | 1.00 | Peak274.2MiB in bounded synthetic upload/variants/CLEAN test |
| PostgreSQL | 512MiB | 0.50 | Peak125.2MiB including small synthetic restore |
| Redis | 128MiB | 0.25 | Peak8.3MiB; maxmemory64MiB/noeviction/AOF |
| S3/Silo evaluation | 768MiB | 0.50 | Peak405.6MiB in scoped synthetic S3/recovery workload |
| Temporary probe slot | 512MiB | 0.50 | Ceiling configured; separate peak not captured |
| HTTPS gateway budget | 128MiB | 0.15 | Provisional, not tested |
| Monitor/watchdog budget | 128MiB | 0.10 | Provisional; only pure stop-policy tests completed |

Steady four services total2432MiB/2.25cores. All reserved slots total**3200MiB/3cores**, leaving4992MiB of an8GiB host before OS/daemon/unbudgeted overhead. This supports initial planning, **not certification**. It was three sequential low-entropy12MP synthetic images, not5MiB complex photos, concurrent staff, large backfills or restored production workloads. No representative remote CPU/I/O measurement exists. Local PG16.14/Redis7.4.10 do not establish parity with last observed production16.15/7.4.11; pin/review appropriate versions on the new host.

Serialize history restore/migration and application acceptance. The migration image reuses the API1024MiB/1core slot while normal API is stopped. A separate offline history-PG process may reuse the temporary512MiB slot; do not add unbudgeted parallel clusters/probes. An on-host identity platform or larger monitoring stack may exceed reserved slots: revise sizing before installing it, never silently consume remaining RAM.

The old same-server6GiB available-memory stop threshold must **not** be copied blindly onto an8GiB dedicated host. Derive dedicated-host thresholds from the selected stack/OS footprint and measured reserve. A2GiB available-memory guard is only an initial design candidate, not an approved SLO. No I/O ceiling, production-sized restore time or throughput is fabricated. Run a bounded scratch-volume I/O/recovery test after host authorization; if quotas, latency, queues, restore or memory headroom fail, revise resources or upgrade only with a new price approval.

### Disk layout planning

For nominal100GB (about93.13GiB), a provisional82GiB allocation fits before filesystem overhead: OS/images32GiB, stage data32GiB, restricted backup workspace8GiB, scratch8GiB and logs2GiB; retain the remainder for reserve/metadata. This is a reviewable budget, not a partition command or a quota already enforced. On a160GiB plan, keep initial limits and reserve rather than filling the extra disk.

Place PG/Redis/S3/uploads, recovery and scratch on genuinely bounded filesystems/quotas selected for the actual new host. Bound writable layers and logs too; rotated container logs do not cap media/WAL. Restore encrypted snapshots only into their reviewed namespace. Build Linux images off-server and transfer verified archives; no on-host Docker build/cache growth as a hidden workload. Do not repartition a spare host without explicit disk authority. Provider IOPS/throughput and application-safe I/O rates remain NOT VERIFIED.

## 3. Public-price shortlist — no order authorized

Checked2026-11-25. These are public list figures, **not checkout quotes, available-stock guarantees, tax-inclusive totals or owner-approved spending**. No currency conversion or promotional credit assumption.

| Option | Public specification | VM per month | Optional provider backup example | Approval status |
| --- | --- | --- | --- | --- |
| DigitalOcean Basic / Regular | Four vCPUs,8GiB,160GiB SSD | **US$48**; listed hourly$0.07143 | Weekly20%=$9.60; VM+weekly backup **$57.60**, before exclusions | NOT APPROVED; region/availability/checkout pending |
| Akamai/Linode `g6-standard-4` | Four vCPUs,8192MiB,163840MiB disk | **US$48**; listed hourly$0.072 | Public add-on$10; VM+backup **$58**, before exclusions | NOT APPROVED; region/stock/checkout pending |
| Hetzner CPX32, alternative quote candidate | Four AMD vCPUs, vendor8GB/160GB NVMe | **UNKNOWN — no current numeric first-party compute quote verified** | UNKNOWN total; do not extrapolate stale/search-snippet prices | Not eligible for price approval until owner console quote |

DigitalOcean figures and bundled IPv4 inclusion come from its [official Droplet price page](https://www.digitalocean.com/pricing/droplets); weekly backup percentage from [official backup pricing](https://docs.digitalocean.com/products/backups/details/pricing/). Akamai figures were captured by unauthenticated GET of its [public type catalog](https://api.linode.com/v4/linode/types/g6-standard-4); [recorded quote](benchmarks/phase92-infrastructure/acc6c8d1/linode-public-catalog.json) includes regional price overrides. For example, Jakarta/SãoPaulo overrides must not be priced at the default$48. Frankfurt `eu-central` appeared operational in the public region catalog, not proof that this plan is orderable there. No region is selected.

Hetzner's [first-party product page](https://www.hetzner.com/cloud/regular-performance/) exposes CPX32 specifications but no usable numeric compute price in this read; the earlier price-adjustment URL returned404. Its [Primary IP documentation](https://docs.hetzner.com/cloud/servers/primary-ips/overview/) verifies IPv4€0.50/$0.60 monthly excluding VAT, **not a complete server quote**. No third-party number was substituted for a current first-party price.

Excluded from the quoted examples: taxes, excess bandwidth, optional volumes/snapshots, independent application-aware off-machine backup storage, paid identity/monitoring services and any setup/one-time charge. Their costs require approval, not silent add-ons. Provider VM backups are supplementary, not proof of a coordinated PostgreSQL/S3/Redis recovery point. [Hetzner's backup guidance](https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/) explicitly distinguishes running-disk consistency and attached-volume coverage. No provider backup was enabled.

Recommendation: assess any owner spare first. Otherwise either verified$48-class option is a reasonable **initial** candidate; prefer an existing owner-controlled account with suitable recovery/access/region. Neither performance nor Iraq-to-region latency is measured. Obtain the final region-specific price/tax/backup selection and spend ceiling before ordering. Do not choose a supposedly cheaper unverified quote or upgrade merely to run disabled AI workloads.

## 4. Proposed architecture — exact design names, not existing resources

Proposed project `rezona-stage-p92-acc6c8d1`. Paths below would exist **only on the separately authorized host**:

- Release/config: `/opt/rezona-staging/p92-acc6c8d1`.
- Owner-only secrets: `/etc/rezona-staging/p92-acc6c8d1/secrets`.
- Bounded data: `/srv/rezona-staging/p92-acc6c8d1`.
- Restricted recovery workspace: `/srv/rezona-staging-backups/p92-acc6c8d1`.

| Component | Connectivity / isolation contract |
| --- | --- |
| HTTPS gateway | Approved private/MFA-equivalent ingress only; fixed API upstream, no arbitrary proxy or browser-only challenge assumed mobile-compatible |
| API | Non-root, no Docker socket, read-only root where supported, bounded tmpfs, private backend network; actual API/workers same immutable image |
| PostgreSQL | Separate instance/data/credentials; hostname alias `postgres`, operational DB `live_commerce` because existing entrypoint fixes these names; never connected to production PG |
| Offline history/rehearsal | Separate network/service or unmounted offline volume; operator-only while migration/data checks run, never reachable by the operational API |
| Redis/BullMQ | Stage-only instance/AOF/credentials; isolated endpoint and queues, no production Redis/job import into a running scheduler |
| S3 | Stage-only service/data; private `aboessa-media` bucket on this new service, restricted non-root application identity and separate operator/recovery identity |
| Monitor/recovery | Private telemetry/backup paths, approved receiver/destination; new exact-project/ID stop allowlist and measured thresholds |

Public IP, DNS name, SSH account, fingerprint, actual volumes and containers remain **UNASSIGNED / NOT CREATED**. Reusing a literal bucket/database/queue name in a wholly separate service does not mean sharing data; validate actual endpoints/network/mount IDs, not naming alone. Recovery buckets are excluded from application IAM. Keep historical and synthetic data lanes separate even within staging.

### Network and strong-access policy

Provider+host ingress default-deny; allow SSH only from owner-approved operator sources with verified recovery-console access. Expose443 only through the approved private/VPN or mobile-compatible strong-access design. Port80 stays closed unless a separately reviewed TLS validation/redirect mechanism requires it. Never publish5432/6379/9000/9001, Docker API, metrics or debug endpoints. Gateway is the only edge-connected service; API/data stay on a distinct internal backend network. Explicitly deny stage access to production endpoints and private data networks; allow only narrowly approved maintenance/renewal/alert/backup traffic from appropriate operator processes.

Test actual Docker/provider/host reachability, including IPv6 and container-to-host routes. [Docker's firewall documentation](https://docs.docker.com/engine/network/packet-filtering-firewalls/) explains why published container traffic is not reliably controlled by UFW alone. Do not disable Docker firewall rules to make a test pass.

Strong Admin protection is **not selected/accepted**. Proposed option: owner-approved device-authenticated private access backed by MFA identity, plus existing application JWT/session/RBAC; or another reviewed Android-compatible equivalent. A browser redirect/login page or reused SSH password is not automatically suitable. Prove login/refresh/private previews/sockets from Admin and the old Customer binary over Wi-Fi/hotspot. Approve any identity product, agent, resource budget, cost, account and device changes separately. No production TLS private key, JWT secret, fal/payment/push credential or copied live session is reused.

## 5. Verified artifact and Stage A configuration contract

Backend **v2 only**: `rezona-admin-rc:130f0653-v2`, identity `sha256:37dcaa839917c81b33fbd7e51915ecea8b056dde68949a8db6189469e5ac4e48`; archive SHA-256 `9627212a7f6c1b0637f44c1a145a17df8e8a99c9938b75a446a8dd7a31754480`. Reverify after transfer/load; do not assume a local RepoDigest is remotely pullable. Never deploy v1. Linux/amd64 and native runtime/security scans must pass on selected infrastructure. Source changes needed for acceptance require a new immutable candidate and scoped security/regression revalidation, not old evidence relabeling.

Use production-equivalent validation, `NODE_ENV=production`, actual entrypoint and stage-specific HTTPS/API/socket/CORS/secrets. All20 code-backed template cards remain browsable. Keep dispatch/live/mock approvals, paid fal/recognition/editing, neural processing, QA gallery/prepaid-experiment endpoints and automatic promotional publication OFF. Manual factual review/original fallback remains. Block external integrations both in configuration and network; setting a flag alone is not an egress proof. No secrets in Flutter, Compose dumps, source, public logs or reports.

## 6. Data and migration sequence — blocked, not executed

No dedicated host means no snapshot transfer, restore, anonymization or migration in this phase. Last live baseline is the Phase9.1 read-only observation:19 applied versus40 source,21 pending; six products/23 auctions/three orders/19 customers/ten FileAssets/11 wallet entries. This timestamped evidence is not “live now”; revalidate only when necessary using already-authorized read-only access before a real rehearsal. No production SSH was opened for this proposal.

Historical checksum mismatch `202609190001_auction_optional_featured_rarity` remains **UNRESOLVED**: DB `fff0ea...fdbb03`, source/deployed/retained archives `438874...5556b5`. Independent structural equivalence is supporting evidence, not a fabricated cause or formal disposition. Require a named DBA/owner-reviewed record of evidence, chosen non-destructive handling, residual risk, pinned-Prisma behavior and approval before19→40. No history edit/resolve/reset/db push/migrate dev.

Approved-host sequence:

1. Verify encrypted snapshot integrity, source scope/age, restore tooling and applicability. Existing DPAPI backups require owner Windows recovery access; do not assume files copied elsewhere are decryptable. Confirm selected provider/region/data-transfer authority.
2. Prefer protected local anonymization before cloud transfer. Inventory PII in customer/admin/contact/address/shipment/device/audit/free-text/JSON/media metadata and any sensitive images; do not sanitize only obvious phone fields. Replace stage identity credentials, invalidate copied sessions/token material, disable production-facing device/webhook/integration state. Keep originals protected; do not alter original product photographs to redact an unrelated field.
3. Preserve a restricted offline historical19 baseline and its hash/aggregate reconciliation. Use a separate maintenance-only copy for the formally approved19→40 rehearsal. Record migration/lock/time/resource/error recovery and media reference results. Do not expose an unanonymized clone to staff/public apps.
4. Operational app acceptance uses a **separate synthetic dataset and credentials**, not transactions on copied customer wallets/orders. Historical data checks run on the protected clone with writer/job safety established first. The existing API uses `postgres` credentials by entrypoint and includes in-process auction workers: merely naming another DB is not access isolation, and there is no demonstrated global “disable all workers” switch. Keep the history cluster off the API network or offline; do not boot against it assuming copied auctions cannot close.
5. Rehearse legacy inventory dry-run/reconciliation only via authorized Phase4/5 services, with current reviewed quantities, pending-order exceptions and owner-confirmed physical mapping. No guessed receipts/locations or ledger edits. Synthetic fixtures must be clearly identified and separate from historical financial data.
6. Seal before/after customer/order/auction/wallet/stock/media aggregates and explain every expected anonymization/test delta. Rehearse restart/replay and compatible recovery; pre-inventory code cannot resume mapped stock writers.

Formal history disposition, actual19→40 timings/locks, real staging anonymization and inventory rehearsal are **NOT DONE**. Prior empty-schema/small synthetic restore timings are not substituted.

## 7. Storage acceptance plan

Evaluate the previously pinned maintained Silo candidate only as staging storage; no production adoption is implied. Confirm current maintainer release/advisory/license/support status, ownership of AGPL review and applicable image/OS scan before using it as the release solution. No live MinIO image/data volume is modified.

Extend the existing local partial tests on the real staging service: restricted app PUT/GET/HEAD/DELETE; anonymous and wrong-employee/account denial; cross-bucket actions against an **existing** second bucket; forbidden admin/policy actions; MIME and complete custom metadata; real original/variant/source/mask/candidate lineage; authenticated private preview; revoked/public access; backup/restore; storage outage/retry/recovery and AWS SDK semantics. Root/operator credentials are never application credentials. Test bytes/hashes/reference counts, not UI success alone.

Current result is **NOT VERIFIED ON DEDICATED STAGING**. Phase9.1's30-object synthetic hash/MIME restore and scoped403 tests remain limited historical subchecks, not complete IAM/failure/real-photo acceptance.

## 8. Mobile and unchanged released Customer acceptance

Signed Admin1.1.0(3) remains the known artifact: package `com.singlestore.admin_app`, certificate SHA-256 `2b768b09c968ba8ebcb3652d959f3e7936ffa143f601a27504dd7d274808850a`. Prepare a separate staging-HTTPS artifact only after the hostname/protection is known. Existing release guards require `APP_ENV=production` and `lib/main.dart`; this can still point to an approved HTTPS staging endpoint, but must be clearly labeled in its artifact manifest. Current Gradle has no accepted production-signed staging suffix. Do not reuse QA flags, silently replace a debug/production install or relax release guards. Decide separate test device versus a separately reviewed flavor/identity change before building/installing. Device-owner permission, installed certificate/version comparison and draft/journal preservation remain mandatory.

Important discovered routing constraint: current Customer DI reads `API_BASE_URL`/`SOCKET_URL` at **compile time**. Server env cannot retarget an unchanged released APK. Identify the exact shipped artifact/version/hash and its routing behavior first. Owner must approve a genuinely test-device-only routing/TLS approach where supported; never globally redirect production DNS, disable certificate validation, reuse the production TLS private key or call a recompiled client the unchanged released binary. Until a safe method is accepted, old-APK staging compatibility remains BLOCKED. A build from the same old source with different defines is supplemental source/contract evidence only.

Actual acceptance must cover auth/guest/sessions, categories/Arabic search/pagination/images, sockets, duplicate/intake, NEW/STOCK_IN, synthetic COD/wallet/auction/order/shipping/refund races, privacy and all20 template/review flows. Paid generation is never part of StageA acceptance. No device or network setting was changed here.

## 9. Monitoring and coordinated recovery

Reuse the [monitoring specification](rezona-phase-9-post-launch-monitoring.md), not its missing success claims. Measure API latency/errors, authentication/permission failures, PG connections/locks/slow operations, Redis/BullMQ backlog/age/failure, S3/upload/variant failures, CPU/RSS/disk/I/O, TLS/backup freshness and inventory/financial reconciliation. Select a lightweight stack compatible with measured budgets; a full identity/dashboard stack is not assumed to fit128MiB.

Configure an owner-approved actual alert receiver/channel and verify delivery/acknowledgment/recovery with staging-only faults. No alert recipient exists yet; no message was sent as a “test alert”. Adapt and test the exact new project/container allowlist before a watchdog can act. Never give the API the Docker socket or a broad stop/prune permission.

Back up DB/S3 originals+variants+masks/candidates/metadata/policies, Redis/in-flight jobs and matching configuration consistently, encrypt the off-machine copy with an approved recoverable key and restore into a fresh stage target. Test worker/database/S3 failure, crash/replay, current-schema-compatible backend recovery, private media and stock/wallet/order integrity. Measure actual full recovery duration/RPO boundary, not only `pg_restore` runtime. Retain UNKNOWN paid commitments; zero new paid dispatch does not reconcile historical ambiguity. No rollback acceptance from a synthetic-only local restore.

## 10. Explicit host/provisioning handoff required

If a spare exists: supply provider/host label, specifications, existing workload/data status and ownership; then provide the established SSH profile/key **path** plus independently verified public host-key fingerprint through the owner-controlled local channel. Do not paste passwords/private keys. Approve read-only assessment first; write/format/firewall scope comes after that assessment.

For a new paid host, owner must explicitly confirm **provider + exact plan + region + architecture/OS + base price + selected backup/add-ons + taxes/checkout total + monthly/one-time spend cap**, then authorize creation and stage-only access configuration. Public list prices are not that authorization. No server will be ordered from “c”, silence, a general “continue” or this planning document.

After the owner creates/authorizes the host: record actual assigned IP, named SSH account/profile, fingerprint, recovery console and ownership; reject production IP `217.76.54.57` as a staging target. Select an owner-approved FQDN/DNS/TLS/strong-access design, operator source CIDRs, alert recipient, backup destination/cost and device strategy. Present exact changes before executing them. Do not rotate production credentials or modify production DNS/firewall/nginx.

### Intended implementation order after authority

Assess approved host read-only → approve exact write/disk/ingress scope → secure access/recovery/updates and scans → bounded isolated data/runtime/secrets/network → reverify/load pinned candidate → protect/anonymize offline dataset → resolve history formally → timed19→40+inventory/media checks → synthetic app acceptance under approved HTTPS/MFA → approved physical old/new client tests → real alert and failure/recovery drills → complete acceptance ledger. Stop at any failed gate. Only a later accepted staging packet can inform the separate Phase9 production decision; no production cutover is authorized here.

## 11. Current acceptance decision

| Required gate | Result / actual evidence |
| --- | --- |
| Specifications/proposal | PASS as planning only;4vCPU/8GiB/100GB minimum, not certified |
| Provider/price/host/access approved | FAIL / missing; public quote evidence is not owner approval |
| Dedicated host provisioned/isolated | NOT RUN / no host supplied |
| Secure HTTPS/MFA/network/IAM | NOT VERIFIED on a host |
| Formal history disposition | UNRESOLVED |
| Actual19→40 / reviewed inventory rehearsal | NOT RUN |
| Complete storage/IAM/failure acceptance | NOT RUN on dedicated staging |
| Admin/Customer/old binary compatibility | NOT RUN; routing/identity decisions pending |
| Signed physical device/network | NOT RUN / no permission inferred |
| Representative resource/I/O limits | NOT MEASURED on dedicated host |
| Monitoring and delivered alerts | NOT RUN / receiver unassigned |
| Full coordinated recovery/rollback | NOT RUN |
| Production preserved this phase | PASS scope evidence: no production connection or mutation by this preparation; not a new remote-state audit |
| Overall staging | **FAIL / NOT PROVISIONED** |
| Overall production | **NO-GO** |

Machine proposal, quotes and preserved reports: [acc6c8d1](benchmarks/phase92-infrastructure/acc6c8d1/manifest.json). The exact next step is owner-provided spare-host details **or** explicit approval of one final provider/configuration/price and its staging access scope. No additional paid or infrastructure action is automatic.
