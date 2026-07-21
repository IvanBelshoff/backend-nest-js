import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import {
  AiDashboardExploreFase,
  AiDashboardExploreJob,
  AiDashboardExploreStatus,
  type AiDashboardExploreMapa,
  type AiDashboardExplorePlano,
} from 'src/database/entities/AiDashboardExploreJobs';
import { AiChatMessage } from 'src/database/entities/AiChatMessage';
import { AiChatThread } from 'src/database/entities/AiChatThread';
import {
  UserNotification,
  UserNotificationType,
} from 'src/database/entities/UserNotification';
import { DashboardService } from 'src/dashboard/dashboard.service';
import { PgBossService } from 'src/queue/pg-boss.service';
import { AI_DASHBOARD_EXPLORE_QUEUE } from 'src/queue/queue.constants';
import type { AiDashboardExploreJobPayload } from 'src/queue/types/ai-dashboard-explore-job.payload';
import { AiService } from './ai.service';
import { PowerbiPublicExploreService } from './powerbi-public-explore.service';
import { generateText } from 'ai';

@Injectable()
export class AiDashboardExploreService {
  private readonly logger = new Logger(AiDashboardExploreService.name);

  constructor(
    @InjectRepository(AiDashboardExploreJob)
    private readonly jobRepository: Repository<AiDashboardExploreJob>,
    @InjectRepository(AiChatThread)
    private readonly threadRepository: Repository<AiChatThread>,
    @InjectRepository(AiChatMessage)
    private readonly messageRepository: Repository<AiChatMessage>,
    @InjectRepository(UserNotification)
    private readonly notificationRepository: Repository<UserNotification>,
    private readonly dashboardService: DashboardService,
    private readonly exploreService: PowerbiPublicExploreService,
    private readonly pgBossService: PgBossService,
    private readonly aiService: AiService,
  ) {}

  async startDiscovery(params: {
    userId: number;
    threadId: string;
    dashboardId: number;
  }): Promise<{ jobId: string; status: AiDashboardExploreStatus }> {
    await this.assertThreadAccess(params.userId, params.threadId);
    const dashboard = await this.dashboardService.findById(
      params.dashboardId,
      params.userId,
    );

    if (!this.exploreService.isEnabled() || !this.pgBossService.isEnabled) {
      throw new ServiceUnavailableException(
        'Exploração avançada de dashboards indisponível no momento.',
      );
    }

    const jobId = randomUUID();
    const job = this.jobRepository.create({
      id: jobId,
      userId: params.userId,
      threadId: params.threadId,
      dashboardId: Number(dashboard.id),
      fase: AiDashboardExploreFase.DISCOVERY,
      status: AiDashboardExploreStatus.QUEUED,
      progress: 0,
      mapa: null,
      plano: null,
      extract: null,
      insightMessageId: null,
      errorMessage: null,
      completedAt: null,
    });
    await this.jobRepository.save(job);

    const payload: AiDashboardExploreJobPayload = {
      jobId,
      userId: params.userId,
      threadId: params.threadId,
      dashboardId: Number(dashboard.id),
      fase: AiDashboardExploreFase.DISCOVERY,
    };

    await this.pgBossService.send(AI_DASHBOARD_EXPLORE_QUEUE, payload, {
      singletonKey: `ai-explore-discovery-${params.threadId}-${dashboard.id}`,
      expireInSeconds: 60 * 30,
    });

    await this.saveAssistantMessage(params.threadId, {
      text: `Vou mapear o dashboard **${dashboard.nome}** (abas, filtros e destaques). Isso pode levar alguns instantes — em seguida faço perguntas para direcionar a análise.`,
      metadata: {
        exploreCard: {
          kind: 'discovery_running',
          jobId,
          dashboardId: Number(dashboard.id),
          dashboardNome: dashboard.nome,
        },
      },
    });

    return { jobId, status: AiDashboardExploreStatus.QUEUED };
  }

