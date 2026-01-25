export type ColorSpace = 'sRGB';

export type LayerType = 'background' | 'subject' | 'shadow' | 'overlay' | 'fx';
export type BlendMode = 'normal' | 'multiply' | 'screen';

export type LayerTransform = {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
};

export type LayerDefinition = {
  id: string;
  type: LayerType;
  file: string;
  z_index: number;
  editable: boolean;
  transform?: LayerTransform;
  opacity?: number;
  blend_mode?: BlendMode;
};

export type ManifestMasks = {
  subject?: string;
  text_safe?: string;
  logo_safe?: string;
};

export type ManifestConstraints = {
  min_subject_scale?: number;
  max_subject_scale?: number;
  locked_aspect_ratios?: string[];
};

export type ManifestProvenance = {
  created_at?: string;
  pipeline_stage?: string;
};

export type LayerAssetManifest = {
  schema_version: '1.0';
  asset_id: string;
  source?: {
    input_image?: string;
    decomposition_model?: string;
    model_version?: string;
  };
  canvas: {
    width: number;
    height: number;
    color_space: ColorSpace;
  };
  layers: LayerDefinition[];
  masks?: ManifestMasks;
  constraints?: ManifestConstraints;
  provenance?: ManifestProvenance;
};

export type InitBundleOptions = {
  bundlePath: string;
  width: number;
  height: number;
  assetId?: string;
};

export type AddLayerOptions = {
  bundlePath: string;
  type: LayerType;
  file: string;
  zIndex: number;
  id?: string;
  blendMode?: BlendMode;
  opacity?: number;
};

export type RenderOptions = {
  bundlePath: string;
};

export type ExportOptions = {
  bundlePath: string;
  formats: string[];
  outDir?: string;
};
