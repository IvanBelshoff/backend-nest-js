export interface ExportJobPayload {
  relatorioId: number;
  userId: number;
  parametros: Record<string, unknown>;
  formato: 'csv';
}
