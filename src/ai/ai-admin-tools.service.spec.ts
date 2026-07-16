import { ForbiddenException } from '@nestjs/common';
import { EstadoRelatorio } from 'src/database/entities/Relatorios';
import { AiAdminToolsService } from './ai-admin-tools.service';

describe('AiAdminToolsService', () => {
  const aiAccessService = {
    isAdmin: jest.fn(),
  };

  const usersService = {
    findAllPaginated: jest.fn(),
    findByIdWithRelations: jest.fn(),
    findByIdWithAccessRelations: jest.fn(),
  };

  const reportService = {
    findAllPaginated: jest.fn(),
    getRelatoriosByUser: jest.fn(),
    findAllPublic: jest.fn(),
  };

  const dashboardService = {
    findAllPaginated: jest.fn(),
    getDashboardsByUser: jest.fn(),
    findAllPublic: jest.fn(),
  };

  const metricsCollectorService = {
    collectSnapshot: jest.fn(),
  };

  const metricsPersistenceService = {
    findHistory: jest.fn(),
  };

  const reportJobService = {
    listJobsForAdmin: jest.fn(),
  };

  const schedulerService = {
    listExecucoesAdmin: jest.fn(),
  };

  const service = new AiAdminToolsService(
    aiAccessService as any,
    usersService as any,
    reportService as any,
    dashboardService as any,
    metricsCollectorService as any,
    metricsPersistenceService as any,
    reportJobService as any,
    schedulerService as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('blocks non-admin users', async () => {
    aiAccessService.isAdmin.mockResolvedValue(false);

    await expect(service.listUsers(2)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lists users without preferencias_ui for admin', async () => {
    aiAccessService.isAdmin.mockResolvedValue(true);
    usersService.findAllPaginated.mockResolvedValue({
      total: 1,
      data: [
        {
          id: 1,
          nome: 'Admin',
          sobrenome: 'Admin',
          email: 'admin@test.com',
          bloqueado: false,
          preferencias_ui: { theme: 'dark' },
          regra: [{ nome: 'REGRA_ADMIN' }],
          permissao: [{ nome: 'PERMISSAO_USAR_IA' }],
        },
      ],
    });

    const result = await service.listUsers(1);

    expect(result.total).toBe(1);
    expect(result.usuarios[0]).toEqual({
      id: 1,
      nome: 'Admin',
      sobrenome: 'Admin',
      email: 'admin@test.com',
      bloqueado: false,
      regras: ['REGRA_ADMIN'],
      permissoes: ['PERMISSAO_USAR_IA'],
    });
    expect(result.usuarios[0]).not.toHaveProperty('preferencias_ui');
  });

  it('lists system reports without query SQL', async () => {
    aiAccessService.isAdmin.mockResolvedValue(true);
    reportService.findAllPaginated.mockResolvedValue({
      total: 1,
      data: [
        {
          id: 5,
          nome: 'Dashboards por Usuário',
          estado: EstadoRelatorio.ONLINE,
          privacidade: 'privado',
          visivel: true,
          id_proprietario: 1,
          query: 'SELECT * FROM users',
        },
      ],
    });

    const result = await service.listReports(1);

    expect(result.relatorios[0]).toMatchObject({
      id: 5,
      nome: 'Dashboards por Usuário',
      estado: EstadoRelatorio.ONLINE,
    });
    expect(result.relatorios[0]).not.toHaveProperty('query');
  });

  it('returns metrics snapshot for admin', async () => {
    aiAccessService.isAdmin.mockResolvedValue(true);
    metricsCollectorService.collectSnapshot.mockResolvedValue({
      recordedAt: '2026-07-16T00:00:00.000Z',
      process: { uptimeSeconds: 10 },
    });

    const result = await service.getMetrics(1);

    expect(result.process.uptimeSeconds).toBe(10);
  });

  it('returns only effective user access (private grants + public catalogs)', async () => {
    aiAccessService.isAdmin.mockResolvedValue(true);
    usersService.findByIdWithRelations.mockResolvedValue({
      id: 20,
      nome: 'Lucas',
      sobrenome: 'Barcellos',
      email: 'lucas@test.com',
      bloqueado: false,
      ultimo_login: null,
      regra: [{ nome: 'REGRA_USUARIO' }],
      permissao: [],
    });
    dashboardService.getDashboardsByUser.mockResolvedValue({
      dashboards: [],
      dashboardsDisponiveis: [
        { id: 1, nome: 'ANTT' },
        { id: 2, nome: 'BPD-AGRO' },
      ],
    });
    reportService.getRelatoriosByUser.mockResolvedValue({
      relatorios: [],
      relatoriosDisponiveis: [{ id: 5, nome: 'Dashboards por Usuário' }],
    });
    dashboardService.findAllPublic.mockResolvedValue({
      data: [{ id: 99, nome: 'ICMS' }],
      total: 1,
    });
    reportService.findAllPublic.mockResolvedValue({ data: [], total: 0 });

    const result = await service.getUser(1, 20);

    expect(result).toMatchObject({
      id: 20,
      nome: 'Lucas',
      sobrenome: 'Barcellos',
      relatoriosPrivadosComAcesso: [],
      dashboardsPrivadosComAcesso: [],
      relatoriosPublicosAcessiveis: [],
      dashboardsPublicosAcessiveis: [{ id: 99, nome: 'ICMS' }],
    });
    expect(result).not.toHaveProperty('acessoDashboards');
    expect(result).not.toHaveProperty('acessoRelatorios');
  });

  it('lists dashboards without URLs for admin', async () => {
    aiAccessService.isAdmin.mockResolvedValue(true);
    dashboardService.findAllPaginated.mockResolvedValue({
      total: 1,
      data: [
        {
          id: 3,
          nome: 'ANTT',
          privacidade: 'privado',
          visivel: true,
          url: 'https://app.powerbi.com/secret',
          id_proprietario: 1,
        },
      ],
    });

    const result = await service.listDashboards(1);

    expect(result.dashboards[0]).toMatchObject({ id: 3, nome: 'ANTT' });
    expect(result.dashboards[0]).not.toHaveProperty('url');
  });
});
