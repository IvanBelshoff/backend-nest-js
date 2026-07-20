import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EstadoRelatorio, Relatorio } from 'src/database/entities/Relatorios';
import { UsuarioRelatorio } from 'src/database/entities/UsuarioRelatorio';
import { ReportService } from 'src/report/report.service';
import { ReportExecutionService } from 'src/report/execution/report-execution.service';
import { SnapshotQueryService } from 'src/report/snapshot-query.service';
import { env } from 'src/shared/env.schema';
import { AiAccessService } from './ai-access.service';
import { resolvePermitirConhecimentoIa } from 'src/report/report-ai-knowledge.util';
import { redactSensitiveReportRows, isSensitiveColumnName } from './ai-sensitive-data.util';
import {
  buildBlockedReportRefusalMessage,
  messageMentionsReportName,
} from './ai-report-name-match.util';

export { buildBlockedReportRefusalMessage };

export interface AiReportSummary {
  id: number;
  nome: string;
  estado: EstadoRelatorio;
  colunas: string[];
  parametros: Relatorio['parametros'];
  permitirConhecimentoIa: boolean;
}

export interface AiReportListForAi {
  total: number;
  relatorios: Array<{ nome: string }>;
  referenciaInterna: Array<{ id: number; nome: string; estado: string }>;
}

export function toPublicReportList(
  summaries: Array<Pick<AiReportSummary, 'id' | 'nome' | 'estado'>>,
): AiReportListForAi {
  return {
    total: summaries.length,
    relatorios: summaries.map((report) => ({ nome: report.nome })),
    referenciaInterna: summaries.map((report) => ({
      id: report.id,
      nome: report.nome,
      estado: report.estado,
    })),
  };
}

export interface AiReportQueryResult {
  relatorioId: number;
  relatorioNome: string;
  fonte: string;
  totalLinhas: number;
  colunas: string[];
  dados: Record<string, unknown>[];
  geradoEm?: string;
}

/** Converte Date/BigInt em valores JSON-safe para o AI SDK validar tool results. */
export function serializeReportRows(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map((row) => serializeReportValue(row) as Record<string, unknown>);
}

function serializeReportValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map(serializeReportValue);
  }

  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        serializeReportValue(entry),
      ]),
    );
  }

  return value;
}

@Injectable()
export class AiReportToolsService {
  constructor(
    private readonly reportService: ReportService,
    private readonly reportExecutionService: ReportExecutionService,
    private readonly snapshotQueryService: SnapshotQueryService,
    private readonly aiAccessService: AiAccessService,
    @InjectRepository(UsuarioRelatorio)
    private readonly usuarioRelatorioRepository: Repository<UsuarioRelatorio>,
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
  ) {}

  async listAvailableReports(userId: number): Promise<AiReportListForAi> {
    const summaries = await this.fetchReportSummaries(userId);
    return toPublicReportList(summaries);
  }

  private async fetchReportSummaries(userId: number): Promise<AiReportSummary[]> {
    const relatorios = await this.reportService.findReportsWithAiKnowledge(userId);

    return relatorios.map((relatorio) => ({
      id: Number(relatorio.id),
      nome: relatorio.nome,
      estado: relatorio.estado,
      colunas: [],
      parametros: relatorio.parametros ?? null,
      permitirConhecimentoIa: true,
    }));
  }

  async getReportCatalogForPrompt(
    userId: number,
  ): Promise<Array<{ id: number; nome: string; estado: string }>> {
    const summaries = await this.fetchReportSummaries(userId);
    return summaries.map((report) => ({
      id: report.id,
      nome: report.nome,
      estado: report.estado,
    }));
  }

  /** Relatórios citados no texto que existem no sistema mas não têm conhecimento IA para o usuário. */
  async findReportNamesWithoutAiInText(
    userId: number,
    text: string,
  ): Promise<string[]> {
    if (!text.trim()) {
      return [];
    }

    const [iaCatalog, allReports] = await Promise.all([
      this.reportService.findReportsWithAiKnowledge(userId),
      this.relatorioRepository.find({
        select: { id: true, nome: true },
        order: { nome: 'ASC' },
      }),
    ]);

    const iaIds = new Set(iaCatalog.map((report) => Number(report.id)));

    const blocked = allReports
      .filter((report) => !iaIds.has(Number(report.id)))
      .filter((report) => messageMentionsReportName(text, report.nome))
      .map((report) => report.nome);

    return blocked;
  }

  buildBlockedReportRefusalMessage(names: string[]): string {
    return buildBlockedReportRefusalMessage(names);
  }

  async describeReport(
    userId: number,
    relatorioId: number,
  ): Promise<AiReportSummary> {
    await this.assertAiKnowledgeAccess(userId, relatorioId);
    const relatorio = await this.reportService.findById(relatorioId, userId);
    const snapshot = await this.snapshotQueryService.queryPage(relatorioId, {
      page: 1,
      pageSize: 1,
    });

    return {
      id: Number(relatorio.id),
      nome: relatorio.nome,
      estado: relatorio.estado,
      colunas: (snapshot?.colunas ?? []).filter(
        (column) => !isSensitiveColumnName(column),
      ),
      parametros: relatorio.parametros ?? null,
      permitirConhecimentoIa: true,
    };
  }

  async queryReport(
    userId: number,
    relatorioId: number,
    parametros: Record<string, unknown> = {},
  ): Promise<AiReportQueryResult> {
    await this.assertAiKnowledgeAccess(userId, relatorioId);
    const relatorio = await this.reportService.findById(relatorioId, userId);

    if (relatorio.estado === EstadoRelatorio.ONLINE) {
      const result = await this.reportExecutionService.execute(
        relatorioId,
        parametros,
      );

      return this.buildQueryResult(
        relatorio,
        result.total_linhas,
        result.colunas,
        serializeReportRows(result.dados.slice(0, env.AI_MAX_REPORT_ROWS)),
        `Relatório "${relatorio.nome}" (consulta online)`,
      );
    }

    const snapshot = await this.snapshotQueryService.queryPage(relatorioId, {
      page: 1,
      pageSize: env.AI_MAX_REPORT_ROWS,
    });

    if (!snapshot) {
      throw new NotFoundException(
        'Snapshot do relatório não disponível para consulta.',
      );
    }

    return this.buildQueryResult(
      relatorio,
      snapshot.total_linhas,
      snapshot.colunas,
      serializeReportRows(snapshot.dados),
      `Relatório "${relatorio.nome}" (snapshot de ${snapshot.gerado_em.toISOString()})`,
      snapshot.gerado_em.toISOString(),
    );
  }

  private buildQueryResult(
    relatorio: Relatorio,
    totalLinhas: number,
    colunas: string[],
    dados: Record<string, unknown>[],
    fonte: string,
    geradoEm?: string,
  ): AiReportQueryResult {
    const redacted = redactSensitiveReportRows(colunas, dados);

    return {
      relatorioId: Number(relatorio.id),
      relatorioNome: relatorio.nome,
      fonte,
      totalLinhas,
      colunas: redacted.colunas,
      dados: redacted.dados,
      geradoEm,
    };
  }

  async assertAiKnowledgeAccess(
    userId: number,
    relatorioId: number,
  ): Promise<void> {
    const relatorio = await this.reportService.findById(relatorioId, userId);

    const hasIaGrant = resolvePermitirConhecimentoIa(relatorio, userId);

    if (hasIaGrant) {
      return;
    }

    throw new ForbiddenException(
      'Conhecimento da IA não habilitado para este relatório.',
    );
  }
}
