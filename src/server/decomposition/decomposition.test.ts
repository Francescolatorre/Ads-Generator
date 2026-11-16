import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { DecompositionJobs, digest } from "./jobs";
import { allowedOutput, downloadLayers, parseRunware, REPLICATE_VERSION, startProvider, type Options, type Transport } from "./providers";
import { initBundle, readManifest, validateBundle, writeManifest } from "../../lib/layerAsset/io";

const roots: string[] = [];
const config = { enabled: true, replicate: "test-secret", runware: "test-runware" };
const options: Options = { provider: "replicate", layers: 2, seed: 42 };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
async function png(alpha = 1) { return sharp({ create: { width: 4, height: 4, channels: 4, background: { r: 255, g: 0, b: 0, alpha } } }).png().toBuffer(); }
async function setup() {
  const root = await fs.mkdtemp(join(tmpdir(), "decomposition-")); roots.push(root);
  const sourcePath = join(root, "source-asset");
  const manifest = await initBundle(sourcePath, { width: 4, height: 4, assetId: "source-asset", source: { input_image: "source/input.png" } });
  await fs.writeFile(join(sourcePath, "source/input.png"), await png());
  return { root, sourcePath, manifest, request: { ...options, requestId: randomUUID(), revision: digest(JSON.stringify(manifest)), paidConsent: true } };
}
afterEach(async () => { for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true }); });

