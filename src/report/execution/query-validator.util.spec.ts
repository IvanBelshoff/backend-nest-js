import { BadRequestException } from '@nestjs/common';
import { assertReadOnlyQuery } from './query-validator.util';

describe('query-validator.util', () => {
  it('allows SELECT queries', () => {
    expect(() =>
      assertReadOnlyQuery('SELECT id, nome FROM usuarios WHERE id = :id'),
    ).not.toThrow();
  });

  it('blocks INSERT queries', () => {
    expect(() =>
      assertReadOnlyQuery('INSERT INTO usuarios (nome) VALUES (:nome)'),
    ).toThrow(BadRequestException);
  });

  it('blocks multiple statements', () => {
    expect(() =>
      assertReadOnlyQuery('SELECT 1; DROP TABLE usuarios'),
    ).toThrow(BadRequestException);
  });
});
