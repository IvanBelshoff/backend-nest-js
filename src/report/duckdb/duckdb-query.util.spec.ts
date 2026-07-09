import {
  buildOrderByClause,
  buildWhereClause,
  parseFiltersParam,
  parseSortParam,
  quoteIdentifier,
  sqlPathLiteral,
} from './duckdb-query.util';

describe('duckdb-query.util', () => {
  const colunas = ['id', 'nome', 'valor'];

  describe('quoteIdentifier', () => {
    it('quotes allowed column names', () => {
      expect(quoteIdentifier('nome', colunas)).toBe('"nome"');
    });

    it('rejects unknown columns', () => {
      expect(() => quoteIdentifier('injected', colunas)).toThrow(
        'Coluna desconhecida',
      );
    });

    it('escapes double quotes in column names', () => {
      const cols = ['a"b'];
      expect(quoteIdentifier('a"b', cols)).toBe('"a""b"');
    });
  });

  describe('sqlPathLiteral', () => {
    it('normalizes backslashes and escapes quotes', () => {
      expect(sqlPathLiteral("C:\\data\\file'x.parquet")).toBe(
        "'C:/data/file''x.parquet'",
      );
    });
  });

  describe('parseSortParam', () => {
    it('parses sort tokens', () => {
      expect(parseSortParam('nome:desc,id:asc')).toEqual([
        { coluna: 'nome', direcao: 'desc' },
        { coluna: 'id', direcao: 'asc' },
      ]);
    });

    it('defaults direction to asc', () => {
      expect(parseSortParam('nome')).toEqual([
        { coluna: 'nome', direcao: 'asc' },
      ]);
    });
  });

  describe('parseFiltersParam', () => {
    it('parses filter array JSON', () => {
      const filters = parseFiltersParam(
        JSON.stringify([{ coluna: 'nome', operador: 'contains', valor: 'abc' }]),
      );
      expect(filters).toEqual([
        { coluna: 'nome', operador: 'contains', valor: 'abc' },
      ]);
    });

    it('rejects invalid JSON', () => {
      expect(() => parseFiltersParam('not-json')).toThrow('JSON válido');
    });
  });

  describe('buildOrderByClause', () => {
    it('builds ORDER BY from sort specs', () => {
      const clause = buildOrderByClause(
        [{ coluna: 'nome', direcao: 'desc' }],
        colunas,
      );
      expect(clause).toBe('ORDER BY "nome" DESC');
    });

    it('returns empty string when no sort', () => {
      expect(buildOrderByClause([], colunas)).toBe('');
    });
  });

  describe('buildWhereClause', () => {
    it('builds parameterized WHERE for eq', () => {
      const where = buildWhereClause(
        [{ coluna: 'id', operador: 'eq', valor: 1 }],
        colunas,
      );
      expect(where.clause).toBe('WHERE "id" = $1');
      expect(where.params).toEqual([1]);
    });

    it('builds ILIKE for contains', () => {
      const where = buildWhereClause(
        [{ coluna: 'nome', operador: 'contains', valor: 'x' }],
        colunas,
      );
      expect(where.clause).toContain('ILIKE');
      expect(where.params).toEqual(['%x%']);
    });
  });
});
