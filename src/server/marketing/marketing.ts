import { promises as fs } from "node:fs";
import sharp from "sharp";
import { z } from "zod";
import { bundleFile } from "../../lib/layerAsset/files";
import { initBundle, addLayer, readManifest, writeManifest, mutateBundle } from "../../lib/layerAsset/io";
import { renderBundle, renderCompositeBuffer } from "../../lib/layerAsset/render";
import { exportBundle } from "../../lib/layerAsset/export";
import { digest } from "../decomposition/jobs";
import { briefSchema, planMarketing, type Plan, type ProcessFlowConfig } from "./processFlow";

export const marketingRequest = briefSchema.extend({ requestId: z.string().uuid(), revision: z.string() }).strict();
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]!);
const dimensions = { "1:1": [1080, 1080], "4:5": [1080, 1350], "9:16": [1080, 1920] } as const;

// Text remains stored as a brief and can be regenerated; PNG layers are editable spatially.
export async function renderMarketing(path: string, source: Buffer, plan: Plan, assetId: string, executionId: string) {
  const [width, height] = dimensions[plan.ratio];
  const svg = (content: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${content}</svg>`);
  const lines: string[] = []; let line = "";
  for (const word of plan.headline.split(/\s+/)) {
    // Long words are split conservatively; never let copy run outside the safe area.
    for (const part of word.match(/.{1,20}/gu) ?? []) {
      if ((line + " " + part).trim().length > 22) { lines.push(line); line = part; }
      else line = (line + " " + part).trim();
    }
  }
  if (line) lines.push(line);
  const titleSize = 68, titleY = 190;
  const artTop = titleY + lines.length * 80 + 20;
  const artHeight = height - artTop - 190;
  if (artHeight < 180) throw new Error("Headline too long for this layout; shorten it");
  await initBundle(path, { width, height, assetId, source: { input_image: "source/input.png", parent_asset_id: plan.assetId, input_sha256: digest(source) } });
  await fs.writeFile(await bundleFile(path, "source/input.png"), source);
  await addLayer(path, { id: "background", type: "background", zIndex: 0, filePath: await sharp(svg(`<rect width="100%" height="100%" fill="#f4f0e8"/><rect x="72" y="72" width="48" height="5" fill="#ba4b35"/>`)).png().toBuffer() });
  const artwork = await sharp(source).resize(900, artHeight, { fit: "inside" }).png().toBuffer();
  const meta = await sharp(artwork).metadata();
  const art = await sharp({ create: { width, height, channels: 4, background: "transparent" } }).composite([{ input: artwork, left: Math.round((width - meta.width!) / 2), top: artTop + Math.round((artHeight - meta.height!) / 2) }]).png().toBuffer();
  await addLayer(path, { id: "source-artwork", type: "subject", zIndex: 1, filePath: art });
  const copy = `<text x="145" y="86" font-family="sans-serif" font-size="23" letter-spacing="3" fill="#283b36">${escape(plan.brand)}</text>` + lines.map((text, i) => `<text x="72" y="${titleY + i * 80}" font-family="sans-serif" font-size="${titleSize}" font-weight="bold" fill="#183b34">${escape(text)}</text>`).join("");
  await addLayer(path, { id: "headline", type: "overlay", zIndex: 2, filePath: await sharp(svg(copy)).png().toBuffer() });
  await addLayer(path, { id: "call-to-action", type: "overlay", zIndex: 3, filePath: await sharp(svg(`<rect x="72" y="${height - 132}" width="620" height="64" rx="32" fill="#183b34"/><text x="110" y="${height - 89}" font-family="sans-serif" font-size="30" fill="#ffffff">${escape(plan.cta)}</text><path d="M 936 ${height - 110} l 24 10 -24 10 M 900 ${height - 100} h 60" fill="none" stroke="#ba4b35" stroke-width="3"/>`)).png().toBuffer() });
  const manifest = await readManifest(path);
  manifest.provenance = { ...manifest.provenance, pipeline_stage: "marketing-layout" };
  await writeManifest(path, manifest);
  await fs.writeFile(await bundleFile(path, "marketing.json"), JSON.stringify({ version: 1, plan, executionId, sourceCompositionSHA256: digest(source), costUSD: 0, textEditing: "regenerate-from-brief", sourceArtwork: "composite of saved source layers; original bundle preserved" }, null, 2));
  await renderBundle(path);
  await exportBundle(path, { formats: [plan.ratio] });
}

export class MarketingWorkflow {
  constructor(readonly root: string, readonly config: ProcessFlowConfig, readonly transport: typeof fetch = fetch) {}
  async run(input: unknown) {
    const request = marketingRequest.parse(input);
    const sourcePath = await bundleFile(this.root, request.assetId);
    return mutateBundle(sourcePath, async () => {
      const assetId = `marketing-${request.requestId}`;
      const target = await bundleFile(this.root, assetId);
      const journalDir = await bundleFile(this.root, ".marketing-jobs"); await fs.mkdir(journalDir, { recursive: true });
      const journal = await bundleFile(journalDir, `${request.requestId}.json`);
      const fingerprint = digest(JSON.stringify(request));
      let record: { fingerprint: string; plan?: Plan; executionId?: string };
      try { record = JSON.parse(await fs.readFile(journal, "utf8")); if (record.fingerprint !== fingerprint) throw new Error("Request ID already belongs to another brief"); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        const current = await readManifest(sourcePath);
        if (digest(JSON.stringify(current)) !== request.revision) throw new Error("Asset changed; reopen before creating a marketing asset");
        record = { fingerprint }; await fs.writeFile(journal, JSON.stringify(record), { flag: "wx" });
        const { requestId: _id, revision: _rev, ...brief } = request;
        const result = await planMarketing(this.config, brief, this.transport);
        record = { fingerprint, ...result };
        const temp = `${journal}.tmp`; await fs.writeFile(temp, JSON.stringify(record)); await fs.rename(temp, journal);
      }
      if (!record.plan || !record.executionId) throw new Error("Workflow outcome unknown. No automatic resubmission; inspect Process Flow before starting a new request.");
      try { const manifest = await readManifest(target); return { manifest, revision: digest(JSON.stringify(manifest)), executionId: record.executionId }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      const manifest = await readManifest(sourcePath);
      if (digest(JSON.stringify(manifest)) !== request.revision) throw new Error("Source changed since workflow submission");
      const source = await renderCompositeBuffer(sourcePath, manifest);
      const staging = await bundleFile(this.root, `.pending-${assetId}`);
      // A previous interrupted local render can be rebuilt without calling Process Flow again.
      await fs.rm(staging, { recursive: true, force: true });
      try {
        await renderMarketing(staging, source, record.plan, assetId, record.executionId);
        await fs.rename(staging, target);
      } catch (error) { await fs.rm(staging, { recursive: true, force: true }); throw error; }
      const output = await readManifest(target);
      return { manifest: output, revision: digest(JSON.stringify(output)), executionId: record.executionId };
    });
  }
}
