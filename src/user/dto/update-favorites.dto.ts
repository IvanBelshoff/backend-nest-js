import { z } from 'zod';

export const updateFavoritesSchema = z
  .object({
    favoritos: z.array(z.coerce.number().int().positive()).default([]),
  })
  .strict();

export type UpdateFavoritesDto = z.infer<typeof updateFavoritesSchema>;
