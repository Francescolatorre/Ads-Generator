<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1a2BonmvmjKYhctjMrVXOc4cZG9daJI0e

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Layer Asset Bundle (v1.0)

The Layer Asset Bundle is the canonical on-disk format for layered marketing assets. It stores the manifest, layers, masks, previews, and exports in a deterministic structure.

```
asset/
├─ manifest.json
├─ layers/
│  ├─ 00_background.png
│  ├─ 01_shadow.png
│  ├─ 02_subject.png
├─ masks/
│  ├─ subject.png
│  ├─ text_safe.png
│  └─ logo_safe.png
├─ previews/
│  ├─ composite.png
│  └─ thumbnail.jpg
└─ exports/
```

### CLI usage

```
layerasset init <path> --width <w> --height <h> [--asset-id <id>]
layerasset add-layer <bundlePath> --type <type> --file <imagePath> --z <z_index> [--id <id>] [--blend <mode>] [--opacity <0..1>]
layerasset validate <bundlePath>
layerasset render <bundlePath>
layerasset export <bundlePath> --formats "1:1,4:5,9:16" [--out <dir>]
```

### Library entry points

Layer Asset utilities live under `src/lib/layerAsset/` and include:

- `types.ts` for TypeScript types
- `schema.ts` for zod validation
- `io.ts` for bundle I/O and validation
- `render.ts` for deterministic recomposition
- `export.ts` for center-cropped exports
