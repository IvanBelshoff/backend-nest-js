import { BadRequestException } from '@nestjs/common';
import {
  ensureLimit,
  prepareAdhocSnapshotSql,
} from './duckdb-adhoc-sql.util';

describe('duckdb-adhoc-sql.util', () => {
  it('allows SELECT against dados and applies LIMIT', () => {
    const sql = prepareAdhocSnapshotSql(
      'SELECT coluna, count(*) AS n FROM dados GROUP BY coluna',
      200,
    );

    expect(sql).toContain('LIMIT 200');
    expect(sql).toContain('FROM dados');
  });

  it('caps an existing LIMIT above the max', () => {
    expect(
      prepareAdhocSnapshotSql('SELECT * FROM dados LIMIT 9999', 200),
    ).toBe('SELECT * FROM dados LIMIT 200');
  });

  it('keeps an existing LIMIT under the max', () => {
    expect(
      prepareAdhocSnapshotSql('SELECT * FROM dados LIMIT 50', 200),
    ).toBe('SELECT * FROM dados LIMIT 50');
  });

  it('rejects DDL and multi-statement', () => {
    expect(() =>
      prepareAdhocSnapshotSql('DROP TABLE dados', 200),
    ).toThrow(BadRequestException);

    expect(() =>
      prepareAdhocSnapshotSql('SELECT 1; SELECT 2', 200),
    ).toThrow(BadRequestException);
  });

  it('rejects read_parquet and file path literals', () => {
    expect(() =>
      prepareAdhocSnapshotSql(
        "SELECT * FROM read_parquet('/tmp/secret.parquet')",
        200,
      ),
    ).toThrow(BadRequestException);

    expect(() =>
      prepareAdhocSnapshotSql("SELECT * FROM dados WHERE x = '/tmp/x'", 200),
    ).toThrow(BadRequestException);

    expect(() =>
      prepareAdhocSnapshotSql(
        "SELECT * FROM dados WHERE arquivo = 'dados.parquet'",
        200,
      ),
    ).toThrow(BadRequestException);
  });

  it('allows date-like string literals with slashes', () => {
    expect(() =>
      prepareAdhocSnapshotSql(
        "SELECT * FROM dados WHERE periodo = '2024/01/15'",
        200,
      ),
    ).not.toThrow();
  });

  it('ensureLimit wraps when LIMIT is absent', () => {
    expect(ensureLimit('SELECT 1 AS a', 10)).toBe(
      'SELECT * FROM (SELECT 1 AS a) AS _ai_limited LIMIT 10',
    );
  });
});
