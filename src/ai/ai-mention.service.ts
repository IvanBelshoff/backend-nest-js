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
import type { AiChatMode, AiMentionDto } from './dto/ai-chat.dto';

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
    options: { mode?: AiChatMode } = {},
  ): Promise<string> {
    if (mentions.length === 0) {
      return '';
    }

    const isAnalytic = options.mode === 'analitico';

    const lines = [
      '',
      'Contexto explícito marcado pelo usuário nesta mensagem:',
      'REGRA: O alvo da pergunta atual é o item/domínio marcado abaixo — NÃO confunda com usuários ou assuntos de mensagens anteriores.',
      'Priorize estes alvos ao responder e ao escolher ferramentas. Use IDs apenas internamente; ao usuário mostre só nomes.',
    ];

    if (isAnalytic) {
      lines.push(
        'MODO ANALÍTICO: abaixo há apenas metadados (nomes, colunas, estado). Nenhuma contagem ou valor foi pré-calculado de propósito — obtenha todo número via ferramentas analíticas.',
      );
    }

    for (const mention of mentions) {
      switch (mention.type) {
        case 'relatorio': {
          if (isAnalytic) {
            lines.push(
              ...(await this.buildAnalyticReportMetadataLines(
                userId,
                mention.id!,
                mention.label,
              )),
            );
            break;
          }

          lines.push(
            `- Relatório destacado: "${mention.label}" (id interno ${mention.id})`,
          );
          break;
        }
        case 'dashboard': {
          if (isAnalytic) {
            lines.push(`- Dashboard destacado: "${mention.label}"`);
            break;
          }

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
          if (isAnalytic) {
            lines.push(
              '- Domínio: Relatórios com conhecimento da IA habilitado (catálogo autorizado).',
              '  Escolha no catálogo do prompt qual relatório analisar; se houver mais de um candidato plausível, pergunte ao usuário qual usar.',
            );
            break;
          }

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
          if (isAnalytic) {
            lines.push(
              '- Domínio: Usuários do sistema.',
              '  Obtenha qualquer contagem via ferramenta autorizada — nenhum número foi pré-calculado neste modo.',
            );
            break;
          }

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
    options: { mode?: AiChatMode } = {},
  ): Promise<string> {
    if (mentions.length === 0) {
      return '';
    }

    if (options.mode === 'analitico') {
      return this.buildAnalyticMentionUserPrefix(mentions);
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
          `[Contexto autorizado do servidor] Alvo: domínio Usuários. total=${stats.total}; ativos=${stats.ativos}; bloqueados=${stats.bloqueados}. Contagens simples: use estes valores. Para relações/listas detalhadas (acessos a dashboards/relatórios), chame as ferramentas autorizadas. Não invente. Não use 50 (limit de página) como total.`,
        );
      } else if (mention.type === 'dominio_relatorios') {
        const catalog =
          await this.aiReportToolsService.getReportCatalogForPrompt(userId);
        parts.push(
          `[Contexto autorizado do servidor] Alvo: domínio Relatórios. total=${catalog.length}. Contagens simples: use este valor. Para relações com usuários/dashboards, chame as ferramentas autorizadas. Não invente.`,
        );
      } else if (mention.type.startsWith('dominio_')) {
        parts.push(
          `[Contexto autorizado do servidor] Alvo: domínio ${mention.label}. Use ferramentas autorizadas para dados; nunca invente contagens.`,
        );
      }
    }

    return parts.join(' ');
  }

  /**
   * No modo analítico o prefixo não carrega fatos numéricos: os números precisam
   * sair das tools analíticas para que o gráfico e o texto contem a mesma história.
   */
  private buildAnalyticMentionUserPrefix(mentions: AiMentionDto[]): string {
    const targets = mentions
      .map((mention) => {
        switch (mention.type) {
          case 'relatorio':
            return `RELATÓRIO "${mention.label}" (id ${mention.id})`;
          case 'dashboard':
            return `DASHBOARD "${mention.label}"`;
          case 'usuario':
            return `USUÁRIO "${mention.label}" (id ${mention.id})`;
          default:
            return `domínio ${mention.label}`;
        }
      })
      .join('; ');

    return `[Contexto autorizado do servidor — modo analítico] Alvo da análise: ${targets}. Nenhum número foi pré-calculado: use as ferramentas analíticas para obter os valores. Para distribuição de usuários por tipo de regra ou gráficos desse domínio, chame graficoUsuariosPorRegra. Se faltar definir coluna, métrica ou período em relatórios, pergunte antes de analisar.`;
  }

  /** Metadados (nome, estado, colunas) de um relatório para orientar a análise. */
  private async buildAnalyticReportMetadataLines(
    userId: number,
    relatorioId: number,
    label: string,
  ): Promise<string[]> {
    try {
      const report = await this.aiReportToolsService.describeReport(
        userId,
        relatorioId,
      );
      const columns = report.colunas ?? [];
      const parameterNames = Object.keys(report.parametros ?? {});

      const lines = [
        `- Relatório destacado para análise: "${report.nome}" (id interno ${report.id}, estado ${report.estado})`,
      ];

      lines.push(
        columns.length > 0
          ? `  Colunas disponíveis: ${columns.join(', ')}.`
          : '  Colunas não disponíveis nos metadados — descreva o relatório antes de analisar.',
      );

      if (parameterNames.length > 0) {
        lines.push(`  Parâmetros aceitos: ${parameterNames.join(', ')}.`);
      }

      lines.push(
        '  Use exatamente estes nomes de coluna nas ferramentas analíticas. Nenhum valor foi pré-calculado.',
      );

      return lines;
    } catch {
      return [
        `- Relatório destacado para análise: "${label}" (id interno ${relatorioId})`,
        '  Metadados não puderam ser carregados agora — descreva o relatório antes de analisar.',
      ];
    }
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
