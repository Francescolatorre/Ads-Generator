import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { manifestSchema } from './schema';
import type {
  AddLayerOptions,
  InitBundleOptions,
  LayerAssetManifest,
  LayerDefinition,
} from './types';

const MANIFEST_NAME = 'manifest.json';
const LAYERS_DIR = 'layers';
const MASKS_DIR = 'masks';
const PREVIEWS_DIR = 'previews';
const EXPORTS_DIR = 'exports';

const ensureDir = async (dirPath: string) => {
  await fs.mkdir(dirPath, { recursive: true });
};

export const createBundle = async ({ bundlePath, width, height, assetId }: InitBundleOptions) => {
  await ensureDir(bundlePath);
  await Promise.all([
    ensureDir(path.join(bundlePath, LAYERS_DIR)),
    ensureDir(path.join(bundlePath, MASKS_DIR)),
    ensureDir(path.join(bundlePath, PREVIEWS_DIR)),
    ensureDir(path.join(bundlePath, EXPORTS_DIR)),
  ]);

  const manifest: LayerAssetManifest = {
    schema_version: '1.0',
    asset_id: assetId ?? crypto.randomUUID(),
    canvas: {
      width,
      height,
      color_space: 'sRGB',
    },
    layers: [],
  };

  await writeManifest(bundlePath, manifest);
  return manifest;
};

export const readManifest = async (bundlePath: string): Promise<LayerAssetManifest> => {
  const manifestPath = path.join(bundlePath, MANIFEST_NAME);
  const raw = await fs.readFile(manifestPath, 'utf-8');
  const data = JSON.parse(raw);
  return manifestSchema.parse(data);
};

export const writeManifest = async (bundlePath: string, manifest: LayerAssetManifest) => {
  const manifestPath = path.join(bundlePath, MANIFEST_NAME);
  const payload = JSON.stringify(manifest, null, 2);
  await fs.writeFile(manifestPath, payload, 'utf-8');
};

const makeLayerFilename = ({ zIndex, id, ext }: { zIndex: number; id: string; ext: string }) => {
  const safeId = id.replace(/[^a-zA-Z0-9_-]+/g, '_');
  const prefix = String(zIndex).padStart(2, '0');
  return `${prefix}_${safeId}${ext}`;
};

const resolveLayerFile = async (bundlePath: string, sourceFile: string, destName: string) => {
  const layersPath = path.join(bundlePath, LAYERS_DIR);
  await ensureDir(layersPath);
  const destPath = path.join(layersPath, destName);
  await fs.copyFile(sourceFile, destPath);
  return path.relative(bundlePath, destPath);
};

const normalizeLayerEntry = (entry: LayerDefinition): LayerDefinition => ({
  ...entry,
  transform: entry.transform ?? undefined,
  opacity: entry.opacity ?? undefined,
  blend_mode: entry.blend_mode ?? undefined,
});

export const addLayer = async ({
  bundlePath,
  type,
  file,
  zIndex,
  id,
  blendMode,
  opacity,
}: AddLayerOptions) => {
  const manifest = await readManifest(bundlePath);
  await fs.access(file);
  const extension = path.extname(file) || '.png';
  const layerId = id ?? path.basename(file, extension);
  const fileName = makeLayerFilename({ zIndex, id: layerId, ext: extension });
  const relativePath = await resolveLayerFile(bundlePath, file, fileName);

  const newLayer: LayerDefinition = {
    id: layerId,
    type,
    file: relativePath,
    z_index: zIndex,
    editable: true,
    ...(blendMode ? { blend_mode: blendMode } : {}),
    ...(typeof opacity === 'number' ? { opacity } : {}),
  };

  const layers = [...manifest.layers, normalizeLayerEntry(newLayer)].sort(
    (a, b) => a.z_index - b.z_index,
  );

  const updatedManifest: LayerAssetManifest = {
    ...manifest,
    layers,
  };

  const validatedManifest = manifestSchema.parse(updatedManifest);
  await writeManifest(bundlePath, validatedManifest);
  return validatedManifest;
};

export const validateBundle = async (bundlePath: string) => {
  await readManifest(bundlePath);
  return true;
};

export const getBundlePaths = (bundlePath: string) => ({
  manifest: path.join(bundlePath, MANIFEST_NAME),
  layers: path.join(bundlePath, LAYERS_DIR),
  masks: path.join(bundlePath, MASKS_DIR),
  previews: path.join(bundlePath, PREVIEWS_DIR),
  exports: path.join(bundlePath, EXPORTS_DIR),
});
