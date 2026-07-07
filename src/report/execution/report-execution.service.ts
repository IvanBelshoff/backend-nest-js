import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Relatorio } from 'src/database/entities/Relatorios';
import { ConnectionService } from 'src/connection/connection.service';
import { assertReadOnlyQuery } from './query-validator.util';
import { executeQuery } from './dynamic-connection.factory';
import { resolveParametros } from './parametros.util';

export interface ReportDataResult {
  colunas: string[];
  dados: Record<string, unknown>[];
  total_linhas: number;
}

@Injectable()
export class ReportExecutionService {
  constructor(
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
    private readonly connectionService: ConnectionService,
  ) {}

  async execute(
    relatorioId: number,
    parametros: Record<string, unknown> = {},
  ): Promise<ReportDataResult> {
    const relatorio = await this.relatorioRepository.findOne({
      where: { id: relatorioId },
      relations: { conexao: true },
    });

    if (!relatorio) {
      throw new NotFoundException('Relatório não localizado');
    }

    assertReadOnlyQuery(relatorio.query);
    const resolvedParams = resolveParametros(relatorio.parametros, parametros);

    const conexao = await this.connectionService.findByIdWithPassword(
      relatorio.id_conexao,
    );
    const senha = this.connectionService.getDecryptedPassword(conexao);

    return executeQuery(
      conexao,
      senha,
      relatorio.query,
      resolvedParams,
      relatorio.limite_linhas,
      relatorio.timeout_ms,
    );
  }
}
