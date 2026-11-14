// Runtime validation and TypeScript share one canonical contract.
export type { LayerAssetManifest } from "./schema";
import type { LayerAssetManifest } from "./schema";
export type LayerDefinition = LayerAssetManifest["layers"][number];
export type LayerType = LayerDefinition["type"];
export type LayerBlendMode = NonNullable<LayerDefinition["blend_mode"]>;
export type LayerTransform = NonNullable<LayerDefinition["transform"]>;
export type LayerAssetSource = LayerAssetManifest["source"];
export type LayerAssetCanvas = LayerAssetManifest["canvas"];
export type LayerAssetMasks = NonNullable<LayerAssetManifest["masks"]>;
export type LayerAssetConstraints = NonNullable<LayerAssetManifest["constraints"]>;
export type LayerAssetProvenance = NonNullable<LayerAssetManifest["provenance"]>;
