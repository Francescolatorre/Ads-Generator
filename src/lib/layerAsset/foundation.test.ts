import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { addLayer, initBundle, readManifest, validateBundle, writeManifest, mutateBundle } from "./io";
import { renderCompositeBuffer } from "./render";
import { exportBundle } from "./export";
import { layerAssetManifestSchema } from "./schema";
import { bundleFile } from "./files";

const roots: string[] = [];
async function fixture(width = 4, height = 4) {
  const root = await fs.mkdtemp(join(tmpdir(), "layerasset-test-")); roots.push(root);
  const manifest = await initBundle(root, { width, height, assetId: "test" });
  return { root, manifest };
}
async function png(r: number, g: number, b: number, alpha = 1, width = 4, height = 4) {
  return sharp({ create: { width, height, channels: 4, background: { r, g, b, alpha } } }).png().toBuffer();
}
async function pixels(root: string) {
  return sharp(await renderCompositeBuffer(root, await readManifest(root))).raw().toBuffer();
}
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

describe("persistent asset contract", () => {
  it("normalizes JPEG to portable sRGB RGBA PNG and preserves existing assets", async () => {
    const { root } = await fixture();
    const jpeg = await sharp(await png(255, 0, 0)).jpeg().toBuffer();
    const manifest = await addLayer(root, { filePath: jpeg, type: "background", zIndex: 0 });
    const layer = manifest.layers[0];
    expect(layer.file).toMatch(/^layers\/[^/]+\.png$/);
    const metadata = await sharp(join(root, layer.file)).metadata();
    expect([metadata.format, metadata.channels, metadata.space]).toEqual(["png", 4, "srgb"]);
    expect(await validateBundle(root)).toEqual([]);
    await expect(initBundle(root, { width: 1, height: 1 })).rejects.toThrow();
    expect(await readManifest(root)).toEqual(manifest);
  });
  it("rejects invalid writes and duplicate IDs without altering the saved bundle", async () => {
    const { root } = await fixture();
    const manifest = await addLayer(root, { id: "same", filePath: await png(0, 0, 0), type: "subject", zIndex: 0 });
    await expect(addLayer(root, { id: "same", filePath: await png(0, 0, 0), type: "subject", zIndex: 1 })).rejects.toThrow();
    await expect(writeManifest(root, { ...manifest, canvas: { ...manifest.canvas, width: 0 } })).rejects.toThrow();
    expect(await readManifest(root)).toEqual(manifest);
    expect((await fs.readdir(join(root, "layers"))).length).toBe(1);
  });
  it.each(["../outside.png", "/absolute.png", "C:/outside.png", "layers\\bad.png", "layers/../bad.png"])("rejects unsafe path %s", async file => {
    const { manifest } = await fixture();
    expect(() => layerAssetManifestSchema.parse({ ...manifest, source: { input_image: file } })).toThrow();
  });
  it("rejects unsupported versions, unsafe export names and non-finite transforms", async () => {
    const { root, manifest } = await fixture();
    expect(() => layerAssetManifestSchema.parse({ ...manifest, schema_version: "2.0" })).toThrow();
    expect(() => layerAssetManifestSchema.parse({ ...manifest, asset_id: "../escape" })).toThrow();
    const added = await addLayer(root, { filePath: await png(0, 0, 0), type: "overlay", zIndex: 0 });
    added.layers[0].transform = { x: Infinity };
    await expect(writeManifest(root, added)).rejects.toThrow();
  });
  it("finds corrupt, missing and non-RGBA layer files", async () => {
    const { root } = await fixture();
    const manifest = await addLayer(root, { filePath: await png(0, 0, 0), type: "subject", zIndex: 0 });
    const path = join(root, manifest.layers[0].file);
    await fs.writeFile(path, await sharp(await png(0, 0, 0)).removeAlpha().png().toBuffer());
    expect((await validateBundle(root))[0]).toContain("RGBA");
    await fs.writeFile(path, "not an image"); expect(await validateBundle(root)).toHaveLength(1);
    await fs.unlink(path); expect(await validateBundle(root)).toHaveLength(1);
  });
  it("rejects symlinked directories for reads and writes", async () => {
    const { root } = await fixture();
    const outside = await fs.mkdtemp(join(tmpdir(), "layerasset-outside-")); roots.push(outside);
    await fs.symlink(outside, join(root, "linked"), "junction");
    await expect(bundleFile(root, "linked/file.png")).rejects.toThrow("Symlink");
  });
  it("rejects concurrent writers and releases the lock after errors", async () => {
    const { root } = await fixture();
    await mutateBundle(root, async () => {
      await expect(mutateBundle(root, async () => {})).rejects.toThrow();
    });
    await expect(mutateBundle(root, async () => { throw new Error("failed"); })).rejects.toThrow("failed");
    await expect(mutateBundle(root, async () => "ok")).resolves.toBe("ok");
  });
});

