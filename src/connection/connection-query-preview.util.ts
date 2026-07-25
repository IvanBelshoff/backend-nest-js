export function resolvePreviewMaxRows(
  limite: number | undefined,
  previewDefault: number,
  absoluteMax: number,
): number {
  const requested = limite ?? previewDefault;
  return Math.min(requested, absoluteMax);
}
