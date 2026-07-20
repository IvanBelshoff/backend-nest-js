import { ForbiddenException } from '@nestjs/common';
import { EstadoRelatorio } from 'src/database/entities/Relatorios';
import { AiReportToolsService } from './ai-report-tools.service';

describe('AiReportToolsService', () => {
  const reportService = {
    findById: jest.fn(),
    findReportsWithAiKnowledge: jest.fn(),
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

  it('detects report names cited without IA knowledge in user text', async () => {
    reportService.findReportsWithAiKnowledge.mockResolvedValue([
      {
        id: 10,
        nome: 'Resumo de Permissões por Usuário',
        privacidade: 'publico',
        visivel: true,
        usuarioRelatorios: [],
      },
    ]);
    relatorioRepository.find.mockResolvedValue([
      { id: 5, nome: 'Acessos de Usuários a Relatórios' },
      { id: 10, nome: 'Resumo de Permissões por Usuário' },
    ]);

    const blocked = await service.findReportNamesWithoutAiInText(
      1,
      'me conte sobre o relatório: Acessos de Usuários a Relatórios',
    );

    expect(blocked).toEqual(['Acessos de Usuários a Relatórios']);
  });

  it('lists IA-enabled reports for admin users using grant rules', async () => {
    aiAccessService.isAdmin.mockResolvedValue(true);
    reportService.findReportsWithAiKnowledge.mockResolvedValue([
      {
        id: 10,
        nome: 'Agendamentos',
        estado: EstadoRelatorio.ONLINE,
        parametros: null,
      },
    ]);

    const reports = await service.listAvailableReports(1);

    expect(reports.relatorios).toHaveLength(1);
    expect(reports.relatorios[0]).toEqual({ nome: 'Agendamentos' });
    expect(reportService.findReportsWithAiKnowledge).toHaveBeenCalledWith(1);
    expect(relatorioRepository.find).not.toHaveBeenCalled();
  });

  it('blocks describeReport when IA knowledge is not enabled', async () => {
    aiAccessService.isAdmin.mockResolvedValue(false);
    reportService.findById.mockResolvedValue({
      id: 20,
      nome: 'Financeiro',
      estado: EstadoRelatorio.OFFLINE,
      parametros: null,
      privacidade: 'privado',
      visivel: true,
      usuarioRelatorios: [],
    });

    await expect(service.describeReport(2, 20)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows describeReport when IA knowledge is enabled via public visibility', async () => {
    aiAccessService.isAdmin.mockResolvedValue(false);
    reportService.findById.mockResolvedValue({
      id: 22,
      nome: 'Público',
      estado: EstadoRelatorio.ONLINE,
      parametros: null,
      privacidade: 'publico',
      visivel: true,
      usuarioRelatorios: [],
    });
    snapshotQueryService.queryPage.mockResolvedValue({
      colunas: [],
    });

    await expect(service.describeReport(2, 22)).resolves.toMatchObject({
      id: 22,
      nome: 'Público',
    });
  });

  it('allows describeReport when IA knowledge grant exists', async () => {
    aiAccessService.isAdmin.mockResolvedValue(false);
    reportService.findById.mockResolvedValue({
      id: 21,
      nome: 'Estoque',
      estado: EstadoRelatorio.OFFLINE,
      parametros: null,
      privacidade: 'privado',
      visivel: true,
      usuarioRelatorios: [{ usuarioId: 2, permitirConhecimentoIa: true }],
    });
    snapshotQueryService.queryPage.mockResolvedValue({
      colunas: ['produto', 'quantidade'],
    });

    const result = await service.describeReport(2, 21);

    expect(result).toMatchObject({
      id: 21,
      nome: 'Estoque',
      colunas: ['produto', 'quantidade'],
    });
  });

  it('serializes Date values in queryReport results for AI SDK compatibility', async () => {
    reportService.findById.mockResolvedValue({
      id: 5,
      nome: 'Dashboards por Usuário',
      estado: EstadoRelatorio.ONLINE,
      parametros: null,
      privacidade: 'publico',
      visivel: true,
      usuarioRelatorios: [],
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

  it('blocks queryReport for admin without IA knowledge grant', async () => {
    aiAccessService.isAdmin.mockResolvedValue(true);
    reportService.findById.mockResolvedValue({
      id: 30,
      nome: 'Admin Report',
      estado: EstadoRelatorio.ONLINE,
      parametros: null,
      privacidade: 'privado',
      visivel: true,
      usuarioRelatorios: [{ usuarioId: 99, permitirConhecimentoIa: false }],
    });

    await expect(service.queryReport(99, 30)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(reportExecutionService.execute).not.toHaveBeenCalled();
  });

  it('redacts sensitive columns from queryReport results', async () => {
    reportService.findById.mockResolvedValue({
      id: 5,
      nome: 'Dashboards por Usuário',
      estado: EstadoRelatorio.ONLINE,
      parametros: null,
      privacidade: 'publico',
      visivel: true,
      usuarioRelatorios: [],
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
