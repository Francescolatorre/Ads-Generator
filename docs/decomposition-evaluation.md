# Qwen-Image-Layered provider evaluation and integration

Updated: 2026-11-16. The initial integration used offline tests only.
The user subsequently authorized three Runware predictions with a USD 1 total
ceiling. Live results are recorded below; a paired Replicate comparison remains pending.

## Decision and evidence

**Current configured default: Runware when its server key is present; otherwise
Replicate.** Runware has now been exercised through the complete asset workflow.
Replicate remains available with separately addressable PNG layers and a pinned
model version. This is an operational choice, not a comparative quality ranking. No automatic provider
fallback is used: that would create a second billable job without consent.

| Criterion | Replicate | Runware |
| --- | --- | --- |
| Model | qwen/qwen-image-layered | alibaba:qwen-image@layered |
| Inputs | image, num_layers, seed; PNG explicitly selected | inputs.referenceImages; settings.layers; seed; steps |
| Output | array of image URLs | one multi-page TIFF URL per generation |
| Integration setting | pinned version, go_fast=false, safety checker enabled | one result, async delivery, 30 steps |
| Polling | GET prediction by ID | getResponse with original task UUID |
| Recovery | persisted prediction ID; no resubmit after uncertain POST | persisted client task UUID; poll same task after uncertainty |
| Empirical evidence here | inspected existing public 4-layer example | three authorized live fixtures, see results below |
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
accessible. This initially left the decoder supported only by synthetic TIFF tests.
The subsequent live evaluation below verifies real four-page RGBA output.
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

## Authorized Runware evaluation

Authorization: three predictions, maximum USD 1 total. No Replicate inference,
model training, automatic retry or fallback was authorized or performed.
The runner used the existing DecompositionJobs workflow, a fixed durable request
UUID per fixture, one sequential request at a time, four layers, seed 42 and
30 steps. Each next request required a completed prior job and a known cost.
A local USD 0.25 reserve per remaining request was used against the USD 1 ceiling.
This reserve is not a provider-enforced price cap. Published example prices were
lower than the actual costs; use reported live costs for future estimates.
The runner enabled only its own job configuration, not general application access.

The original 512 x 512 fixtures are generated by `npm run evaluation:fixtures`.
Live outputs are 1024 x 1024. Raw images and private output URLs remain in the
local ignored asset store. Sanitized metrics and hashes are in
[runware-live-evaluation.json](runware-live-evaluation.json).

| Fixture | Reported USD | End-to-end seconds | RGB MAE / 255 |
| --- | ---: | ---: | ---: |
| Product | 0.1178 | 122.703 | 2.0722 |
| Contours / shadows | 0.1190 | 135.577 | 1.8383 |
| Typography | 0.1190 | 134.887 | 2.5898 |
| **Total** | **0.3558** | | |

All three submissions completed on their first attempt. Each TIFF contained four
RGBA pages; no decoder workaround or discarded preview was necessary. Returned
page order produced visually coherent reconstructions. Original manifests were
preserved. Repeated composition was byte-identical; moving the top layer changed
the image without changing the saved manifest. All three assets exported at 1:1,
4:5 and 9:16 (nine exports total).

Visual findings from source/composite/individual-layer contact sheets:
- Product: background, shadow and bottle are separable, but an additional white
  bottle silhouette is present. Moving only the colored bottle exposes it.
- Contours/shadows: background, shadow and ring separate usefully. The blue object
  and fine black contour remain grouped in one layer.
- Typography: NOVA and PURE 01 remain legible in this sample. The label separates
  from the coral object, but NOVA shares a layer with a ghosted object silhouette.
  All text remains raster pixels, not editable typography.
- Every reconstruction adds visible texture to the original flat colors. Low RGB
  error therefore does not imply exact product identity or faithful flat artwork.

Decision: Runware is suitable for the next supervised decomposition evaluation and
is preselected when configured. It is not yet approved for unattended marketing
output. Independent layers can still contain coupled content and residual shapes;
semantic naming/grouping and exact brand/text preservation remain open. The API's
qualityEvaluated flag remains false to avoid claiming general quality acceptance.

A fair real-product evaluation still needs user-chosen photographs and logos.
These three synthetic images establish integration behavior, not marketing-grade
fidelity. No claim about Runware versus Replicate quality can be made without a
paired test. All subsequent paid predictions require separate authorization.

## Validation of this change

39 tests pass, including real PNG/TIFF decoding, simulated provider transports,
payment gating, unknown submission outcomes, restart recovery, stale edits,
failed polling, malformed output, URL restrictions and original-asset preservation.
TypeScript and production build pass. Browser tests verified the locked default
and, with intercepted/mock responses only, explicit per-request consent, pending
status, reload recovery and opening the result asset. Those browser tests used
mock responses; the separate authorized live runs are documented above.
