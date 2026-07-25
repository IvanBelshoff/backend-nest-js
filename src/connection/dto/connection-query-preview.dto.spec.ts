import { connectionQueryPreviewSchema, connectionQueryCountSchema } from './connection-query-preview.dto';
import { env } from 'src/shared/env.schema';

describe('connection-query-preview.dto', () => {
  it('validates preview payload', () => {
    const result = connectionQueryPreviewSchema.parse({
      query: 'SELECT 1',
      parametros: { id: 1 },
    });

    expect(result.query).toBe('SELECT 1');
    expect(result.parametros).toEqual({ id: 1 });
  });

  it('rejects empty query', () => {
    expect(() =>
      connectionQueryPreviewSchema.parse({
        query: '   ',
      }),
    ).toThrow();
  });

  it('rejects limite above report max rows', () => {
    expect(() =>
      connectionQueryPreviewSchema.parse({
        query: 'SELECT 1',
        limite: env.REPORT_QUERY_MAX_ROWS + 1,
      }),
    ).toThrow();
  });
});

describe('connection-query-count.dto', () => {
  it('validates count payload', () => {
    const result = connectionQueryCountSchema.parse({
      query: 'SELECT * FROM usuarios',
    });

    expect(result.query).toBe('SELECT * FROM usuarios');
  });
});
