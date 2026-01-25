import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';
import { readManifest, getBundlePaths } from './io';
import { renderComposite } from './render';
import type { ExportOptions } from './types';

const parseRatio = (ratio: string) => {
  const match = ratio.trim().match(/^(\d+):(\d+)$/);
  if (!match) {
    throw new Error(`Invalid ratio format: ${ratio}`);
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid ratio values: ${ratio}`);
  }
  return { width, height };
};

const computeTargetSize = (
  canvasWidth: number,
  canvasHeight: number,
  ratioWidth: number,
  ratioHeight: number,
) => {
  const targetRatio = ratioWidth / ratioHeight;
  const canvasRatio = canvasWidth / canvasHeight;

  if (targetRatio > canvasRatio) {
    const width = canvasWidth;
    const height = Math.round(width / targetRatio);
    return { width, height };
  }

  const height = canvasHeight;
  const width = Math.round(height * targetRatio);
  return { width, height };
};

export const exportBundle = async ({ bundlePath, formats, outDir }: ExportOptions) => {
  const manifest = await readManifest(bundlePath);
  const { exports: defaultExportDir } = getBundlePaths(bundlePath);
  const exportDir = outDir ?? defaultExportDir;
  await fs.mkdir(exportDir, { recursive: true });

  const compositeBuffer = await renderComposite(bundlePath, manifest);

  const results = await Promise.all(
    formats.map(async (format) => {
      const { width: ratioWidth, height: ratioHeight } = parseRatio(format);
      const { width, height } = computeTargetSize(
        manifest.canvas.width,
        manifest.canvas.height,
        ratioWidth,
        ratioHeight,
      );

      const left = Math.max(0, Math.round((manifest.canvas.width - width) / 2));
      const top = Math.max(0, Math.round((manifest.canvas.height - height) / 2));

      const outputName = `${manifest.asset_id}_${ratioWidth}x${ratioHeight}_${width}x${height}.png`;
      const outputPath = path.join(exportDir, outputName);

      await sharp(compositeBuffer)
        .extract({ left, top, width, height })
        .png()
        .toFile(outputPath);

      return outputPath;
    }),
  );

  return results;
};
