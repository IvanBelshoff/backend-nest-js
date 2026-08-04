import { buildTableSpecFromRows } from './ai-table-spec.schema';
import { planRequiresVisualization } from './plan/ai-plan.schema';
import type { AiPlan } from './plan/ai-plan.schema';

describe('planRequiresVisualization', () => {
  const basePlan: AiPlan = {
    id: '00000000-0000-4000-8000-000000000001',
    status: 'awaiting_approval',
    objetivo: 'Analisar NPS',
    relatorioIds: [1],
    perguntas: [],
    passos: [{ id: 's1', titulo: 'Passo', detalhe: 'Detalhe', status: 'pending' }],
  };

  it('detects visualization in step title', () => {
    expect(
      planRequiresVisualization({
        ...basePlan,
        passos: [
          {
            id: 's1',
            titulo: 'Gerar visualizações',
            detalhe: 'Gráficos de tendência',
            status: 'pending',
          },
        ],
      }),
    ).toBe(true);
  });

  it('returns false when no visualization keywords', () => {
    expect(
      planRequiresVisualization({
        ...basePlan,
        passos: [
          {
            id: 's1',
            titulo: 'Consolidar dados',
            detalhe: 'Agregar por mês',
            status: 'pending',
          },
        ],
      }),
    ).toBe(false);
  });
});

describe('buildTableSpecFromRows', () => {
  it('builds table spec with numeric alignment', () => {
    const spec = buildTableSpecFromRows({
      title: 'NPS por mês',
      columns: ['mes', 'nps'],
      rows: [
        { mes: '04', nps: 86.36 },
        { mes: '05', nps: 91.3 },
      ],
      truncado: false,
    });

    expect(spec).not.toBeNull();
    expect(spec?.columns).toHaveLength(2);
    expect(spec?.rows).toHaveLength(2);
    expect(spec?.columns.find((c) => c.key === 'nps')?.align).toBe('right');
  });
});
