# Publish assets to Process Flow

Open a saved asset in the local asset panel and click **Upload to Process Flow**.
The server uploads the saved manifest, layer PNGs, original input when present,
a newly rendered preview, marketing brief and a fresh matching PNG export.
Older export files are deliberately excluded because they may predate saved edits. Unsaved/stale revisions
are refused. No image generation or advertising publication occurs.

The returned link opens Process Flow's central `/assets` comparison and review
page. The target must include the corresponding Process Flow asset-library PR.
The original local bundle is preserved; `central-storage.json` records the central
content ID and viewer link. It is a link record, not a live synchronization service.
Later edits require another upload; the server stores a new immutable version and
never copies approval from old content. Identical uploads are deduplicated centrally,
so a user can safely retry an interrupted upload. There is no automatic network retry.

Configuration remains server-only:

```dotenv
PROCESS_FLOW_URL=https://flow.example.test
PROCESS_FLOW_API_TOKEN=
# Optional separate review instance during PR evaluation:
PROCESS_FLOW_ASSET_URL=https://review.example.test
PROCESS_FLOW_ASSET_TOKEN=
```

When an alternate asset URL is configured it uses only the separate asset token;
the main instance's token is not forwarded to a different deployment. Otherwise,
the existing Process Flow URL/token is reused. HTTPS origins only; redirects are
refused. Authentication errors do not expose the remote response body or credentials.
The upload is limited to 40 MiB decoded / 72 files. The central service enforces its
own owner-scoped storage quota and access checks.

Collection grouping uses the source parent ID for marketing variants and the asset
ID otherwise. This groups the three formats from a shared source for comparison.
This is an explicit upload feature: it does not move all local assets automatically,
load remote bundles into the editor, or grant any approval on the user's behalf.

Validation: 49 tests in Ads-Generator; live upload of all three existing layout
formats, full-bundle retrieval, comparison and review checked against the separate
Hetzner instance. No paid provider calls. The existing local development adapter
remains local-only; this is not a production Ads-Generator deployment.
