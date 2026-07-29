import { AiAnalyticsToolsService } from './ai-analytics-tools.service';

describe('AiAnalyticsToolsService', () => {
  const aiReportToolsService = {
    assertAiKnowledgeAccess: jest.fn(),
  };

  const reportService = {
    findById: jest.fn(),
  };

  const reportSnapshotService = {
    resolveSnapshotFile: jest.fn(),
  };

  const duckDbService = {
    runAggregation: jest.fn(),
  };

  const service = new AiAnalyticsToolsService(
    aiReportToolsService as any,
    reportService as any,
    reportSnapshotService as any,
    duckDbService as any,
  );

  const geradoEm = new Date('2026-07-01T12:00:00.000Z');

  function mockSnapshot(colunas: string[]) {
    reportService.findById.mockResolvedValue({
      id: 7,
      nome: 'Vendas por Filial',
      estado: 'offline',
    });
    reportSnapshotService.resolveSnapshotFile.mockResolvedValue({
      readUri: '/tmp/vendas.parquet',
      snapshot: {
        colunas,
        colunas_tipos: {},
        total_linhas: 500,
        gerado_em: geradoEm,
      },
    });
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('recusa análise quando o relatório não tem snapshot gerado', async () => {
    reportService.findById.mockResolvedValue({
      id: 7,
      nome: 'Vendas por Filial',
      estado: 'online',
    });
    reportSnapshotService.resolveSnapshotFile.mockResolvedValue(null);

    const result = await service.resumirDistribuicao(1, {
      relatorioId: 7,
      coluna: 'total',
    });

    expect(result.chartSpec).toBeNull();
    expect(String(result.resumo.erro)).toContain('snapshot');
    expect(duckDbService.runAggregation).not.toHaveBeenCalled();
  });

  it('rejeita coluna inexistente informando as colunas disponíveis', async () => {
    mockSnapshot(['data_venda', 'total']);

    const result = await service.analisarTendencia(1, {
      relatorioId: 7,
      colunaData: 'data_venda',
      colunaValor: 'faturamento',
    });

    expect(String(result.resumo.erro)).toContain('faturamento');
    expect(String(result.resumo.erro)).toContain('data_venda, total');
    expect(duckDbService.runAggregation).not.toHaveBeenCalled();
  });

  it('ignora colunas sensíveis do snapshot na whitelist de análise', async () => {
    mockSnapshot(['data_venda', 'total', 'connection_string']);

    const result = await service.resumirDistribuicao(1, {
      relatorioId: 7,
      coluna: 'connection_string',
    });

    expect(String(result.resumo.erro)).toContain('connection_string');
    expect(duckDbService.runAggregation).not.toHaveBeenCalled();
  });

  it('calcula tendência com inclinação, variação e gráfico de linha', async () => {
    mockSnapshot(['data_venda', 'total']);
    duckDbService.runAggregation.mockResolvedValue([
      {
        periodo: new Date('2026-01-01T00:00:00.000Z'),
        valor: 100,
        slope: 50,
        intercept: 60,
        r2: 0.95,
        n: 3,
      },
      {
        periodo: new Date('2026-02-01T00:00:00.000Z'),
        valor: 150,
        slope: 50,
        intercept: 60,
        r2: 0.95,
        n: 3,
      },
      {
        periodo: new Date('2026-03-01T00:00:00.000Z'),
        valor: 200,
        slope: 50,
        intercept: 60,
        r2: 0.95,
        n: 3,
      },
    ]);

    const result = await service.analisarTendencia(1, {
      relatorioId: 7,
      colunaData: 'data_venda',
      colunaValor: 'total',
    });

    expect(result.resumo.direcao).toBe('alta');
    expect(result.resumo.periodosAnalisados).toBe(3);
    expect(result.resumo.variacaoPercentual).toBe(100);
    expect(result.resumo.qualidadeDoAjuste).toBe('boa');
    expect(result.resumo.fonte).toContain('snapshot de 2026-07-01');
    expect(result.chartSpec).toMatchObject({
      type: 'line',
      xAxis: { key: 'periodo' },
      series: [{ key: 'valor' }],
    });
    expect(result.chartSpec?.data).toEqual([
      { periodo: '01/2026', valor: 100 },
      { periodo: '02/2026', valor: 150 },
      { periodo: '03/2026', valor: 200 },
    ]);
  });

  it('recusa tendência quando há poucos períodos válidos', async () => {
    mockSnapshot(['data_venda', 'total']);
    duckDbService.runAggregation.mockResolvedValue([
      { periodo: new Date('2026-01-01T00:00:00.000Z'), valor: 10, slope: 1, r2: 1, n: 1 },
    ]);

    const result = await service.analisarTendencia(1, {
      relatorioId: 7,
      colunaData: 'data_venda',
      colunaValor: 'total',
    });

    expect(String(result.resumo.erro)).toContain('insuficientes');
    expect(result.chartSpec).toBeNull();
  });

  it('escolhe o par mais forte para o gráfico de dispersão da correlação', async () => {
    mockSnapshot(['a', 'b', 'c']);
    duckDbService.runAggregation
      .mockResolvedValueOnce([
        {
          corr_0: 0.12,
          n_0: 400,
          corr_1: -0.93,
          n_1: 400,
          corr_2: 0.4,
          n_2: 400,
        },
      ])
      .mockResolvedValueOnce([
        { x: 1, y: 9 },
        { x: 2, y: 8 },
        { x: 3, y: 7 },
      ]);

    const result = await service.calcularCorrelacao(1, {
      relatorioId: 7,
      colunas: ['a', 'b', 'c'],
    });

    expect(result.resumo.parMaisForte).toBe('a × c');
    expect(result.chartSpec).toMatchObject({ type: 'scatter' });
    expect(result.chartSpec?.title).toBe('a × c');
  });

  it('exige ao menos duas colunas distintas para correlação', async () => {
    mockSnapshot(['a', 'b']);

    const result = await service.calcularCorrelacao(1, {
      relatorioId: 7,
      colunas: ['a', 'a'],
    });

    expect(String(result.resumo.erro)).toContain('duas colunas');
    expect(duckDbService.runAggregation).not.toHaveBeenCalled();
  });

  it('compara períodos em ordem cronológica com variação percentual', async () => {
    mockSnapshot(['data_venda', 'total']);
    duckDbService.runAggregation.mockResolvedValue([
      {
        periodo: new Date('2026-03-01T00:00:00.000Z'),
        valor: 120,
        anterior: 100,
        variacao: 20,
      },
      {
        periodo: new Date('2026-02-01T00:00:00.000Z'),
        valor: 100,
        anterior: 80,
        variacao: 25,
      },
    ]);

    const result = await service.compararPeriodos(1, {
      relatorioId: 7,
      colunaData: 'data_venda',
      colunaValor: 'total',
    });

    expect(result.resumo.ultimoPeriodo).toBe('03/2026');
    expect(result.resumo.variacaoUltimoPeriodo).toBe(20);
    expect(result.chartSpec?.data).toEqual([
      { periodo: '02/2026', valor: 100 },
      { periodo: '03/2026', valor: 120 },
    ]);
  });
});
