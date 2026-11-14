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
  const [assets, setAssets] = useState<LayerAssetManifest[]>([]);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [ratio, setRatio] = useState("1:1");
  const [layerType, setLayerType] = useState("overlay");
  const refresh = async () => setAssets(await (await api("")).json());
  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function accept(next: Snapshot) {
    setSnapshot(next); setDirty(false); setPreview(null);
    const blob = await (await api(`/${next.manifest.asset_id}/preview`)).blob();
    setPreview(URL.createObjectURL(blob));
    await refresh();
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
    <p className="text-sm text-white/60">Local workspace: save the uploaded image, import separate layers, then edit and export. Automatic image decomposition is not connected yet.</p>
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
          {assets.map(a => <option key={a.asset_id} value={a.asset_id}>{a.asset_id.slice(0, 8)} · {a.canvas.width} × {a.canvas.height}</option>)}
        </select></label>
      </div>
      {snapshot && <>
        <p className="text-xs text-white/60">{snapshot.manifest.asset_id} · {snapshot.manifest.canvas.width} × {snapshot.manifest.canvas.height}</p>
        <label>Layer type <select className={control} value={layerType} onChange={e => setLayerType(e.target.value)}>
          {["background", "subject", "shadow", "overlay", "fx"].map(t => <option key={t}>{t}</option>)}
        </select></label>{" "}
        <label className="text-sm">Import layer <input type="file" accept="image/png,image/jpeg,image/webp,image/tiff" disabled={dirty} onChange={e => {
          const file = e.target.files?.[0]; e.target.value = "";
          if (file) void run(async () => accept(await (await api(`/${snapshot.manifest.asset_id}/layers?type=${layerType}`, { method: "POST", body: file })).json()));
        }} /></label>
        <div className="space-y-3">
          {snapshot.manifest.layers.map((layer, index) => <fieldset disabled={!layer.editable} key={layer.id} className="border border-white/10 rounded p-3">
            <legend className="text-sm">{index + 1}. {layer.type} {layer.editable ? "" : "(locked)"}</legend>
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
