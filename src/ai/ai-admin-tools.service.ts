import { ForbiddenException, Injectable } from '@nestjs/common';
import type { ListAdminJobsQueryDto } from 'src/admin-jobs/dto/list-admin-jobs-query.dto';
import type { ListAdminScheduleExecutionsQueryDto } from 'src/admin-jobs/dto/list-admin-schedule-executions-query.dto';
import { Dashboard } from 'src/database/entities/Dashboards';
import { Relatorio } from 'src/database/entities/Relatorios';
import { Usuario } from 'src/database/entities/Usuarios';
import { DashboardService } from 'src/dashboard/dashboard.service';
import { ReportJobService } from 'src/report/jobs/report-job.service';
import { ReportService } from 'src/report/report.service';
import { SchedulerService } from 'src/scheduler/scheduler.service';
import { MetricsCollectorService } from 'src/system-metrics/metrics-collector.service';
import { MetricsPersistenceService } from 'src/system-metrics/metrics-persistence.service';
import { UsersService } from 'src/user/user.service';
import { AiAccessService } from './ai-access.service';
import { resolvePermitirConhecimentoIa } from 'src/report/report-ai-knowledge.util';

export interface AiAdminUserSummary {
  id: number;
  nome: string;
  sobrenome: string;
  email: string;
  bloqueado: boolean;
  regras: string[];
  permissoes: string[];
}

export interface AiAdminUserDetail extends AiAdminUserSummary {
  ultimo_login: string | null;
  relatoriosPrivadosComAcesso: Array<{
    relatorioId: number;
    nome: string;
    permitirConhecimentoIa: boolean;
  }>;
  dashboardsPrivadosComAcesso: Array<{
    id: number;
    nome: string;
  }>;
  relatoriosPublicosAcessiveis: Array<{
    id: number;
    nome: string;
  }>;
  dashboardsPublicosAcessiveis: Array<{
    id: number;
    nome: string;
  }>;
}

export interface AiAdminReportSummary {
  id: number;
  nome: string;
  estado: string;
  privacidade: string;
  visivel: boolean;
  id_proprietario: number | null;
  conhecimentoIaHabilitado: boolean;
}

export interface AiAdminDashboardSummary {
  id: number;
  nome: string;
  privacidade: string;
  visivel: boolean;
  id_proprietario: number | null;
  data_criacao: string | null;
  data_atualizacao: string | null;
  usuario_cadastrador: string | null;
}

@Injectable()
export class AiAdminToolsService {
  constructor(
    private readonly aiAccessService: AiAccessService,
    private readonly usersService: UsersService,
    private readonly reportService: ReportService,
    private readonly dashboardService: DashboardService,
    private readonly metricsCollectorService: MetricsCollectorService,
    private readonly metricsPersistenceService: MetricsPersistenceService,
    private readonly reportJobService: ReportJobService,
    private readonly schedulerService: SchedulerService,
  ) {}

  async listUsers(
    userId: number,
    params: {
      page?: number;
      limit?: number;
      filter?: string;
      bloqueado?: boolean;
    } = {},
  ): Promise<{ total: number; usuarios: AiAdminUserSummary[] }> {
    await this.assertCanManageUsers(userId);

    const { data, total } = await this.usersService.findAllPaginated({
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      filter: params.filter,
      bloqueado: params.bloqueado,
    });

    return {
      total,
      usuarios: data.map((user) => this.sanitizeUser(user)),
    };
  }

  /**
   * Relaciona usuários com dashboards/relatórios privados concedidos.
   * Uma única chamada evita N× obterUsuarioSistema (limitado por AI_MAX_STEPS).
   */
  async relateUsersPrivateAccess(
    userId: number,
    params: {
      somenteAtivos?: boolean;
      exigirDashboardsPrivados?: boolean;
      exigirRelatoriosPrivados?: boolean;
      limit?: number;
    } = {},
  ): Promise<{
    total: number;
    relatoriosPrivadosNoSistema: Array<{
      id: number;
      nome: string;
      usuariosComAcesso: string[];
    }>;
    dashboardsPrivadosNoSistemaTotal: number;
    relacoes: Array<{
      usuario: {
        id: number;
        nome: string;
        sobrenome: string;
        email: string;
        bloqueado: boolean;
      };
      dashboardsPrivados: Array<{ id: number; nome: string }>;
      relatoriosPrivados: Array<{ id: number; nome: string }>;
    }>;
  }> {
    await this.assertAdmin(userId);

    const somenteAtivos = params.somenteAtivos ?? true;
    const exigirDashboardsPrivados = params.exigirDashboardsPrivados ?? true;
    const exigirRelatoriosPrivados = params.exigirRelatoriosPrivados ?? true;
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 100);

    const [
      { data: users },
      privateReportsPage,
      privateDashboardsPage,
    ] = await Promise.all([
      this.usersService.findAllPaginated({
        page: 1,
        limit,
        bloqueado: somenteAtivos ? false : undefined,
      }),
      this.reportService.findAllPaginated({
        page: 1,
        limit: 100,
        privacidade: 'privado',
      }),
      this.dashboardService.findAllPaginated({
        page: 1,
        limit: 100,
        privacidade: 'privado',
      }),
    ]);

