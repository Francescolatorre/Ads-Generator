import { loadEnv } from "vite";
import { workflow } from "../src/server/marketing/processFlow";

const env = loadEnv("development", process.cwd(), "");
const base = new URL(env.PROCESS_FLOW_URL || "https://not-configured.invalid");
if (!env.PROCESS_FLOW_URL || base.protocol !== "https:" || base.username || base.password || base.pathname !== "/" || base.search || base.hash) throw new Error("Configure PROCESS_FLOW_URL as an HTTPS origin first");
const headers = { "Content-Type": "application/json", ...(env.PROCESS_FLOW_API_TOKEN ? { Authorization: `Bearer ${env.PROCESS_FLOW_API_TOKEN}` } : {}) };
const check = await fetch(new URL(`/api/flows/${workflow.id}`, base), { headers, redirect: "error", signal: AbortSignal.timeout(15000) });
if (check.ok) {
  // Never overwrite an existing workflow, including a user's modified copy.
  console.log(`Workflow ${workflow.id} already exists; no changes made.`);
} else if (check.status === 404) {
  const result = await fetch(new URL("/api/flows", base), { method: "POST", headers, body: JSON.stringify(workflow), redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!result.ok) throw new Error(`Workflow installation HTTP ${result.status}; not retried`);
  console.log(`Installed ${workflow.id}. No flow or paid model was executed.`);
} else throw new Error(`Process Flow HTTP ${check.status}; no changes made`);
