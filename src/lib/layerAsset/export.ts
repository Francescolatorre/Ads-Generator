import { join, resolve } from "node:path";
import { promises as fs } from "node:fs";
import sharp from "sharp";
import { readManifest } from "./io";
import { renderCompositeBuffer } from "./render";

export interface ExportOptions {
  formats: string[];
  outputDir?: string;
}

interface Ratio {
  width: number;
  height: number;
  label: string;
}

export async function exportBundle(bundlePath: string, options: ExportOptions): Promise<string[]> {
  const manifest = await readManifest(bundlePath);
  const compositeBuffer = await renderCompositeBuffer(bundlePath, manifest);
  const canvas = manifest.canvas;
  const outputDir = options.outputDir
    ? resolve(options.outputDir)
    : join(bundlePath, "exports");

  await fs.mkdir(outputDir, { recursive: true });

  const outputs: string[] = [];
  const ratios = options.formats.map(parseRatio);
  for (const ratio of ratios) {
    const crop = calculateCenteredCrop(canvas.width, canvas.height, ratio.width, ratio.height);
    const outputPath = join(
      outputDir,
      `${manifest.asset_id}_${ratio.label}_${crop.width}x${crop.height}.png`,
    );

    await sharp(compositeBuffer)
      .extract({
        left: crop.left,
        top: crop.top,
        width: crop.width,
        height: crop.height,
      })
      .png()
      .toFile(outputPath);

    outputs.push(outputPath);
  }

  return outputs;
}

function parseRatio(input: string): Ratio {
  const [width, height] = input.split(":").map((value) => Number(value));
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`Invalid ratio format: ${input}`);
  }
  return { width, height, label: input.replace(":", "x") };
}

function calculateCenteredCrop(
  canvasWidth: number,
  canvasHeight: number,
  ratioWidth: number,
  ratioHeight: number,
): { width: number; height: number; left: number; top: number } {
  const canvasRatio = canvasWidth / canvasHeight;
  const targetRatio = ratioWidth / ratioHeight;
  let width = canvasWidth;
  let height = canvasHeight;

  if (canvasRatio > targetRatio) {
    width = Math.round(canvasHeight * targetRatio);
  } else if (canvasRatio < targetRatio) {
    height = Math.round(canvasWidth / targetRatio);
  }

  const left = Math.max(0, Math.round((canvasWidth - width) / 2));
  const top = Math.max(0, Math.round((canvasHeight - height) / 2));

  return { width, height, left, top };
}
