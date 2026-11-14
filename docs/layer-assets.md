# Layer Asset foundation: architecture and decisions

## Repository audit (2026-11-14)

Base commit: `1a7d23230421dae02ec083d4e2873a74d3ea8299`.
The application is React 19 + Vite 6, but its UI is at the repository root
(`App.tsx`, `components/`, `services/`), not `src/app`. The existing flow reads
an upload into browser memory, calls Gemini `gemini-2.5-flash-image` separately
for each placement, and returns flat image data URLs. There is no database,
authentication, job queue, backend deployment or durable generation history.
The Gemini key is injected into browser code by Vite; this is a local prototype,
not a secure public deployment pattern.

`src/lib/layerAsset` and `src/cli/layerasset.ts` already existed. Four tests passed,
but `tsc` failed: Sharp does not implement an overlay `opacity` option. Import
copied arbitrary image files instead of normalizing RGBA, validation checked only
file existence, paths were unrestricted, init could overwrite a manifest, and
transformed layers were not clipped. `index.html` lacked its application module
entry, so the original Vite build emitted only HTML. These are corrected.

## Decision: app workflow with a small local Node adapter

Keep the reusable Node/Sharp library. Vite development middleware in
`src/server/layerAssets.ts` connects the existing UI to it; no new web framework
or second application is required. The `LayerAssetPanel` appears in development
only. Upload -> persist source + initial background -> import already separated
layers -> edit transforms/opacity/order -> save -> render -> export is usable
without an AI key. A single flat source is explicitly NOT a decomposition.

The existing Gemini generation flow remains separate; it does not automatically
create bundles or claim that generated advertisements contain editable objects.
Source images and imported layers are converted to oriented, sRGB RGBA PNGs.
The normalized source remains independent of later layer edits.

Keep the existing CLI for batch imports, diagnostics and future provider evaluation.
It is not the primary user interface. Fixed Node 22 launch (`--import tsx`) and
readable nonzero error exits. Invoke it from the checkout with
`node bin/layerasset.js --help`; no global installation is required.

The local API is available only under `npm run dev`, bound to 127.0.0.1. Generated bundles are excluded from Vite file watching to prevent reloads and
Windows directory locks during publication. It checks
Host, same-origin requests and a custom request header, and never accepts client
filesystem paths or provider URLs. Uploads are capped at 20 MiB and decoded images
at 8192 x 8192 pixels; bundles contain at most 64 layers. Do not expose this dev
server as a shared service. Production needs authentication, authorized storage,
quotas, isolated image processing and a proper server adapter. The static build
intentionally excludes the local editor/API. `npm run preview` is not the editor.

## Bundle v1.0 semantics

- `manifest.json` is the versioned canonical contract. Zod validates reads and
  writes; TypeScript types are derived from it. Unsupported versions fail.
- `layers/<uuid>.png` are immutable, normalized sRGB RGBA artifacts. File names use
  forward slashes on all platforms. `source/input.png` stores the normalized input
  created by the app. `masks/`, `previews/`, `exports/` retain the existing layout.
- Layer IDs must be unique. Asset IDs are safe filename components. Paths must be
  relative and cannot contain traversal, drive names or symlink components.
- Full validation decodes every referenced layer, mask and source; layers must be
  single-frame RGBA PNG. Invalid imports fail before the manifest changes.
- Manifest replacement uses a temporary file and rename. Asset initialization is
  exclusive. Layer imports and UI edits acquire an exclusive `.write-lock` file;
  competing writers fail rather than lose updates. The app additionally compares
  a manifest SHA-256 revision to reject stale edits (HTTP 409). Direct library
  read/modify/write callers must use `mutateBundle` too. After a process crash,
  remove a stale lock only after verifying no writer is running. This is not a
  database or a filesystem security boundary against hostile local processes.
- Rendering sorts by ascending `z_index`, using manifest array order for ties.
  Scale is applied first, rotation second, then integer-rounded x/y place the
  top-left of the transformed bounding box. Overflow is clipped; fully off-canvas
  layers disappear. Opacity multiplies existing alpha with 8-bit rounding.
  Normal, multiply and screen are supported. No AI is used for composition.
- Identical manifest and layer bytes produce identical PNG bytes with the same
  locked Sharp/libvips runtime. Cross-version or cross-platform byte identity is
  not promised. `npm ci` uses the committed lockfile.
- PNG exports are centered crops at source resolution, with dimensions rounded to
  whole pixels (minimum one pixel). They do not upscale to platform presets, apply
  subject-aware layout or outpaint. Thumbnail JPEGs flatten transparency on white.
  Render/export do not mutate the manifest or original layers.
- Masks and constraint metadata are stored/validated, but not applied as clipping
  masks, safe zones or layout rules. There is no text engine, PSD/EXR, animation,
  automatic layer naming, layer deletion, undo history or bundle ZIP export yet.

Compatibility: previously accepted arbitrary IDs, backslash paths and non-RGBA
files now fail validation. Existing compliant v1.0 bundles remain readable.
Re-import old image files through `add-layer` and change manifest paths to portable
relative paths. There is no silent migration or schema downgrade.

## Provider evaluation, not training

Qwen-Image-Layered remains a candidate. Its official model documentation describes
image decomposition into independently editable RGBA layers:
https://github.com/QwenLM/Qwen-Image-Layered

Runware documents a Qwen-Image-Layered endpoint:
https://runware.ai/docs/models/alibaba-qwen-image-layered
Replicate lists `qwen/qwen-image-layered`:
https://replicate.com/qwen/qwen-image-layered
These primary sources were checked on 2026-11-14. Availability is not a quality
benchmark. No paid provider calls, credentials, model deployment or training were
used in this change, and no provider integration is claimed.

Next provider adapter should run server-side: send a source, poll/cancel a job,
fetch bounded image outputs, verify image content, normalize through the existing
library, preserve layer ordering and record model/version/provider/seed/request
provenance before atomically publishing a complete bundle. Never persist expiring
URLs as the only layer representation. Do not assume semantic names or that the
first returned image is a layer rather than a preview. Check actual provider
response contracts, dimensions and multi-page output formats before implementing.

Evaluate both providers with the same consented product-image set: reconstruction
pixel/perceptual difference, product/logo fidelity, alpha halos on light and dark
backgrounds, shadows, occluded content, text, layer usefulness after moving/removing
objects, latency, failure/cancellation handling, reproducibility and cost per usable
asset. Human review should decide acceptance thresholds; a model's output is not
guaranteed to reconstruct the source exactly. Compare manual-layer baseline too.
Provider selection, production storage/auth, generated-result persistence and a
full editor remain follow-up decisions. No model training is planned.

## Verification

`npm run typecheck`, `npm run test:run`, `npm run build` and CLI smoke commands.
Tests exercise real Sharp image bytes and real temporary-file persistence, plus a
local HTTP round trip covering create/list/reopen/import/edit/conflict/preview/export
and origin rejection. No external image-generation services are required.
CI runs the same checks on Linux and Windows with Node 22.

The dependency audit initially reported four affected packages. Sharp was upgraded
to 0.35.5 and Vitest to 5.1.0; npm reported zero vulnerabilities after installation.
The production bundle still has Vite's >500 kB size warning from the existing
Gemini client dependency; code splitting is separate work. Existing CDN Tailwind
and fonts also remain deployment considerations.

Browser smoke test (Windows): uploaded a synthetic PNG, created a persisted asset,
imported a subject layer, saved opacity 0.5 and X=-30, downloaded a PNG, reloaded
the page and reopened the asset; both edit values survived. Also verified that
adding the actual index.tsx entry produces a JavaScript bundle, not empty HTML.
