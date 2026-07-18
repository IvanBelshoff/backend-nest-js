import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from 'src/database/entities/Usuarios';
import { DashboardService } from 'src/dashboard/dashboard.service';
import {
  AiAccessService,
  DASHBOARD_ROLE_NAME,
} from './ai-access.service';
import { AiReportToolsService } from './ai-report-tools.service';
import type { AiMentionDto } from './dto/ai-chat.dto';

export type AiMentionRelatorioItem = {
  id: number;
  nome: string;
};

@Injectable()
export class AiMentionService {
  constructor(
    private readonly aiAccessService: AiAccessService,
    private readonly aiReportToolsService: AiReportToolsService,
    private readonly dashboardService: DashboardService,
    @InjectRepository(Usuario)
    private readonly userRepository: Repository<Usuario>,
  ) {}

  async listMentionRelatorios(
    userId: number,
  ): Promise<AiMentionRelatorioItem[]> {
    const catalog =
      await this.aiReportToolsService.getReportCatalogForPrompt(userId);

    return catalog.map((report) => ({
      id: report.id,
      nome: report.nome,
    }));
  }

  async validateMentions(
    userId: number,
    mentions: AiMentionDto[] = [],
  ): Promise<AiMentionDto[]> {
    if (mentions.length === 0) {
      return [];
    }

    for (const mention of mentions) {
      await this.validateOne(userId, mention);
    }

    return mentions;
  }

  async buildMentionsPromptSection(
    userId: number,
    mentions: AiMentionDto[],
  ): Promise<string> {
    if (mentions.length === 0) {
      return '';
    }

    const lines = [
      '',
      'Contexto explícito marcado pelo usuário nesta mensagem:',
      'REGRA: O alvo da pergunta atual é o item/domínio marcado abaixo — NÃO confunda com usuários ou assuntos de mensagens anteriores.',
      'Priorize estes alvos ao responder e ao escolher ferramentas. Use IDs apenas internamente; ao usuário mostre só nomes.',
    ];

    for (const mention of mentions) {
      switch (mention.type) {
        case 'relatorio':
          lines.push(
            `- Relatório destacado: "${mention.label}" (id interno ${mention.id})`,
          );
          break;
        case 'dashboard': {
          const dashboard = await this.dashboardService.findById(
            mention.id!,
            userId,
          );
          const criadoEm =
            dashboard.data_criacao instanceof Date
              ? dashboard.data_criacao.toISOString()
              : String(dashboard.data_criacao ?? '');
          const atualizadoEm =
            dashboard.data_atualizacao instanceof Date
              ? dashboard.data_atualizacao.toISOString()
              : String(dashboard.data_atualizacao ?? '');
          lines.push(
            `- Dashboard destacado: "${dashboard.nome}" (id interno ${Number(dashboard.id)})`,
            `  Metadados do dashboard (fonte autorizada): data_criacao=${criadoEm}; data_atualizacao=${atualizadoEm}; privacidade=${String(dashboard.privacidade)}; cadastrado_por=${dashboard.usuario_cadastrador ?? 'desconhecido'}.`,
            '  Se o usuário perguntar quando foi cadastrado/criado, responda com data_criacao deste dashboard.',
          );
          break;
        }
        case 'usuario':
          lines.push(
            `- Usuário destacado: "${mention.label}" (id interno ${mention.id})`,
          );
          break;
        case 'dominio_relatorios': {
          const catalog =
            await this.aiReportToolsService.getReportCatalogForPrompt(userId);
          lines.push(
            '- Domínio: Relatórios com conhecimento da IA habilitado (catálogo autorizado).',
            `  Metadados autorizados (fonte do servidor): total=${catalog.length}.`,
            '  Para perguntas de quantidade de relatórios, use EXATAMENTE este número. Nunca invente. Não peça ao usuário para consultar o banco.',
          );
          break;
        }
        case 'dominio_dashboards':
          lines.push('- Domínio: Dashboards acessíveis ao usuário.');
          break;
        case 'dominio_usuarios': {
          const stats = await this.getUserDomainStats();
          lines.push(
            '- Domínio: Usuários do sistema.',
            `  Metadados autorizados (fonte do servidor): total=${stats.total}; ativos=${stats.ativos}; bloqueados=${stats.bloqueados}.`,
            '  Para perguntas de quantidade, use EXATAMENTE estes números. Nunca invente. O valor 50 (limit de página de ferramentas) NÃO é o total de usuários.',
          );
          break;
        }
        default:
          break;
      }
    }

    return lines.join('\n');
  }

