/** Monta URL de preview Power BI (chromeless), espelhando o frontend. */
export function buildPowerBiExtractUrl(
  rawUrl: string,
  rawQuery?: string | null,
): string {
  const trimmedUrl = rawUrl.trim();
  if (!trimmedUrl) {
    return '';
  }

  try {
    const parsedUrl = new URL(trimmedUrl);
    const extraQuery = rawQuery?.trim();

    if (extraQuery) {
      const normalizedQuery = extraQuery.startsWith('?')
        ? extraQuery.slice(1)
        : extraQuery;
      if (normalizedQuery) {
        const params = new URLSearchParams(normalizedQuery);
        params.forEach((value, key) => {
          parsedUrl.searchParams.set(key, value);
        });
      }
    }

    if (parsedUrl.hostname.includes('powerbi.com')) {
      parsedUrl.searchParams.set('pageView', 'fitToWidth');
      parsedUrl.searchParams.set('chromeless', '1');
    }

    return parsedUrl.toString();
  } catch {
    return trimmedUrl;
  }
}

export function redactUrlsFromText(text: string): string {
  return text
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[url omitida]')
    .replace(/\bapp\.powerbi\.com[^\s"'<>]*/gi, '[url omitida]');
}
