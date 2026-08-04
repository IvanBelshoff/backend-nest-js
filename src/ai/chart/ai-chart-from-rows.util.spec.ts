import { buildChartSpecFromRows } from './ai-chart-from-rows.util';

describe('buildChartSpecFromRows', () => {
  it('builds bar chart from categorical x and numeric series', () => {
    const spec = buildChartSpecFromRows({
      columns: ['months_subscribed', 'nps', 'respostas'],
      rows: [
        { months_subscribed: 4, nps: 86.36, respostas: 44 },
        { months_subscribed: 5, nps: 91.3, respostas: 46 },
        { months_subscribed: 6, nps: 85.19, respostas: 54 },
      ],
      title: 'NPS por tempo de assinatura',
      colunaX: 'months_subscribed',
      series: ['nps'],
    });

    expect(spec).not.toBeNull();
    expect(spec?.type).toBe('bar');
    expect(spec?.data).toHaveLength(3);
    expect(spec?.series[0]?.key).toBe('nps');
  });

  it('builds line chart for temporal column names', () => {
    const spec = buildChartSpecFromRows({
      columns: ['periodo', 'valor'],
      rows: [
        { periodo: '2026-01-01', valor: 10 },
        { periodo: '2026-02-01', valor: 12 },
      ],
      title: 'Tendência',
    });

    expect(spec).not.toBeNull();
    expect(spec?.type).toBe('line');
  });

  it('builds scatter for two numeric columns without categorical x', () => {
    const spec = buildChartSpecFromRows({
      columns: ['nps', 'ticket_medio'],
      rows: [
        { nps: 80, ticket_medio: 200 },
        { nps: 90, ticket_medio: 250 },
      ],
      title: 'Correlação',
      tipoGrafico: 'scatter',
      colunaX: 'nps',
      series: ['ticket_medio'],
    });

    expect(spec).not.toBeNull();
    expect(spec?.type).toBe('scatter');
  });

  it('returns null when no numeric columns', () => {
    const spec = buildChartSpecFromRows({
      columns: ['nome', 'status'],
      rows: [{ nome: 'A', status: 'ok' }],
      title: 'Inválido',
    });

    expect(spec).toBeNull();
  });
});