    const relacoes: Array<{
      usuario: {
        id: number;
        nome: string;
        sobrenome: string;
        email: string;
        bloqueado: boolean;
      };
      dashboardsPrivados: Array<{ id: number; nome: string }>;
      relatoriosPrivados: Array<{ id: number; nome: string }>;
    }> = [];

    const reportAccessIndex = new Map<number, string[]>();

    for (const user of users) {
      const targetId = Number(user.id);
      const [privateDashboardAccess, privateReportAccess] = await Promise.all([
        this.dashboardService.getDashboardsByUser(targetId),
        this.reportService.getRelatoriosByUser(targetId),
      ]);

      const dashboardsPrivados = privateDashboardAccess.dashboards.map(
        (dashboard) => ({
          id: Number(dashboard.id),
          nome: dashboard.nome,
        }),
      );
      const relatoriosPrivados = privateReportAccess.relatorios.map(
        (report) => ({
          id: Number(report.id),
          nome: report.nome,
        }),
      );

      const userLabel = `${user.nome} ${user.sobrenome}`.trim();
      for (const report of relatoriosPrivados) {
        const existing = reportAccessIndex.get(report.id) ?? [];
        existing.push(userLabel);
        reportAccessIndex.set(report.id, existing);
      }

      if (exigirDashboardsPrivados && dashboardsPrivados.length === 0) {
        continue;
      }
      if (exigirRelatoriosPrivados && relatoriosPrivados.length === 0) {
        continue;
      }
      if (
        !exigirDashboardsPrivados &&
        !exigirRelatoriosPrivados &&
        dashboardsPrivados.length === 0 &&
        relatoriosPrivados.length === 0
      ) {
        continue;
      }

      relacoes.push({
        usuario: {
          id: targetId,
          nome: user.nome,
          sobrenome: user.sobrenome,
          email: user.email,
          bloqueado: Boolean(user.bloqueado),
        },
        dashboardsPrivados,
        relatoriosPrivados,
      });
    }

    const privateDashboardsInSystem = privateDashboardsPage.data;

    const relatoriosPrivadosNoSistema = privateReportsPage.data.map(
      (report) => ({
        id: Number(report.id),
        nome: report.nome,
        usuariosComAcesso: reportAccessIndex.get(Number(report.id)) ?? [],
      }),
    );

