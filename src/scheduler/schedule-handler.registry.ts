import { Injectable } from '@nestjs/common';
import {
  ScheduleHandler,
  ScheduleHandlerResult,
} from './handlers/schedule-handler.interface';
import { AgendamentoVinculoTipo } from './entities/scheduler.enums';

@Injectable()
export class ScheduleHandlerRegistry {
  private readonly handlers = new Map<
    AgendamentoVinculoTipo,
    ScheduleHandler
  >();

  register(handler: ScheduleHandler): void {
    this.handlers.set(handler.tipo, handler);
  }

  get(tipo: AgendamentoVinculoTipo): ScheduleHandler | undefined {
    return this.handlers.get(tipo);
  }

  async execute(
    tipo: AgendamentoVinculoTipo,
    ctx: Parameters<ScheduleHandler['execute']>[0],
  ): Promise<ScheduleHandlerResult> {
    const handler = this.get(tipo);

    if (!handler) {
      return {
        status: 'failed',
        erro: `Nenhum handler registrado para o tipo ${tipo}`,
      };
    }

    return handler.execute(ctx);
  }
}
