export interface SnapshotJobPayload {
  relatorioId: number;
  userId: number;
  parametrosSnapshot: Record<string, unknown>;
}
