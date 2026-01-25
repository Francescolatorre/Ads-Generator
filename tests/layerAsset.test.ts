import { describe, expect, it } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import sharp from 'sharp';
import { manifestSchema } from '../src/lib/layerAsset/schema';
import { addLayer, createBundle } from '../src/lib/layerAsset/io';
import { renderBundle } from '../src/lib/layerAsset/render';

const createTempDir = async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'layer-asset-'));
  return dir;
};

const createSolidPng = async (filePath: string, color: { r: number; g: number; b: number }) => {
  await sharp({
    create: {
      width: 10,
      height: 10,
      channels: 4,
      background: { ...color, alpha: 1 },
    },
  })
    .png()
    .toFile(filePath);
};

describe('manifest schema', () => {
  it('rejects invalid manifest', () => {
    expect(() => manifestSchema.parse({})).toThrow();
  });

  it('accepts valid manifest', () => {
    const parsed = manifestSchema.parse({
      schema_version: '1.0',
      asset_id: 'asset-123',
      canvas: {
        width: 1200,
        height: 800,
        color_space: 'sRGB',
      },
      layers: [],
    });
    expect(parsed.asset_id).toBe('asset-123');
  });
});

describe('rendering', () => {
  it('composites layers in z_index order', async () => {
    const bundlePath = await createTempDir();
    await createBundle({ bundlePath, width: 10, height: 10, assetId: 'order-test' });

    const redLayer = path.join(bundlePath, 'red.png');
    const blueLayer = path.join(bundlePath, 'blue.png');
    await createSolidPng(redLayer, { r: 255, g: 0, b: 0 });
    await createSolidPng(blueLayer, { r: 0, g: 0, b: 255 });

    await addLayer({
      bundlePath,
      type: 'background',
      file: redLayer,
      zIndex: 0,
      id: 'background',
    });

    await addLayer({
      bundlePath,
      type: 'subject',
      file: blueLayer,
      zIndex: 1,
      id: 'subject',
    });

    const { compositePath } = await renderBundle(bundlePath);
    const buffer = await sharp(compositePath).raw().toBuffer();
    const [r, g, b] = buffer;
    expect([r, g, b]).toEqual([0, 0, 255]);
  });

  it('writes composite and thumbnail with expected dimensions', async () => {
    const bundlePath = await createTempDir();
    await createBundle({ bundlePath, width: 1000, height: 400, assetId: 'size-test' });

    const greenLayer = path.join(bundlePath, 'green.png');
    await createSolidPng(greenLayer, { r: 0, g: 255, b: 0 });

    await addLayer({
      bundlePath,
      type: 'background',
      file: greenLayer,
      zIndex: 0,
      id: 'background',
    });

    const { compositePath, thumbnailPath } = await renderBundle(bundlePath);

    const compositeMeta = await sharp(compositePath).metadata();
    expect(compositeMeta.width).toBe(1000);
    expect(compositeMeta.height).toBe(400);

    const thumbnailMeta = await sharp(thumbnailPath).metadata();
    expect(Math.max(thumbnailMeta.width ?? 0, thumbnailMeta.height ?? 0)).toBeLessThanOrEqual(512);
  });
});
