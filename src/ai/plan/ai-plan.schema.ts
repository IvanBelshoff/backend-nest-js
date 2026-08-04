import { z } from 'zod';

export const aiPlanStatusSchema = z.enum([
  'draft',
  'awaiting_approval',
  'approved',
  'running',
  'done',
  'failed',
  'cancelled',
]);

export type AiPlanStatus = z.infer<typeof aiPlanStatusSchema>;

export const aiPlanOptionSchema = z.object({
  key: z.string().min(1).max(8),
  label: z.string().min(1).max(500),
});

export const aiPlanQuestionSchema = z.object({
  id: z.string().min(1).max(64),
  texto: z.string().min(1).max(1000),
  opcoes: z.array(aiPlanOptionSchema).min(2).max(6),
  respostaUsuario: z.string().min(1).max(8).optional(),
  respostaLivre: z.string().max(2000).optional(),
});

export const aiPlanStepStatusSchema = z.enum([
  'pending',
  'running',
  'done',
  'skipped',
  'failed',
]);

export const aiPlanStepSchema = z.object({
  id: z.string().min(1).max(64),
  titulo: z.string().min(1).max(200),
  detalhe: z.string().min(1).max(2000),
  status: aiPlanStepStatusSchema.default('pending'),
});

/** Plano proposto pelo modelo (antes da persistência / aprovação). */
export const aiPlanProposalSchema = z.object({
  objetivo: z.string().min(5).max(2000),
  relatorioIds: z.array(z.number().int().positive()).min(1).max(5),
  perguntas: z.array(aiPlanQuestionSchema).min(1).max(8),
  passos: z.array(aiPlanStepSchema).min(1).max(12),
});

export type AiPlanProposal = z.infer<typeof aiPlanProposalSchema>;

export const aiPlanSchema = aiPlanProposalSchema.extend({
  id: z.string().uuid(),
  status: aiPlanStatusSchema,
  jobId: z.string().optional(),
  tentativas: z.number().int().nonnegative().optional(),
  erro: z.string().max(2000).optional(),
  messageId: z.string().uuid().optional(),
});

export type AiPlan = z.infer<typeof aiPlanSchema>;

export const updateAiPlanSchema = z.object({
  perguntas: z
    .array(
      z.object({
        id: z.string().min(1),
        respostaUsuario: z.string().min(1).max(8).optional(),
        respostaLivre: z.string().max(2000).optional(),
      }),
    )
    .optional(),
  passos: z
    .array(
      z.object({
        id: z.string().min(1),
        titulo: z.string().min(1).max(200).optional(),
        detalhe: z.string().min(1).max(2000).optional(),
      }),
    )
    .optional(),
  objetivo: z.string().min(5).max(2000).optional(),
});

export type UpdateAiPlanDto = z.infer<typeof updateAiPlanSchema>;

const VISUALIZATION_INTENT_PATTERN =
  /visualiz|gr[aá]fico|grafico|chart|dashboard|histograma|tend[eê]ncia|tendencia|correla|dispers|plot/i;

/** Detecta se o plano pede gráficos/visualizações nos passos ou objetivo. */
export function planRequiresVisualization(plan: AiPlan): boolean {
  const chunks = [
    plan.objetivo,
    ...plan.passos.flatMap((passo) => [passo.titulo, passo.detalhe]),
  ];

  return chunks.some((text) => VISUALIZATION_INTENT_PATTERN.test(text));
}

export function buildVisualizationExecutionInstructions(): string {
  return [
    '',
    'VISUALIZAÇÃO OBRIGATÓRIA NESTE PLANO:',
    '- Antes de finalizar, chame ao menos UMA ferramenta que gera gráfico: analisarTendencia, calcularCorrelacao, detectarOutliers, resumirDistribuicao, compararPeriodos ou visualizarDados.',
    '- Para dados agregados por SQL, use visualizarDados (gera gráfico automaticamente).',
    '- Para tabelas detalhadas, use publicarTabela — NÃO reproduza tabelas markdown com números já consultados.',
    '- O texto final deve conter insights e conclusões; gráficos e tabelas interativas aparecem nos cards do chat.',
  ].join('\n');
}

export function buildPlanExecutionPrompt(plan: AiPlan): string {
  const lines = [
    `Objetivo da análise: ${plan.objetivo}`,
    `Relatórios autorizados (IDs internos): ${plan.relatorioIds.join(', ')}`,
    '',
    'Respostas do usuário às perguntas do plano:',
  ];

  for (const pergunta of plan.perguntas) {
    const escolha =
      pergunta.respostaUsuario === 'outra' || pergunta.respostaLivre
        ? pergunta.respostaLivre?.trim() || '(não informado)'
        : pergunta.opcoes.find((o) => o.key === pergunta.respostaUsuario)
            ?.label ??
          pergunta.respostaUsuario ??
          '(sem resposta)';
    lines.push(`- [${pergunta.id}] ${pergunta.texto} → ${escolha}`);
  }

  lines.push('', 'Passos a seguir (corrija e tente de novo se uma tool falhar):');
  for (const [index, passo] of plan.passos.entries()) {
    lines.push(`${index + 1}. ${passo.titulo}: ${passo.detalhe}`);
  }

  if (planRequiresVisualization(plan)) {
    lines.push(buildVisualizationExecutionInstructions());
  }

  return lines.join('\n');
}
