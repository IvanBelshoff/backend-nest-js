import { Injectable } from '@nestjs/common';
import { DuckDbService } from './duckdb/duckdb.service';
import type { FilterSpec, SortSpec } from './duckdb/duckdb-query.util';
import { ReportSnapshotService } from './report-snapshot.service';

export interface SnapshotPageParams {
  page: number;
  pageSize: number;
  sort?: SortSpec[];
  filters?: FilterSpec[];
}

export interface SnapshotPageResult {
  colunas: string[];
  colunas_tipos: Record<string, string>;
  dados: Record<string, unknown>[];
  total_linhas: number;
  parametros_utilizados: Record<string, unknown>;
  gerado_em: Date;
}

@Injectable()
export class SnapshotQueryService {
  constructor(
    private readonly reportSnapshotService: ReportSnapshotService,
    private readonly duckDbService: DuckDbService,
  ) {}

  /**
   * Lê uma página do snapshot (Parquet) via DuckDB.
   * Retorna null quando não existe snapshot em formato Parquet.
   */
  async queryPage(
    relatorioId: number,
    params: SnapshotPageParams,
  ): Promise<SnapshotPageResult | null> {
    const resolved =
      await this.reportSnapshotService.resolveSnapshotFile(relatorioId);

    if (!resolved) {
      return null;
    }

    const { snapshot, readUri } = resolved;

    const page = await this.duckDbService.queryPage(readUri, {
      colunas: snapshot.colunas,
      page: params.page,
      pageSize: params.pageSize,
      sort: params.sort,
      filters: params.filters,
    });

    return {
      colunas: snapshot.colunas,
      colunas_tipos: snapshot.colunas_tipos ?? {},
      dados: page.dados,
      total_linhas: page.total_linhas,
      parametros_utilizados: snapshot.parametros_utilizados ?? {},
      gerado_em: snapshot.gerado_em,
    };
  }
}
