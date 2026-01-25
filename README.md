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

The Layer Asset Bundle is a deterministic, layered asset representation designed for editable marketing assets. A bundle is a directory containing a `manifest.json` plus layer, mask, preview, and export assets.

```
asset/
├─ manifest.json
├─ layers/
│  ├─ 00_background.png
│  ├─ 01_shadow.png
│  └─ 02_subject.png
├─ masks/
├─ previews/
│  ├─ composite.png
│  └─ thumbnail.jpg
└─ exports/
```

### CLI usage

```
layerasset init ./asset --width 1200 --height 800 --asset-id example-asset
layerasset add-layer ./asset --type background --file ./background.png --z 0
layerasset add-layer ./asset --type subject --file ./subject.png --z 2 --opacity 0.9
layerasset validate ./asset
layerasset render ./asset
layerasset export ./asset --formats "1:1,4:5,9:16"
```

The CLI is powered by the reusable library in `src/lib/layerAsset`, which includes TypeScript types, runtime validation, deterministic recomposition, and export helpers.
