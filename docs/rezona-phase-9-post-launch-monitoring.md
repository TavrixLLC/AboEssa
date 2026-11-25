# REZONA Phase 9 — monitoring and staff acceptance specification

2026-11-25 · **PLANNED / NOT DEPLOYED / ALERT DELIVERY NOT VERIFIED**.

No production launch occurred. This document is a dashboard/acceptance specification, not proof of an operational monitoring system. [Launch review](rezona-phase-9-production-launch.md) is NO-GO. No telemetry endpoint, cloud service, agent, dashboard account or alert recipient was invented/provisioned.

## Dashboard and evidence contract

| Panel | Required signals | Current evidence / missing work |
| --- | --- | --- |
| API/customer | health+ready, requests, status/error rate, latency percentiles, route family | Fresh existing-production ready200/TLS success only; no time series or accepted latency/error threshold |
| Admin/security | login failures/429, session refresh/reuse/revocation, permission/ownership denials, private-media denials | Local guard/RBAC tests; actual multi-instance/MFA/alert acceptance missing |
| PostgreSQL | connections/utilization, locks/long transactions, slow queries, migration/checksum status | Earlier19-migration baseline; fresh capacity/lock/slow-query observation missing |
| Inventory/financial | reconciliation violations, per-location allocations/reservations, ledger arithmetic, wallet/order aggregate deltas | Earlier local integration/dry-run, not current continuous reconciliation |
| Redis/BullMQ | Redis readiness/memory/persistence, waiting/active/delayed/failed/stalled/repeated jobs, oldest age, processing latency | Queue names/contracts must be inventoried from actual running version; no measured backlog baseline |
| Media | authenticated S3 canary, denied anonymous/cross-owner access, failed uploads/variant jobs, processing age, storage growth | Local ten-object restore plus eight-variant tests; restricted principal/live canary/recovery alert unrun |
| AI Studio | admission/request/outcome counts by safe model/template ID; pending/UNKNOWN/reservations; estimated versus reconciled charges; permitted remaining spend; employee decisions; latency | StageA paid dispatch OFF; no production admission/billing pathway. Historical known batch $0.254955 does not resolve historical UNKNOWNs |
| Infrastructure | CPU, RAM/RSS, swap/pressure, disk free/inodes/IO, Docker/log growth | No accepted peak/capacity or same-server safety baseline |
| Recovery | DB+media+jobs/config backup age, hash verification, off-machine recovery, restore drill age/duration | Earlier local encrypted restores only; no current coordinated recovery/off-machine sign-off |
| TLS | certificate chain/hostname/expiry, renewal failures | Current certificate expiry 2027-01-30 11:24 UTC; renewal and alert delivery not demonstrated |
| Staff workflows | intake/photo timing, abandoned drafts/errors, restart recovery, stock correctness, review acceptance | No signed-release employee/physical-network acceptance in Phase9 |

Keep API availability distinct from `/ready`: current readiness checks DB+Redis, not S3, all queues, backup freshness, neural runtime or successful customer purchases. A container healthcheck alone is not alert delivery. Do not expose private monitor endpoints publicly or apply Admin-only protection to customer APIs.

## Threshold selection — deliberately not fabricated

Before GO, record baseline sample window, workload/device/network, peak and accepted p95/p99 latency, error denominator/window, RSS peaks/headroom, queue age/backlog and worst accepted processing envelope. Derive CPU/RAM/disk/IO/log limits from production baseline plus staging load and backup/restore headroom. Record a named approver and evaluated operating margin for each threshold. No numerical production performance SLO or staging suitability is claimed here.

Non-baseline safety conditions can be specified now: any unauthorized private-media exposure, negative/mismatched stock or unexplained financial change, successful unauthorized access, unexpected StageA paid dispatch or unresolved new paid outcome triggers a stop/escalation. They do not authorize automatic data repair, refunds, retries, rollback, credential rotation or app restart. Distinguish expected rejected auth attempts from a successful boundary violation.

For every alert rule store: signal/query source, scope/version, calibrated threshold/window/severity, recipient/on-call owner, suppression/dedup behavior, safe investigation link, tested timestamp and acknowledgment/recovery evidence. All required recipient/threshold fields currently remain **UNASSIGNED/NOT MEASURED**, so alert readiness FAILS.

## Delivery and failure rehearsal

Use only protected staging/synthetic records to inject failures. Do not stop or corrupt production to test alerts.

- [ ] Verify current-version API/worker metrics/log ingestion with safe correlation IDs, no payload logging.
- [ ] Simulate unavailable API, DB/Redis/S3 dependency failures, stalled/failed variant job, bounded queue overload, disk/resource warning and old backup/TLS warning without changing the live host clock/data.
- [ ] Verify actual alert delivery to the owner-approved receiver and record acknowledgment/recovery, delivery latency, dedup and monitoring-service failure behavior. A rule file, console print or test PASS is insufficient.
- [ ] Exercise RBAC/private-media denials and a synthetic invariant violation on staging; preserve evidence, never mutate immutable live history.
- [ ] With mocked transport only, test StageA unexpected-paid-admission rejection, UNKNOWN no-redispatch/reservation retention and kill-switch behavior. No paid calls to prove monitoring.
- [ ] Demonstrate that disabling dispatch stops new admission but cannot cancel an already accepted external provider request. Reconcile in-flight work before declaring spending stopped.
- [ ] Show queue crash/restart recovery preserves durable identity and does not double NEW/STOCK_IN/stock/wallet operations. Verify no automatic paid retries, alternate models or UNKNOWN release.
- [ ] Run a coordinated restore/compatible rollback drill and measure RTO/RPO with explicit inventory, media and financial checks before reopening staging writers.

Do not install agents, send email/messages or use external monitoring services without the approved change/recipient scope. No actual alert was sent by this review.

## Privacy and retention

Allow only bounded counters, durations, safe error codes and internal correlation/model/template IDs. No API keys/JWTs/passwords, account secrets, customer names/phone/addresses, raw images, base64, provider response bodies, signed/private/unrestricted image URLs or SQL bind values. Restrict raw infrastructure metrics and migration reports to operators; safe staff summaries need not expose customer identifiers. Set retention/rotation/disk quota from measured capacity and policy before deployment. Prevent audit/telemetry from becoming an uncontrolled source-photo export.

## Controlled employee acceptance after authorized release

Named first operators and devices are still **UNASSIGNED**. Device migration/installation and normal physical stock actions need their own authority. Start with the approved small group; expansion owner/window/duration are to be agreed after staging, not invented now.

Observe camera-first intake, visible-information/manual metadata, duplicate review, user-entered pricing, real warehouse selection/receipt, original/local fallback, all20 templates, manual accept/reject and restart/draft recovery. Paid generation is excluded from StageA and needs separate StageB approval/consent/billing pathway. Promotional approval is not factual-primary selection or publication.

Measure complete end-to-end intake/photo workflows with comparable product/task conditions, timestamps, error/abandon counts, stock reconciliation and employee feedback. Do not claim speed improvements from partial steps or widget tests. For later StageB measure actual reconciled cost per employee-accepted promotional image, counting billed rejections and retaining UNKNOWN uncertainty separately.

## Incident handoff

Use the stop/recovery rules in the [cutover checklist](rezona-phase-9-cutover-checklist.md). First preserve evidence, disable affected admission/fence unsafe writers, then choose an approved current-schema-compatible recovery. Never automatically roll back to the old pre-inventory API, flush Redis, rewrite balances or restore a DB without a separately approved incident/data-loss decision. Record incident owner, exact image/config, external outcomes, loss/recovery estimate, invariant reconciliation and reopen authorization.
