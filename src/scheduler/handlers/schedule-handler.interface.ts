import { Agendamento } from '../entities/Agendamento';
import { AgendamentoVinculo } from '../entities/AgendamentoVinculo';
import { AgendamentoVinculoTipo } from '../entities/scheduler.enums';

export interface ScheduleHandlerContext {
  vinculo: AgendamentoVinculo;
  agendamento: Agendamento;
  execucaoId: number;
}

export type ScheduleHandlerStatus = 'completed' | 'skipped' | 'failed';

export interface ScheduleHandlerResult {
  status: ScheduleHandlerStatus;
  jobId?: string;
  erro?: string;
}

export interface ScheduleHandler {
  readonly tipo: AgendamentoVinculoTipo;
  execute(ctx: ScheduleHandlerContext): Promise<ScheduleHandlerResult>;
}
