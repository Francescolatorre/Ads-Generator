import { z } from "zod";

const transformSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().positive().optional(),
  rotation: z.number().optional(),
});

const layerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["background", "subject", "shadow", "overlay", "fx"]),
  file: z.string().min(1),
  z_index: z.number(),
  editable: z.boolean(),
  transform: transformSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  blend_mode: z.enum(["normal", "multiply", "screen"]).optional(),
});

const sourceSchema = z.object({
  input_image: z.string().optional(),
  decomposition_model: z.string().optional(),
  model_version: z.string().optional(),
});

const canvasSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  color_space: z.literal("sRGB"),
});

const masksSchema = z.object({
  subject: z.string().optional(),
  text_safe: z.string().optional(),
  logo_safe: z.string().optional(),
});

const constraintsSchema = z.object({
  min_subject_scale: z.number().positive().optional(),
  max_subject_scale: z.number().positive().optional(),
  locked_aspect_ratios: z.array(z.string()).optional(),
});

const provenanceSchema = z.object({
  created_at: z.string().optional(),
  pipeline_stage: z.string().optional(),
});

export const layerAssetManifestSchema = z.object({
  schema_version: z.literal("1.0"),
  asset_id: z.string().min(1),
  source: sourceSchema,
  canvas: canvasSchema,
  layers: z.array(layerSchema),
  masks: masksSchema.optional(),
  constraints: constraintsSchema.optional(),
  provenance: provenanceSchema.optional(),
});

export type LayerAssetManifestInput = z.input<typeof layerAssetManifestSchema>;
export type LayerAssetManifest = z.infer<typeof layerAssetManifestSchema>;
