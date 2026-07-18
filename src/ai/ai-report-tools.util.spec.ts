import { toPublicReportList } from './ai-report-tools.service';

describe('toPublicReportList', () => {
  it('splits public names from internal reference', () => {
    const result = toPublicReportList([
      { id: 3, nome: 'Producao EAD', estado: 'online' },
      { id: 5, nome: 'Dashboards por Usuário', estado: 'offline' },
    ]);

    expect(result.relatorios).toEqual([
      { nome: 'Producao EAD' },
      { nome: 'Dashboards por Usuário' },
    ]);
    expect(result.total).toBe(2);
    expect(result.referenciaInterna).toEqual([
      { id: 3, nome: 'Producao EAD', estado: 'online' },
      { id: 5, nome: 'Dashboards por Usuário', estado: 'offline' },
    ]);
  });
});
