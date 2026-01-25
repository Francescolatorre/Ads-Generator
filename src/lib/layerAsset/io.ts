import { promises as fs } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { layerAssetManifestSchema, type LayerAssetManifest } from "./schema";

const manifestFileName = "manifest.json";
const requiredDirs = ["layers", "masks", "previews", "exports"];

export interface InitBundleOptions {
  width: number;
  height: number;
  assetId?: string;
  source?: LayerAssetManifest["source"];
}

export interface AddLayerOptions {
  id?: string;
  type: LayerAssetManifest["layers"][number]["type"];
  filePath: string;
  zIndex: number;
  blendMode?: LayerAssetManifest["layers"][number]["blend_mode"];
  opacity?: number;
  editable?: boolean;
}

export async function initBundle(bundlePath: string, options: InitBundleOptions): Promise<LayerAssetManifest> {
  const resolved = resolve(bundlePath);
  await fs.mkdir(resolved, { recursive: true });
  await Promise.all(
    requiredDirs.map((dir) => fs.mkdir(join(resolved, dir), { recursive: true })),
  );

  const manifest: LayerAssetManifest = {
    schema_version: "1.0",
    asset_id: options.assetId ?? randomUUID(),
    source: options.source ?? {},
    canvas: {
      width: options.width,
      height: options.height,
      color_space: "sRGB",
    },
    layers: [],
    masks: {},
    provenance: {
      created_at: new Date().toISOString(),
      pipeline_stage: "init",
    },
  };

  await writeManifest(resolved, manifest);
  return manifest;
}

export async function readManifest(bundlePath: string): Promise<LayerAssetManifest> {
  const manifestPath = join(bundlePath, manifestFileName);
  const raw = await fs.readFile(manifestPath, "utf-8");
  const parsed = JSON.parse(raw);
  return layerAssetManifestSchema.parse(parsed);
}

export async function writeManifest(bundlePath: string, manifest: LayerAssetManifest): Promise<void> {
  const manifestPath = join(bundlePath, manifestFileName);
  const json = JSON.stringify(manifest, null, 2);
  await fs.writeFile(manifestPath, `${json}\n`);
}

export async function addLayer(bundlePath: string, options: AddLayerOptions): Promise<LayerAssetManifest> {
  const manifest = await readManifest(bundlePath);
  const layerId = options.id ?? randomUUID();
  const layersDir = join(bundlePath, "layers");
  const sourcePath = resolve(options.filePath);
  const fileName = await resolveUniqueFileName(layersDir, basename(sourcePath));
  const destPath = join(layersDir, fileName);

  await fs.copyFile(sourcePath, destPath);

  manifest.layers.push({
    id: layerId,
    type: options.type,
    file: join("layers", fileName),
    z_index: options.zIndex,
    editable: options.editable ?? true,
    blend_mode: options.blendMode,
    opacity: options.opacity,
  });

  manifest.provenance = {
    ...(manifest.provenance ?? {}),
    pipeline_stage: "add-layer",
  };

  await writeManifest(bundlePath, manifest);
  return manifest;
}

export async function validateBundle(bundlePath: string): Promise<string[]> {
  const errors: string[] = [];
  let manifest: LayerAssetManifest | null = null;
  try {
    manifest = await readManifest(bundlePath);
  } catch (error) {
    errors.push(`Manifest validation failed: ${error instanceof Error ? error.message : String(error)}`);
    return errors;
  }

  const layerFiles = manifest.layers.map((layer) => layer.file);
  const maskFiles = manifest.masks ? Object.values(manifest.masks).filter(Boolean) : [];
  const allFiles = [...layerFiles, ...maskFiles];

  for (const relative of allFiles) {
    const filePath = resolve(bundlePath, relative);
    try {
      await fs.access(filePath);
    } catch (error) {
      errors.push(`Missing file referenced in manifest: ${relative}`);
    }
  }

  return errors;
}

async function resolveUniqueFileName(dir: string, fileName: string): Promise<string> {
  const parsedName = basename(fileName);
  const extIndex = parsedName.lastIndexOf(".");
  const base = extIndex >= 0 ? parsedName.slice(0, extIndex) : parsedName;
  const ext = extIndex >= 0 ? parsedName.slice(extIndex) : "";
  let candidate = parsedName;
  let counter = 1;

  while (true) {
    try {
      await fs.access(join(dir, candidate));
      candidate = `${base}-${counter}${ext}`;
      counter += 1;
    } catch {
      return candidate;
    }
  }
}

export function resolveBundlePath(path: string): string {
  return resolve(path);
}
