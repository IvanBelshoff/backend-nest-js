import { Injectable } from '@nestjs/common';
import { AuditService } from 'src/audit/audit.service';
import { AUDIT_ACTIONS } from 'src/audit/constants/audit-actions';
import { toAuditActor } from 'src/audit/utils/audit-actor.util';
import { toAuditRecordMetadata } from 'src/audit/utils/audit-metadata.util';
import { ConnectionService } from 'src/connection/connection.service';
import type {
  ConnectionQueryCountDto,
  ConnectionQueryPreviewDto,
} from 'src/connection/dto/connection-query-preview.dto';
import { SchemaIntrospectionService } from 'src/connection/schema/schema-introspection.service';
import {
  executeCountQuery,
  executeQuery,
} from 'src/report/execution/dynamic-connection.factory';
import { assertReadOnlyQuery } from 'src/report/execution/query-validator.util';
import { resolveParametros } from 'src/report/execution/parametros.util';
import { env } from 'src/shared/env.schema';
import { resolvePreviewMaxRows } from 'src/connection/connection-query-preview.util';

interface Requester {
  sub: number;
  email: string;
}

export interface ConnectionQueryPreviewResult {
  colunas: string[];
  dados: Record<string, unknown>[];
  total_linhas: number;
  truncado: boolean;
  tempo_ms: number;
}

export interface ConnectionQueryCountResult {
  total_linhas: number;
  tempo_ms: number;
}

@Injectable()
export class ConnectionQueryService {
  constructor(
    private readonly connectionService: ConnectionService,
    private readonly schemaIntrospectionService: SchemaIntrospectionService,
    private readonly auditService: AuditService,
  ) {}

  async preview(
    connectionId: number,
    dto: ConnectionQueryPreviewDto,
    requester: Requester,
  ): Promise<ConnectionQueryPreviewResult> {
    assertReadOnlyQuery(dto.query);

    const maxRows = resolvePreviewMaxRows(
      dto.limite,
      env.QUERY_PREVIEW_MAX_ROWS,
      env.REPORT_QUERY_MAX_ROWS,
    );

    return this.runPreview(connectionId, dto, requester, {
      maxRows,
      timeoutMs: env.QUERY_PREVIEW_TIMEOUT_MS,
      auditAction: AUDIT_ACTIONS.CONNECTION_QUERY_PREVIEW,
    });
  }

  /**
   * Preview com limites e auditoria específicos da IA (mais rígidos que o editor).
   */
  async previewForAi(
    connectionId: number,
    dto: ConnectionQueryPreviewDto,
    requester: Requester,
    options: {
      maxRows: number;
      timeoutMs: number;
      relatorioId: number;
    },
  ): Promise<ConnectionQueryPreviewResult> {
    assertReadOnlyQuery(dto.query);

    const maxRows = Math.min(dto.limite ?? options.maxRows, options.maxRows);

    return this.runPreview(connectionId, dto, requester, {
      maxRows,
      timeoutMs: options.timeoutMs,
      auditAction: AUDIT_ACTIONS.AI_QUERY_CONNECTION,
      relatorioId: options.relatorioId,
    });
  }

  private async runPreview(
    connectionId: number,
    dto: ConnectionQueryPreviewDto,
    requester: Requester,
    options: {
      maxRows: number;
      timeoutMs: number;
      auditAction: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
      relatorioId?: number;
    },
  ): Promise<ConnectionQueryPreviewResult> {
    const resolvedParams = this.resolveParams(dto);
    const { conexao, senha } = await this.getCredentials(connectionId);

    const startedAt = Date.now();
    const result = await executeQuery(
      conexao,
      senha,
      dto.query,
      resolvedParams,
      options.maxRows,
      options.timeoutMs,
    );
    const tempoMs = Date.now() - startedAt;

    const truncado = result.total_linhas >= options.maxRows;

    this.auditService.record({
      actor: toAuditActor(requester),
      action: options.auditAction,
      category: 'connection',
      outcome: 'success',
      resource: { type: 'conexao', id: String(connectionId) },
      metadata: toAuditRecordMetadata([], {
        truncado,
        total_linhas: result.total_linhas,
        tempo_ms: tempoMs,
        ...(options.relatorioId != null
          ? { relatorio_id: options.relatorioId }
          : {}),
      }),
    });

    return {
      colunas: result.colunas,
      dados: result.dados,
      total_linhas: result.total_linhas,
      truncado,
      tempo_ms: tempoMs,
    };
  }

  async count(
    connectionId: number,
    dto: ConnectionQueryCountDto,
    requester: Requester,
  ): Promise<ConnectionQueryCountResult> {
    assertReadOnlyQuery(dto.query);

    const resolvedParams = this.resolveParams(dto);
    const { conexao, senha } = await this.getCredentials(connectionId);

    const startedAt = Date.now();
    const totalLinhas = await executeCountQuery(
      conexao,
      senha,
      dto.query,
      resolvedParams,
      env.QUERY_COUNT_TIMEOUT_MS,
    );
    const tempoMs = Date.now() - startedAt;

    this.auditService.record({
      actor: toAuditActor(requester),
      action: AUDIT_ACTIONS.CONNECTION_QUERY_COUNT,
      category: 'connection',
      outcome: 'success',
      resource: { type: 'conexao', id: String(connectionId) },
      metadata: toAuditRecordMetadata([], {
        total_linhas: totalLinhas,
        tempo_ms: tempoMs,
      }),
    });

    return {
      total_linhas: totalLinhas,
      tempo_ms: tempoMs,
    };
  }

  async listSchemas(connectionId: number) {
    const { conexao, senha } = await this.getCredentials(connectionId);
    return this.schemaIntrospectionService.listSchemas(conexao, senha);
  }

  async listTables(connectionId: number, escopo: string) {
    const { conexao, senha } = await this.getCredentials(connectionId);
    return this.schemaIntrospectionService.listTables(conexao, senha, escopo);
  }

  async listColumns(connectionId: number, escopo: string, tabela: string) {
    const { conexao, senha } = await this.getCredentials(connectionId);
    return this.schemaIntrospectionService.listColumns(
      conexao,
      senha,
      escopo,
      tabela,
    );
  }

  private resolveParams(
    dto: ConnectionQueryPreviewDto | ConnectionQueryCountDto,
  ): Record<string, unknown> {
    if (dto.parametros_schema?.length) {
      return resolveParametros(dto.parametros_schema, dto.parametros ?? {});
    }

    return dto.parametros ?? {};
  }

  private async getCredentials(connectionId: number) {
    const conexao =
      await this.connectionService.findByIdWithPassword(connectionId);
    const senha = this.connectionService.getDecryptedPassword(conexao);

    return { conexao, senha };
  }
}
