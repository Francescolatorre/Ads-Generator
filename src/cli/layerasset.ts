#!/usr/bin/env node
import { Command } from "commander";
import { addLayer, initBundle, resolveBundlePath, validateBundle, writeManifest } from "../lib/layerAsset/io";
import { exportBundle } from "../lib/layerAsset/export";
import { renderBundle } from "../lib/layerAsset/render";

const program = new Command();

program.name("layerasset").description("Layer Asset Bundle CLI").version("1.0.0");

program
  .command("init")
  .argument("<path>", "Bundle root path")
  .requiredOption("--width <number>", "Canvas width", (value) => Number(value))
  .requiredOption("--height <number>", "Canvas height", (value) => Number(value))
  .option("--asset-id <id>", "Asset identifier")
  .action(async (path, options) => {
    const bundlePath = resolveBundlePath(path);
    const manifest = await initBundle(bundlePath, {
      width: options.width,
      height: options.height,
      assetId: options.assetId,
    });
    await writeManifest(bundlePath, manifest);
    console.log(`Initialized bundle at ${bundlePath}`);
  });

program
  .command("add-layer")
  .argument("<bundlePath>", "Bundle root path")
  .requiredOption("--type <type>", "Layer type")
  .requiredOption("--file <imagePath>", "Layer image path")
  .requiredOption("--z <zIndex>", "z-index", (value) => Number(value))
  .option("--id <id>", "Layer id")
  .option("--blend <mode>", "Blend mode")
  .option("--opacity <value>", "Opacity 0..1", (value) => Number(value))
  .action(async (bundlePath, options) => {
    await addLayer(bundlePath, {
      id: options.id,
      type: options.type,
      filePath: options.file,
      zIndex: options.z,
      blendMode: options.blend,
      opacity: options.opacity,
    });
    console.log("Layer added.");
  });

program
  .command("validate")
  .argument("<bundlePath>", "Bundle root path")
  .action(async (bundlePath) => {
    const errors = await validateBundle(bundlePath);
    if (errors.length === 0) {
      console.log("Bundle is valid.");
      return;
    }
    console.error("Bundle validation errors:");
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exitCode = 1;
  });

program
  .command("render")
  .argument("<bundlePath>", "Bundle root path")
  .action(async (bundlePath) => {
    const result = await renderBundle(bundlePath);
    console.log(`Composite: ${result.compositePath}`);
    console.log(`Thumbnail: ${result.thumbnailPath}`);
  });

program
  .command("export")
  .argument("<bundlePath>", "Bundle root path")
  .requiredOption("--formats <list>", "Comma-separated ratios, e.g. 1:1,4:5,9:16")
  .option("--out <dir>", "Output directory")
  .action(async (bundlePath, options) => {
    const formats = String(options.formats)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    const outputs = await exportBundle(bundlePath, {
      formats,
      outputDir: options.out,
    });
    outputs.forEach((file) => console.log(file));
  });

program.parseAsync(process.argv);
