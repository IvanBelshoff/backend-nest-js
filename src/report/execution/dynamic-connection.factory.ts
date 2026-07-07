import { BadRequestException } from '@nestjs/common';
import { Conexao, TipoConexao } from 'src/database/entities/Conexoes';
import { decryptConnectionPassword } from 'src/shared/utils/connection-encryption.util';
import { Pool as PgPool } from 'pg';
import * as mysql from 'mysql2/promise';
import * as mssql from 'mssql';
import * as oracledb from 'oracledb';

export interface QueryExecutionResult {
  colunas: string[];
  dados: Record<string, unknown>[];
  total_linhas: number;
}

export interface ConnectionCredentials {
  conexao: Conexao;
  senha: string;
}

export function getConnectionCredentials(conexao: Conexao): ConnectionCredentials {
  return {
    conexao,
    senha: decryptConnectionPassword(conexao.senha_criptografada),
  };
}

export async function testConnection(conexao: Conexao): Promise<void> {
  const { senha } = getConnectionCredentials(conexao);
  await executeQuery(conexao, senha, 'SELECT 1 AS ok', {}, 1, 5000);
}

export async function executeQuery(
  conexao: Conexao,
  senha: string,
  sql: string,
  params: Record<string, unknown>,
  maxRows: number,
  timeoutMs: number,
): Promise<QueryExecutionResult> {
  switch (conexao.tipo) {
    case TipoConexao.POSTGRES:
      return executePostgres(conexao, senha, sql, params, maxRows, timeoutMs);
    case TipoConexao.MYSQL:
      return executeMysql(conexao, senha, sql, params, maxRows, timeoutMs);
    case TipoConexao.MSSQL:
      return executeMssql(conexao, senha, sql, params, maxRows, timeoutMs);
    case TipoConexao.ORACLE:
      return executeOracle(conexao, senha, sql, params, maxRows, timeoutMs);
    default:
      throw new BadRequestException('Tipo de conexão não suportado');
  }
}

async function executePostgres(
  conexao: Conexao,
  senha: string,
  sql: string,
  params: Record<string, unknown>,
  maxRows: number,
  timeoutMs: number,
): Promise<QueryExecutionResult> {
  const pool = new PgPool({
    host: conexao.host,
    port: conexao.porta,
    database: conexao.database,
    user: conexao.usuario,
    password: senha,
    max: 1,
    connectionTimeoutMillis: timeoutMs,
    statement_timeout: timeoutMs,
    ssl: conexao.opcoes?.ssl === true ? { rejectUnauthorized: false } : undefined,
  });

  try {
    const { text, values } = buildPostgresQuery(sql, params, maxRows);
    const result = await pool.query(text, values);
    return mapRows(result.fields.map((field) => field.name), result.rows);
  } finally {
    await pool.end();
  }
}

async function executeMysql(
  conexao: Conexao,
  senha: string,
  sql: string,
  params: Record<string, unknown>,
  maxRows: number,
  timeoutMs: number,
): Promise<QueryExecutionResult> {
  const connection = await mysql.createConnection({
    host: conexao.host,
    port: conexao.porta,
    database: conexao.database,
    user: conexao.usuario,
    password: senha,
    connectTimeout: timeoutMs,
  });

  try {
    const { text, values } = buildMysqlQuery(sql, params, maxRows);
    const [rows, fields] = await connection.execute(
      text,
      values as mysql.ExecuteValues[],
    );
    const rowArray = Array.isArray(rows) ? (rows as Record<string, unknown>[]) : [];
    const colunas = Array.isArray(fields)
      ? fields.map((field) => field.name)
      : rowArray.length > 0
        ? Object.keys(rowArray[0])
        : [];
    return mapRows(colunas, rowArray);
  } finally {
    await connection.end();
  }
}

