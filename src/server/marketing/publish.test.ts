import { promises as fs } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { afterEach, expect, it, vi } from "vitest";
import { initBundle, addLayer, readManifest } from "../../lib/layerAsset/io";
import { digest } from "../decomposition/jobs";
import { publishAsset } from "./publish";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
async function setup() { const root = await fs.mkdtemp(join(tmpdir(), "publish-")); roots.push(root); await initBundle(root, { width: 8, height: 8, assetId: "sample" }); const png = await sharp({ create: { width: 8, height: 8, channels: 4, background: "red" } }).png().toBuffer(); const manifest = await addLayer(root, { filePath: png, type: "subject", zIndex: 0 }); return { root, manifest, revision: digest(JSON.stringify(manifest)) }; }
it("uploads an exact snapshot with layers and fresh preview without changing source", async () => {
  const { root, manifest, revision } = await setup();
  await fs.writeFile(join(root, "exports/stale.png"), "stale export");
  const fetch = vi.fn(async (_url, init) => {
    const upload = JSON.parse(init.body); expect(upload.collectionId).toBe("sample"); expect(upload.files.map((f: { path: string }) => f.path)).toContain(manifest.layers[0].file);
    expect(upload.files.some((f: { path: string }) => f.path === "previews/composite.png")).toBe(true); expect(init.redirect).toBe("error");
    const preview = upload.files.find((f: { path: string }) => f.path === "previews/composite.png");
    expect(upload.files.find((f: { path: string }) => f.path === "exports/composite.png").base64).toBe(preview.base64);
    expect(upload.files.some((f: { path: string }) => f.path.endsWith("stale.png"))).toBe(false);
    return new Response(JSON.stringify({ success: true, data: { id: "a".repeat(64), revision: 0 } }));
  });
  const result = await publishAsset(root, revision, { baseUrl: "https://flow.example.test" }, fetch);
  expect(result.viewerUrl).toBe(`https://flow.example.test/assets?asset=${"a".repeat(64)}`); expect(await readManifest(root)).toEqual(manifest); expect(fetch).toHaveBeenCalledTimes(1);
});
it("blocks stale uploads and never automatically retries a failed upload", async () => {
  const { root, revision } = await setup(); const fetch = vi.fn(async () => new Response("private detail", { status: 500 }));
  await expect(publishAsset(root, "stale", { baseUrl: "https://flow.example.test" }, fetch)).rejects.toThrow("changed"); expect(fetch).not.toHaveBeenCalled();
  await expect(publishAsset(root, revision, { baseUrl: "https://flow.example.test" }, fetch)).rejects.toThrow("HTTP 500"); expect(fetch).toHaveBeenCalledTimes(1);
});
