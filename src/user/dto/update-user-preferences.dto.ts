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
  })
  .strict()
  .refine(
    (value) =>
      value.theme !== undefined ||
      value.accentColor !== undefined ||
      value.language !== undefined ||
      value.notification !== undefined,
    { message: 'Informe ao menos uma preferência para atualizar' },
  );

export type UpdateUserPreferencesDto = z.infer<typeof updateUserPreferencesSchema>;
