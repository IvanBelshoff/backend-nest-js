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
  // Desligue quando o modelo configurado não suportar raciocínio estendido:
  // o toggle "Pensamento" fica indisponível na UI em vez de falhar na chamada.
  AI_REASONING_ENABLED: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
  AI_REASONING_EFFORT: z
    .enum(['minimal', 'low', 'medium', 'high'])
    .default('medium'),
  AI_REASONING_BUDGET_TOKENS: z.coerce
    .number()
    .int()
    .positive()
    .default(4096),
  // Modelos que devolvem o raciocínio como texto puro entre <think>...</think>
  // (comum em Ollama e servidores openai-compatible).
  AI_REASONING_THINK_TAGS: z
    .string()
    .optional()
    .transform((value) => value !== 'false'),
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
