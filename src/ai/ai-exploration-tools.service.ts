import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from 'src/audit/audit.service';
import { AUDIT_ACTIONS } from 'src/audit/constants/audit-actions';
import { toAuditActor } from 'src/audit/utils/audit-actor.util';
import { toAuditRecordMetadata } from 'src/audit/utils/audit-metadata.util';
import { ConnectionQueryService } from 'src/connection/connection-query.service';
import { EstadoRelatorio } from 'src/database/entities/Relatorios';
import { Usuario } from 'src/database/entities/Usuarios';
import { DuckDbService } from 'src/report/duckdb/duckdb.service';
import { ReportService } from 'src/report/report.service';
import { ReportSnapshotService } from 'src/report/report-snapshot.service';
import { env } from 'src/shared/env.schema';
import {
  redactSensitiveReportRows,
  isSensitiveColumnName,
} from './ai-sensitive-data.util';
import {
  AiReportToolsService,
  serializeReportRows,
} from './ai-report-tools.service';
import { buildChartSpecFromRows } from './chart/ai-chart-from-rows.util';
import type { AiChartSpec, AiChartType } from './ai-chart-spec.schema';
import {
  buildTableSpecFromRows,
  type AiTableSpec,
} from './ai-table-spec.schema';

export type VisualizationToolResult = {
  resumo: Record<string, unknown>;
  chartSpec: AiChartSpec | null;
};

export type TableToolResult = {
  resumo: Record<string, unknown>;
  tableSpec: AiTableSpec | null;
};

export type GarantirSnapshotResult =
  | {
      status: 'ok';
      relatorioId: number;
      relatorioNome: string;
      totalLinhas: number;
      geradoEm: string;
      fonte: string;
    }
  | {
      status: 'gerando';
      relatorioId: number;
      relatorioNome: string;
      jobId: string;
      aviso: string;
    }
  | { status: 'erro'; mensagem: string };

@Injectable()
export class AiExplorationToolsService {
  private readonly logger = new Logger(AiExplorationToolsService.name);

  constructor(
    private readonly aiReportToolsService: AiReportToolsService,
    private readonly reportService: ReportService,
    private readonly reportSnapshotService: ReportSnapshotService,
    private readonly duckDbService: DuckDbService,
    private readonly connectionQueryService: ConnectionQueryService,
    private readonly auditService: AuditService,
    @InjectRepository(Usuario)
    private readonly userRepository: Repository<Usuario>,
  ) {}

