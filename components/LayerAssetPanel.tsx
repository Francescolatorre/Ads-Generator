import React, { useEffect, useState } from "react";
import type { LayerAssetManifest } from "../src/lib/layerAsset/schema";
type Snapshot = { manifest: LayerAssetManifest; revision: string };
async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(`/api/layer-assets${path}`, {
    ...options, headers: { ...options.headers, "X-Layer-Asset": "1" },
  });
  if (!response.ok) throw new Error((await response.json()).error ?? "Asset request failed");
  return response;
}
export function LayerAssetPanel({ source }: { source: string | null }) {
  const [capabilities, setCapabilities] = useState<{ enabled: boolean; providers: Record<string, boolean>; processFlow?: boolean } | null>(null);
  const [centralUrl, setCentralUrl] = useState<string | null>(null);
  const [brand, setBrand] = useState("YOUR BRAND");
  const [headline, setHeadline] = useState("Made for your everyday.");
  const [cta, setCta] = useState("Discover more");
  const [marketingRatio, setMarketingRatio] = useState("4:5");
  const [marketingRequestId, setMarketingRequestId] = useState<string | null>(null);
  const [workflowExecution, setWorkflowExecution] = useState<string | null>(null);
  const [provider, setProvider] = useState("replicate");
  const [layerCount, setLayerCount] = useState(4);
  const [paidConsent, setPaidConsent] = useState(false);
  const [job, setJob] = useState<{ status: string; error?: string; outputAsset?: string; createdAt: string } | null>(null);
  const [assets, setAssets] = useState<LayerAssetManifest[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [ratio, setRatio] = useState("1:1");
  const [layerType, setLayerType] = useState("overlay");
  const refresh = async () => setAssets(await (await api("")).json());
  useEffect(() => {
    refresh().catch(e => setError(e.message));
    api("/capabilities").then(r => r.json()).then(value => {
      setCapabilities(value);
      setProvider(value.recommended === "runware" ? "runware" : "replicate");
      setPaidConsent(false);
    }).catch(e => setError(e.message));
  }, []);
  useEffect(() => { setMarketingRequestId(null); }, [brand, headline, cta, marketingRatio, snapshot?.manifest.asset_id, snapshot?.revision]);
  useEffect(() => {
    if (!snapshot || !job || !["processing", "submitting"].includes(job.status)) return;
    // One status request at a time; stop automatic polling after ten minutes.
    if (Date.now() - Date.parse(job.createdAt) > 10 * 60 * 1000) return;
    let active = true;
    const timer = setTimeout(() => {
      api(`/${snapshot.manifest.asset_id}/decomposition`).then(r => r.json()).then(value => { if (active) setJob(value); }).catch(e => { if (active) setError(e.message); });
    }, 5000);
    return () => { active = false; clearTimeout(timer); };
  }, [job, snapshot?.manifest.asset_id]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function accept(next: Snapshot) {
    setCentralUrl(null);
    setSnapshot(next); setDirty(false); setPreview(null); setJob(null); setPaidConsent(false);
    const blob = await (await api(`/${next.manifest.asset_id}/preview`)).blob();
    setPreview(URL.createObjectURL(blob));
    await refresh();
    setJob(await (await api(`/${next.manifest.asset_id}/decomposition`)).json());
    if (next.manifest.provenance?.pipeline_stage === "marketing-layout") {
      const record = await (await api(`/${next.manifest.asset_id}/marketing`)).json();
      setBrand(record.plan.brand); setHeadline(record.plan.headline); setCta(record.plan.cta); setMarketingRatio(record.plan.ratio);
      setWorkflowExecution(record.executionId);
    }
  }
  async function save() {
    if (!snapshot) return;
    const layers = snapshot.manifest.layers.map(l => ({
      id: l.id, opacity: l.opacity ?? 1, z_index: l.z_index,
      transform: { x: l.transform?.x ?? 0, y: l.transform?.y ?? 0, scale: l.transform?.scale ?? 1, rotation: l.transform?.rotation ?? 0 },
    }));
    await accept(await (await api(`/${snapshot.manifest.asset_id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: snapshot.revision, layers }),
    })).json());
  }
  function edit(index: number, field: string, value: number) {
    if (!snapshot) return;
    const layers = snapshot.manifest.layers.map((layer, i) => i !== index ? layer :
      ["opacity", "z_index"].includes(field) ? { ...layer, [field]: value } :
      { ...layer, transform: { ...layer.transform, [field]: value } });
    setSnapshot({ ...snapshot, manifest: { ...snapshot.manifest, layers } }); setDirty(true);
  }
  const control = "bg-slate-900 border border-white/20 rounded px-2 py-1 text-sm disabled:opacity-40";
  return <section className="mt-8 bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4" aria-label="Layer assets">
    <h2 className="text-xl font-semibold">Reusable layer assets</h2>
    <p className="text-sm text-white/60">Local workspace: save the uploaded image, import separate layers, then edit and export. Qwen decomposition requires server credentials and explicit paid-call consent.</p>
    <fieldset disabled={busy} className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <button className={control} disabled={!source || dirty} onClick={() => run(async () => {
          const blob = await (await fetch(`data:image/png;base64,${source}`)).blob();
          await accept(await (await api("", { method: "POST", body: blob })).json());
        })}>Save uploaded image as asset</button>
        <label>Open asset <select className={control} disabled={dirty} value={snapshot?.manifest.asset_id ?? ""} onChange={e => {
          const id = e.target.value;
          if (id) void run(async () => accept(await (await api(`/${id}`)).json()));
        }}>
          <option value="">Choose saved asset</option>
          {assets.map(a => <option key={a.asset_id} value={a.asset_id}>{a.asset_id.length === 36 ? a.asset_id.slice(0, 8) : a.asset_id} · {a.canvas.width} × {a.canvas.height}</option>)}
        </select></label>
      </div>
      {snapshot && <>
        <p className="text-xs text-white/60">{snapshot.manifest.asset_id} · {snapshot.manifest.canvas.width} × {snapshot.manifest.canvas.height}</p>
        <div className="border border-white/10 rounded p-3 space-y-3">
          <h3 className="font-semibold">Marketing layout · Process Flow</h3>
          <p className="text-sm text-white/60">Create a new layout from this saved composition. Process Flow receives your brief, not the image. No paid AI generation. Text can be revised here before creating another version.</p>
          <div className="flex flex-wrap gap-3">
            <label>Brand<input className={`${control} block`} maxLength={24} value={brand} onChange={e => setBrand(e.target.value)} /></label>
            <label>Headline<input className={`${control} block`} maxLength={70} value={headline} onChange={e => setHeadline(e.target.value)} /></label>
            <label>Call to action<input className={`${control} block`} maxLength={24} value={cta} onChange={e => setCta(e.target.value)} /></label>
            <label>Layout format<select className={`${control} block`} value={marketingRatio} onChange={e => setMarketingRatio(e.target.value)}>{["1:1", "4:5", "9:16"].map(r => <option key={r}>{r}</option>)}</select></label>
          </div>
          {!capabilities?.processFlow && <p role="note">Process Flow is not connected on this local server.</p>}
          {snapshot.manifest.provenance?.pipeline_stage === "marketing-layout" && snapshot.manifest.source.parent_asset_id && <button className={control} disabled={dirty} onClick={() => run(async () => accept(await (await api(`/${snapshot.manifest.source.parent_asset_id}`)).json()))}>Return to source · revise brief or format</button>}
          <button className={control} disabled={dirty || snapshot.manifest.provenance?.pipeline_stage === "marketing-layout" || !capabilities?.processFlow || !brand.trim() || !headline.trim() || !cta.trim()} onClick={() => run(async () => {
            const requestId = marketingRequestId ?? crypto.randomUUID(); setMarketingRequestId(requestId);
            const output = await (await api(`/${snapshot.manifest.asset_id}/marketing`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ assetId: snapshot.manifest.asset_id, revision: snapshot.revision, requestId, brand, headline, cta, ratio: marketingRatio }) })).json();
            setWorkflowExecution(output.executionId); await accept(output);
          })}>Create marketing asset · no AI charge</button>
          {workflowExecution && <p role="status" className="text-xs">Process Flow completed · {workflowExecution}</p>}
        </div>
        <div className="border border-white/10 rounded p-3 space-y-3">
          <h3 className="font-semibold">Automatic decomposition (evaluation)</h3>
          <p className="text-sm text-white/60">Sends the saved original image to the selected provider and creates a new asset. Review the resulting layers: decomposition can change text, colors and product details.</p>
          <div className="flex flex-wrap gap-3">
            <label>Provider <select className={control} value={provider} onChange={e => { setProvider(e.target.value); setPaidConsent(false); }}>
              <option value="replicate">Replicate</option><option value="runware">Runware</option>
            </select></label>
            <label>Layers <input className={`${control} w-16`} type="number" min="2" max="8" value={layerCount} onChange={e => { setLayerCount(e.target.valueAsNumber); setPaidConsent(false); }} /></label>
          </div>
          <p className="text-xs text-white/60">One prediction, seed 42. Provider charges apply, including some failed or interrupted runs. No automatic paid retries. Review current provider pricing before confirming.</p>
          {!capabilities?.enabled || !capabilities.providers[provider] ? <p role="note">Paid calls are locked. Configure the provider key and ALLOW_PAID_DECOMPOSITION on the local server after approving a budget.</p> : null}
          <label className="block text-sm"><input type="checkbox" checked={paidConsent} onChange={e => setPaidConsent(e.target.checked)} /> I approve this one paid prediction and sending this image to {provider}.</label>
          <button className={control} disabled={!capabilities?.enabled || !capabilities?.providers[provider] || !paidConsent || dirty || !Number.isInteger(layerCount) || layerCount < 2 || layerCount > 8 || !!job && ["processing", "submitting", "unknown"].includes(job.status)} onClick={() => run(async () => {
            setPaidConsent(false);
            setJob(await (await api(`/${snapshot.manifest.asset_id}/decomposition`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, layers: layerCount, seed: 42, paidConsent: true, requestId: crypto.randomUUID(), revision: snapshot.revision }) })).json());
          })}>Start paid decomposition</button>
          <button className={`${control} ml-3`} onClick={() => run(async () => setJob(await (await api(`/${snapshot.manifest.asset_id}/decomposition`)).json()))}>Check decomposition status</button>
          {job && <p role="status">Decomposition: {job.status}. {job.error}</p>}
          {job?.outputAsset && <button className={control} disabled={dirty} onClick={() => run(async () => accept(await (await api(`/${job.outputAsset}`)).json()))}>Open decomposed asset</button>}
        </div>
        <div className="border border-white/10 rounded p-3 space-y-2">
          <h3 className="font-semibold">Central asset library</h3>
          <p className="text-sm text-white/60">Upload this saved version, including images, layers and exports, to Process Flow for comparison and approval. This does not generate images or publish an ad.</p>
          <button className={control} disabled={dirty || !capabilities?.processFlow} onClick={() => run(async () => {
            const result = await (await api(`/${snapshot.manifest.asset_id}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: snapshot.revision }) })).json();
            setCentralUrl(result.viewerUrl);
          })}>Upload to Process Flow</button>
          {centralUrl && <p role="status">Stored centrally. <a className="underline" href={centralUrl} target="_blank" rel="noreferrer">Open comparison and approval</a></p>}
        </div>
        <label>Layer type <select className={control} value={layerType} onChange={e => setLayerType(e.target.value)}>
          {["background", "subject", "shadow", "overlay", "fx"].map(t => <option key={t}>{t}</option>)}
        </select></label>{" "}
        <label className="text-sm">Import layer <input type="file" accept="image/png,image/jpeg,image/webp,image/tiff" disabled={dirty} onChange={e => {
          const file = e.target.files?.[0]; e.target.value = "";
          if (file) void run(async () => accept(await (await api(`/${snapshot.manifest.asset_id}/layers?type=${layerType}`, { method: "POST", body: file })).json()));
        }} /></label>
        <div className="space-y-3">
          {snapshot.manifest.layers.map((layer, index) => <fieldset disabled={!layer.editable} key={layer.id} className="border border-white/10 rounded p-3">
            <legend className="text-sm">{index + 1}. {layer.id.match(/^(background|source-artwork|headline|call-to-action)$/) ? layer.id : layer.type} {layer.editable ? "" : "(locked)"}</legend>
            <div className="flex flex-wrap gap-3">
              {([
                ["opacity", "Opacity", layer.opacity ?? 1, 0, 1, 0.05],
                ["z_index", "Order", layer.z_index, undefined, undefined, 1],
                ["x", "X", layer.transform?.x ?? 0, undefined, undefined, 1],
                ["y", "Y", layer.transform?.y ?? 0, undefined, undefined, 1],
                ["scale", "Scale", layer.transform?.scale ?? 1, 0.01, 16, 0.01],
                ["rotation", "Rotation", layer.transform?.rotation ?? 0, undefined, undefined, 1],
              ] as const).map(([field, label, value, min, max, step]) => <label className="text-xs" key={field}>{label}<input className={`${control} block w-20`} type="number" value={value} min={min} max={max} step={step} onChange={e => edit(index, field, e.target.valueAsNumber)} /></label>)}
            </div>
          </fieldset>)}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className={control} disabled={!dirty} onClick={() => run(save)}>Save edits & refresh preview</button>
          <button className={control} disabled={!dirty} onClick={() => run(async () => accept(await (await api(`/${snapshot.manifest.asset_id}`)).json()))}>Discard edits / reload</button>
          <label>Export ratio <select className={control} value={ratio} onChange={e => setRatio(e.target.value)}>{["1:1", "4:5", "9:16", "16:9"].map(r => <option key={r}>{r}</option>)}</select></label>
          <button className={control} disabled={dirty} onClick={() => run(async () => {
            const blob = await (await api(`/${snapshot.manifest.asset_id}/export?ratio=${ratio}`, { method: "POST" })).blob();
            const url = URL.createObjectURL(blob); const link = document.createElement("a");
            link.href = url; link.download = `${snapshot.manifest.asset_id}_${ratio.replace(":", "x")}.png`; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          })}>Download PNG</button>
        </div>
        <p className="text-xs text-white/60">Exports use a centered crop at source resolution. {dirty ? "Unsaved changes — preview shows the last saved version." : "All edits saved locally."}</p>
        {preview && <img className="max-h-96 mx-auto object-contain" src={preview} alt="Saved layer composition" />}
      </>}
    </fieldset>
    {busy && <p role="status">Processing asset…</p>}
    {error && <p role="alert" className="text-red-300 whitespace-pre-wrap">{error}</p>}
  </section>;
}
