import { promises as fs } from "node:fs";
import { z } from "zod";
import { bundleFile } from "../../lib/layerAsset/files";
import { readManifest, mutateBundle } from "../../lib/layerAsset/io";
import { renderCompositeBuffer } from "../../lib/layerAsset/render";
import { digest } from "../decomposition/jobs";
import type { ProcessFlowConfig } from "./processFlow";

export async function publishAsset(path: string, revision: string, config: ProcessFlowConfig, transport: typeof fetch = fetch) {
  if (!config.baseUrl) throw new Error("Process Flow is not configured");
  const base = new URL(config.baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error("Process Flow requires an HTTPS origin");
  return mutateBundle(path, async () => {
    const manifest = await readManifest(path);
    if (digest(JSON.stringify(manifest)) !== revision) throw new Error("Asset changed; save or reopen before uploading");
    const names = new Set(manifest.layers.map(l => l.file));
    if (manifest.source.input_image) names.add(manifest.source.input_image);
    let label = manifest.asset_id;
    try {
      const marketing = JSON.parse(await fs.readFile(await bundleFile(path, "marketing.json"), "utf8"));
      label = `${marketing.plan.brand} · ${marketing.plan.ratio}`; names.add("marketing.json");
    } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
    // Existing exports may predate layer edits. Publish only an export of this exact snapshot.
    const preview = await renderCompositeBuffer(path, manifest);
    const entries = [{ path: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2)) }, { path: "previews/composite.png", data: preview }, { path: "exports/composite.png", data: preview }];
    for (const name of names) entries.push({ path: name, data: await fs.readFile(await bundleFile(path, name)) });
    if (entries.length > 72 || entries.reduce((sum, f) => sum + f.data.length, 0) > 40 * 1024 * 1024) throw new Error("Bundle exceeds central storage upload limits");
    const response = await transport(new URL("/api/assets", base), { method: "POST", redirect: "error", signal: AbortSignal.timeout(90000), headers: { "Content-Type": "application/json", ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) }, body: JSON.stringify({ collectionId: manifest.source.parent_asset_id ?? manifest.asset_id, label: label.slice(0, 100), files: entries.map(f => ({ path: f.path, base64: f.data.toString("base64") })) }) });
    if (!response.ok) throw new Error(`Central asset upload HTTP ${response.status}; no automatic retry`);
    const reader = response.body!.getReader(); let bytes = 0; const chunks: Uint8Array[] = [];
    try { while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.length; if (bytes > 2 * 1024 * 1024) throw new Error("Upload response too large"); chunks.push(value); } }
    finally { await reader.cancel(); }
    const result = z.object({ success: z.literal(true), data: z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), revision: z.number().int().nonnegative() }) }).parse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    const record = { assetId: result.data.id, viewerUrl: new URL(`/assets?asset=${result.data.id}`, base).href, uploadedAt: new Date().toISOString() };
    const target = await bundleFile(path, "central-storage.json"), temp = `${target}.tmp`;
    try { await fs.writeFile(temp, JSON.stringify(record, null, 2)); await fs.rename(temp, target); }
    finally { await fs.rm(temp, { force: true }); }
    return record;
  });
}
