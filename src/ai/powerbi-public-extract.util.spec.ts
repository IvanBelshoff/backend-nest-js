import {
  buildPowerBiExtractUrl,
  redactUrlsFromText,
} from './powerbi-public-extract.util';

describe('powerbi-public-extract.util', () => {
  it('adds chromeless params for powerbi.com urls', () => {
    const url = buildPowerBiExtractUrl(
      'https://app.powerbi.com/view?r=abc',
      'x=1',
    );

    expect(url).toContain('r=abc');
    expect(url).toContain('x=1');
    expect(url).toContain('chromeless=1');
    expect(url).toContain('pageView=fitToWidth');
  });

  it('returns empty string for blank url', () => {
    expect(buildPowerBiExtractUrl('   ')).toBe('');
  });

  it('redacts absolute urls and powerbi hosts', () => {
    expect(
      redactUrlsFromText(
        'veja https://app.powerbi.com/view?r=secret e app.powerbi.com/foo',
      ),
    ).toBe('veja [url omitida] e [url omitida]');
  });
});
