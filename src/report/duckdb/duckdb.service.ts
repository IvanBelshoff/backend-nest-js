import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';
import { env } from 'src/shared/env.schema';
import {
  buildOrderByClause,
  buildWhereClause,
  normalizeRow,
  quoteIdentifier,
  sqlPathLiteral,
  type FilterSpec,
  type SortSpec,
} from './duckdb-query.util';

export interface QueryPageOptions {
  colunas: string[];
  page: number;
  pageSize: number;
  sort?: SortSpec[];
  filters?: FilterSpec[];
}

export interface QueryPageResult {
  colunas: string[];
  dados: Record<string, unknown>[];
  total_linhas: number;
}

@Injectable()
export class DuckDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DuckDbService.name);
  private instance: DuckDBInstance | null = null;
  private readonly maxConcurrency = env.DUCKDB_MAX_CONCURRENCY;
  private active = 0;
  private readonly waiters: (() => void)[] = [];

  async onModuleInit(): Promise<void> {
    this.instance = await DuckDBInstance.create(':memory:', {
      threads: String(this.maxConcurrency),
    });
    this.logger.log('DuckDB inicializado (in-memory reader)');
  }

  onModuleDestroy(): void {
    this.instance?.closeSync();
    this.instance = null;
  }

  private async acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    const next = this.waiters.shift();
    if (next) {
      next();
    }
  }

  private async withConnection<T>(
    fn: (conn: DuckDBConnection) => Promise<T>,
  ): Promise<T> {
    if (!this.instance) {
      throw new Error('DuckDB não inicializado');
    }

    await this.acquire();
    const connection = await this.instance.connect();

    let timer: NodeJS.Timeout | undefined;
    try {
      const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          try {
            connection.interrupt();
          } catch {
            /* ignore */
          }
          reject(
            new Error(
              `Consulta DuckDB excedeu o timeout de ${env.DUCKDB_QUERY_TIMEOUT_MS}ms`,
            ),
          );
        }, env.DUCKDB_QUERY_TIMEOUT_MS);
      });

      return await Promise.race([fn(connection), timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      connection.closeSync();
      this.release();
    }
  }

  /** Materializa um arquivo JSONL (newline-delimited) em Parquet. */
  async writeParquet(
    jsonlPath: string,
    outParquetPath: string,
    compression: string = env.SNAPSHOT_PARQUET_COMPRESSION,
  ): Promise<void> {
    const src = sqlPathLiteral(jsonlPath);
    const dest = sqlPathLiteral(outParquetPath);
    await this.withConnection(async (conn) => {
      await conn.run(
        `COPY (SELECT * FROM read_json_auto(${src}, format='newline_delimited', sample_size=-1)) ` +
          `TO ${dest} (FORMAT PARQUET, COMPRESSION ${compression})`,
      );
    });
  }

  /** Gera um Parquet vazio (0 linhas) preservando os nomes das colunas como VARCHAR. */
  async writeEmptyParquet(
    colunas: string[],
    outParquetPath: string,
    compression: string = env.SNAPSHOT_PARQUET_COMPRESSION,
  ): Promise<void> {
    const dest = sqlPathLiteral(outParquetPath);
    const selectCols =
      colunas.length > 0
        ? colunas
            .map((c) => `NULL::VARCHAR AS ${quoteIdentifier(c, colunas)}`)
            .join(', ')
        : 'NULL::VARCHAR AS "_empty"';
    await this.withConnection(async (conn) => {
      await conn.run(
        `COPY (SELECT ${selectCols} LIMIT 0) TO ${dest} (FORMAT PARQUET, COMPRESSION ${compression})`,
      );
    });
  }

  /** Retorna o mapa coluna -> tipo DuckDB de um Parquet. */
  async describe(parquetPath: string): Promise<Record<string, string>> {
    const src = sqlPathLiteral(parquetPath);
    return this.withConnection(async (conn) => {
      const reader = await conn.runAndReadAll(
        `DESCRIBE SELECT * FROM read_parquet(${src})`,
      );
      const rows = reader.getRowObjectsJS();
      const map: Record<string, string> = {};
      for (const row of rows) {
        map[String(row.column_name)] = String(row.column_type);
      }
      return map;
    });
  }

  async count(
    parquetPath: string,
    filters: FilterSpec[] | undefined,
    allowedColumns: string[],
  ): Promise<number> {
    const src = sqlPathLiteral(parquetPath);
    const where = buildWhereClause(filters, allowedColumns);
    return this.withConnection(async (conn) => {
      const reader = await conn.runAndReadAll(
        `SELECT count(*)::BIGINT AS c FROM read_parquet(${src}) ${where.clause}`,
        where.params,
      );
      const [row] = reader.getRowObjectsJS();
      return Number(row?.c ?? 0);
    });
  }

  async queryPage(
    parquetPath: string,
    options: QueryPageOptions,
  ): Promise<QueryPageResult> {
    const { colunas, page, pageSize, sort, filters } = options;
    const src = sqlPathLiteral(parquetPath);
    const where = buildWhereClause(filters, colunas);
    const orderBy = buildOrderByClause(sort, colunas);
    const offset = Math.max(0, (page - 1) * pageSize);

    return this.withConnection(async (conn) => {
      const totalReader = await conn.runAndReadAll(
        `SELECT count(*)::BIGINT AS c FROM read_parquet(${src}) ${where.clause}`,
        where.params,
      );
      const [totalRow] = totalReader.getRowObjectsJS();
      const total = Number(totalRow?.c ?? 0);

      const dataReader = await conn.runAndReadAll(
        `SELECT * FROM read_parquet(${src}) ${where.clause} ${orderBy} ` +
          `LIMIT ${Math.trunc(pageSize)} OFFSET ${Math.trunc(offset)}`,
        where.params,
      );

      const dados = dataReader
        .getRowObjectsJS()
        .map((row) => normalizeRow(row as Record<string, unknown>));

      return { colunas, dados, total_linhas: total };
    });
  }

  /** Exporta o conteúdo de um Parquet para CSV via COPY (streaming nativo). */
  async copyToCsv(parquetPath: string, outCsvPath: string): Promise<void> {
    const src = sqlPathLiteral(parquetPath);
    const dest = sqlPathLiteral(outCsvPath);
    await this.withConnection(async (conn) => {
      await conn.run(
        `COPY (SELECT * FROM read_parquet(${src})) TO ${dest} ` +
          `(FORMAT CSV, HEADER, DELIMITER ',')`,
      );
    });
  }
}