async function executeMssql(
  conexao: Conexao,
  senha: string,
  sql: string,
  params: Record<string, unknown>,
  maxRows: number,
  timeoutMs: number,
): Promise<QueryExecutionResult> {
  const pool = await mssql.connect({
    server: conexao.host,
    port: conexao.porta,
    database: conexao.database,
    user: conexao.usuario,
    password: senha,
    options: {
      encrypt: conexao.opcoes?.encrypt !== false,
      trustServerCertificate: conexao.opcoes?.trustServerCertificate === true,
    },
    connectionTimeout: timeoutMs,
    requestTimeout: timeoutMs,
    pool: { max: 1, min: 0 },
  });

  try {
    const request = pool.request();
    const { text, bindings } = buildMssqlQuery(sql, params, maxRows);
    for (const [key, value] of Object.entries(bindings)) {
      request.input(key, value);
    }
    const result = await request.query(text);
    const rows = (result.recordset ?? []) as Record<string, unknown>[];
    const colunas =
      rows.length > 0
        ? Object.keys(rows[0])
        : (result.recordset?.columns
            ? Object.keys(result.recordset.columns)
            : []);
    return mapRows(colunas, rows);
  } finally {
    await pool.close();
  }
}

async function executeOracle(
  conexao: Conexao,
  senha: string,
  sql: string,
  params: Record<string, unknown>,
  maxRows: number,
  timeoutMs: number,
): Promise<QueryExecutionResult> {
  const connectString =
    (conexao.opcoes?.connectString as string | undefined) ??
    `${conexao.host}:${conexao.porta}/${conexao.database}`;

  const connection = await oracledb.getConnection({
    user: conexao.usuario,
    password: senha,
    connectString,
    connectTimeout: Math.ceil(timeoutMs / 1000),
  });

  try {
    const { text, bindings } = buildOracleQuery(sql, params, maxRows);
    const result = await connection.execute(
      text,
      bindings,
      {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        maxRows,
      },
    );
    const rows = (result.rows ?? []) as Record<string, unknown>[];
    const colunas =
      rows.length > 0
        ? Object.keys(rows[0])
        : (result.metaData?.map((column) => column.name) ?? []);
    return mapRows(colunas, rows);
  } finally {
    await connection.close();
  }
}

function mapRows(
  colunas: string[],
  rows: Record<string, unknown>[],
): QueryExecutionResult {
  return {
    colunas,
    dados: rows,
    total_linhas: rows.length,
  };
}

function buildPostgresQuery(
  sql: string,
  params: Record<string, unknown>,
  maxRows: number,
) {
  const entries = Object.entries(params);
  let text = sql;
  const values: unknown[] = [];

  entries.forEach(([key, value], index) => {
    const placeholder = new RegExp(`:${key}\\b`, 'g');
    text = text.replace(placeholder, `$${index + 1}`);
    values.push(value);
  });

  if (!/\blimit\b/i.test(text)) {
    text = `${text} LIMIT ${maxRows}`;
  }

  return { text, values };
}

function buildMysqlQuery(
  sql: string,
  params: Record<string, unknown>,
  maxRows: number,
) {
  const values: unknown[] = [];
  let text = sql;

  for (const [key, value] of Object.entries(params)) {
    const placeholder = new RegExp(`:${key}\\b`, 'g');
    text = text.replace(placeholder, '?');
    values.push(value);
  }

  if (!/\blimit\b/i.test(text)) {
    text = `${text} LIMIT ${maxRows}`;
  }

  return { text, values };
}

function buildMssqlQuery(
  sql: string,
  params: Record<string, unknown>,
  maxRows: number,
) {
  const bindings: Record<string, unknown> = {};
  let text = sql;

  for (const [key, value] of Object.entries(params)) {
    const placeholder = new RegExp(`:${key}\\b`, 'g');
    text = text.replace(placeholder, `@${key}`);
    bindings[key] = value;
  }

  if (!/\btop\b/i.test(text) && !/\bfetch\b/i.test(text)) {
    text = `SELECT TOP (${maxRows}) * FROM (${text}) AS subquery`;
  }

  return { text, bindings };
}

function buildOracleQuery(
  sql: string,
  params: Record<string, unknown>,
  maxRows: number,
) {
  const bindings: Record<string, unknown> = { ...params };
  let text = sql;

  if (!/\bfetch\b/i.test(text) && !/\brownum\b/i.test(text)) {
    text = `SELECT * FROM (${text}) WHERE ROWNUM <= ${maxRows}`;
  }

  return { text, bindings };
}
