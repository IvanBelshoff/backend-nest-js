import { userQuerySchema } from './user-query.dto';

describe('userQuerySchema', () => {
  it('does not default bloqueado to false when query param is omitted', () => {
    const parsed = userQuerySchema.parse({ page: '1', limit: '100' });

    expect(parsed.bloqueado).toBeUndefined();
  });

  it('parses bloqueado=true', () => {
    const parsed = userQuerySchema.parse({
      page: '1',
      limit: '100',
      bloqueado: 'true',
    });

    expect(parsed.bloqueado).toBe(true);
  });

  it('parses bloqueado=false', () => {
    const parsed = userQuerySchema.parse({
      page: '1',
      limit: '100',
      bloqueado: 'false',
    });

    expect(parsed.bloqueado).toBe(false);
  });
});
