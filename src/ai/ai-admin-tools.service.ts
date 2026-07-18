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
    params: { page?: number; limit?: number; filter?: string } = {},
  ): Promise<{ total: number; usuarios: AiAdminUserSummary[] }> {
    await this.assertAdmin(userId);

    const { data, total } = await this.usersService.findAllPaginated({
      page: params.page ?? 1,
      limit: params.limit ?? 50,
      filter: params.filter,
    });

    return {
      total,
      usuarios: data.map((user) => this.sanitizeUser(user)),
    };
  }

  async getUser(
    userId: number,
    targetUserId: number,
  ): Promise<AiAdminUserDetail> {
    await this.assertAdmin(userId);

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
      relatorios: data.map((report) => this.sanitizeReport(report)),
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

  private sanitizeReport(report: Relatorio): AiAdminReportSummary {
    return {
      id: Number(report.id),
      nome: report.nome,
      estado: report.estado,
      privacidade: String(report.privacidade ?? 'privado'),
      visivel: report.visivel ?? false,
      id_proprietario: report.id_proprietario ?? null,
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