  async confirmAnalysis(params: {
    userId: number;
    threadId: string;
    dashboardId: number;
    plano: AiDashboardExplorePlano;
  }): Promise<{ jobId: string; status: AiDashboardExploreStatus }> {
    await this.assertThreadAccess(params.userId, params.threadId);
    const dashboard = await this.dashboardService.findById(
      params.dashboardId,
      params.userId,
    );

    if (!params.plano?.perguntaAnalitica?.trim()) {
      throw new BadRequestException('Plano de análise incompleto.');
    }

    if (!this.exploreService.isEnabled() || !this.pgBossService.isEnabled) {
      throw new ServiceUnavailableException(
        'Exploração avançada de dashboards indisponível no momento.',
      );
    }

    const jobId = randomUUID();
    const job = this.jobRepository.create({
      id: jobId,
      userId: params.userId,
      threadId: params.threadId,
      dashboardId: Number(dashboard.id),
      fase: AiDashboardExploreFase.ANALYSIS,
      status: AiDashboardExploreStatus.QUEUED,
      progress: 0,
      mapa: await this.getLatestMapa(params.threadId, Number(dashboard.id)),
      plano: params.plano,
      extract: null,
      insightMessageId: null,
      errorMessage: null,
      completedAt: null,
    });
    await this.jobRepository.save(job);

    await this.pgBossService.send(
      AI_DASHBOARD_EXPLORE_QUEUE,
      {
        jobId,
        userId: params.userId,
        threadId: params.threadId,
        dashboardId: Number(dashboard.id),
        fase: AiDashboardExploreFase.ANALYSIS,
      } satisfies AiDashboardExploreJobPayload,
      {
        expireInSeconds: 60 * 45,
      },
    );

    await this.saveAssistantMessage(params.threadId, {
      text: `Análise iniciada no **${dashboard.nome}**. Vou aplicar os filtros e percorrer as abas do plano. Aviso você quando o insight estiver pronto.`,
      metadata: {
        exploreCard: {
          kind: 'analysis_running',
          jobId,
          dashboardId: Number(dashboard.id),
          dashboardNome: dashboard.nome,
          plano: params.plano,
        },
      },
    });

    return { jobId, status: AiDashboardExploreStatus.QUEUED };
  }

  async getJob(
    userId: number,
    jobId: string,
  ): Promise<{
    id: string;
    fase: AiDashboardExploreFase;
    status: AiDashboardExploreStatus;
    progress: number;
    mapa: AiDashboardExploreMapa | null;
    plano: AiDashboardExplorePlano | null;
    errorMessage: string | null;
    threadId: string;
    dashboardId: number;
  }> {
    const job = await this.jobRepository.findOne({ where: { id: jobId } });
    if (!job || job.userId !== userId) {
      throw new NotFoundException('Job de exploração não encontrado.');
    }

    return {
      id: job.id,
      fase: job.fase,
      status: job.status,
      progress: job.progress,
      mapa: job.mapa,
      plano: job.plano,
      errorMessage: job.errorMessage,
      threadId: job.threadId,
      dashboardId: Number(job.dashboardId),
    };
  }

  async getLatestMapaForThread(
    userId: number,
    threadId: string,
    dashboardId?: number,
  ): Promise<AiDashboardExploreMapa | null> {
    await this.assertThreadAccess(userId, threadId);
    return this.getLatestMapa(threadId, dashboardId);
  }

  async offerDiscoveryCard(params: {
    userId: number;
    dashboardId: number;
  }): Promise<{
    exploreCard: {
      kind: 'start_discovery';
      dashboardId: number;
      dashboardNome: string;
    };
    mensagem: string;
  }> {
    const dashboard = await this.dashboardService.findById(
      params.dashboardId,
      params.userId,
    );

    return {
      exploreCard: {
        kind: 'start_discovery',
        dashboardId: Number(dashboard.id),
        dashboardNome: dashboard.nome,
      },
      mensagem: `Posso iniciar uma análise guiada do dashboard "${dashboard.nome}": primeiro mapeio abas/filtros, faço perguntas e só então exploro com o plano confirmado.`,
    };
  }

