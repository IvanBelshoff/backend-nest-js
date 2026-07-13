export enum AgendamentoFrequencia {
  MINUTO = 'minuto',
  HORA = 'hora',
  DIA = 'dia',
  SEMANA = 'semana',
  MES = 'mes',
}

export enum AgendamentoVinculoTipo {
  REPORT_SNAPSHOT_REFRESH = 'report_snapshot_refresh',
}

export enum AgendamentoExecucaoStatus {
  STARTED = 'started',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
}