  async garantirSnapshot(
    userId: number,
    relatorioId: number,
  ): Promise<GarantirSnapshotResult> {
    try {
      await this.aiReportToolsService.assertAiKnowledgeAccess(
        userId,
        relatorioId,
      );
      const relatorio = await this.reportService.findById(relatorioId, userId);

      if (relatorio.estado === EstadoRelatorio.GERANDO_SNAPSHOT) {
        return {
          status: 'gerando',
          relatorioId,
          relatorioNome: relatorio.nome,
          jobId: '',
          aviso:
            'O snapshot deste relatório já está sendo gerado. Aguarde e tente novamente em breve.',
        };
      }

      const resolved =
        await this.reportSnapshotService.resolveSnapshotFile(relatorioId);

      if (resolved && relatorio.snapshot_valido) {
        const geradoEm =
          resolved.snapshot.gerado_em instanceof Date
            ? resolved.snapshot.gerado_em
            : new Date(resolved.snapshot.gerado_em ?? 0);

        return {
          status: 'ok',
          relatorioId,
          relatorioNome: relatorio.nome,
          totalLinhas: Number(resolved.snapshot.total_linhas ?? 0),
          geradoEm: geradoEm.toISOString(),
          fonte: `Relatório "${relatorio.nome}" (snapshot de ${geradoEm.toISOString()})`,
        };
      }

      const jobId = await this.reportSnapshotService.scheduleSnapshotGeneration(
        relatorioId,
        userId,
        {},
      );

      return {
        status: 'gerando',
        relatorioId,
        relatorioNome: relatorio.nome,
        jobId,
        aviso:
          'Snapshot enfileirado. Aguarde a geração concluir e chame garantirSnapshot de novo antes de consultar.',
      };
    } catch (error) {
      this.logger.warn(
        `garantirSnapshot falhou para relatório ${relatorioId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        status: 'erro',
        mensagem:
          error instanceof Error
            ? error.message
            : 'Não foi possível garantir o snapshot.',
      };
    }
  }

  async executarQuerySnapshot(
    userId: number,
    relatorioId: number,
    sql: string,
  ): Promise<Record<string, unknown>> {
    try {
      await this.aiReportToolsService.assertAiKnowledgeAccess(
        userId,
        relatorioId,
      );
      const relatorio = await this.reportService.findById(relatorioId, userId);

      let resolved: Awaited<
        ReturnType<ReportSnapshotService['resolveSnapshotFile']>
      >;
      try {
        resolved =
          await this.reportSnapshotService.resolveSnapshotFile(relatorioId);
      } catch (error) {
        return {
          erro:
            error instanceof Error
              ? error.message
              : 'Snapshot indisponível. Use garantirSnapshot.',
        };
      }

      if (!resolved) {
        return {
          erro: `O relatório "${relatorio.nome}" ainda não tem snapshot. Use garantirSnapshot antes de consultar.`,
        };
      }

      const maxRows = env.AI_SNAPSHOT_QUERY_MAX_ROWS;
      const result = await this.duckDbService.queryAdhoc(
        resolved.readUri,
        sql,
        maxRows,
      );

      const safeColumns = result.colunas.filter(
        (column) => !isSensitiveColumnName(column),
      );
      const redacted = redactSensitiveReportRows(result.colunas, result.dados);
      const geradoEm =
        resolved.snapshot.gerado_em instanceof Date
          ? resolved.snapshot.gerado_em
          : new Date(resolved.snapshot.gerado_em ?? 0);

      this.auditService.record({
        actor: await this.toActor(userId),
        action: AUDIT_ACTIONS.AI_QUERY_SNAPSHOT,
        category: 'report',
        outcome: 'success',
        resource: { type: 'relatorio', id: String(relatorioId) },
        metadata: toAuditRecordMetadata([], {
          total_linhas: result.total_linhas,
          truncado: result.truncado,
          max_rows: maxRows,
        }),
      });

      return {
        relatorioId,
        relatorioNome: relatorio.nome,
        fonte: `Relatório "${relatorio.nome}" (snapshot de ${geradoEm.toISOString()})`,
        colunas: safeColumns,
        totalLinhas: result.total_linhas,
        truncado: result.truncado,
        dados: serializeReportRows(redacted.dados),
      };
    } catch (error) {
      return {
        erro:
          error instanceof Error
            ? error.message
            : 'Falha ao executar query no snapshot.',
      };
    }
  }

  async executarQueryConexao(
    userId: number,
    relatorioId: number,
    sql: string,
  ): Promise<Record<string, unknown>> {
    try {
      await this.aiReportToolsService.assertAiKnowledgeAccess(
        userId,
        relatorioId,
      );
      const relatorio = await this.reportService.findById(relatorioId, userId);
      const user = await this.userRepository.findOne({ where: { id: userId } });

      if (!user) {
        return { erro: 'Usuário não encontrado.' };
      }

      const result = await this.connectionQueryService.previewForAi(
        Number(relatorio.id_conexao),
        {
          query: sql,
          parametros: {},
          limite: env.AI_DB_QUERY_MAX_ROWS,
        },
        {
          sub: userId,
          email: user.email,
        },
        {
          timeoutMs: env.AI_DB_QUERY_TIMEOUT_MS,
          maxRows: env.AI_DB_QUERY_MAX_ROWS,
          relatorioId,
        },
      );

      const redacted = redactSensitiveReportRows(result.colunas, result.dados);

      return {
        relatorioId,
        relatorioNome: relatorio.nome,
        fonte: `Relatório "${relatorio.nome}" (consulta na conexão do relatório)`,
        colunas: redacted.colunas,
        totalLinhas: result.total_linhas,
        truncado: result.truncado,
        tempoMs: result.tempo_ms,
        dados: serializeReportRows(redacted.dados),
      };
    } catch (error) {
      return {
        erro:
          error instanceof Error
            ? error.message
            : 'Falha ao executar query na conexão.',
      };
    }
  }

  async visualizarDados(
    userId: number,
    params: {
      relatorioId: number;
      sql: string;
      titulo: string;
      tipoGrafico?: AiChartType | 'auto';
      colunaX?: string;
      series?: string[];
      subtitle?: string;
    },
  ): Promise<VisualizationToolResult> {
    const query = await this.executarQuerySnapshot(
      userId,
      params.relatorioId,
      params.sql,
    );

    if ('erro' in query) {
      return {
        resumo: { erro: String(query.erro) },
        chartSpec: null,
      };
    }

    const colunas = (query.colunas as string[]) ?? [];
    const dados = (query.dados as Record<string, unknown>[]) ?? [];

    const chartSpec = buildChartSpecFromRows({
      columns: colunas,
      rows: dados,
      title: params.titulo,
      subtitle: params.subtitle,
      source: String(query.fonte ?? ''),
      tipoGrafico: params.tipoGrafico,
      colunaX: params.colunaX,
      series: params.series,
    });

    return {
      resumo: {
        relatorioId: params.relatorioId,
        titulo: params.titulo,
        colunas,
        linhasRetornadas: dados.length,
        totalLinhas: query.totalLinhas,
        truncado: query.truncado,
        tipoGrafico: chartSpec?.type ?? null,
        colunaX: chartSpec?.xAxis.key ?? params.colunaX ?? null,
        series: chartSpec?.series.map((item) => item.key) ?? params.series ?? [],
        graficoIncluido: chartSpec !== null,
        ...(chartSpec === null
          ? {
              aviso:
                'Não foi possível montar o gráfico com essas colunas. Tente ajustar colunaX/series ou use publicarTabela.',
            }
          : {}),
      },
      chartSpec,
    };
  }

  async publicarTabela(
    userId: number,
    params: {
      relatorioId: number;
      sql: string;
      titulo: string;
      subtitle?: string;
    },
  ): Promise<TableToolResult> {
    const query = await this.executarQuerySnapshot(
      userId,
      params.relatorioId,
      params.sql,
    );

    if ('erro' in query) {
      return {
        resumo: { erro: String(query.erro) },
        tableSpec: null,
      };
    }

    const colunas = (query.colunas as string[]) ?? [];
    const dados = (query.dados as Record<string, unknown>[]) ?? [];

    const tableSpec = buildTableSpecFromRows({
      title: params.titulo,
      subtitle: params.subtitle,
      columns: colunas,
      rows: dados,
      source: String(query.fonte ?? ''),
      truncado: Boolean(query.truncado),
    });

    return {
      resumo: {
        relatorioId: params.relatorioId,
        titulo: params.titulo,
        colunas,
        linhasPublicadas: dados.length,
        totalLinhas: query.totalLinhas,
        truncado: query.truncado,
        tabelaIncluida: tableSpec !== null,
      },
      tableSpec,
    };
  }

  private async toActor(userId: number) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    return toAuditActor({
      sub: userId,
      email: user?.email ?? `user-${userId}`,
    });
  }
}
