export type LayerBlendMode = "normal" | "multiply" | "screen";

export type LayerType = "background" | "subject" | "shadow" | "overlay" | "fx";

export interface LayerTransform {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
}

export interface LayerDefinition {
  id: string;
  type: LayerType;
  file: string;
  z_index: number;
  editable: boolean;
  transform?: LayerTransform;
  opacity?: number;
  blend_mode?: LayerBlendMode;
}

export interface LayerAssetSource {
  input_image?: string;
  decomposition_model?: string;
  model_version?: string;
}

export interface LayerAssetCanvas {
  width: number;
  height: number;
  color_space: "sRGB";
}

export interface LayerAssetMasks {
  subject?: string;
  text_safe?: string;
  logo_safe?: string;
}

export interface LayerAssetConstraints {
  min_subject_scale?: number;
  max_subject_scale?: number;
  locked_aspect_ratios?: string[];
}

export interface LayerAssetProvenance {
  created_at?: string;
  pipeline_stage?: string;
}

export interface LayerAssetManifest {
  schema_version: "1.0";
  asset_id: string;
  source: LayerAssetSource;
  canvas: LayerAssetCanvas;
  layers: LayerDefinition[];
  masks?: LayerAssetMasks;
  constraints?: LayerAssetConstraints;
  provenance?: LayerAssetProvenance;
}
