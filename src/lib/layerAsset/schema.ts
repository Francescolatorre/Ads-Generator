import { z } from 'zod';

export const layerTransformSchema = z
  .object({
    x: z.number().optional(),
    y: z.number().optional(),
    scale: z.number().optional(),
    rotation: z.number().optional(),
  })
  .strict();

export const layerSchema = z
  .object({
    id: z.string(),
    type: z.enum(['background', 'subject', 'shadow', 'overlay', 'fx']),
    file: z.string(),
    z_index: z.number().int(),
    editable: z.boolean(),
    transform: layerTransformSchema.optional(),
    opacity: z.number().min(0).max(1).optional(),
    blend_mode: z.enum(['normal', 'multiply', 'screen']).optional(),
  })
  .strict();

export const manifestSchema = z
  .object({
    schema_version: z.literal('1.0'),
    asset_id: z.string(),
    source: z
      .object({
        input_image: z.string().optional(),
        decomposition_model: z.string().optional(),
        model_version: z.string().optional(),
      })
      .strict()
      .optional(),
    canvas: z
      .object({
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        color_space: z.literal('sRGB'),
      })
      .strict(),
    layers: z.array(layerSchema),
    masks: z
      .object({
        subject: z.string().optional(),
        text_safe: z.string().optional(),
        logo_safe: z.string().optional(),
      })
      .strict()
      .optional(),
    constraints: z
      .object({
        min_subject_scale: z.number().optional(),
        max_subject_scale: z.number().optional(),
        locked_aspect_ratios: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),
    provenance: z
      .object({
        created_at: z.string().optional(),
        pipeline_stage: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type ManifestSchema = z.infer<typeof manifestSchema>;
