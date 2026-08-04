import { describe, expect, it } from '@jest/globals';
import {
  aiPlanProposalSchema,
  buildPlanExecutionPrompt,
  aiPlanSchema,
} from './ai-plan.schema';

describe('ai-plan.schema', () => {
  const proposal = {
    objetivo: 'Analisar a distribuição das respostas do NPS mensal',
    relatorioIds: [1],
    perguntas: [
      {
        id: 'q1',
        texto: 'Qual recorte temporal?',
        opcoes: [
          { key: 'a', label: 'Últimos 12 meses' },
          { key: 'b', label: 'Último trimestre' },
          { key: 'c', label: 'Outra' },
        ],
      },
    ],
    passos: [
      {
        id: 's1',
        titulo: 'Garantir snapshot',
        detalhe: 'Validar Parquet do relatório',
        status: 'pending' as const,
      },
      {
        id: 's2',
        titulo: 'Distribuição',
        detalhe: 'Agregar respostas por faixa',
        status: 'pending' as const,
      },
    ],
  };

  it('validates a proposal', () => {
    expect(aiPlanProposalSchema.parse(proposal).objetivo).toContain('NPS');
  });

  it('builds execution prompt with answers', () => {
    const plan = aiPlanSchema.parse({
      ...proposal,
      id: '3f0b8f1e-6c3a-4d5b-9f2e-8a1b2c3d4e5f',
      status: 'approved',
      perguntas: [
        {
          ...proposal.perguntas[0],
          respostaUsuario: 'a',
        },
      ],
    });

    const prompt = buildPlanExecutionPrompt(plan);
    expect(prompt).toContain('Últimos 12 meses');
    expect(prompt).toContain('Garantir snapshot');
  });
});
