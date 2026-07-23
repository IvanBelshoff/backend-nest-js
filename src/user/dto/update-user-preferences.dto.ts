import { z } from 'zod';

const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida. Use o formato #RRGGBB');

const notificationDisplayStyleSchema = z.enum([
  'slideUpBar',
  'fadeTopRight',
  'scaleCenter',
  'slideFromLeft',
  'compactPill',
  'accentBorderCard',
  'stackShrink',
  'bounceIn',
  'flipIn',
  'blurMiniPanel',
  'topBanner',
  'circularProgress',
  'splitReveal',
  'minimalStrip',
  'timelineStack',
]);

const notificationPlacementSchema = z.enum([
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'middle-center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]);

const dataGridSortPreferenceSchema = z
  .object({
    id: z.string().trim().min(1).max(120),
    desc: z.boolean(),
  })
  .strict();

const dataGridLayoutPreferenceSchema = z
  .object({
    columnOrder: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
    columnSizing: z
      .record(z.string().trim().min(1).max(120), z.number().finite().positive().max(2000))
      .optional(),
    sorting: z.array(dataGridSortPreferenceSchema).max(10).optional(),
  })
  .strict();

const dataGridStylePreferenceSchema = z
  .object({
    columnLines: z.enum(['none', 'header', 'full']).optional(),
    stripedRows: z.boolean().optional(),
    showRowLines: z.boolean().optional(),
    stickyHeader: z.boolean().optional(),
  })
  .strict();

const dataGridLayoutsSchema = z
  .record(z.string().trim().min(1).max(80), dataGridLayoutPreferenceSchema)
  .refine((value) => Object.keys(value).length <= 20, {
    message: 'No máximo 20 layouts de grid podem ser salvos',
  });

export const updateUserPreferencesSchema = z
  .object({
    theme: z.enum(['system', 'dark', 'light']).optional(),
    accentColor: hexColorSchema.optional(),
    notification: z
      .object({
        style: notificationDisplayStyleSchema.optional(),
        placement: notificationPlacementSchema.optional(),
      })
      .strict()
      .optional(),
    language: z.enum(['pt-BR', 'en-US', 'es-ES']).optional(),
    dataGridStyle: dataGridStylePreferenceSchema.optional(),
    grids: dataGridLayoutsSchema.optional(),
  })
  .strict()
  .refine(
    (value) =>
      value.theme !== undefined ||
      value.accentColor !== undefined ||
      value.language !== undefined ||
      value.notification !== undefined ||
      value.dataGridStyle !== undefined ||
      value.grids !== undefined,
    { message: 'Informe ao menos uma preferência para atualizar' },
  );

export type UpdateUserPreferencesDto = z.infer<typeof updateUserPreferencesSchema>;