  /** Prefixo curto injetado na última mensagem do usuário (só para o modelo). */
  async buildMentionUserPrefix(
    userId: number,
    mentions: AiMentionDto[],
  ): Promise<string> {
    if (mentions.length === 0) {
      return '';
    }

    const parts: string[] = [];

    for (const mention of mentions) {
      if (mention.type === 'dashboard' && mention.id != null) {
        const dashboard = await this.dashboardService.findById(
          mention.id,
          userId,
        );
        const criadoEm =
          dashboard.data_criacao instanceof Date
            ? dashboard.data_criacao.toISOString()
            : String(dashboard.data_criacao ?? '');
        const cadastradoPor = dashboard.usuario_cadastrador ?? 'desconhecido';
        parts.push(
          `[Contexto autorizado do servidor] Alvo: DASHBOARD "${dashboard.nome}". data_criacao=${criadoEm}; cadastrado_por=${cadastradoPor}. Responda em português do Brasil com estes fatos. Não chame ferramentas. Não escreva JSON nem nomes de funções.`,
        );
      } else if (mention.type === 'relatorio' && mention.id != null) {
        parts.push(
          `[Contexto autorizado do servidor] Alvo: RELATÓRIO "${mention.label}" (id ${mention.id}).`,
        );
      } else if (mention.type === 'usuario' && mention.id != null) {
        parts.push(
          `[Contexto autorizado do servidor] Alvo: USUÁRIO "${mention.label}" (id ${mention.id}).`,
        );
      } else if (mention.type === 'dominio_usuarios') {
        const stats = await this.getUserDomainStats();
        parts.push(
          `[Contexto autorizado do servidor] Alvo: domínio Usuários. total=${stats.total}; ativos=${stats.ativos}; bloqueados=${stats.bloqueados}. Responda contagens com estes valores. Não invente. Não use 50 (limit de página) como total. Não escreva JSON.`,
        );
      } else if (mention.type === 'dominio_relatorios') {
        const catalog =
          await this.aiReportToolsService.getReportCatalogForPrompt(userId);
        parts.push(
          `[Contexto autorizado do servidor] Alvo: domínio Relatórios. total=${catalog.length}. Responda contagens com este valor. Não invente. Não peça para consultar o banco. Não escreva JSON.`,
        );
      } else if (mention.type.startsWith('dominio_')) {
        parts.push(
          `[Contexto autorizado do servidor] Alvo: domínio ${mention.label}. Use ferramentas autorizadas para dados; nunca invente contagens.`,
        );
      }
    }

    return parts.join(' ');
  }

  private async getUserDomainStats(): Promise<{
    total: number;
    ativos: number;
    bloqueados: number;
  }> {
    const [total, bloqueados] = await Promise.all([
      this.userRepository.count(),
      this.userRepository.count({ where: { bloqueado: true } }),
    ]);
    return {
      total,
      bloqueados,
      ativos: Math.max(0, total - bloqueados),
    };
  }

  private async validateOne(
    userId: number,
    mention: AiMentionDto,
  ): Promise<void> {
    switch (mention.type) {
      case 'relatorio':
        await this.aiReportToolsService.assertAiKnowledgeAccess(
          userId,
          mention.id!,
        );
        return;
      case 'dominio_relatorios': {
        const catalog = await this.listMentionRelatorios(userId);
        if (catalog.length < 1) {
          throw new ForbiddenException(
            'Nenhum relatório com conhecimento da IA disponível.',
          );
        }
        return;
      }
      case 'dashboard':
        await this.dashboardService.findById(mention.id!, userId);
        return;
      case 'dominio_dashboards': {
        const allowed = await this.userCanUseDashboardMentions(userId);
        if (!allowed) {
          throw new ForbiddenException(
            'Sem permissão para mencionar dashboards.',
          );
        }
        return;
      }
      case 'usuario': {
        const canUsers = await this.aiAccessService.canMentionUsers(userId);
        if (!canUsers) {
          throw new ForbiddenException(
            'Sem permissão para mencionar usuários.',
          );
        }
        const user = await this.userRepository.findOne({
          where: { id: mention.id! },
        });
        if (!user) {
          throw new NotFoundException('Usuário mencionado não encontrado.');
        }
        return;
      }
      case 'dominio_usuarios': {
        const canUsers = await this.aiAccessService.canMentionUsers(userId);
        if (!canUsers) {
          throw new ForbiddenException(
            'Sem permissão para o domínio Usuários.',
          );
        }
        return;
      }
      default:
        throw new BadRequestException('Tipo de mention inválido.');
    }
  }

  private async userCanUseDashboardMentions(userId: number): Promise<boolean> {
    if (await this.aiAccessService.hasRole(userId, DASHBOARD_ROLE_NAME)) {
      return true;
    }

    const result = await this.dashboardService.findAllPrivate(userId, {
      page: 1,
      limit: 1,
    });

    return result.total > 0;
  }
}
