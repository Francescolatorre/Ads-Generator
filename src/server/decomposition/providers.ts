import { z } from "zod";
import sharp from "sharp";
import { imageOptions } from "../../lib/layerAsset/io";

export const REPLICATE_VERSION = "0890ff07096bd81d93b920ac1918f29134e8053f28b31b9b42774216c80b6172";
export const optionsSchema = z.object({ provider: z.enum(["replicate", "runware"]), layers: z.number().int().min(2).max(8), seed: z.number().int().min(0).max(2147483647) }).strict();
export type Options = z.infer<typeof optionsSchema>;
export type ProviderState = { status: "processing" | "succeeded" | "failed"; id: string; urls?: string[]; version?: string; cost?: number };
export type Config = { enabled: boolean; replicate?: string; runware?: string };
export type Transport = typeof fetch;
const REPLICATE = "https://api.replicate.com/v1";
const RUNWARE = "https://api.runware.ai/v1";
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/);
export function model(options: Options) { return options.provider === "replicate" ? "qwen/qwen-image-layered" : "alibaba:qwen-image@layered"; }
export function keyFor(config: Config, provider: Options["provider"]) {
  const key = config[provider];
  if (!key) throw new Error(`Configure ${provider} credentials on the server first`);
  return key;
}
async function bounded(response: Response, maximum: number) {
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}; request was not retried`);
  if (Number(response.headers.get("content-length")) > maximum) throw new Error("Provider response too large");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty provider response");
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.length;
      if (size > maximum) throw new Error("Provider response too large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
async function json(transport: Transport, url: string, key: string, payload?: unknown) {
  const response = await transport(url, {
    method: payload === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(url === `${REPLICATE}/predictions` ? { "Cancel-After": "10m" } : {}) },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  return JSON.parse((await bounded(response, 2 * 1024 * 1024)).toString("utf8"));
}
export function parseReplicate(value: unknown): ProviderState {
  const p = z.object({ id: idSchema, status: z.enum(["starting", "processing", "succeeded", "failed", "canceled"]), output: z.array(z.string().url()).max(8).nullable().optional(), version: z.string().optional() }).parse(value);
  return { id: p.id, status: p.status === "succeeded" ? "succeeded" : ["failed", "canceled"].includes(p.status) ? "failed" : "processing", urls: p.output ?? undefined, version: p.version };
}
export function parseRunware(value: unknown, id: string): ProviderState {
  const p = z.object({ data: z.array(z.object({ taskUUID: z.string(), status: z.string().optional(), imageURL: z.string().url().optional(), cost: z.number().optional() })).default([]), errors: z.array(z.unknown()).default([]) }).parse(value);
  if (p.errors.length) return { id, status: "failed" };
  const rows = p.data.filter(row => row.taskUUID === id);
  if (rows.length !== 1) throw new Error("Unexpected Runware result count or task ID");
  const row = rows[0];
  if (row.status === "error") return { id, status: "failed" };
  return { id, status: row.imageURL ? "succeeded" : "processing", urls: row.imageURL ? [row.imageURL] : undefined, cost: row.cost };
}
export async function startProvider(options: Options, source: Buffer, requestId: string, config: Config, transport: Transport = fetch): Promise<ProviderState> {
  if (!config.enabled) throw new Error("Paid decomposition is disabled on this server");
  const key = keyFor(config, options.provider);
  if (source.length > 4 * 1024 * 1024) throw new Error("Provider input exceeds the 4 MiB evaluation limit");
  const image = `data:image/png;base64,${source.toString("base64")}`;
  // Never retry creation: a lost response can still mean a billed prediction.
  if (options.provider === "replicate") return parseReplicate(await json(transport, `${REPLICATE}/predictions`, key, {
    version: REPLICATE_VERSION, input: { image, num_layers: options.layers, seed: options.seed, description: "auto", output_format: "png", go_fast: false, disable_safety_checker: false },
  }));
  return parseRunware(await json(transport, RUNWARE, key, [{ taskType: "imageInference", taskUUID: requestId,
    model: model(options), deliveryMethod: "async", outputType: "URL", outputFormat: "TIFF", numberResults: 1,
    positivePrompt: "Decompose the supplied image into independent RGBA layers. Preserve the original composition, product details, text, colors and shadows when recomposited.",
    inputs: { referenceImages: [image] }, settings: { layers: options.layers }, seed: options.seed, steps: 30, includeCost: true,
  }]), requestId);
}
export async function pollProvider(options: Options, id: string, config: Config, transport: Transport = fetch): Promise<ProviderState> {
  idSchema.parse(id); const key = keyFor(config, options.provider);
  return options.provider === "replicate"
    ? parseReplicate(await json(transport, `${REPLICATE}/predictions/${id}`, key))
    : parseRunware(await json(transport, RUNWARE, key, [{ taskType: "getResponse", taskUUID: id }]), id);
}
export function allowedOutput(url: string, provider: Options["provider"]) {
  const u = new URL(url);
  const allowed = provider === "replicate" ? u.hostname === "replicate.delivery" || u.hostname.endsWith(".replicate.delivery") : u.hostname === "im.runware.ai";
  if (!allowed || u.protocol !== "https:" || u.username || u.password || u.port) throw new Error("Untrusted provider output URL");
  return u.href;
}
export async function downloadLayers(options: Options, urls: string[], config: Config, transport: Transport = fetch): Promise<Buffer[]> {
  if (urls.length !== (options.provider === "runware" ? 1 : options.layers)) throw new Error("Unexpected layer output count; no preview or layer will be silently dropped");
  const files: Buffer[] = [];
  for (const url of urls) {
    const response = await transport(allowedOutput(url, options.provider), { redirect: "error", signal: AbortSignal.timeout(60000),
      headers: options.provider === "replicate" ? { Authorization: `Bearer ${keyFor(config, options.provider)}` } : {},
    });
    files.push(await bounded(response, 64 * 1024 * 1024));
  }
  if (options.provider === "runware") {
    const metadata = await sharp(files[0], imageOptions).metadata();
    if (metadata.format !== "tiff" || metadata.pages !== options.layers) throw new Error("Expected one TIFF page per requested layer; ambiguous output rejected");
    const pages: Buffer[] = [];
    for (let page = 0; page < options.layers; page++) {
      const image = sharp(files[0], { ...imageOptions, page, pages: 1 });
      if (!(await image.metadata()).hasAlpha) throw new Error("Provider layer has no alpha channel");
      pages.push(await image.toColourspace("srgb").png().toBuffer());
    }
    return pages;
  }
  return files;
}
