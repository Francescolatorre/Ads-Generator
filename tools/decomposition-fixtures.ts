import sharp from "sharp";
import { promises as fs } from "node:fs";
import { resolve, join } from "node:path";
import { initBundle, addLayer } from "../src/lib/layerAsset/io";

// Generates our own test images locally. No network, credentials or inference.
const cases = {
  product: '<rect width="512" height="512" fill="#e9e4da"/><ellipse cx="256" cy="414" rx="104" ry="20" fill="#b8b2a8"/><rect x="180" y="140" width="152" height="264" rx="25" fill="#367676"/><rect x="204" y="105" width="104" height="45" rx="8" fill="#183e3e"/><rect x="195" y="240" width="122" height="90" rx="8" fill="#fff4d5"/>',
  shadows: '<rect width="512" height="512" fill="#edeff5"/><ellipse cx="290" cy="408" rx="165" ry="24" fill="#a6adbd" opacity="0.45"/><circle cx="248" cy="242" r="126" fill="#f2a65a"/><circle cx="248" cy="242" r="78" fill="#edeff5"/><path d="M110 390 Q200 320 380 398" fill="none" stroke="#252b36" stroke-width="5"/><rect x="185" y="342" width="120" height="57" rx="8" fill="#426e9f"/>',
  typography: '<rect width="512" height="512" fill="#16233b"/><rect x="145" y="172" width="222" height="245" rx="22" fill="#d97767"/><text x="256" y="100" text-anchor="middle" font-size="48" font-family="sans-serif" fill="white">NOVA</text><rect x="173" y="240" width="166" height="78" fill="#fff5e6"/><text x="256" y="290" text-anchor="middle" font-size="30" font-family="sans-serif" fill="#16233b">PURE 01</text>',
};
for (const [name, content] of Object.entries(cases)) {
  const assetId = `evaluation-${name}`; const path = resolve("assets", assetId);
  try { await fs.access(join(path, "manifest.json")); console.log(`Already exists: ${assetId}`); continue; } catch {}
  const png = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">${content}</svg>`)).ensureAlpha().png().toBuffer();
  await initBundle(path, { width: 512, height: 512, assetId, source: { input_image: "source/input.png" } });
  await fs.writeFile(join(path, "source/input.png"), png);
  await addLayer(path, { type: "background", filePath: png, zIndex: 0 });
  console.log(`Prepared ${assetId}; no paid call made`);
}
