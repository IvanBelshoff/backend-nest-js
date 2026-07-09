/** MongoDB BSON document limit is 16MB; keep headroom for encoding overhead. */
export const MONGODB_BSON_MAX_BYTES = 16 * 1024 * 1024;
export const SAFE_SNAPSHOT_MAX_BYTES = 15 * 1024 * 1024;

export function estimateSnapshotPayloadBytes(payload: unknown): number {
  return Buffer.byteLength(JSON.stringify(payload), 'utf8');
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${bytes} B`;
}

export function buildSnapshotSizeExceededMessage(
  estimatedBytes: number,
  maxBytes: number = SAFE_SNAPSHOT_MAX_BYTES,
): string {
  return (
    `Snapshot excede o limite do MongoDB (${formatBytes(maxBytes)}). ` +
    `Tamanho estimado: ${formatBytes(estimatedBytes)}. ` +
    `Reduza limite_linhas, colunas retornadas ou simplifique a consulta.`
  );
}
