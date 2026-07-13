import { ScheduleCronBuilder } from './schedule-cron.builder';
import { AgendamentoFrequencia } from './entities/scheduler.enums';

describe('ScheduleCronBuilder', () => {
  const builder = new ScheduleCronBuilder();

  it('converte hora a cada N horas', () => {
    expect(
      builder.build({
        frequencia: AgendamentoFrequencia.HORA,
        intervalo: 2,
      }),
    ).toBe('0 */2 * * *');
  });

  it('converte diário com horas e minutos', () => {
    expect(
      builder.build({
        frequencia: AgendamentoFrequencia.DIA,
        intervalo: 1,
        horas: [7, 18],
        minutos: [30],
      }),
    ).toBe('30 7,18 * * *');
  });

  it('converte semanal seg–sex 7–18h', () => {
    expect(
      builder.build({
        frequencia: AgendamentoFrequencia.SEMANA,
        intervalo: 1,
        diasSemana: [1, 2, 3, 4, 5],
        horas: [7, 18],
        minutos: [0],
      }),
    ).toBe('0 7,18 * * 1,2,3,4,5');
  });

  it('converte mensal no dia 1', () => {
    expect(
      builder.build({
        frequencia: AgendamentoFrequencia.MES,
        intervalo: 1,
        horas: [8],
        minutos: [15],
      }),
    ).toBe('15 8 1 * *');
  });

  it('converte minuto a cada N minutos', () => {
    expect(
      builder.build({
        frequencia: AgendamentoFrequencia.MINUTO,
        intervalo: 15,
      }),
    ).toBe('*/15 * * * *');
  });
});
