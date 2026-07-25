import { resolvePreviewMaxRows } from './connection-query-preview.util';

describe('resolvePreviewMaxRows', () => {
  const previewDefault = 200;
  const absoluteMax = 10000;

  it('uses preview default when limite is omitted', () => {
    expect(resolvePreviewMaxRows(undefined, previewDefault, absoluteMax)).toBe(200);
  });

  it('allows limite above preview default up to absolute max', () => {
    expect(resolvePreviewMaxRows(500, previewDefault, absoluteMax)).toBe(500);
  });

  it('clamps limite to absolute max', () => {
    expect(resolvePreviewMaxRows(20000, previewDefault, absoluteMax)).toBe(10000);
  });
});
