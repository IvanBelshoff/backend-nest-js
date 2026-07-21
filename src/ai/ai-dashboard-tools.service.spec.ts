import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { AiDashboardToolsService } from './ai-dashboard-tools.service';

describe('AiDashboardToolsService', () => {
  const dashboardService = {
    findById: jest.fn(),
  };

  const powerbiPublicExtractService = {
    isEnabled: jest.fn(),
    extract: jest.fn(),
  };

  const service = new AiDashboardToolsService(
    dashboardService as never,
    powerbiPublicExtractService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    service.clearCache();
    powerbiPublicExtractService.isEnabled.mockReturnValue(true);
  });

  it('rejects when user has no access to dashboard', async () => {
    dashboardService.findById.mockRejectedValue(
      new ForbiddenException('Sem acesso'),
    );

    await expect(service.inspect(1, 99)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(powerbiPublicExtractService.extract).not.toHaveBeenCalled();
  });

  it('throws when extract is disabled', async () => {
    dashboardService.findById.mockResolvedValue({
      id: 5,
      nome: 'BI Senac',
      url: 'https://app.powerbi.com/view?r=secret',
      query: null,
    });
    powerbiPublicExtractService.isEnabled.mockReturnValue(false);

    await expect(service.inspect(1, 5)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('returns sanitized extract without urls and caches by user+dashboard', async () => {
    dashboardService.findById.mockResolvedValue({
      id: 5,
      nome: 'BI Senac',
      url: 'https://app.powerbi.com/view?r=secret',
      query: null,
    });
    powerbiPublicExtractService.extract.mockResolvedValue({
      geradoEm: '2026-07-20T12:00:00.000Z',
      paginas: [
        {
          titulo: 'Painel',
          kpis: ['Turmas: 12'],
          tabelas: [],
          textos: ['https://app.powerbi.com/view?r=leak'],
        },
      ],
      avisoLimitacoes: ['limitação'],
    });

    const first = await service.inspect(1, 5);
    expect(first.cache).toBe(false);
    expect(first.dashboardNome).toBe('BI Senac');
    expect(JSON.stringify(first)).not.toMatch(/powerbi\.com/i);
    expect(JSON.stringify(first)).not.toMatch(/https?:\/\//i);
    expect(powerbiPublicExtractService.extract).toHaveBeenCalledTimes(1);

    const second = await service.inspect(1, 5);
    expect(second.cache).toBe(true);
    expect(powerbiPublicExtractService.extract).toHaveBeenCalledTimes(1);
  });

  it('skips cache when foco is provided', async () => {
    dashboardService.findById.mockResolvedValue({
      id: 5,
      nome: 'BI Senac',
      url: 'https://app.powerbi.com/view?r=secret',
      query: null,
    });
    powerbiPublicExtractService.extract.mockResolvedValue({
      geradoEm: '2026-07-20T12:00:00.000Z',
      paginas: [
        {
          titulo: 'Painel',
          kpis: ['Turmas: 12'],
          tabelas: [],
          textos: ['Vigência 07/2026'],
        },
      ],
      avisoLimitacoes: [],
    });

    await service.inspect(1, 5);
    await service.inspect(1, 5, 'qual a vigência?');

    expect(powerbiPublicExtractService.extract).toHaveBeenCalledTimes(2);
  });

  it('does not cache empty extracts', async () => {
    dashboardService.findById.mockResolvedValue({
      id: 7,
      nome: 'Vazio',
      url: 'https://app.powerbi.com/view?r=x',
      query: null,
    });
    powerbiPublicExtractService.extract.mockResolvedValue({
      geradoEm: '2026-07-20T12:00:00.000Z',
      paginas: [{ titulo: null, kpis: [], tabelas: [], textos: [] }],
      avisoLimitacoes: ['sem conteúdo'],
    });

    await service.inspect(2, 7);
    await service.inspect(2, 7);

    expect(powerbiPublicExtractService.extract).toHaveBeenCalledTimes(2);
  });
});
