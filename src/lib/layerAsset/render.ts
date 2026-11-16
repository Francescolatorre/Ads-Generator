import { promises as fs } from "node:fs";
import sharp, { type Blend, type OverlayOptions } from "sharp";
import { readManifest, imageOptions } from "./io";
import { bundleFile } from "./files";
import { layerAssetManifestSchema } from "./schema";
import type { LayerAssetManifest } from "./schema";

export interface RenderResult {
  compositePath: string;
  thumbnailPath: string;
}

const blendModeMap: Record<string, Blend> = {
  normal: "over",
  multiply: "multiply",
  screen: "screen",
};

export async function renderBundle(bundlePath: string): Promise<RenderResult> {
  const manifest = await readManifest(bundlePath);
  const compositeBuffer = await renderCompositeBuffer(bundlePath, manifest);

  const previewsDir = await bundleFile(bundlePath, "previews");
  await fs.mkdir(previewsDir, { recursive: true });

  const compositePath = await bundleFile(bundlePath, "previews/composite.png");
  await sharp(compositeBuffer).png().toFile(compositePath);

  const thumbnailPath = await bundleFile(bundlePath, "previews/thumbnail.jpg");
  await sharp(compositeBuffer)
    .resize({
      width: 512,
      height: 512,
      fit: "inside",
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 82 })
    .toFile(thumbnailPath);

  return { compositePath, thumbnailPath };
}

export async function renderCompositeBuffer(
  bundlePath: string,
  manifest: LayerAssetManifest,
): Promise<Buffer> {
  manifest = layerAssetManifestSchema.parse(manifest);
  const canvas = manifest.canvas;
  const sortedLayers = [...manifest.layers].sort((a, b) => a.z_index - b.z_index);

  const base = sharp({
    create: {
      width: canvas.width,
      height: canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });

  const composites: OverlayOptions[] = [];

  for (const layer of sortedLayers) {
    const layerPath = await bundleFile(bundlePath, layer.file);
    const transform = layer.transform ?? {};
    const scale = transform.scale ?? 1;
    const rotation = transform.rotation ?? 0;
    const x = Math.round(transform.x ?? 0);
    const y = Math.round(transform.y ?? 0);

    const image = sharp(layerPath, imageOptions).toColourspace("srgb").ensureAlpha();
    const metadata = await image.metadata();
    const sourceWidth = metadata.width ?? canvas.width;
    const sourceHeight = metadata.height ?? canvas.height;
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale));
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale));

    if (targetWidth > 8192 || targetHeight > 8192) throw new Error("Transformed layer exceeds 8192 pixels");
    let pipeline = image.resize(targetWidth, targetHeight);
    if (rotation !== 0) {
      // Materialize resizing: Sharp otherwise rotates before resizing.
      pipeline = sharp(await pipeline.png().toBuffer()).rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    }
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    // Sharp has no overlay opacity option. Multiply existing alpha, never RGB.
    for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * (layer.opacity ?? 1));
    const left = Math.max(0, x), top = Math.max(0, y);
    const width = Math.min(info.width + Math.min(0, x), canvas.width - left);
    const height = Math.min(info.height + Math.min(0, y), canvas.height - top);
    if (width <= 0 || height <= 0) continue;
    const buffer = await sharp(data, { raw: info })
      .extract({ left: Math.max(0, -x), top: Math.max(0, -y), width, height }).png().toBuffer();
    composites.push({ input: buffer, top, left, blend: blendModeMap[layer.blend_mode ?? "normal"] });
  }

  return base.composite(composites).png().toBuffer();
}
