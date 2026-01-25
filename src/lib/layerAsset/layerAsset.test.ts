import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import sharp from "sharp";
import { layerAssetManifestSchema } from "./schema";
import { renderBundle, renderCompositeBuffer } from "./render";

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempPaths.map(async (path) => {
      await fs.rm(path, { recursive: true, force: true });
    }),
  );
  tempPaths.length = 0;
});

describe("layer asset manifest schema", () => {
  it("accepts a valid manifest", () => {
    const manifest = {
      schema_version: "1.0",
      asset_id: "asset-123",
      source: {},
      canvas: { width: 1200, height: 800, color_space: "sRGB" },
      layers: [
        {
          id: "layer-1",
          type: "background",
          file: "layers/00_background.png",
          z_index: 0,
          editable: false,
        },
      ],
    };

    expect(layerAssetManifestSchema.parse(manifest).asset_id).toBe("asset-123");
  });

  it("rejects invalid opacity", () => {
    const manifest = {
      schema_version: "1.0",
      asset_id: "asset-123",
      source: {},
      canvas: { width: 1200, height: 800, color_space: "sRGB" },
      layers: [
        {
          id: "layer-1",
          type: "background",
          file: "layers/00_background.png",
          z_index: 0,
          editable: false,
          opacity: 2,
        },
      ],
    };

    expect(() => layerAssetManifestSchema.parse(manifest)).toThrow();
  });
});

describe("rendering", () => {
  it("composites layers in z_index order", async () => {
    const tmp = await fs.mkdtemp(join(os.tmpdir(), "layerasset-"));
    tempPaths.push(tmp);
    const layersDir = join(tmp, "layers");
    await fs.mkdir(layersDir, { recursive: true });

    const redPath = join(layersDir, "red.png");
    const bluePath = join(layersDir, "blue.png");

    await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 255, g: 0, b: 0, alpha: 1 },
      },
    })
      .png()
      .toFile(redPath);

    await sharp({
      create: {
        width: 4,
        height: 4,
        channels: 4,
        background: { r: 0, g: 0, b: 255, alpha: 1 },
      },
    })
      .png()
      .toFile(bluePath);

    const manifest = layerAssetManifestSchema.parse({
      schema_version: "1.0",
      asset_id: "asset-456",
      source: {},
      canvas: { width: 4, height: 4, color_space: "sRGB" },
      layers: [
        {
          id: "layer-red",
          type: "background",
          file: "layers/red.png",
          z_index: 0,
          editable: false,
        },
        {
          id: "layer-blue",
          type: "overlay",
          file: "layers/blue.png",
          z_index: 1,
          editable: true,
        },
      ],
    });

    const buffer = await renderCompositeBuffer(tmp, manifest);
    const { data } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBe(0);
    expect(data[1]).toBe(0);
    expect(data[2]).toBe(255);
  });

  it("renders preview output at canvas dimensions", async () => {
    const tmp = await fs.mkdtemp(join(os.tmpdir(), "layerasset-"));
    tempPaths.push(tmp);
    await fs.mkdir(join(tmp, "layers"), { recursive: true });
    await fs.mkdir(join(tmp, "previews"), { recursive: true });

    const layerPath = join(tmp, "layers", "single.png");
    await sharp({
      create: {
        width: 6,
        height: 5,
        channels: 4,
        background: { r: 10, g: 20, b: 30, alpha: 1 },
      },
    })
      .png()
      .toFile(layerPath);

    const manifest = {
      schema_version: "1.0",
      asset_id: "asset-789",
      source: {},
      canvas: { width: 6, height: 5, color_space: "sRGB" },
      layers: [
        {
          id: "layer-1",
          type: "background",
          file: "layers/single.png",
          z_index: 0,
          editable: false,
        },
      ],
      masks: {},
    };

    await fs.writeFile(join(tmp, "manifest.json"), JSON.stringify(manifest, null, 2));
    await renderBundle(tmp);

    const metadata = await sharp(join(tmp, "previews", "composite.png")).metadata();
    expect(metadata.width).toBe(6);
    expect(metadata.height).toBe(5);
  });
});
