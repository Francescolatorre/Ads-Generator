import { join, resolve } from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import { readManifest, writeManifest } from "./io";
import type { LayerAssetManifest } from "./schema";

export interface RenderResult {
  compositePath: string;
  thumbnailPath: string;
}

const blendModeMap: Record<string, sharp.Blend> = {
  normal: "over",
  multiply: "multiply",
  screen: "screen",
};

export async function renderBundle(bundlePath: string): Promise<RenderResult> {
  const manifest = await readManifest(bundlePath);
  const compositeBuffer = await renderCompositeBuffer(bundlePath, manifest);

  const previewsDir = join(bundlePath, "previews");
  await fs.mkdir(previewsDir, { recursive: true });

  const compositePath = join(previewsDir, "composite.png");
  await sharp(compositeBuffer).png().toFile(compositePath);

  const thumbnailPath = join(previewsDir, "thumbnail.jpg");
  await sharp(compositeBuffer)
    .resize({
      width: 512,
      height: 512,
      fit: "inside",
    })
    .jpeg({ quality: 82 })
    .toFile(thumbnailPath);

  manifest.provenance = {
    ...(manifest.provenance ?? {}),
    pipeline_stage: "render",
  };
  await writeManifest(bundlePath, manifest);

  return { compositePath, thumbnailPath };
}

export async function renderCompositeBuffer(
  bundlePath: string,
  manifest: LayerAssetManifest,
): Promise<Buffer> {
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

  const composites: sharp.OverlayOptions[] = [];

  for (const layer of sortedLayers) {
    const layerPath = resolve(bundlePath, layer.file);
    const transform = layer.transform ?? {};
    const scale = transform.scale ?? 1;
    const rotation = transform.rotation ?? 0;
    const x = Math.round(transform.x ?? 0);
    const y = Math.round(transform.y ?? 0);

    const image = sharp(layerPath).ensureAlpha();
    const metadata = await image.metadata();
    const width = metadata.width ?? canvas.width;
    const height = metadata.height ?? canvas.height;
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    let pipeline = image.resize(targetWidth, targetHeight);
    if (rotation !== 0) {
      pipeline = pipeline.rotate(rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
    }
    const buffer = await pipeline.toBuffer();

    composites.push({
      input: buffer,
      top: y,
      left: x,
      blend: blendModeMap[layer.blend_mode ?? "normal"],
      opacity: layer.opacity ?? 1,
    });
  }

  return base.composite(composites).png().toBuffer();
}
