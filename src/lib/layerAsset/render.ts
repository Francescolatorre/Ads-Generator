import { promises as fs } from 'fs';
import path from 'path';
import sharp, { Blend } from 'sharp';
import { readManifest, getBundlePaths } from './io';
import type { LayerAssetManifest, LayerDefinition } from './types';

const blendMap: Record<string, Blend> = {
  normal: 'over',
  multiply: 'multiply',
  screen: 'screen',
};

const defaultTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
};

const applyOpacity = async (image: sharp.Sharp, opacity: number) => {
  if (opacity >= 1) {
    return image;
  }
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    return image;
  }
  const mask = await sharp({
    create: {
      width: metadata.width,
      height: metadata.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: opacity },
    },
  })
    .png()
    .toBuffer();
  return image.composite([{ input: mask, blend: 'dest-in' }]);
};

const prepareLayer = async (layerPath: string, layer: LayerDefinition) => {
  const transform = { ...defaultTransform, ...layer.transform };
  let image = sharp(layerPath).ensureAlpha();

  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`Unable to read layer dimensions for ${layerPath}`);
  }

  if (transform.scale !== 1) {
    const width = Math.max(1, Math.round(metadata.width * transform.scale));
    const height = Math.max(1, Math.round(metadata.height * transform.scale));
    image = image.resize(width, height, { fit: 'fill' });
  }

  if (transform.rotation !== 0) {
    image = image.rotate(transform.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } });
  }

  if (typeof layer.opacity === 'number') {
    image = await applyOpacity(image, layer.opacity);
  }

  const buffer = await image.png().toBuffer();
  return {
    buffer,
    left: Math.round(transform.x),
    top: Math.round(transform.y),
    blend: blendMap[layer.blend_mode ?? 'normal'],
  };
};

export const renderComposite = async (bundlePath: string, manifest: LayerAssetManifest) => {
  const canvas = sharp({
    create: {
      width: manifest.canvas.width,
      height: manifest.canvas.height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).toColourspace('srgb');

  const sortedLayers = [...manifest.layers].sort((a, b) => a.z_index - b.z_index);
  const composites = await Promise.all(
    sortedLayers.map(async (layer) => {
      const layerPath = path.join(bundlePath, layer.file);
      return prepareLayer(layerPath, layer);
    }),
  );

  const compositeImage = canvas.composite(composites);
  return compositeImage.png().toBuffer();
};

export const renderBundle = async (bundlePath: string) => {
  const manifest = await readManifest(bundlePath);
  const { previews } = getBundlePaths(bundlePath);
  await fs.mkdir(previews, { recursive: true });

  const compositeBuffer = await renderComposite(bundlePath, manifest);
  const compositePath = path.join(previews, 'composite.png');
  await sharp(compositeBuffer).png().toFile(compositePath);

  const maxEdge = Math.max(manifest.canvas.width, manifest.canvas.height);
  const resizeOptions = maxEdge > 512 ? { width: 512, height: 512, fit: 'inside' } : undefined;
  const thumbnail = sharp(compositeBuffer).jpeg({ quality: 82 });
  if (resizeOptions) {
    thumbnail.resize(resizeOptions);
  }
  const thumbnailPath = path.join(previews, 'thumbnail.jpg');
  await thumbnail.toFile(thumbnailPath);

  return { compositePath, thumbnailPath };
};
