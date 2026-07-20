import {
  buildBlockedReportRefusalMessage,
  messageMentionsReportName,
} from './ai-report-name-match.util';

describe('ai-report-name-match.util', () => {
  it('detects full report name with trailing punctuation', () => {
    expect(
      messageMentionsReportName(
        'me conte sobre o relatório: Acessos de Usuários a Relatórios.',
        'Acessos de Usuários a Relatórios',
      ),
    ).toBe(true);
  });

  it('does not match unrelated report names', () => {
    expect(
      messageMentionsReportName(
        'quantos relatórios existem?',
        'Acessos de Usuários a Relatórios',
      ),
    ).toBe(false);
  });

  it('builds refusal message for a single report', () => {
    expect(
      buildBlockedReportRefusalMessage(['Acessos de Usuários a Relatórios']),
    ).toContain('Acessos de Usuários a Relatórios');
    expect(
      buildBlockedReportRefusalMessage(['Acessos de Usuários a Relatórios']),
    ).toContain('não está habilitado');
  });
});