  async proposeAnalysisPlan(params: {
    userId: number;
    threadId: string;
    dashboardId: number;
    plano: AiDashboardExplorePlano;
  }): Promise<{
    exploreCard: {
      kind: 'confirm_analysis';
      dashboardId: number;
      dashboardNome: string;
      plano: AiDashboardExplorePlano;
    };
    mensagem: string;
  }> {
    await this.assertThreadAccess(params.userId, params.threadId);
    const dashboard = await this.dashboardService.findById(
      params.dashboardId,
      params.userId,
    );

    const mapa = await this.getLatestMapa(
      params.threadId,
      Number(dashboard.id),
    );
    if (!mapa) {
      throw new BadRequestException(
        'Mapa do dashboard ainda não está disponível. Inicie a análise (discovery) antes.',
      );
    }

    const filtrosTexto =
      params.plano.filtros?.length > 0
        ? params.plano.filtros.map((f) => `${f.nome}=${f.valor}`).join(', ')
        : 'nenhum';
    const abasTexto =
      params.plano.abas?.length > 0
        ? params.plano.abas.join(', ')
        : 'vista atual / capa';

    return {
      exploreCard: {
        kind: 'confirm_analysis',
        dashboardId: Number(dashboard.id),
        dashboardNome: dashboard.nome,
        plano: params.plano,
      },
      mensagem: `Plano de análise para "${dashboard.nome}": abas [${abasTexto}]; filtros [${filtrosTexto}]; pergunta: ${params.plano.perguntaAnalitica}. Confirme para eu executar.`,
    };
  }

