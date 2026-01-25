#!/usr/bin/env node
import { Command } from 'commander';
import path from 'path';
import { addLayer, createBundle, validateBundle } from '../lib/layerAsset/io';
import { exportBundle as runExport } from '../lib/layerAsset/export';
import { renderBundle as runRender } from '../lib/layerAsset/render';
import type { BlendMode, LayerType } from '../lib/layerAsset/types';

const program = new Command();

const resolvePath = (inputPath: string) => path.resolve(process.cwd(), inputPath);

const handleError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
};

program.name('layerasset').description('Manage Layer Asset Bundles (v1.0)').version('1.0.0');

program
  .command('init')
  .argument('<path>', 'Bundle directory path')
  .requiredOption('--width <w>', 'Canvas width', (value) => Number(value))
  .requiredOption('--height <h>', 'Canvas height', (value) => Number(value))
  .option('--asset-id <id>', 'Asset identifier')
  .action(async (bundlePath, options) => {
    try {
      const manifest = await createBundle({
        bundlePath: resolvePath(bundlePath),
        width: options.width,
        height: options.height,
        assetId: options.assetId,
      });
      console.log(`Created bundle ${manifest.asset_id}`);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('add-layer')
  .argument('<bundlePath>', 'Bundle directory path')
  .requiredOption('--type <type>', 'Layer type (background|subject|shadow|overlay|fx)')
  .requiredOption('--file <imagePath>', 'Layer image path')
  .requiredOption('--z <zIndex>', 'Layer z-index', (value) => Number(value))
  .option('--id <id>', 'Layer identifier')
  .option('--blend <mode>', 'Blend mode (normal|multiply|screen)')
  .option('--opacity <value>', 'Opacity 0..1', (value) => Number(value))
  .action(async (bundlePath, options) => {
    try {
      const manifest = await addLayer({
        bundlePath: resolvePath(bundlePath),
        type: options.type as LayerType,
        file: resolvePath(options.file),
        zIndex: options.z,
        id: options.id,
        blendMode: options.blend as BlendMode,
        opacity: options.opacity,
      });
      console.log(`Added layer. Total layers: ${manifest.layers.length}`);
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('validate')
  .argument('<bundlePath>', 'Bundle directory path')
  .action(async (bundlePath) => {
    try {
      await validateBundle(resolvePath(bundlePath));
      console.log('Bundle is valid.');
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('render')
  .argument('<bundlePath>', 'Bundle directory path')
  .action(async (bundlePath) => {
    try {
      await runRender(resolvePath(bundlePath));
      console.log('Rendered previews.');
    } catch (error) {
      handleError(error);
    }
  });

program
  .command('export')
  .argument('<bundlePath>', 'Bundle directory path')
  .requiredOption('--formats <ratios>', 'Comma-separated ratios, e.g. "1:1,4:5"')
  .option('--out <dir>', 'Output directory')
  .action(async (bundlePath, options) => {
    try {
      const formats = String(options.formats)
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      const outputs = await runExport({
        bundlePath: resolvePath(bundlePath),
        formats,
        outDir: options.out ? resolvePath(options.out) : undefined,
      });
      console.log(`Exported ${outputs.length} assets.`);
    } catch (error) {
      handleError(error);
    }
  });

program.parse();