describe("deterministic image composition", () => {
  it("multiplies existing alpha by opacity, preserves RGB and repeats byte-for-byte", async () => {
    const { root } = await fixture();
    await addLayer(root, { filePath: await png(255, 0, 0, 0.5), type: "subject", zIndex: 0, opacity: 0.5 });
    expect(Array.from((await pixels(root)).subarray(0, 4))).toEqual([255, 0, 0, 64]);
    const manifest = await readManifest(root);
    expect(await renderCompositeBuffer(root, manifest)).toEqual(await renderCompositeBuffer(root, manifest));
  });
  it("clips negative offsets and oversized layers, and ignores off-canvas layers", async () => {
    const { root } = await fixture(2, 2);
    let manifest = await addLayer(root, { filePath: await png(255, 0, 0), type: "subject", zIndex: 0 });
    manifest.layers[0].transform = { x: -3, y: -3 }; await writeManifest(root, manifest);
    const data = await pixels(root);
    expect(Array.from(data.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(data[7]).toBe(0);
    manifest.layers[0].transform = { x: 20, y: 20 }; await writeManifest(root, manifest);
    expect([...await pixels(root)].every(v => v === 0)).toBe(true);
  });
  it("uses manifest array order for equal z-index and supports zero opacity", async () => {
    const { root } = await fixture();
    await addLayer(root, { filePath: await png(255, 0, 0), type: "background", zIndex: 0 });
    let manifest = await addLayer(root, { filePath: await png(0, 0, 255), type: "overlay", zIndex: 0 });
    expect(Array.from((await pixels(root)).subarray(0, 4))).toEqual([0, 0, 255, 255]);
    manifest.layers[1].opacity = 0; await writeManifest(root, manifest);
    expect(Array.from((await pixels(root)).subarray(0, 4))).toEqual([255, 0, 0, 255]);
  });
  it.each(["multiply", "screen"] as const)("supports %s blending", async blendMode => {
    const { root } = await fixture();
    await addLayer(root, { filePath: await png(255, 0, 0), type: "background", zIndex: 0 });
    await addLayer(root, { filePath: await png(0, 0, 255), type: "overlay", zIndex: 1, blendMode });
    expect(Array.from((await pixels(root)).subarray(0, 4))).toEqual(blendMode === "multiply" ? [0, 0, 0, 255] : [255, 0, 255, 255]);
  });
  it("scales and rotates around the transformed image bounding box", async () => {
    const { root } = await fixture(4, 4);
    const manifest = await addLayer(root, { filePath: await png(255, 0, 0, 1, 2, 1), type: "subject", zIndex: 0 });
    manifest.layers[0].transform = { scale: 2, rotation: 90 };
    await writeManifest(root, manifest);
    const data = await pixels(root);
    expect(data[3]).toBe(255); expect(data[11]).toBe(0); expect(data[(3 * 4) * 4 + 3]).toBe(255);
  });
  it("exports centered crops with valid nonzero dimensions and rejects malformed ratios", async () => {
    const { root } = await fixture(8, 4);
    await addLayer(root, { filePath: await png(50, 100, 150, 1, 8, 4), type: "background", zIndex: 0 });
    const before = await readManifest(root);
    const files = await exportBundle(root, { formats: ["1:1", "4:5", "9:16"] });
    expect(await Promise.all(files.map(async f => { const m = await sharp(f).metadata(); return [m.width, m.height]; }))).toEqual([[4, 4], [3, 4], [2, 4]]);
    for (const format of ["1:1:2", "../x", "0:1", "NaN:1"]) await expect(exportBundle(root, { formats: [format] })).rejects.toThrow();
    await expect(exportBundle(root, { formats: [] })).rejects.toThrow();
    expect(await readManifest(root)).toEqual(before);
  });
});
