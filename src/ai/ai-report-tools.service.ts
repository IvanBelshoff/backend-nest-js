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
import { redactSensitiveReportRows, isSensitiveColumnName } from './ai-sensitive-data.util';

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
    const isAdmin = await this.aiAccessService.isAdmin(userId);

    if (isAdmin) {
      const relatorios = await this.relatorioRepository.find({
        order: { nome: 'ASC' },
      });

      return relatorios.map((relatorio) => ({
        id: Number(relatorio.id),
        nome: relatorio.nome,
        estado: relatorio.estado,
        colunas: [],
        parametros: relatorio.parametros ?? null,
        permitirConhecimentoIa: true,
      }));
    }

    const grants = await this.usuarioRelatorioRepository.find({
      where: {
        usuarioId: userId,
        permitirConhecimentoIa: true,
      },
      relations: { relatorio: true },
      order: { relatorio: { nome: 'ASC' } },
    });

    return grants
      .filter((grant) => grant.relatorio != null)
      .map((grant) => ({
        id: Number(grant.relatorio.id),
        nome: grant.relatorio.nome,
        estado: grant.relatorio.estado,
        colunas: [],
        parametros: grant.relatorio.parametros ?? null,
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
    await this.reportService.findById(relatorioId, userId);

    const isAdmin = await this.aiAccessService.isAdmin(userId);
    if (isAdmin) {
      return;
    }

    const grant = await this.usuarioRelatorioRepository.findOne({
      where: {
        usuarioId: userId,
        relatorioId,
        permitirConhecimentoIa: true,
      },
    });

    if (!grant) {
      throw new ForbiddenException(
        'Conhecimento da IA não habilitado para este relatório.',
      );
    }
  }
}
