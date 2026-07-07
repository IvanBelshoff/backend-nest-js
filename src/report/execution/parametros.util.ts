import { BadRequestException } from '@nestjs/common';
import { ParametroRelatorio } from 'src/database/entities/Relatorios';

export function resolveParametros(
  schema: ParametroRelatorio[] | null | undefined,
  input: Record<string, unknown> = {},
): Record<string, unknown> {
  const definitions = schema ?? [];
  const resolved: Record<string, unknown> = {};

  for (const param of definitions) {
    const rawValue =
      input[param.nome] !== undefined ? input[param.nome] : param.padrao;

    if (
      (rawValue === undefined || rawValue === null || rawValue === '') &&
      param.obrigatorio
    ) {
      throw new BadRequestException(
        `Parâmetro obrigatório não informado: ${param.nome}`,
      );
    }

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      continue;
    }

    resolved[param.nome] = coerceParametro(param, rawValue);
  }

  for (const [key, value] of Object.entries(input)) {
    if (!(key in resolved) && value !== undefined && value !== null && value !== '') {
      throw new BadRequestException(`Parâmetro não definido no relatório: ${key}`);
    }
  }

  return resolved;
}

function coerceParametro(
  param: ParametroRelatorio,
  rawValue: unknown,
): unknown {
  switch (param.tipo) {
    case 'string':
      return String(rawValue);
    case 'number': {
      const numberValue = Number(rawValue);
      if (Number.isNaN(numberValue)) {
        throw new BadRequestException(`Parâmetro ${param.nome} deve ser numérico`);
      }
      return numberValue;
    }
    case 'boolean':
      if (typeof rawValue === 'boolean') return rawValue;
      if (rawValue === 'true') return true;
      if (rawValue === 'false') return false;
      throw new BadRequestException(`Parâmetro ${param.nome} deve ser booleano`);
    case 'date': {
      const date = new Date(String(rawValue));
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException(`Parâmetro ${param.nome} deve ser uma data válida`);
      }
      return date;
    }
    case 'enum': {
      const value = String(rawValue);
      if (param.valores?.length && !param.valores.includes(value)) {
        throw new BadRequestException(
          `Parâmetro ${param.nome} deve ser um dos valores: ${param.valores.join(', ')}`,
        );
      }
      return value;
    }
    default:
      return rawValue;
  }
}
