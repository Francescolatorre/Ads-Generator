# Qwen-Image-Layered provider evaluation and integration

Date: 2026-11-14. Status: technical evaluation and offline integration complete;
controlled paid comparison pending user authorization and credentials.
No inference request or paid API call was made during implementation.

## Decision and evidence

**Provisional default: Replicate.** Its model schema provides separately addressable
PNG layers and a concrete model version, avoiding the additional TIFF extraction
step. This is an integration decision, not a claim of better image quality or cost.
Runware is implemented as a selectable comparison adapter. No automatic provider
fallback is used: that would create a second billable job without consent.

| Criterion | Replicate | Runware |
| --- | --- | --- |
| Model | qwen/qwen-image-layered | alibaba:qwen-image@layered |
| Inputs | image, num_layers, seed; PNG explicitly selected | inputs.referenceImages; settings.layers; seed; steps |
| Output | array of image URLs | one multi-page TIFF URL per generation |
| Integration setting | pinned version, go_fast=false, safety checker enabled | one result, async delivery, 30 steps |
| Polling | GET prediction by ID | getResponse with original task UUID |
| Recovery | persisted prediction ID; no resubmit after uncertain POST | persisted client task UUID; poll same task after uncertainty |
| Empirical evidence here | inspected existing public 4-layer example | published example TIFF returned HTTP 404 |
| Paired quality/latency/cost test | pending | pending |

Primary references checked:
- https://replicate.com/qwen/qwen-image-layered/api/schema
- https://replicate.com/docs/reference/http
- https://replicate.com/docs/topics/predictions/output-files
- https://runware.ai/docs/models/alibaba-qwen-image-layered
- https://runware.ai/docs/models/alibaba-qwen-image-layered/examples
- https://runware.ai/docs/models-api/task-polling

The Replicate schema was read from the public page's embedded schema after the
plain HTTP reader returned 403. Version:
`0890ff07096bd81d93b920ac1918f29134e8053f28b31b9b42774216c80b6172`.
Inputs allow 2-8 layers and output includes PNG; output schema is an array of URLs.
Runware documents TIFF-only output for this model and 1-10 layers. The comparison
UI deliberately uses the shared range 2-8. Provider implementation/version and
configuration differences mean equal seeds are not guaranteed to yield equal
results across providers.

## Free inspection of already published files

Replicate's public office-split example requested four layers and returned four
WebP files, each 640 x 640 with an alpha channel. Pixels with alpha below 255 were
20.09%, 94.54%, 86.41% and 96.63% respectively. Compositing in returned order gave
mean absolute RGB error 2.97/255 against the resized source; reversed order gave
59.41/255. This supports preserving the returned order. It is one curated sample,
with go_fast=true, WebP compression and a resized reference; it is NOT our own
inference, a provider ranking, or proof that all cases work.

Runware's documented observatory output URL returned 404; its reference image was
accessible. Thus Runware output shape is documentation-backed and its decoder is
covered with synthetic TIFF tests, but real output semantics remain unverified.
Example prices shown on documentation pages are historical examples, not a binding
quote. Current account pricing must be checked before authorizing a live run.

## Workflow and paid-call boundary

1. `npm run evaluation:fixtures` prepares three original synthetic 512 x 512 test
   images locally: a product silhouette, fine contours/overlap/shadows, and text.
   This command never connects to a provider or incurs inference charges.
2. `npm run dev`: open a saved asset. The source is the original persisted input,
   not the current edited composition. Choose provider and 2-8 layers.
3. Server configuration defaults to locked. After approving a budget, place keys
   in gitignored `.env.local`, using `.env.example` as the template. Never put keys
   in chat, source control, or variables prefixed with VITE_. Restart the server.
4. Set `ALLOW_PAID_DECOMPOSITION=true` only after authorization. Each submission
   still requires checking the paid-consent box and pressing the paid-start button.
   One click starts one prediction. There is no automatic paid retry/fallback.
   This is per-request consent, NOT a provider-enforced dollar budget; use account
   spending controls and verify pricing before any budget-limited evaluation.
5. The UI polls the existing job every five seconds, at most ten minutes from
   creation. Manual status checking resumes polling/import without another paid
   submission. Replicate requests also send Cancel-After: 10m. A local polling
   timeout does not imply Runware stopped or that no charge was incurred.
6. Open the resulting new asset, inspect/edit its layers and export as before.
   Original bundle and edits are preserved. Layer types start as generic overlays;
   neither adapter invents semantic labels such as subject or shadow.

Server credentials never enter the browser bundle. Output downloads use fixed
provider host allowlists, HTTPS, no redirects, timeouts and size caps. The original
input is capped at 4 MiB, output files at 64 MiB each and output dimensions at
2048 per side for this evaluation workflow. Alpha and equal layer dimensions are
required. An unexpected extra preview, missing layer, flattened TIFF or corrupt
file fails import rather than silently inventing layers or dropping outputs.

## Persistence and failure behavior

A durable `.jobs/<request-id>.json` journal is created before the provider POST.
The source bundle's `decomposition-job` pointer allows reopening after restart.
Exclusive per-source locking and request IDs prevent duplicate submissions. A
lost Replicate creation response is shown as unknown; inspect the provider dashboard
before manually resolving it. No idempotency guarantee is assumed from either
provider. Failed polling leaves the existing job resumable. If download/import
fails, Check status retries only that import, never prediction creation.

A complete new bundle is published only after all layers validate and previews
render. Its source metadata records parent asset, source SHA-256, provider, model,
version, request ID, provider job ID and seed. Runware version is explicitly
provider-managed when no immutable version is returned. `evaluation.json` records
layer hashes, returned canvas size, elapsed wall time (including polling delays),
reported cost when available, and a diagnostic reconstruction error. The source
is resized to the returned dimensions and both images flattened on white for this
metric; this is not a perceptual or semantic acceptance test. Human review remains
required. The manifest format remains 1.0 with optional additive provenance fields.

Limitations: local development adapter only; no shared-service auth, durable worker
queue, account billing ledger or Runware remote cancellation. A crashed job may
require dashboard-assisted resolution. Provider JSON/errors are not dumped into
browser responses, avoiding accidental credentials/input leakage. Cached output
URLs in the local job journal may expire; successful bundles contain actual PNGs.

## Proposed authorized evaluation

Six predictions total: the same three generated fixtures through each provider,
four layers, seed 42, one attempt each. Proposed spending ceiling: USD 2 total,
subject to checking actual account prices before each submission. If that ceiling
cannot be established from account pricing/spend limits, stop rather than assume.
No automatic retries. A fair real-product evaluation should follow with user-chosen
images after this smoke test; synthetic fixtures alone cannot establish marketing
quality.

Record request/version/options, billable cost, provider and end-to-end timing,
reconstruction error and visual inspection on light/dark backgrounds. Review
product identity, text correctness, alpha halos, shadow separation, behavior when
moving/hiding layers and whether the layers are useful for reuse. Mark failures
and ambiguous outputs explicitly. Final default/provider choice remains pending
these measurements and human review.


## Validation of this change

39 tests pass, including real PNG/TIFF decoding, simulated provider transports,
payment gating, unknown submission outcomes, restart recovery, stale edits,
failed polling, malformed output, URL restrictions and original-asset preservation.
TypeScript and production build pass. Browser tests verified the locked default
and, with intercepted/mock responses only, explicit per-request consent, pending
status, reload recovery and opening the result asset. No paid provider was contacted.
