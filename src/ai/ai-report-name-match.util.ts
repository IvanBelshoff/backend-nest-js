export function normalizeMessageForReportMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function messageMentionsReportName(
  text: string,
  reportName: string,
): boolean {
  const normalizedText = normalizeMessageForReportMatch(text);
  const normalizedName = normalizeMessageForReportMatch(reportName);

  if (!normalizedText || !normalizedName) {
    return false;
  }

  if (normalizedText.includes(normalizedName)) {
    return true;
  }

  const escaped = normalizedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `(?:^|[\\s:;,"'(])${escaped}(?=$|[\\s.,;:!?)|"'\\]])`,
    'i',
  );

  return pattern.test(` ${normalizedText} `);
}

export function buildBlockedReportRefusalMessage(names: string[]): string {
  if (names.length === 1) {
    return `O conhecimento da IA não está habilitado para o relatório "${names[0]}". Para consultá-lo pelo assistente, um administrador precisa ativar a permissão de IA nas configurações de acesso do relatório.`;
  }

  const quoted = names.map((name) => `"${name}"`).join(', ');
  return `O conhecimento da IA não está habilitado para os relatórios: ${quoted}. Para consultá-los pelo assistente, um administrador precisa ativar a permissão de IA nas configurações de acesso de cada relatório.`;
}
