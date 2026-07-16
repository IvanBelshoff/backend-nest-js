import { redactSensitiveReportRows } from './ai-sensitive-data.util';

describe('redactSensitiveReportRows', () => {
  it('redacts url columns and URL-like cell values', () => {
    const result = redactSensitiveReportRows(
      ['nome', 'url', 'email'],
      [
        {
          nome: 'ANTT',
          url: 'https://app.powerbi.com/view?r=secret',
          email: 'user@test.com',
        },
      ],
    );

    expect(result.colunas).toEqual(['nome', 'email']);
    expect(result.dados[0]).toEqual({
      nome: 'ANTT',
      email: 'user@test.com',
    });
    expect(result.dados[0]).not.toHaveProperty('url');
  });
});
