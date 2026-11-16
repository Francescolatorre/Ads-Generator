import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { initBundle, addLayer, readManifest, validateBundle } from "../../lib/layerAsset/io";
import { renderCompositeBuffer } from "../../lib/layerAsset/render";
import { digest } from "../decomposition/jobs";
import { planMarketing, workflow } from "./processFlow";
import { MarketingWorkflow } from "./marketing";

const roots: string[] = [];
const brief = { assetId: "source", brand: "NOVA", headline: "Everyday, considered.", cta: "Discover more", ratio: "4:5" as const };
const config = { baseUrl: "https://flow.example.test", token: "secret-test-token" };
const response = (data: unknown) => new Response(JSON.stringify({ success: true, data }));
const transport = () => vi.fn(async (_url: unknown, options?: RequestInit) => options?.method === "POST" ? response({ output: { ...JSON.parse(options.body as string).inputs, version: 1, template: "editorial-v1", paidGeneration: false }, executionId: "167df057-284f-477c-afb6-38aa0d6e738f" }) : response(workflow));
async function setup() {
  const root = await fs.mkdtemp(join(tmpdir(), "marketing-")); roots.push(root);
  const source = join(root, "source");
  await initBundle(source, { width: 64, height: 64, assetId: "source" });
  const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: "#389481" } }).png().toBuffer();
  const m = await addLayer(source, { filePath: png, type: "subject", zIndex: 0 });
  return { root, source, m, request: { ...brief, revision: digest(JSON.stringify(m)), requestId: randomUUID() } };
}
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });
describe("reviewed Process Flow boundary", () => {
  it("blocks modified remote workflows before execution", async () => {
    const changed = structuredClone(workflow); changed.nodes[1].type = "http_request";
    const fetch = vi.fn(async () => response(changed));
    await expect(planMarketing(config, brief, fetch)).rejects.toThrow("differs"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("does not follow redirects or expose credentials in errors", async () => {
    const fetch = vi.fn(async (_url, init) => { expect(init.redirect).toBe("error"); return new Response("secret-test-token", { status: 401 }); });
    await expect(planMarketing(config, brief, fetch)).rejects.toThrow("HTTP 401");
    await expect(planMarketing({ baseUrl: "http://flow.example.test" }, brief, fetch)).rejects.toThrow("HTTPS");
  });
  it("rejects changed briefs and paid output instructions", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(response(workflow)).mockResolvedValueOnce(response({ output: { ...brief, version: 1, template: "editorial-v1", paidGeneration: true }, executionId: randomUUID() }));
    await expect(planMarketing(config, brief, fetch)).rejects.toThrow();
  });
});
describe("marketing assets", () => {
  it.each(["1:1", "4:5", "9:16"] as const)("renders %s with separate layers, original intact and repeat-safe request", async ratio => {
    const { root, source, m, request } = await setup(); const fetch = transport();
    const jobs = new MarketingWorkflow(root, config, fetch);
    const input = { ...request, ratio, headline: 'Less <noise> & more life.' };
    const result = await jobs.run(input); const path = join(root, result.manifest.asset_id);
    expect(result.manifest.layers.map(l => l.id)).toEqual(["background", "source-artwork", "headline", "call-to-action"]);
    expect(await validateBundle(path)).toEqual([]); expect(await readManifest(source)).toEqual(m);
    expect(await fs.readdir(join(path, "exports"))).toHaveLength(1);
    const a = await renderCompositeBuffer(path, result.manifest); const b = await renderCompositeBuffer(path, result.manifest); expect(a.equals(b)).toBe(true);
    expect((await jobs.run(input)).manifest).toEqual(result.manifest); expect(fetch).toHaveBeenCalledTimes(2);
    const edited = structuredClone(result.manifest); edited.layers[2].opacity = 0;
    expect(a.equals(await renderCompositeBuffer(path, edited))).toBe(false);
    await expect(jobs.run({ ...input, cta: "Changed" })).rejects.toThrow("another brief");
  });
  it("checks stale revisions before any remote work", async () => {
    const { root, request } = await setup(); const fetch = transport();
    await expect(new MarketingWorkflow(root, config, fetch).run({ ...request, revision: "stale" })).rejects.toThrow("changed"); expect(fetch).not.toHaveBeenCalled();
  });
  it("does not resubmit an ambiguous remote run after restart", async () => {
    const { root, request } = await setup(); const fetch = vi.fn().mockResolvedValueOnce(response(workflow)).mockRejectedValueOnce(new Error("offline"));
    await expect(new MarketingWorkflow(root, config, fetch).run(request)).rejects.toThrow("offline");
    await expect(new MarketingWorkflow(root, config, fetch).run(request)).rejects.toThrow("unknown"); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
