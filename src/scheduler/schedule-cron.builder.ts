import { BadRequestException } from '@nestjs/common';
import { AgendamentoFrequencia } from './entities/scheduler.enums';

export interface ScheduleCronInput {
  frequencia: AgendamentoFrequencia;
  intervalo: number;
  horas?: number[];
  minutos?: number[];
  diasSemana?: number[];
}

function assertRange(values: number[], min: number, max: number, label: string): void {
  for (const value of values) {
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new BadRequestException(
        `${label} deve conter inteiros entre ${min} e ${max}`,
      );
    }
  }
}

function joinUnique(values: number[]): string {
  return [...new Set(values)].sort((a, b) => a - b).join(',');
}

export class ScheduleCronBuilder {
  build(input: ScheduleCronInput): string {
    const intervalo = input.intervalo;

    if (!Number.isInteger(intervalo) || intervalo < 1) {
      throw new BadRequestException('Intervalo deve ser um inteiro positivo');
    }

    switch (input.frequencia) {
      case AgendamentoFrequencia.MINUTO:
        return `*/${intervalo} * * * *`;

      case AgendamentoFrequencia.HORA:
        return `0 */${intervalo} * * *`;

      case AgendamentoFrequencia.DIA: {
        const horas = input.horas?.length ? input.horas : [0];
        const minutos = input.minutos?.length ? input.minutos : [0];
        assertRange(horas, 0, 23, 'Horas');
        assertRange(minutos, 0, 59, 'Minutos');
        return `${joinUnique(minutos)} ${joinUnique(horas)} * * *`;
      }

      case AgendamentoFrequencia.SEMANA: {
        const diasSemana = input.diasSemana ?? [];
        const horas = input.horas?.length ? input.horas : [0];
        const minutos = input.minutos?.length ? input.minutos : [0];

        if (diasSemana.length === 0) {
          throw new BadRequestException(
            'dias_semana é obrigatório para frequência semanal',
          );
        }

        assertRange(diasSemana, 0, 6, 'Dias da semana');
        assertRange(horas, 0, 23, 'Horas');
        assertRange(minutos, 0, 59, 'Minutos');
        return `${joinUnique(minutos)} ${joinUnique(horas)} * * ${joinUnique(diasSemana)}`;
      }

      case AgendamentoFrequencia.MES: {
        const horas = input.horas?.length ? input.horas : [0];
        const minutos = input.minutos?.length ? input.minutos : [0];
        assertRange(horas, 0, 23, 'Horas');
        assertRange(minutos, 0, 59, 'Minutos');
        return `${joinUnique(minutos)} ${joinUnique(horas)} 1 * *`;
      }

      default:
        throw new BadRequestException('Frequência de agendamento inválida');
    }
  }
}
