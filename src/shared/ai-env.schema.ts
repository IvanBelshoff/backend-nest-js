import { z } from 'zod';

const aiEnvShape = {
  AI_PROVIDER: z
    .enum([
      'ollama',
      'openai',
      'openai-compatible',
      'anthropic',
      'google',
    ])
    .default('ollama'),
  AI_MODEL: z.string().min(1).default('qwen3.5:4b'),
  AI_BASE_URL: z.string().url().optional(),
  AI_API_KEY: z.string().min(1).optional(),
};

export const aiEnvSchema = z.object(aiEnvShape).superRefine((data, ctx) => {
  const requireApiKey = (
    providers: Array<typeof data.AI_PROVIDER>,
    message: string,
  ) => {
    if (providers.includes(data.AI_PROVIDER) && !data.AI_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message,
        path: ['AI_API_KEY'],
      });
    }
  };

  requireApiKey(
    ['openai', 'openai-compatible', 'anthropic', 'google'],
    'AI_API_KEY é obrigatória para o provedor de IA configurado.',
  );

  if (data.AI_PROVIDER === 'openai-compatible' && !data.AI_BASE_URL) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'AI_BASE_URL é obrigatória para o provedor openai-compatible.',
      path: ['AI_BASE_URL'],
    });
  }
});

export function parseAiEnv(input: Record<string, unknown>) {
  return aiEnvSchema.parse(input);
}
