import { TipoConexao } from 'src/database/entities/Conexoes';
import type {
  ColumnListResult,
  SchemaListResult,
  TableListResult,
} from './schema-introspection.types';

export interface SchemaIntrospectionStrategy {
  listScopes(): string;
  listTables(escopo: string): string;
  listColumns(escopo: string, tabela: string): string;
}

export const postgresIntrospection: SchemaIntrospectionStrategy = {
  listScopes: () => `
    SELECT schema_name AS nome
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
      AND schema_name NOT LIKE 'pg_temp_%'
      AND schema_name NOT LIKE 'pg_toast_temp_%'
    ORDER BY schema_name
  `,
  listTables: (escopo) => `
    SELECT table_name AS nome, table_type AS tipo
    FROM information_schema.tables
    WHERE table_schema = '${escopo.replace(/'/g, "''")}'
      AND table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY table_name
  `,
  listColumns: (escopo, tabela) => `
    SELECT column_name AS nome, data_type AS tipo_dado, is_nullable AS nullable
    FROM information_schema.columns
    WHERE table_schema = '${escopo.replace(/'/g, "''")}'
      AND table_name = '${tabela.replace(/'/g, "''")}'
    ORDER BY ordinal_position
  `,
};

export const mysqlIntrospection: SchemaIntrospectionStrategy = {
  listScopes: () => `
    SELECT schema_name AS nome
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')
    ORDER BY schema_name
  `,
  listTables: (escopo) => `
    SELECT table_name AS nome, table_type AS tipo
    FROM information_schema.tables
    WHERE table_schema = '${escopo.replace(/'/g, "''")}'
      AND table_type IN ('BASE TABLE', 'VIEW')
    ORDER BY table_name
  `,
  listColumns: (escopo, tabela) => `
    SELECT column_name AS nome, data_type AS tipo_dado, is_nullable AS nullable
    FROM information_schema.columns
    WHERE table_schema = '${escopo.replace(/'/g, "''")}'
      AND table_name = '${tabela.replace(/'/g, "''")}'
    ORDER BY ordinal_position
  `,
};

export const mssqlIntrospection: SchemaIntrospectionStrategy = {
  listScopes: () => `
    SELECT name AS nome
    FROM sys.schemas
    WHERE name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest')
    ORDER BY name
  `,
  listTables: (escopo) => `
    SELECT t.name AS nome,
      CASE WHEN t.type = 'V' THEN 'VIEW' ELSE 'BASE TABLE' END AS tipo
    FROM sys.tables t
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    WHERE s.name = '${escopo.replace(/'/g, "''")}'
    UNION ALL
    SELECT v.name AS nome, 'VIEW' AS tipo
    FROM sys.views v
    INNER JOIN sys.schemas s ON v.schema_id = s.schema_id
    WHERE s.name = '${escopo.replace(/'/g, "''")}'
    ORDER BY nome
  `,
  listColumns: (escopo, tabela) => `
    SELECT c.name AS nome, ty.name AS tipo_dado,
      CASE WHEN c.is_nullable = 1 THEN 'YES' ELSE 'NO' END AS nullable
    FROM sys.columns c
    INNER JOIN sys.tables t ON c.object_id = t.object_id
    INNER JOIN sys.schemas s ON t.schema_id = s.schema_id
    INNER JOIN sys.types ty ON c.user_type_id = ty.user_type_id
    WHERE s.name = '${escopo.replace(/'/g, "''")}' AND t.name = '${tabela.replace(/'/g, "''")}'
    ORDER BY c.column_id
  `,
};

export const oracleIntrospection: SchemaIntrospectionStrategy = {
  listScopes: () => `
    SELECT username AS nome FROM all_users
    WHERE username NOT IN (
      'SYS', 'SYSTEM', 'OUTLN', 'DBSNMP', 'APPQOSSYS', 'WMSYS',
      'XDB', 'CTXSYS', 'MDSYS', 'ORDSYS', 'ORDDATA'
    )
    ORDER BY username
  `,
  listTables: (escopo) => `
    SELECT table_name AS nome, 'BASE TABLE' AS tipo FROM all_tables
    WHERE owner = UPPER('${escopo.replace(/'/g, "''")}')
    UNION ALL
    SELECT view_name AS nome, 'VIEW' AS tipo FROM all_views
    WHERE owner = UPPER('${escopo.replace(/'/g, "''")}')
    ORDER BY nome
  `,
  listColumns: (escopo, tabela) => `
    SELECT column_name AS nome, data_type AS tipo_dado, nullable
    FROM all_tab_columns
    WHERE owner = UPPER('${escopo.replace(/'/g, "''")}')
      AND table_name = UPPER('${tabela.replace(/'/g, "''")}')
    ORDER BY column_id
  `,
};

export function getSchemaIntrospectionStrategy(
  tipo: TipoConexao,
): SchemaIntrospectionStrategy {
  switch (tipo) {
    case TipoConexao.POSTGRES:
      return postgresIntrospection;
    case TipoConexao.MYSQL:
      return mysqlIntrospection;
    case TipoConexao.MSSQL:
      return mssqlIntrospection;
    case TipoConexao.ORACLE:
      return oracleIntrospection;
    default:
      return postgresIntrospection;
  }
}

export function mapScopeTipo(tipo: TipoConexao): 'database' | 'schema' {
  return tipo === TipoConexao.MYSQL ? 'database' : 'schema';
}

export function mapTableTipo(raw: string): 'table' | 'view' {
  return raw?.toUpperCase() === 'VIEW' ? 'view' : 'table';
}

export function mapNullable(raw: unknown): boolean | undefined {
  if (raw === null || raw === undefined) {
    return undefined;
  }

  const value = String(raw).toUpperCase();
  if (value === 'YES' || value === 'Y' || value === 'TRUE' || value === '1') {
    return true;
  }

  if (value === 'NO' || value === 'N' || value === 'FALSE' || value === '0') {
    return false;
  }

  return undefined;
}

export function normalizeRowKeys(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(row)) {
    normalized[key.toLowerCase()] = value;
  }

  return normalized;
}

export function mapSchemaList(
  rows: Record<string, unknown>[],
  tipo: TipoConexao,
): SchemaListResult {
  const scopeTipo = mapScopeTipo(tipo);

  return {
    items: rows.map((row) => {
      const normalized = normalizeRowKeys(row);
      return {
        nome: String(normalized.nome ?? ''),
        tipo: scopeTipo,
      };
    }),
  };
}

export function mapTableList(rows: Record<string, unknown>[]): TableListResult {
  return {
    items: rows.map((row) => {
      const normalized = normalizeRowKeys(row);
      return {
        nome: String(normalized.nome ?? ''),
        tipo: mapTableTipo(String(normalized.tipo ?? 'BASE TABLE')),
      };
    }),
  };
}

export function mapColumnList(rows: Record<string, unknown>[]): ColumnListResult {
  return {
    items: rows.map((row) => {
      const normalized = normalizeRowKeys(row);
      return {
        nome: String(normalized.nome ?? ''),
        tipo_dado: String(normalized.tipo_dado ?? ''),
        nullable: mapNullable(normalized.nullable),
      };
    }),
  };
}
