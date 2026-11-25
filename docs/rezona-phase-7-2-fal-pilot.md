# REZONA Phase 7.2 fal pilot results

22 November 2026, Asia/Baghdad. **Two real fal requests, one technical pass and one HTTP 422 failure. Pilot stopped. No automatic image acceptance, publication, production deployment or GitHub push.** This report supplements, and does not relabel, the earlier mock-only Phase 7.2 report.

## Results

Both requests used **google/nano-banana-lite/edit**, one initial generation per photograph, no retry, regeneration, Flux comparison or other provider. Only the previously reviewed TECLAST and soap isolation sources were eligible. The other four photographs were not transformed or transferred.

| Photograph and existing QA identity | Request time in Baghdad | Timing | Output and disposition |
| --- | --- | --- | --- |
| 1 TECLAST tPad packaging, `cmwqhrgat000gvt24q2ovqxge` | 19:43:38.744 | Client adapter 27.225 s; provider execution 11.171 s | 1024 × 1024 neutral background; recomposition passed technical gates; employee approval **pending** |
| 5 GUXIAOBEI soap packaging, `cmwqhrvqf003evt24nl089q68` | 19:44:14.832 | Whole worker 21.587 s; provider execution 13.960 s; exact client HTTP latency was not retained on failure | HTTP 422; no usable output or output dimensions; rejected for use, local isolation retained; billing state **UNKNOWN** |

The successful request ID is `01a20424-6932-77c3-9fe0-b6c57b0cf289`, confirmed against fal request metadata. A unique 422 record in the second dispatch window, `01a20424-f79b-7a02-bdf9-dca2ef28b069`, correlates with the soap request by endpoint, timing and status; this second ID is an **inference**, not an ID captured from its HTTP response. Provider execution excludes client transfer and local processing. Error payloads were not retained, so the specific cause of 422 is unresolved rather than attributed to content safety or invalid parameters without evidence.

## Cost

| Item | USD | Evidence and limits |
| --- | ---: | --- |
| TECLAST | 0.042409 estimated | Response billable units 0.042409 × authenticated quoted unit price 1 USD/unit |
| Soap | Unknown | No charge header retained; HTTP 422 is not treated as proof of zero charge |
| Total actual charge | **Not verified** | Billing-events API returned 403; no permissions were expanded |
| Total conservative budget commitment | 0.348160 | Two reservations of 0.174080; **not a charge or spend total** |

Known reported-cost subtotal is 0.042409 USD (about 4.24 cents), **not a verified two-request total**. No final balance or invoice is claimed. The pilot cap was 0.40 USD, daily cap 0.50 USD and monthly cap 10 USD; concurrency was one. Configured maximum regenerations was one, but this pilot allowed **zero** regenerations. The conservative reservation was based on reviewed token rates and full model ceilings, not measured consumption. These are application controls for this isolated workflow, not a guarantee against unrelated account spending. Per-request charge reconciliation requires the relevant [fal billing permission](https://fal.ai/docs/platform-apis/v1/models/billing-events); no broader key was requested.

## Visual review and preservation

The TECLAST raw output is an empty, softly lit neutral plate: no duplicated box, product text, logos or extra objects were visible. Final foreground comes from the original photograph and prior reviewed mask, **not generated RGB**. Its prepared foreground SHA-256 matches the locally composed reference exactly; visible box shape, barcode and lettering remain captured content. This is not a guarantee that small text is readable after resampling, nor evidence of the tablet inside its box. Orientation, packaging wear and original lighting remain. The improvement over the existing white local result is modest; there is no demonstrated business-quality advantage yet.

Soap has no valid provider output to judge. No claim is made about generated label/shape fidelity; the local result remains the fallback. Neither fal result received an employee ACCEPT decision or became a product image. An automated technical pass is **not** employee approval.

Original byte copies and masks match their prior hashes. Source approval was replayed only for the already-reviewed local masks. Private before/local/raw/final boards are in:

- `D:/rezona-phase7-2-qa/fal-pilot/run-84a2de4a/01-comparison.jpg`
- `D:/rezona-phase7-2-qa/fal-pilot/run-84a2de4a/05-comparison.jpg`
- `D:/rezona-phase7-2-qa/fal-pilot/run-84a2de4a/review.html`

## Safety verification and decision

The normal authenticated admin intake workflow ran against a **fresh disposable QA database**, separate from the existing six products. Its two sessions remain private DRAFTs with no completed product, quantity or location. Read-only audit found zero products, customers, wallets, orders, auctions, inventory balances/movements/allocations and warehouses in this disposable target. All media remain private and unassociated. The original six-product QA API was offline; this run does **not** claim a fresh authenticated re-audit of those existing records. No production/customer connection was used.

Backend key stayed in private backend environment configuration, outside Git and Flutter. No key values were placed in reports, logs or screenshots. Input/output history suppression and private expiring-output headers were requested, with inline transfer and no public image upload/CDN download. These settings are **not zero-data-retention guarantees**, especially for underlying-provider logging; see [fal retention controls](https://fal.ai/docs/documentation/model-apis/media-expiration) and [file access controls](https://fal.ai/docs/documentation/model-apis/file-access-controls).

336 unit tests, scoped lint and TypeScript checks passed. Durable per-source attempt markers, DB reservations, exact model/source/mask allowlists and a network fence prevent silent repeat calls. The API process was closed after the run; automatic usage remains disabled by default.

**Decision: do not expand usage yet.** One modest visual success plus one unexplained 422 is insufficient to justify broader fal processing. Employee review of TECLAST, read-only billing reconciliation and diagnosis from existing provider history should precede any separately authorized paid retry. Keep all four problematic images blocked. Do not switch models or spend more automatically.

Evidence: `docs/benchmarks/phase7-2/fal-84a2de4a/pilot-result.json`; read-only audits `postflight-1795366477968.json` (known request and billing 403), `postflight-1795366547853.json` (unique 422 metadata); final unit and lint logs. The [model schema](https://fal.ai/models/google/nano-banana-lite/edit/api), [request metadata API](https://fal.ai/docs/platform-apis/v1/models/requests/by-endpoint) and [pricing API](https://fal.ai/docs/documentation/model-apis/pricing) were checked against official fal documentation.
