import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { layerAssetManifestSchema, type LayerAssetManifest } from "./schema";
import { bundleFile } from "./files";

export const imageOptions = { limitInputPixels: 8192 * 8192, failOn: "warning" as const };
export interface InitBundleOptions {
  width: number;
  height: number;
  assetId?: string;
  source?: LayerAssetManifest["source"];
}
export interface AddLayerOptions {
  id?: string;
  type: LayerAssetManifest["layers"][number]["type"];
  filePath: string | Buffer;
  zIndex: number;
  blendMode?: LayerAssetManifest["layers"][number]["blend_mode"];
  opacity?: number;
  editable?: boolean;
}

export async function initBundle(bundlePath: string, options: InitBundleOptions): Promise<LayerAssetManifest> {
  const manifest = layerAssetManifestSchema.parse({
    schema_version: "1.0", asset_id: options.assetId ?? randomUUID(),
    source: options.source ?? {},
    canvas: { width: options.width, height: options.height, color_space: "sRGB" },
    layers: [], masks: {},
    provenance: { created_at: new Date().toISOString(), pipeline_stage: "init" },
  });
  await fs.mkdir(resolve(bundlePath), { recursive: true });
  // Exclusive creation: never reset an existing asset.
  await fs.writeFile(await bundleFile(bundlePath, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  for (const dir of ["layers", "masks", "previews", "exports", "source"]) {
    await fs.mkdir(await bundleFile(bundlePath, dir), { recursive: true });
  }
  return manifest;
}

export async function readManifest(bundlePath: string): Promise<LayerAssetManifest> {
  return layerAssetManifestSchema.parse(JSON.parse(await fs.readFile(await bundleFile(bundlePath, "manifest.json"), "utf-8")));
}

export async function writeManifest(bundlePath: string, manifest: LayerAssetManifest): Promise<void> {
  const parsed = layerAssetManifestSchema.parse(manifest);
  const target = await bundleFile(bundlePath, "manifest.json");
  const temp = await bundleFile(bundlePath, `manifest-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temp, JSON.stringify(parsed, null, 2) + "\n", { flag: "wx" });
    await fs.rename(temp, target);
  } finally {
    await fs.rm(temp, { force: true });
  }
}

// Mutations fail clearly rather than losing concurrent edits (also across CLI processes).
export async function mutateBundle<T>(bundlePath: string, operation: () => Promise<T>): Promise<T> {
  const lockPath = await bundleFile(bundlePath, ".write-lock");
  const lock = await fs.open(lockPath, "wx");
  try { return await operation(); }
  finally { await lock.close(); await fs.unlink(lockPath); }
}

export async function normalizeImage(input: string | Buffer): Promise<Buffer> {
  const meta = await sharp(input, imageOptions).metadata();
  if ((meta.pages ?? 1) !== 1 || !["png", "jpeg", "webp", "tiff"].includes(meta.format ?? "")) {
    throw new Error("Expected a single-frame PNG, JPEG, WebP or TIFF image");
  }
  return sharp(input, imageOptions).rotate().toColourspace("srgb").ensureAlpha().png().toBuffer();
}

export async function addLayer(bundlePath: string, options: AddLayerOptions): Promise<LayerAssetManifest> {
  return mutateBundle(bundlePath, async () => {
    const manifest = await readManifest(bundlePath);
    const file = `layers/${randomUUID()}.png`;
    manifest.layers.push({
      id: options.id ?? randomUUID(), type: options.type, file,
      z_index: options.zIndex, editable: options.editable ?? true,
      blend_mode: options.blendMode, opacity: options.opacity,
    });
    layerAssetManifestSchema.parse(manifest);
    const png = await normalizeImage(options.filePath);
    const target = await bundleFile(bundlePath, file);
    await fs.writeFile(target, png, { flag: "wx" });
    try { await writeManifest(bundlePath, manifest); }
    catch (error) { await fs.unlink(target); throw error; }
    return manifest;
  });
}

export async function validateBundle(bundlePath: string): Promise<string[]> {
  const errors: string[] = [];
  let manifest: LayerAssetManifest;
  try { manifest = await readManifest(bundlePath); }
  catch (error) { return [`Manifest validation failed: ${String(error)}`]; }
  const files = [
    ...manifest.layers.map(layer => ({ file: layer.file, rgba: true })),
    ...Object.values(manifest.masks ?? {}).map(file => ({ file, rgba: false })),
    ...(manifest.source.input_image ? [{ file: manifest.source.input_image, rgba: false }] : []),
  ];
  for (const { file, rgba } of files) {
    try {
      const path = await bundleFile(bundlePath, file);
      const metadata = await sharp(path, imageOptions).metadata();
      if (metadata.format !== "png" || (metadata.pages ?? 1) !== 1) throw new Error("Expected single-frame PNG");
      if (rgba && (metadata.channels !== 4 || !metadata.hasAlpha || metadata.space !== "srgb")) throw new Error("Expected sRGB RGBA PNG");
      // Decode too: metadata alone does not detect truncated pixel streams.
      await sharp(path, imageOptions).raw().toBuffer();
    } catch (error) { errors.push(`${file}: ${String(error)}`); }
  }
  return errors;
}

export function resolveBundlePath(path: string): string { return resolve(path); }
