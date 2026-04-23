import { z } from 'zod'

export const idParamSchema = z.object({
  id: z.string().regex(/^\d+$/, 'id must be a positive integer').transform(Number),
})

export const analysisCreateSchema = z.object({
  name: z.string().min(1).max(200),
})

export const analysisPatchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    view_mode: z.enum(['optimized', 'single_node']).optional(),
    excluded_locations: z.array(z.number().int().nonnegative()).optional(),
    projected_order_count: z.number().int().nonnegative().nullable().optional(),
    projected_period: z.enum(['month', 'year']).optional(),
    status: z.enum(['draft', 'complete']).optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'no fields to update' })

export const warehouseCreateSchema = z.object({
  provider_name: z.string().min(1).max(200),
  location_label: z.string().min(1).max(200),
  origin_zip: z.string().min(1).max(10),
  dim_weight_enabled: z.boolean().optional().default(false),
  dim_factor: z.number().int().positive().nullable().optional(),
  surcharge_flat_cents: z.number().int().nonnegative().optional().default(0),
  notes: z.string().nullable().optional(),
})

export const warehousePatchSchema = z
  .object({
    provider_name: z.string().min(1).max(200).optional(),
    location_label: z.string().min(1).max(200).optional(),
    origin_zip: z.string().min(1).max(10).optional(),
    dim_weight_enabled: z.boolean().optional(),
    dim_factor: z.number().int().positive().nullable().optional(),
    surcharge_flat_cents: z.number().int().nonnegative().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'no fields to update' })

export const orderColumnMappingSchema = z
  .object({
    order_number: z.string().min(1),
    dest_zip: z.string().min(1),
    weight: z.string().min(1),
    weight_unit: z.enum(['lbs', 'oz']),
    length: z.string().optional(),
    width: z.string().optional(),
    height: z.string().optional(),
    state: z.string().optional(),
  })
  .strict()

export const rateCardCreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    weight_unit_mode: z.enum(['oz_only', 'lbs_only', 'oz_then_lbs']),
    input_mode: z.enum(['file', 'paste']).optional().default('file'),
  })
  .strict()

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  pageSize: z.coerce.number().int().positive().max(1000).optional().default(100),
})