    return {
      total: relacoes.length,
      relatoriosPrivadosNoSistema,
      dashboardsPrivadosNoSistemaTotal: privateDashboardsInSystem.length,
      relacoes,
    };
  }

  async getUser(
    userId: number,
    targetUserId: number,
  ): Promise<AiAdminUserDetail> {
    await this.assertCanManageUsers(userId);

    const [
      user,
      privateDashboardAccess,
      privateReportAccess,
      publicDashboards,
      publicReports,
    ] = await Promise.all([
      this.usersService.findByIdWithRelations(targetUserId),
      this.dashboardService.getDashboardsByUser(targetUserId),
      this.reportService.getRelatoriosByUser(targetUserId),
      this.dashboardService.findAllPublic(1, 200),
      this.reportService.findAllPublic(1, 200),
    ]);

    return this.buildUserAccessDetail(
      user,
      privateDashboardAccess.dashboards,
      privateReportAccess.relatorios,
      publicDashboards.data,
      publicReports.data,
    );
  }

  async listReports(
    userId: number,
    params: { page?: number; limit?: number; nome?: string } = {},
  ): Promise<{ total: number; relatorios: AiAdminReportSummary[] }> {
    await this.assertAdmin(userId);

    const { data, total } = await this.reportService.findAllPaginated({
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      nome: params.nome,
    });

    return {
      total,
      relatorios: data.map((report) => this.sanitizeReport(report, userId)),
    };
  }

  async listDashboards(
    userId: number,
    params: { page?: number; limit?: number; nome?: string } = {},
  ): Promise<{ total: number; dashboards: AiAdminDashboardSummary[] }> {
    await this.assertAdmin(userId);

    const { data, total } = await this.dashboardService.findAllPaginated({
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      nome: params.nome,
    });

    return {
      total,
      dashboards: data.map((dashboard) => this.sanitizeDashboard(dashboard)),
    };
  }

  async getDashboard(
    userId: number,
    dashboardId: number,
  ): Promise<AiAdminDashboardSummary> {
    await this.assertAdmin(userId);
    const dashboard = await this.dashboardService.findById(dashboardId, userId);
    return this.sanitizeDashboard(dashboard);
  }

  async getMetrics(userId: number) {
    await this.assertAdmin(userId);
    return this.metricsCollectorService.collectSnapshot();
  }

  async getMetricsHistory(
    userId: number,
    params: { hours?: number; limit?: number } = {},
  ) {
    await this.assertAdmin(userId);

    const hours = params.hours ?? 24;
    const limit = params.limit ?? 100;
    const items = await this.metricsPersistenceService.findHistory(hours, limit);

    return { hours, count: items.length, items };
  }

  async listJobs(userId: number, query: Partial<ListAdminJobsQueryDto> = {}) {
    await this.assertAdmin(userId);

    return this.reportJobService.listJobsForAdmin({
      page: query.page ?? 1,
      page_size: query.page_size ?? 50,
      sort: query.sort ?? 'created_at:desc',
      status: query.status,
      tipo: query.tipo,
      relatorio_id: query.relatorio_id,
      user_id: query.user_id,
      job_id: query.job_id,
      created_from: query.created_from,
      created_to: query.created_to,
    });
  }

  async listScheduleExecutions(
    userId: number,
    query: Partial<ListAdminScheduleExecutionsQueryDto> = {},
  ) {
    await this.assertAdmin(userId);

    return this.schedulerService.listExecucoesAdmin({
      page: query.page ?? 1,
      page_size: query.page_size ?? 50,
      sort: query.sort ?? 'iniciado_em:desc',
      status: query.status,
      relatorio_id: query.relatorio_id,
      created_from: query.created_from,
      created_to: query.created_to,
    });
  }

  private async assertAdmin(userId: number): Promise<void> {
    const isAdmin = await this.aiAccessService.isAdmin(userId);

    if (!isAdmin) {
      throw new ForbiddenException(
        'Apenas administradores podem consultar dados do sistema.',
      );
    }
  }

  private async assertCanManageUsers(userId: number): Promise<void> {
    const canManageUsers = await this.aiAccessService.canMentionUsers(userId);

    if (!canManageUsers) {
      throw new ForbiddenException(
        'Sem permissão para consultar usuários do sistema.',
      );
    }
  }

  private buildUserAccessDetail(
    user: Omit<Usuario, 'senha'>,
    privateDashboards: Dashboard[],
    privateReports: Array<Relatorio & { permitirConhecimentoIa: boolean }>,
    publicDashboards: Dashboard[],
    publicReports: Relatorio[],
  ): AiAdminUserDetail {
    const base = this.sanitizeUser(user);
    const extended = user as Omit<Usuario, 'senha'> & { ultimo_login?: Date };

    return {
      ...base,
      ultimo_login: extended.ultimo_login
        ? extended.ultimo_login.toISOString()
        : null,
      relatoriosPrivadosComAcesso: privateReports.map((report) => ({
        relatorioId: Number(report.id),
        nome: report.nome,
        permitirConhecimentoIa: report.permitirConhecimentoIa,
      })),
      dashboardsPrivadosComAcesso: privateDashboards.map((dashboard) => ({
        id: Number(dashboard.id),
        nome: dashboard.nome,
      })),
      relatoriosPublicosAcessiveis: publicReports.map((report) => ({
        id: Number(report.id),
        nome: report.nome,
      })),
      dashboardsPublicosAcessiveis: publicDashboards.map((dashboard) => ({
        id: Number(dashboard.id),
        nome: dashboard.nome,
      })),
    };
  }

  private sanitizeUser(user: Omit<Usuario, 'senha'>): AiAdminUserSummary {
    const { preferencias_ui: _preferencias, regra, permissao, ...rest } =
      user as Omit<Usuario, 'senha'> & {
        preferencias_ui?: unknown;
        regra?: Array<{ nome: string }>;
        permissao?: Array<{ nome: string }>;
      };

    return {
      id: Number(rest.id),
      nome: rest.nome,
      sobrenome: rest.sobrenome,
      email: rest.email,
      bloqueado: rest.bloqueado,
      regras: (regra ?? []).map((item) => item.nome),
      permissoes: (permissao ?? []).map((item) => item.nome),
    };
  }

  private sanitizeReport(
    report: Relatorio,
    userId: number,
  ): AiAdminReportSummary {
    return {
      id: Number(report.id),
      nome: report.nome,
      estado: report.estado,
      privacidade: String(report.privacidade ?? 'privado'),
      visivel: report.visivel ?? false,
      id_proprietario: report.id_proprietario ?? null,
      conhecimentoIaHabilitado: resolvePermitirConhecimentoIa(report, userId),
    };
  }

  private sanitizeDashboard(dashboard: Dashboard): AiAdminDashboardSummary {
    return {
      id: Number(dashboard.id),
      nome: dashboard.nome,
      privacidade: String(dashboard.privacidade ?? 'privado'),
      visivel: dashboard.visivel ?? false,
      id_proprietario: dashboard.id_proprietario ?? null,
      data_criacao:
        dashboard.data_criacao instanceof Date
          ? dashboard.data_criacao.toISOString()
          : dashboard.data_criacao
            ? String(dashboard.data_criacao)
            : null,
      data_atualizacao:
        dashboard.data_atualizacao instanceof Date
          ? dashboard.data_atualizacao.toISOString()
          : dashboard.data_atualizacao
            ? String(dashboard.data_atualizacao)
            : null,
      usuario_cadastrador: dashboard.usuario_cadastrador ?? null,
    };
  }
}
