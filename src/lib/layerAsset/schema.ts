import { z } from "zod";

// Portable paths; physical containment is checked by I/O.
export const bundleFileSchema = z.string().min(1).refine(
  value => !/[\\:\x00]/.test(value) && !value.startsWith("/") &&
    value.split("/").every(part => part !== ".." && part !== "." && part !== ""),
  "Expected a portable, bundle-relative path",
);
export const identifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/);

const transformSchema = z.object({
  x: z.number().optional(),
  y: z.number().optional(),
  scale: z.number().positive().optional(),
  rotation: z.number().optional(),
});

const layerSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["background", "subject", "shadow", "overlay", "fx"]),
  file: bundleFileSchema,
  z_index: z.number(),
  editable: z.boolean(),
  transform: transformSchema.optional(),
  opacity: z.number().min(0).max(1).optional(),
  blend_mode: z.enum(["normal", "multiply", "screen"]).optional(),
});

const sourceSchema = z.object({
  input_image: bundleFileSchema.optional(),
  decomposition_model: z.string().optional(),
  model_version: z.string().optional(),
  provider: z.enum(["replicate", "runware"]).optional(),
  request_id: z.string().uuid().optional(),
  provider_job_id: z.string().optional(),
  parent_asset_id: identifierSchema.optional(),
  input_sha256: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  seed: z.number().int().nonnegative().optional(),
});

const canvasSchema = z.object({
  width: z.number().int().positive().max(8192),
  height: z.number().int().positive().max(8192),
  color_space: z.literal("sRGB"),
});

const masksSchema = z.object({
  subject: bundleFileSchema.optional(),
  text_safe: bundleFileSchema.optional(),
  logo_safe: bundleFileSchema.optional(),
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
  asset_id: identifierSchema,
  source: sourceSchema,
  canvas: canvasSchema,
  layers: z.array(layerSchema).max(64).refine(layers => new Set(layers.map(l => l.id)).size === layers.length, "Duplicate layer IDs"),
  masks: masksSchema.optional(),
  constraints: constraintsSchema.optional(),
  provenance: provenanceSchema.optional(),
});

export type LayerAssetManifestInput = z.input<typeof layerAssetManifestSchema>;
export type LayerAssetManifest = z.infer<typeof layerAssetManifestSchema>;
