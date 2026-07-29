import { extractReasoningMiddleware, wrapLanguageModel, type LanguageModel } from 'ai';
import { env } from 'src/shared/env.schema';

/** Raciocínio só é oferecido quando habilitado por configuração. */
export function isReasoningEnabled(): boolean {
  return env.AI_REASONING_ENABLED;
}

/**
 * Alguns modelos (Ollama, servidores openai-compatible) devolvem o raciocínio
 * como texto puro entre `<think>...</think>` em vez de partes de reasoning.
 * O middleware do AI SDK converte isso em `ReasoningUIPart` de verdade, o que
 * também evita que o preâmbulo vaze no texto da resposta e no título do thread.
 *
 * É aplicado mesmo com o modo Pensamento desligado: quando o modelo não emite as
 * tags, o middleware é inócuo; quando emite sem ter sido pedido, evita o vazamento.
 */
export function withThinkTagExtraction(model: LanguageModel): LanguageModel {
  if (!env.AI_REASONING_THINK_TAGS || typeof model === 'string') {
    return model;
  }

  return wrapLanguageModel({
    model,
    middleware: extractReasoningMiddleware({ tagName: 'think' }),
  });
}

export function reasoningEffort(): string {
  return env.AI_REASONING_EFFORT;
}

export function reasoningBudgetTokens(): number {
  return env.AI_REASONING_BUDGET_TOKENS;
}
