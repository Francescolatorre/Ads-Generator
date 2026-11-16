import { z } from "zod";
import workflow from "../../../workflows/marketing-asset-v1.json";
import { identifierSchema } from "../../lib/layerAsset/schema";

const copy = (max: number) => z.string().trim().min(1).max(max).refine(s => !/[\u0000-\u001f]/.test(s), "Use single-line text");
export const briefSchema = z.object({ assetId: identifierSchema, brand: copy(24), headline: copy(70), cta: copy(24), ratio: z.enum(["1:1", "4:5", "9:16"]) }).strict();
export const planSchema = briefSchema.extend({ version: z.literal(1), template: z.literal("editorial-v1"), paidGeneration: z.literal(false) }).strict();
export type Plan = z.infer<typeof planSchema>;
export type ProcessFlowConfig = { baseUrl?: string; token?: string };
export { workflow };

// This reviewed workflow has no external calls. Do not execute arbitrary user-supplied flows.
export async function planMarketing(config: ProcessFlowConfig, input: unknown, transport: typeof fetch = fetch) {
  const brief = briefSchema.parse(input);
  if (!config.baseUrl) throw new Error("Configure PROCESS_FLOW_URL on the server");
  const base = new URL(config.baseUrl);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new Error("Process Flow requires an HTTPS origin");
  const call = async (suffix: string, body?: unknown) => {
    const response = await transport(new URL(`/api/flows/${workflow.id}${suffix}`, base), {
      method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(25000),
      headers: { "Content-Type": "application/json", ...(config.token ? { Authorization: `Bearer ${config.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`Process Flow HTTP ${response.status}; no automatic retry`);
    const reader = response.body!.getReader(); const chunks: Uint8Array[] = []; let length = 0;
    try { while (true) { const { done, value } = await reader.read(); if (done) break; length += value.length; if (length > 256 * 1024) throw new Error("Process Flow response too large"); chunks.push(value); } }
    finally { await reader.cancel(); }
    const result = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (result.success !== true) throw new Error("Process Flow rejected request");
    return result.data;
  };
  const definition = await call("");
  // Canonical comparison tolerates object key reordering, not changed behavior.
  const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  if (canonical(definition.nodes) !== canonical(workflow.nodes) || canonical(definition.edges) !== canonical(workflow.edges)) throw new Error("Remote workflow differs from reviewed cost-free workflow; execution blocked");
  const result = await call("/run", { inputs: brief, timeout: 20 });
  const plan = planSchema.parse(result.output);
  if (canonical(briefSchema.parse(Object.fromEntries(Object.keys(brief).map(k => [k, plan[k as keyof Plan]])))) !== canonical(brief)) throw new Error("Workflow changed the submitted brief");
  return { plan, executionId: z.string().uuid().parse(result.executionId) };
}
