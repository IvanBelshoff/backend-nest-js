import { describe, expect, it } from '@jest/globals';
import {
  buildMongoSort,
  buildTypeOrmOrder,
  parseListSortParam,
} from './list-sort.util';

describe('list-sort.util', () => {
  it('parses sort tokens against whitelist', () => {
    expect(parseListSortParam('nome:desc,estado:asc', ['nome', 'estado'])).toEqual([
      { column: 'nome', direction: 'desc' },
      { column: 'estado', direction: 'asc' },
    ]);
  });

  it('rejects unknown columns', () => {
    expect(() => parseListSortParam('invalid:asc', ['nome'])).toThrow(
      'Coluna de ordenação inválida: invalid',
    );
  });

  it('builds mongo sort with fallback', () => {
    expect(buildMongoSort([], { criado_em: -1 })).toEqual({ criado_em: -1 });
    expect(buildMongoSort([{ column: 'action', direction: 'asc' }])).toEqual({
      action: 1,
    });
  });

  it('builds typeorm order', () => {
    expect(
      buildTypeOrmOrder([{ column: 'nome', direction: 'desc' }], 'dashboard'),
    ).toEqual({
      'dashboard.nome': 'DESC',
    });
  });
});
