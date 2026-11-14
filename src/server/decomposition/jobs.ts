import { promises as fs } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import { bundleFile } from "../../lib/layerAsset/files";
import { initBundle, addLayer, readManifest, writeManifest, mutateBundle, imageOptions } from "../../lib/layerAsset/io";
import { renderBundle, renderCompositeBuffer } from "../../lib/layerAsset/render";
import { optionsSchema, startProvider, pollProvider, downloadLayers, model, REPLICATE_VERSION, type Config, type Options, type ProviderState, type Transport } from "./providers";

export const digest = (input: string | Buffer) => createHash("sha256").update(input).digest("hex");
export const startSchema = z.object({ ...optionsSchema.shape, requestId: z.string().uuid(), revision: z.string(), paidConsent: z.literal(true) }).strict();
export interface Job {
  id: string; sourceAsset: string; sourceHash: string; options: Options; createdAt: string;
  status: "submitting" | "processing" | "unknown" | "failed" | "completed";
  provider?: ProviderState; outputAsset?: string; error?: string;
}
export class DecompositionJobs {
  constructor(readonly root: string, readonly config: Config, readonly transport: Transport = fetch) {}
  capabilities() { return { enabled: this.config.enabled, providers: { replicate: !!this.config.replicate, runware: !!this.config.runware }, recommended: "replicate", qualityEvaluated: false }; }
  private async path(id: string) { z.string().uuid().parse(id); return bundleFile(this.root, `.jobs/${id}.json`); }
  private async store(job: Job) {
    const target = await this.path(job.id); const temp = `${target}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temp, JSON.stringify(job, null, 2), { flag: "wx" }); await fs.rename(temp, target); }
    finally { await fs.rm(temp, { force: true }); }
  }
  async latest(sourcePath: string): Promise<Job | null> {
    try {
      const id = (await fs.readFile(await bundleFile(sourcePath, "decomposition-job"), "utf8")).trim();
      return JSON.parse(await fs.readFile(await this.path(id), "utf8"));
    } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
  }
  async start(sourcePath: string, input: unknown): Promise<Job> {
    const request = startSchema.parse(input); const options = optionsSchema.parse({ provider: request.provider, layers: request.layers, seed: request.seed });
    if (!this.config.enabled || !this.config[options.provider]) throw new Error("Paid decomposition is disabled or credentials are missing");
    return mutateBundle(sourcePath, async () => {
      const manifest = await readManifest(sourcePath);
      const previous = await this.latest(sourcePath);
      if (previous?.id === request.requestId) return previous;
      if (previous && ["submitting", "processing", "unknown"].includes(previous.status)) throw new Error("A decomposition is already pending. Check its status; do not submit another paid request.");
      if (digest(JSON.stringify(manifest)) !== request.revision) throw new Error("Asset changed. Reopen it before decomposition.");
      if (!manifest.source.input_image) throw new Error("This asset has no persisted input image");
      const source = await fs.readFile(await bundleFile(sourcePath, manifest.source.input_image));
      if (source.length > 4 * 1024 * 1024) throw new Error("Input exceeds the 4 MiB evaluation limit");
      const metadata = await sharp(source, imageOptions).metadata();
      if (metadata.format !== "png" || (metadata.pages ?? 1) !== 1) throw new Error("Expected a persisted single-frame PNG source");
      await fs.mkdir(await bundleFile(this.root, ".jobs"), { recursive: true });
      const job: Job = { id: request.requestId, sourceAsset: manifest.asset_id, sourceHash: digest(source), options, createdAt: new Date().toISOString(), status: "submitting" };
      // Exclusive durable journal BEFORE a possibly billable POST.
      await fs.writeFile(await this.path(job.id), JSON.stringify(job), { flag: "wx" });
      await fs.writeFile(await bundleFile(sourcePath, "decomposition-job"), job.id);
      try {
        job.provider = await startProvider(options, source, job.id, this.config, this.transport);
        job.status = job.provider.status === "failed" ? "failed" : "processing";
      } catch {
        job.status = "unknown";
        job.error = "Submission outcome unknown. Check the provider dashboard; no automatic paid retry was made.";
        if (options.provider === "runware") job.provider = { id: job.id, status: "processing" };
      }
      await this.store(job); return job;
    });
  }
  async refresh(sourcePath: string): Promise<Job | null> {
    return mutateBundle(sourcePath, async () => {
      const job = await this.latest(sourcePath);
      if (!job || job.status === "completed" || job.status === "failed" && job.provider?.status !== "succeeded") return job;
      if (!job.provider) {
        job.status = "unknown"; job.error = "Provider submission may have been billed. Check the provider dashboard before retrying.";
        await this.store(job); return job;
      }
      // Poll failures leave the paid job recoverable. They never create a replacement job.
      const state = job.provider.status === "succeeded" ? job.provider : await pollProvider(job.options, job.provider.id, this.config, this.transport);
      if (state.id !== job.provider.id) throw new Error("Provider returned a different job ID");
      job.provider = state; job.status = state.status === "failed" ? "failed" : "processing"; delete job.error;
      await this.store(job);
      if (state.status === "succeeded") {
        try { job.outputAsset = await this.publish(sourcePath, job); job.status = "completed"; }
        catch { job.status = "failed"; job.error = "Provider result could not be validated/imported. Original asset preserved; inspect the provider job before any paid retry."; }
        await this.store(job);
      }
      return job;
    });
  }
  private async publish(sourcePath: string, job: Job): Promise<string> {
    const assetId = `decomposed-${job.id}`;
    const target = await bundleFile(this.root, assetId);
    try { const existing = await readManifest(target); if (existing.source.request_id === job.id) return assetId; throw new Error("Output collision"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    const sourceManifest = await readManifest(sourcePath);
    const source = await fs.readFile(await bundleFile(sourcePath, sourceManifest.source.input_image!));
    if (digest(source) !== job.sourceHash) throw new Error("Input source changed");
    const layers = await downloadLayers(job.options, job.provider!.urls ?? [], this.config, this.transport);
    let width = 0, height = 0;
    for (const layer of layers) {
      const metadata = await sharp(layer, imageOptions).metadata();
      if (metadata.format !== "png" || !metadata.hasAlpha || (metadata.pages ?? 1) !== 1) throw new Error("Expected RGBA PNG layer");
      if (metadata.width! > 2048 || metadata.height! > 2048) throw new Error("Layer exceeds evaluation dimensions");
      width ||= metadata.width!; height ||= metadata.height!;
      if (metadata.width !== width || metadata.height !== height) throw new Error("Layer canvas dimensions differ");
    }
    const staging = await bundleFile(this.root, `.pending-${job.id}-${randomUUID()}`);
    try {
      await initBundle(staging, { width, height, assetId, source: { input_image: "source/input.png", decomposition_model: model(job.options), model_version: job.provider!.version ?? (job.options.provider === "replicate" ? REPLICATE_VERSION : "provider-managed"), provider: job.options.provider, request_id: job.id, provider_job_id: job.provider!.id, parent_asset_id: job.sourceAsset, input_sha256: job.sourceHash, seed: job.options.seed } });
      await fs.writeFile(await bundleFile(staging, "source/input.png"), source);
      for (let i = 0; i < layers.length; i++) await addLayer(staging, { id: `layer-${i}`, filePath: layers[i], type: "overlay", zIndex: i });
      const manifest = await readManifest(staging);
      manifest.provenance = { ...manifest.provenance, pipeline_stage: "decomposed" }; await writeManifest(staging, manifest);
      await renderBundle(staging);
      const composite = await renderCompositeBuffer(staging, manifest);
      const reference = await sharp(source).resize(width, height, { fit: "fill" }).flatten({ background: "white" }).removeAlpha().raw().toBuffer();
      const actual = await sharp(composite).flatten({ background: "white" }).removeAlpha().raw().toBuffer();
      let absolute = 0; for (let i = 0; i < reference.length; i++) absolute += Math.abs(reference[i] - actual[i]);
      const report = { provider: job.options.provider, options: job.options, inputSHA256: job.sourceHash, width, height, layerSHA256: layers.map(digest), meanAbsoluteRGBError: absolute / reference.length, comparison: "source stretched to output size; both flattened on white; diagnostic only, not a quality pass", costUSD: job.provider!.cost ?? null, elapsedMs: Date.now() - Date.parse(job.createdAt), needsHumanReview: true };
      await fs.writeFile(await bundleFile(staging, "evaluation.json"), JSON.stringify(report, null, 2));
      await fs.rename(staging, target); return assetId;
    } catch (error) { await fs.rm(staging, { recursive: true, force: true }); throw error; }
  }
}
