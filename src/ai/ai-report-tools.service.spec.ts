import { ForbiddenException } from '@nestjs/common';
import { EstadoRelatorio } from 'src/database/entities/Relatorios';
import { AiReportToolsService } from './ai-report-tools.service';

describe('AiReportToolsService', () => {
  const reportService = {
    findById: jest.fn(),
  };

  const reportExecutionService = {
    execute: jest.fn(),
  };

  const snapshotQueryService = {
    queryPage: jest.fn(),
  };

  const aiAccessService = {
    isAdmin: jest.fn(),
  };

  const usuarioRelatorioRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
  };

  const relatorioRepository = {
    find: jest.fn(),
  };

  const service = new AiReportToolsService(
    reportService as any,
    reportExecutionService as any,
    snapshotQueryService as any,
    aiAccessService as any,
    usuarioRelatorioRepository as any,
    relatorioRepository as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists only IA-enabled grants for non-admin users', async () => {
    aiAccessService.isAdmin.mockResolvedValue(false);
    usuarioRelatorioRepository.find.mockResolvedValue([
      {
        relatorio: {
          id: 10,
          nome: 'Vendas',
          estado: EstadoRelatorio.OFFLINE,
          parametros: null,
        },
      },
    ]);

    const reports = await service.listAvailableReports(1);

    expect(reports.relatorios).toHaveLength(1);
    expect(reports.relatorios[0]).toEqual({ nome: 'Vendas' });
    expect(reports.referenciaInterna[0]).toMatchObject({
      id: 10,
      nome: 'Vendas',
      estado: EstadoRelatorio.OFFLINE,
    });
    expect(usuarioRelatorioRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          usuarioId: 1,
          permitirConhecimentoIa: true,
        },
      }),
    );
  });

  it('blocks describeReport when IA knowledge is not enabled', async () => {
    aiAccessService.isAdmin.mockResolvedValue(false);
    reportService.findById.mockResolvedValue({
      id: 20,
      nome: 'Financeiro',
      estado: EstadoRelatorio.OFFLINE,
      parametros: null,
    });
    usuarioRelatorioRepository.findOne.mockResolvedValue(null);

    await expect(service.describeReport(2, 20)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows describeReport when IA knowledge grant exists', async () => {
    aiAccessService.isAdmin.mockResolvedValue(false);
    reportService.findById.mockResolvedValue({
      id: 21,
      nome: 'Estoque',
      estado: EstadoRelatorio.OFFLINE,
      parametros: null,
    });
    usuarioRelatorioRepository.findOne.mockResolvedValue({ id: 1 });
    snapshotQueryService.queryPage.mockResolvedValue({
      colunas: ['produto', 'quantidade'],
    });

    const result = await service.describeReport(3, 21);

    expect(result).toMatchObject({
      id: 21,
      nome: 'Estoque',
      colunas: ['produto', 'quantidade'],
    });
  });

  it('serializes Date values in queryReport results for AI SDK compatibility', async () => {
    aiAccessService.isAdmin.mockResolvedValue(true);
    reportService.findById.mockResolvedValue({
      id: 5,
      nome: 'Dashboards por Usuário',
      estado: EstadoRelatorio.ONLINE,
      parametros: null,
    });
    const loginDate = new Date('2026-07-16T10:00:00.000Z');
    reportExecutionService.execute.mockResolvedValue({
      total_linhas: 1,
      colunas: ['nome', 'ultimo_login'],
      dados: [{ nome: 'Admin', ultimo_login: loginDate }],
    });

    const result = await service.queryReport(1, 5);

    expect(result.dados[0].ultimo_login).toBe('2026-07-16T10:00:00.000Z');
  });

  it('bypasses IA grant check for admin users', async () => {
    aiAccessService.isAdmin.mockResolvedValue(true);
    reportService.findById.mockResolvedValue({
      id: 30,
      nome: 'Admin Report',
      estado: EstadoRelatorio.ONLINE,
      parametros: null,
    });
    reportExecutionService.execute.mockResolvedValue({
      total_linhas: 1,
      colunas: ['valor'],
      dados: [{ valor: 100 }],
    });

    const result = await service.queryReport(99, 30);

    expect(result.relatorioNome).toBe('Admin Report');
    expect(usuarioRelatorioRepository.findOne).not.toHaveBeenCalled();
  });

  it('redacts sensitive columns from queryReport results', async () => {
    aiAccessService.isAdmin.mockResolvedValue(true);
    reportService.findById.mockResolvedValue({
      id: 5,
      nome: 'Dashboards por Usuário',
      estado: EstadoRelatorio.ONLINE,
      parametros: null,
    });
    reportExecutionService.execute.mockResolvedValue({
      total_linhas: 1,
      colunas: ['nome', 'url', 'dashboard'],
      dados: [
        {
          nome: 'ANTT',
          url: 'https://app.powerbi.com/view?r=secret',
          dashboard: 'ANTT',
        },
      ],
    });

    const result = await service.queryReport(1, 5);

    expect(result.colunas).toEqual(['nome', 'dashboard']);
    expect(result.dados[0]).toEqual({ nome: 'ANTT', dashboard: 'ANTT' });
    expect(result.dados[0]).not.toHaveProperty('url');
  });
});
