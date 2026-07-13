import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DashboardService } from 'src/dashboard/dashboard.service';
import { Relatorio } from 'src/database/entities/Relatorios';
import { ReportService } from 'src/report/report.service';
import { UsersService } from 'src/user/user.service';
import { UserNotificationService } from './user-notification.service';

@Injectable()
export class UserMeSummaryService {
  constructor(
    private readonly usersService: UsersService,
    private readonly reportService: ReportService,
    private readonly dashboardService: DashboardService,
    private readonly userNotificationService: UserNotificationService,
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
  ) {}

  async getSummary(userId: number) {
    const user = await this.usersService.findByIdWithRelations(userId);

    const [
      relatoriosAcessiveis,
      dashboardsAcessiveis,
      relatoriosProprios,
      notificacoesNaoLidas,
    ] = await Promise.all([
      this.reportService.findAllPrivate(userId, { page: 1, limit: 1 }),
      this.dashboardService.findAllPrivate(userId, { page: 1, limit: 1 }),
      this.relatorioRepository.count({
        where: { id_proprietario: userId },
      }),
      this.userNotificationService.getUnreadCount(userId),
    ]);

    return {
      ultimo_login: user.ultimo_login ?? null,
      membro_desde: user.data_criacao,
      relatorios_acessiveis: relatoriosAcessiveis.total,
      dashboards_acessiveis: dashboardsAcessiveis.total,
      relatorios_favoritos: user.relatorios_favoritos?.length ?? 0,
      dashboards_favoritos: user.dashboards_favoritos?.length ?? 0,
      relatorios_proprios: relatoriosProprios,
      regras: user.regra?.map((regra) => regra.nome) ?? [],
      permissoes: user.permissao?.map((permissao) => permissao.nome) ?? [],
      notificacoes_nao_lidas: notificacoesNaoLidas,
    };
  }
}
