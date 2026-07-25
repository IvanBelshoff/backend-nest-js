import { Injectable } from '@nestjs/common';
import { Conexao } from 'src/database/entities/Conexoes';
import { env } from 'src/shared/env.schema';
import { executeQuery } from 'src/report/execution/dynamic-connection.factory';
import {
  getSchemaIntrospectionStrategy,
  mapColumnList,
  mapSchemaList,
  mapTableList,
} from './schema-introspection.strategies';
import type {
  ColumnListResult,
  SchemaListResult,
  TableListResult,
} from './schema-introspection.types';

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

@Injectable()
export class SchemaIntrospectionService {
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  async listSchemas(
    conexao: Conexao,
    senha: string,
  ): Promise<SchemaListResult> {
    const cacheKey = `schema:${conexao.id}:scopes`;
    const cached = this.getFromCache<SchemaListResult>(cacheKey);

    if (cached) {
      return cached;
    }

    const strategy = getSchemaIntrospectionStrategy(conexao.tipo);
    const result = await executeQuery(
      conexao,
      senha,
      strategy.listScopes(),
      {},
      10_000,
      env.QUERY_PREVIEW_TIMEOUT_MS,
    );

    const mapped = mapSchemaList(result.dados, conexao.tipo);
    this.setCache(cacheKey, mapped);
    return mapped;
  }

  async listTables(
    conexao: Conexao,
    senha: string,
    escopo: string,
  ): Promise<TableListResult> {
    const cacheKey = `schema:${conexao.id}:tables:${escopo}`;
    const cached = this.getFromCache<TableListResult>(cacheKey);

    if (cached) {
      return cached;
    }

    const strategy = getSchemaIntrospectionStrategy(conexao.tipo);
    const result = await executeQuery(
      conexao,
      senha,
      strategy.listTables(escopo),
      {},
      10_000,
      env.QUERY_PREVIEW_TIMEOUT_MS,
    );

    const mapped = mapTableList(result.dados);
    this.setCache(cacheKey, mapped);
    return mapped;
  }

  async listColumns(
    conexao: Conexao,
    senha: string,
    escopo: string,
    tabela: string,
  ): Promise<ColumnListResult> {
    const cacheKey = `schema:${conexao.id}:columns:${escopo}:${tabela}`;
    const cached = this.getFromCache<ColumnListResult>(cacheKey);

    if (cached) {
      return cached;
    }

    const strategy = getSchemaIntrospectionStrategy(conexao.tipo);
    const result = await executeQuery(
      conexao,
      senha,
      strategy.listColumns(escopo, tabela),
      {},
      500,
      env.QUERY_PREVIEW_TIMEOUT_MS,
    );

    const mapped = mapColumnList(result.dados);
    this.setCache(cacheKey, mapped);
    return mapped;
  }

  private getFromCache<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value as T;
  }

  private setCache<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + env.QUERY_SCHEMA_CACHE_TTL_MS,
    });
  }
}
