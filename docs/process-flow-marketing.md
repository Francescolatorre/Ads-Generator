# Process Flow marketing integration

Implemented 2026-11-16, against the running Process Flow build `dda208b`.
This first workflow is deliberately free of model calls: a saved composition and
a user-written brief become an editorial layout with four separately editable
RGBA layers. It does not claim to generate campaign strategy or improve the source
image. Existing paid decomposition stays separately gated.

## Architecture and workflow

`Ads-Generator → Process Flow brief/plan → local renderer → new asset + PNG export`

The versioned flow is `workflows/marketing-asset-v1.json`, ID
`ads-marketing-asset-v1`. Its three visible nodes are:

1. Start: require asset ID, brand, headline, CTA and format.
2. Transform: emit the version-1 editorial layout contract, explicitly prohibiting
   paid generation.
3. Output: return the JSON plan.

The browser calls the existing local same-origin asset API. Server-side code
connects to Process Flow over HTTPS, verifies the remote nodes/edges against the
reviewed definition, and calls `POST /api/flows/:id/run` with a 20-second limit.
Only brief text and the asset ID leave the machine, not image bytes or provider
credentials. Text is stored in Process Flow execution history; use only suitable
briefing content. Responses are size-limited and validated; redirects are refused.

Why this boundary: the current Ads-Generator backend is a local Vite adapter, not
a deployed asset service. Process Flow cannot call back into a user's loopback
server. The initial flow is short and deterministic, so the synchronous API is a
good fit. No SSH tunnel, inbound port, CORS relaxation or SSRF allowlist change is
needed. The SDK's synchronous run behavior matches the REST route used here.

Process Flow owns the layout contract; the local renderer owns actual pixels,
bundle validation and persistence. The original layered asset remains intact.
Its saved composition is embedded as one artwork layer in the new layout, alongside
background, headline/brand and CTA layers. Source decomposition layers are not
duplicated as independently editable layers inside the marketing bundle.

## Setup and use

Set server-only values in ignored `.env.local`:

```dotenv
PROCESS_FLOW_URL=https://flow.your-tailnet.ts.net
PROCESS_FLOW_API_TOKEN=
```

The local server must reach that URL (for the inspected instance: Tailscale).
If your instance requires authentication, supply its Process Flow API token.
The inspected instance uses its existing local-auth deployment; this change does
not change server authentication. Never put tokens in `VITE_` variables.

Run `npm run process-flow:install` to create the versioned flow. The installer
does not overwrite an existing flow and never executes it. Then `npm run dev`.
In **Reusable layer assets**, open a source, fill **Marketing layout · Process
Flow**, select 1:1, 4:5 or 9:16, and create the asset. The result opens with its
four layers and preview. Download the PNG at the matching ratio to avoid cropping.

The three canvas sizes are 1080×1080, 1080×1350 and 1080×1920. Each layout is
rendered to its own canvas; this is re-layout, not a crop of another format.
Use **Return to source · revise brief or format** to create another version.
Reopening a marketing asset restores its stored brief. Changing the original
headline/CTA creates new text pixels rather than modifying the old PNG in place.
Spatial and opacity edits remain available as for all other layer assets.

## Persistence and failure behavior

The input revision must match the saved source. Each request has a UUID and a
durable `.marketing-jobs/<id>.json` record, written before the remote request.
A repeated identical request returns the existing asset; reusing its ID with
different input is rejected. A completed plan is saved before local rendering,
so a failed local render can resume without another Process Flow execution.
Assets publish by directory rename only after layers, preview and export succeed.

A lost remote response leaves an unknown outcome and is not automatically
resubmitted. Inspect Process Flow's execution history; this initial workflow has
no paid operations, so a new explicitly started request cannot incur model fees.
The current UI retains the request ID for retry while mounted; after a browser
reload a new click creates a new request. Completed assets remain in the list.
Per-source locking prevents simultaneous mutations; a process killed mid-write
can leave a lock requiring inspection, as in the existing asset API.

The remote definition check is a drift guard, not a transactional security boundary:
an administrator could change a flow between inspection and execution. Keep this
versioned flow immutable operationally. Never add paid nodes under this ID.
Future paid workflows need separately reviewed authorization, budgets and a
server-enforced immutable execution definition. No budget authorization is inferred
from the presence of a Runware key or from earlier test approvals.

## Validation and current limits

47 local tests pass, including modified-flow refusal, HTTP errors, invalid paid
instructions, stale source revisions, unknown-response recovery and duplicate IDs.
Real PNG tests cover all three formats, separate layers, deterministic recomposition,
edits, exports and source preservation. TypeScript and build checks are also run.

The flow was installed on the existing Hetzner instance without changing its code,
container or configuration. Real end-to-end runs produced all three formats.
Browser checks created an asset, reopened its saved brief, returned to the source
and confirmed paid decomposition remained disabled. No paid provider calls occurred.

Open work:
- Real product photos and a brand-approved visual direction; this is one starter
  template and uses system fonts (pixel output can vary across operating systems).
- Semantic object grouping, original product layer reuse and rich text editing.
- Durable approvals and execution checkpoints in Process Flow; its running
  engine/approval state is currently in memory and execution history saves at end.
- A deployed authenticated asset service, before remote workers should generate
  or store image assets. Long paid jobs should retain the decomposition journal,
  use explicit start/status operations and never rely on retrying a generation.
- A dedicated asset node can later wrap that service. Existing Runway nodes are
  for a different provider; no Runware node is required for this first workflow.