describe("payment boundary and durable jobs", () => {
  it("never calls a provider without server enablement, credentials and explicit consent", async () => {
    const { root, sourcePath, request } = await setup(); const transport = vi.fn();
    for (const cfg of [{ enabled: false, replicate: "x" }, { enabled: true }]) await expect(new DecompositionJobs(root, cfg, transport).start(sourcePath, request)).rejects.toThrow();
    await expect(new DecompositionJobs(root, config, transport).start(sourcePath, { ...request, paidConsent: false })).rejects.toThrow();
    expect(transport).not.toHaveBeenCalled();
  });
  it("pins the Replicate version and PNG output without disabling safety checks", async () => {
    const transport = vi.fn(async () => json({ id: "prediction-1", status: "starting" }));
    await startProvider(options, await png(), randomUUID(), config, transport);
    const [url, init] = (transport.mock.calls as unknown as [string, RequestInit][])[0];
    expect(url).toBe("https://api.replicate.com/v1/predictions");
    const body = JSON.parse(init.body as string);
    expect(body.version).toBe(REPLICATE_VERSION);
    expect(body.input).toMatchObject({ num_layers: 2, seed: 42, output_format: "png", disable_safety_checker: false, go_fast: false });
    expect(init.headers).toMatchObject({ "Cancel-After": "10m" });
  });
  it("does not duplicate a paid request after timeout or process restart", async () => {
    const { root, sourcePath, request } = await setup();
    const transport = vi.fn(async () => { throw new Error("lost response"); });
    const jobs = new DecompositionJobs(root, config, transport);
    expect((await jobs.start(sourcePath, request)).status).toBe("unknown");
    const restarted = new DecompositionJobs(root, config, transport);
    expect((await restarted.start(sourcePath, request)).status).toBe("unknown");
    await expect(restarted.start(sourcePath, { ...request, requestId: randomUUID() })).rejects.toThrow("already pending");
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("preserves the original and publishes normalized layers with provenance and diagnostic metrics", async () => {
    const { root, sourcePath, manifest, request } = await setup();
    const image = await png(); const transparent = await png(0);
    const transport: Transport = vi.fn(async (url, init) => {
      if (String(url).endsWith("/predictions")) return json({ id: "p1", status: "starting" });
      if (String(url).endsWith("/predictions/p1")) return json({ id: "p1", status: "succeeded", version: REPLICATE_VERSION, output: ["https://replicate.delivery/a.png", "https://replicate.delivery/b.png"] });
      expect(init?.headers).toMatchObject({ Authorization: "Bearer test-secret" });
      return new Response(String(url).endsWith("a.png") ? image : transparent);
    });
    const jobs = new DecompositionJobs(root, config, transport);
    await jobs.start(sourcePath, request);
    const result = await new DecompositionJobs(root, config, transport).refresh(sourcePath);
    expect(result?.status).toBe("completed");
    const outputPath = join(root, result!.outputAsset!);
    expect(await validateBundle(outputPath)).toEqual([]);
    const output = await readManifest(outputPath);
    expect(output.layers).toHaveLength(2); expect(output.layers.map(l => l.z_index)).toEqual([0, 1]);
    expect(output.source).toMatchObject({ provider: "replicate", parent_asset_id: "source-asset", seed: 42, provider_job_id: "p1" });
    expect(await readManifest(sourcePath)).toEqual(manifest);
    const report = JSON.parse(await fs.readFile(join(outputPath, "evaluation.json"), "utf8"));
    expect(report.meanAbsoluteRGBError).toBe(0); expect(report.needsHumanReview).toBe(true);
    const count = vi.mocked(transport).mock.calls.length;
    await jobs.refresh(sourcePath); expect(transport).toHaveBeenCalledTimes(count);
  });
  it("rejects stale revisions and oversized inputs before spending", async () => {
    const { root, sourcePath, request } = await setup(); const transport = vi.fn();
    const jobs = new DecompositionJobs(root, config, transport);
    await expect(jobs.start(sourcePath, { ...request, revision: "stale" })).rejects.toThrow("Asset changed");
    await fs.writeFile(join(sourcePath, "source/input.png"), Buffer.alloc(4 * 1024 * 1024 + 1));
    await expect(jobs.start(sourcePath, request)).rejects.toThrow("4 MiB"); expect(transport).not.toHaveBeenCalled();
  });
  it("retains a job on poll errors, then recovers without resubmitting", async () => {
    const { root, sourcePath, request } = await setup();
    const transport = vi.fn().mockResolvedValueOnce(json({ id: "p1", status: "starting" })).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(json({ id: "p1", status: "failed" }));
    const jobs = new DecompositionJobs(root, config, transport);
    await jobs.start(sourcePath, request); await expect(jobs.refresh(sourcePath)).rejects.toThrow("offline");
    expect((await jobs.latest(sourcePath))?.status).toBe("processing");
    expect((await jobs.refresh(sourcePath))?.status).toBe("failed");
    expect(transport.mock.calls.filter(([, init]) => init.method === "POST")).toHaveLength(1);
  });
  it("rejects corrupt output without publishing a partial asset or changing the original", async () => {
    const { root, sourcePath, manifest, request } = await setup();
    const transport = vi.fn(async (url: string | URL | Request) => String(url).includes("api.replicate.com") ? json({ id: "p1", status: "succeeded", output: ["https://replicate.delivery/a.png", "https://replicate.delivery/b.png"] }) : new Response("corrupt"));
    const jobs = new DecompositionJobs(root, config, transport); await jobs.start(sourcePath, request);
    expect((await jobs.refresh(sourcePath))?.status).toBe("failed");
    expect(await readManifest(sourcePath)).toEqual(manifest);
    expect((await fs.readdir(root)).filter(n => n.startsWith("decomposed-") || n.startsWith(".pending-"))).toEqual([]);
  });
});
describe("provider output normalization", () => {
  it.each(["http://replicate.delivery/a", "https://127.0.0.1/a", "https://replicate.delivery.evil.com/a", "https://user:password@replicate.delivery/a", "https://replicate.delivery:444/a"])("rejects untrusted URLs %s", url => { expect(() => allowedOutput(url, "replicate")).toThrow(); });
  it("rejects unexpected previews/counts before downloading", async () => {
    const transport = vi.fn(); await expect(downloadLayers(options, ["https://replicate.delivery/a.png"], config, transport)).rejects.toThrow("count"); expect(transport).not.toHaveBeenCalled();
  });
  it("decodes all Runware TIFF pages with transparency and order intact", async () => {
    const data = Buffer.from([255,0,0,255, 0,0,255,128]);
    const tiff = await sharp(data, { raw: { width: 1, height: 2, channels: 4, pageHeight: 1 } }).tiff({ compression: "lzw" }).toBuffer();
    const transport = vi.fn(async () => new Response(tiff));
    const pages = await downloadLayers({ ...options, provider: "runware" }, ["https://im.runware.ai/result.tiff"], config, transport);
    expect(pages).toHaveLength(2);
    expect(Array.from(await sharp(pages[1]).raw().toBuffer())).toEqual([0,0,255,128]);
  });
  it("rejects flattened TIFF and does not mistake separate generations for layers", async () => {
    const tiff = await sharp(await png()).tiff().toBuffer();
    await expect(downloadLayers({ ...options, provider: "runware" }, ["https://im.runware.ai/result.tiff"], config, vi.fn(async () => new Response(tiff)))).rejects.toThrow("TIFF page");
    expect(() => parseRunware({ data: [{ taskUUID: "other" }] }, "expected")).toThrow("task ID");
    expect(parseRunware({ errors: [{ code: "failed" }] }, "id").status).toBe("failed");
  });
  it("uses Runware nested inputs and one asynchronous TIFF result", async () => {
    const id = randomUUID(); const transport = vi.fn(async () => json({ data: [{ taskUUID: id, status: "processing" }] }));
    await startProvider({ ...options, provider: "runware" }, await png(), id, config, transport);
    const body = JSON.parse((transport.mock.calls as unknown as [string, RequestInit][])[0][1].body as string)[0];
    expect(body).toMatchObject({ taskUUID: id, deliveryMethod: "async", numberResults: 1, outputFormat: "TIFF", settings: { layers: 2 } });
    expect(body.inputs.referenceImages[0]).toMatch(/^data:image\/png;base64,/);
  });
});
