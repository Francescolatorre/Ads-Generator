import { promises as fs } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import sharp from "sharp";
import { z } from "zod";
import { addLayer, initBundle, readManifest, writeManifest, mutateBundle, normalizeImage } from "../lib/layerAsset/io";
import { identifierSchema, layerAssetManifestSchema } from "../lib/layerAsset/schema";
import { bundleFile } from "../lib/layerAsset/files";
import { renderCompositeBuffer } from "../lib/layerAsset/render";
import { exportBundle } from "../lib/layerAsset/export";

import { DecompositionJobs } from "./decomposition/jobs";
import type { Config } from "./decomposition/providers";

const revision = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const editsSchema = z.object({
  revision: z.string(),
  layers: z.array(z.object({
    id: z.string(), opacity: z.number().min(0).max(1), z_index: z.number(),
    transform: z.object({ x: z.number(), y: z.number(), scale: z.number().positive().max(16), rotation: z.number() }),
  }).strict()).max(64),
}).strict();
async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) throw new Error("Upload exceeds 20 MiB");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

// A local development adapter, deliberately not a public production API.
export function layerAssetsMiddleware(root: string, jobs = new DecompositionJobs(root, { enabled: false })) {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith("/api/layer-assets")) return next();
    const json = (status: number, data: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify(data));
    };
    try {
      const host = req.headers.host ?? "";
      if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ||
          (req.headers.origin && req.headers.origin !== `http://${host}`) ||
          req.headers["x-layer-asset"] !== "1") {
        return json(403, { error: "Local same-origin requests only" });
      }
      await fs.mkdir(root, { recursive: true });
      const url = new URL(req.url, `http://${host}`);
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length < 2 || parts.length > 4 || parts[1] !== "layer-assets") return json(404, { error: "Not found" });
      const id = parts[2];
      const action = parts[3];
      if (id === "capabilities" && req.method === "GET") return json(200, jobs.capabilities());
      if (!id && req.method === "GET") {
        const assets = [];
        for (const entry of await fs.readdir(root, { withFileTypes: true })) {
          if (entry.isDirectory() && identifierSchema.safeParse(entry.name).success) {
            try { assets.push(await readManifest(await bundleFile(root, entry.name))); } catch { /* Ignore incomplete/invalid bundles. */ }
          }
        }
        return json(200, assets);
      }
      if (!id && req.method === "POST") {
        const png = await normalizeImage(await body(req));
        const metadata = await sharp(png).metadata();
        const assetId = randomUUID();
        const staging = await bundleFile(root, `.pending-${assetId}`);
        try {
          await initBundle(staging, { width: metadata.width!, height: metadata.height!, assetId, source: { input_image: "source/input.png" } });
          await fs.writeFile(await bundleFile(staging, "source/input.png"), png);
          const manifest = await addLayer(staging, { filePath: png, type: "background", zIndex: 0 });
          await fs.rename(staging, await bundleFile(root, assetId));
          return json(201, { manifest, revision: revision(manifest) });
        } catch (error) { await fs.rm(staging, { recursive: true, force: true }); throw error; }
      }
      if (!id) return json(405, { error: "Unsupported method" });
      identifierSchema.parse(id);
      const path = await bundleFile(root, id);
      const manifest = await readManifest(path);
      if (action === "decomposition" && req.method === "POST") return json(202, await jobs.start(path, JSON.parse((await body(req)).toString("utf8"))));
      if (action === "decomposition" && req.method === "GET") return json(200, await jobs.refresh(path));
      if (!action && req.method === "GET") return json(200, { manifest, revision: revision(manifest) });
      if (action === "preview" && req.method === "GET") {
        const png = await renderCompositeBuffer(path, manifest);
        res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
        return res.end(png);
      }
      if (action === "layers" && req.method === "POST") {
        const type = z.enum(["background", "subject", "shadow", "overlay", "fx"]).parse(url.searchParams.get("type") ?? "overlay");
        const updated = await addLayer(path, { filePath: await body(req), type, zIndex: Math.max(-1, ...manifest.layers.map(l => l.z_index)) + 1 });
        return json(200, { manifest: updated, revision: revision(updated) });
      }
      if (!action && req.method === "PUT") {
        const edits = editsSchema.parse(JSON.parse((await body(req)).toString("utf8")));
        return await mutateBundle(path, async () => {
          const current = await readManifest(path);
          if (revision(current) !== edits.revision) return json(409, { error: "Asset changed. Reopen it before saving." });
          if (edits.layers.length !== current.layers.length || new Set(edits.layers.map(l => l.id)).size !== edits.layers.length) throw new Error("Layer set cannot change through edits");
          const updated = layerAssetManifestSchema.parse({ ...current, layers: current.layers.map(layer => {
            const edit = edits.layers.find(l => l.id === layer.id);
            if (!edit) throw new Error("Unknown layer");
            return layer.editable ? { ...layer, ...edit } : layer;
          }) });
          await writeManifest(path, updated);
          return json(200, { manifest: updated, revision: revision(updated) });
        });
      }
      if (action === "export" && req.method === "POST") {
        const ratio = url.searchParams.get("ratio") ?? "1:1";
        const [file] = await exportBundle(path, { formats: [ratio] });
        res.writeHead(200, { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="${basename(file)}"`, "Cache-Control": "no-store" });
        return res.end(await fs.readFile(file));
      }
      return json(404, { error: "Not found" });
    } catch (error) {
      return json(400, { error: error instanceof Error ? error.message : String(error) });
    }
  };
}
export function layerAssetsPlugin(root: string, config: Config = { enabled: false }): Plugin {
  return { name: "local-layer-assets", apply: "serve", configureServer(server) {
    server.middlewares.use(layerAssetsMiddleware(root, new DecompositionJobs(root, config)));
  } };
}