  async processJob(payload: AiDashboardExploreJobPayload): Promise<void> {
    const job = await this.jobRepository.findOne({
      where: { id: payload.jobId },
    });
    if (!job) {
      return;
    }

    await this.jobRepository.update(job.id, {
      status: AiDashboardExploreStatus.PROCESSING,
      progress: 10,
    });

    try {
      const dashboard = await this.dashboardService.findById(
        payload.dashboardId,
        payload.userId,
      );

      if (payload.fase === AiDashboardExploreFase.DISCOVERY) {
        await this.runDiscovery(job, dashboard.url, dashboard.query, dashboard.nome);
      } else {
        await this.runAnalysis(job, dashboard.url, dashboard.query, dashboard.nome);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Falha na exploração';
      this.logger.error(`Explore job ${payload.jobId} failed: ${message}`);
      await this.jobRepository.update(payload.jobId, {
        status: AiDashboardExploreStatus.FAILED,
        errorMessage: message,
        completedAt: new Date(),
        progress: 100,
      });
      await this.notify(payload.userId, {
        type: UserNotificationType.AI_DASHBOARD_EXPLORE_FAILED,
        title: 'Análise do dashboard falhou',
        body: message,
        payload: {
          jobId: payload.jobId,
          threadId: payload.threadId,
          dashboardId: payload.dashboardId,
        },
      });
    }
  }

  private async runDiscovery(
    job: AiDashboardExploreJob,
    url: string,
    query: string | null | undefined,
    dashboardNome: string,
  ): Promise<void> {
    await this.jobRepository.update(job.id, { progress: 30 });
    const mapa = await this.exploreService.discover({ url, query });
    await this.jobRepository.update(job.id, {
      progress: 70,
      mapa,
    });

    const questions = await this.buildDiscoveryQuestions(dashboardNome, mapa);
    const message = await this.saveAssistantMessage(job.threadId, {
      text: questions,
      metadata: {
        exploreCard: {
          kind: 'discovery_ready',
          jobId: job.id,
          dashboardId: Number(job.dashboardId),
          dashboardNome,
          mapa,
        },
      },
    });

    await this.jobRepository.update(job.id, {
      status: AiDashboardExploreStatus.COMPLETED,
      progress: 100,
      completedAt: new Date(),
      insightMessageId: message.id,
    });

    await this.notify(job.userId, {
      type: UserNotificationType.AI_DASHBOARD_DISCOVERY_READY,
      title: 'Mapa do dashboard pronto',
      body: `Mapeei "${dashboardNome}". Abra a conversa para responder às perguntas da análise.`,
      payload: {
        jobId: job.id,
        threadId: job.threadId,
        dashboardId: Number(job.dashboardId),
        dashboardNome,
      },
    });
  }

  private async runAnalysis(
    job: AiDashboardExploreJob,
    url: string,
    query: string | null | undefined,
    dashboardNome: string,
  ): Promise<void> {
    if (!job.plano) {
      throw new Error('Plano de análise ausente no job.');
    }

    await this.jobRepository.update(job.id, { progress: 25 });
    const extract = await this.exploreService.analyze({
      url,
      query,
      plano: job.plano,
    });
    job.progress = 70;
    job.extract = JSON.parse(JSON.stringify(extract)) as Record<string, unknown>;
    await this.jobRepository.save(job);

    const insight = await this.buildInsight(dashboardNome, job.plano, extract);
    const message = await this.saveAssistantMessage(job.threadId, {
      text: insight,
      metadata: {
        exploreCard: {
          kind: 'analysis_ready',
          jobId: job.id,
          dashboardId: Number(job.dashboardId),
          dashboardNome,
          plano: job.plano,
        },
      },
    });

    await this.jobRepository.update(job.id, {
      status: AiDashboardExploreStatus.COMPLETED,
      progress: 100,
      completedAt: new Date(),
      insightMessageId: message.id,
    });

    await this.notify(job.userId, {
      type: UserNotificationType.AI_DASHBOARD_EXPLORE_READY,
      title: 'Análise do dashboard pronta',
      body: `A análise de "${dashboardNome}" foi concluída. Abra a conversa para ver o insight.`,
      payload: {
        jobId: job.id,
        threadId: job.threadId,
        dashboardId: Number(job.dashboardId),
        dashboardNome,
      },
    });
  }

  private async buildDiscoveryQuestions(
    dashboardNome: string,
    mapa: AiDashboardExploreMapa,
  ): Promise<string> {
    const anoFiltro = mapa.filtros.find((f) => /ano/i.test(f.nome));
    const anos =
      anoFiltro?.valores ?? anoFiltro?.valoresAmostra ?? [];
    const lines = [
      `Mapeei o dashboard **${dashboardNome}**.`,
      '',
      mapa.abas.length
        ? `**Abas encontradas:** ${mapa.abas.join(', ')}.`
        : 'Não consegui listar abas nomeadas com segurança; posso analisar a vista atual.',
      mapa.filtros.length
        ? `**Filtros detectados:** ${mapa.filtros
            .map((f) => {
              const vals = f.valores ?? f.valoresAmostra ?? [];
              return vals.length
                ? `${f.nome} (${vals.slice(0, 8).join(', ')}${vals.length > 8 ? '…' : ''})`
                : f.nome;
            })
            .join('; ')}.`
        : 'Não detectei slicers claros nesta passagem.',
      mapa.destaquesCapa.length
        ? `**Destaques da capa:** ${mapa.destaquesCapa.slice(0, 8).join(' · ')}.`
        : '',
      '',
      'Para montar a análise, me diga:',
    ];

    let q = 1;
    if (anos.length > 0) {
      lines.push(`${q}. Qual **Ano** você quer analisar? Opções: ${anos.join(', ')}.`);
      q += 1;
    } else {
      lines.push(`${q}. Há um recorte temporal desejado (ano/período)?`);
      q += 1;
    }

    const vigencia = mapa.destaquesCapa.find((d) => /vig[eê]ncia/i.test(d));
    if (vigencia) {
      lines.push(
        `${q}. Vi **${vigencia}** na capa. Quer analisar nesse recorte ou outro?`,
      );
      q += 1;
    }

    if (mapa.abas.length > 1) {
      lines.push(
        `${q}. Quer só a capa/primeira página ou também: ${mapa.abas.slice(0, 6).join(', ')}?`,
      );
      q += 1;
    }

    const mun = mapa.filtros.find((f) => /munic/i.test(f.nome));
    if (mun) {
      lines.push(
        `${q}. No filtro **${mun.nome}**, prefere consolidado (todos) ou um município específico?`,
      );
    }

    lines.push(
      '',
      'Quando responder, confirmo o plano de análise antes de explorar as abas com os filtros.',
    );

    try {
      const { text } = await generateText({
        model: this.aiService.getChatModel(),
        prompt: [
          'Você é analista de dados do DataDash. Com base no MAPA abaixo, escreva em português do Brasil 1–3 perguntas curtas e úteis para destravar a análise do Power BI.',
          'Só use abas/filtros/valores presentes no mapa. Não invente. Não cite URLs.',
          'Inclua um breve resumo do que encontrou (1–2 frases) e depois as perguntas numeradas.',
          '',
          `Dashboard: ${dashboardNome}`,
          `MAPA: ${JSON.stringify(mapa)}`,
        ].join('\n'),
      });
      if (text?.trim()) {
        return text.trim();
      }
    } catch (error) {
      this.logger.warn(
        `Falha ao gerar perguntas com modelo: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
    }

    return lines.filter(Boolean).join('\n');
  }

  private async buildInsight(
    dashboardNome: string,
    plano: AiDashboardExplorePlano,
    extract: Awaited<ReturnType<PowerbiPublicExploreService['analyze']>>,
  ): Promise<string> {
    try {
      const { text } = await generateText({
        model: this.aiService.getChatModel(),
        prompt: [
          'Você é analista de dados do DataDash. Gere um insight analítico em português do Brasil.',
          'Use APENAS o extract. Não invente números, seções ou datas.',
          'Cite a fonte pelo nome do dashboard. Informe filtros aplicados e abas lidas.',
          'Se houver avisoLimitacoes ou dados ausentes, admita a limitação.',
          '',
          `Dashboard: ${dashboardNome}`,
          `Plano: ${JSON.stringify(plano)}`,
          `Extract: ${JSON.stringify(extract).slice(0, 24000)}`,
        ].join('\n'),
      });
      if (text?.trim()) {
        return text.trim();
      }
    } catch (error) {
      this.logger.warn(
        `Falha ao gerar insight: ${
          error instanceof Error ? error.message : 'erro'
        }`,
      );
    }

    const filtros = extract.filtrosAplicados
      .map((f) => `${f.nome}=${f.valor}${f.ok ? '' : ' (falhou)'}`)
      .join(', ');
    const kpis = extract.paginas
      .flatMap((p) => p.kpis.slice(0, 5))
      .slice(0, 12)
      .join('; ');

    return [
      `Insight do dashboard **${dashboardNome}**`,
      '',
      `Objetivo: ${plano.perguntaAnalitica}`,
      filtros ? `Filtros: ${filtros}` : 'Filtros: nenhum aplicado.',
      `Abas lidas: ${extract.paginas.map((p) => p.nomeAba).join(', ') || 'nenhuma'}`,
      '',
      kpis ? `Principais indicadores capturados: ${kpis}` : 'Poucos KPIs legíveis no extract.',
      '',
      ...(extract.avisoLimitacoes ?? []),
    ].join('\n');
  }

  private async getLatestMapa(
    threadId: string,
    dashboardId?: number,
  ): Promise<AiDashboardExploreMapa | null> {
    const qb = this.jobRepository
      .createQueryBuilder('job')
      .where('job.thread_id = :threadId', { threadId })
      .andWhere('job.fase = :fase', { fase: AiDashboardExploreFase.DISCOVERY })
      .andWhere('job.status = :status', {
        status: AiDashboardExploreStatus.COMPLETED,
      })
      .andWhere('job.mapa IS NOT NULL')
      .orderBy('job.completed_at', 'DESC')
      .take(1);

    if (dashboardId != null) {
      qb.andWhere('job.dashboard_id = :dashboardId', { dashboardId });
    }

    const job = await qb.getOne();
    return job?.mapa ?? null;
  }

  private async assertThreadAccess(
    userId: number,
    threadId: string,
  ): Promise<AiChatThread> {
    const thread = await this.threadRepository.findOne({
      where: { id: threadId, userId },
    });
    if (!thread) {
      throw new ForbiddenException('Thread não encontrada.');
    }
    return thread;
  }

  private async saveAssistantMessage(
    threadId: string,
    params: { text: string; metadata?: Record<string, unknown> },
  ): Promise<AiChatMessage> {
    const message = this.messageRepository.create({
      id: randomUUID(),
      threadId,
      role: 'assistant',
      parts: [{ type: 'text', text: params.text }],
      metadata: params.metadata ?? {},
    });
    const saved = await this.messageRepository.save(message);
    await this.threadRepository.update(threadId, { updatedAt: new Date() });
    return saved;
  }

  private async notify(
    userId: number,
    input: {
      type: UserNotificationType;
      title: string;
      body: string;
      payload: Record<string, unknown>;
    },
  ): Promise<void> {
    const existing = await this.notificationRepository
      .createQueryBuilder('n')
      .where('n.user_id = :userId', { userId })
      .andWhere("n.payload->>'jobId' = :jobId", {
        jobId: String(input.payload.jobId ?? ''),
      })
      .getOne();
    if (existing) {
      return;
    }

    await this.notificationRepository.save(
      this.notificationRepository.create({
        userId,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload,
        readAt: null,
      }),
    );
  }
}
