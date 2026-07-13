import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Agendamento } from './entities/Agendamento';
import { AgendamentoExecucao } from './entities/AgendamentoExecucao';
import { AgendamentoVinculo } from './entities/AgendamentoVinculo';
import {
  AgendamentoVinculoTipo,
} from './entities/scheduler.enums';
import { ScheduleCronBuilder } from './schedule-cron.builder';
import { ScheduleSyncService } from './schedule-sync.service';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto';
import { CreateVinculoDto } from './dto/create-vinculo.dto';
import { CreateReportSnapshotScheduleDto } from './dto/create-report-snapshot-schedule.dto';

interface Requester {
  sub: number;
  email: string;
}

@Injectable()
export class SchedulerService {
  private readonly cronBuilder = new ScheduleCronBuilder();

  constructor(
    @InjectRepository(Agendamento)
    private readonly agendamentoRepository: Repository<Agendamento>,
    @InjectRepository(AgendamentoVinculo)
    private readonly vinculoRepository: Repository<AgendamentoVinculo>,
    @InjectRepository(AgendamentoExecucao)
    private readonly execucaoRepository: Repository<AgendamentoExecucao>,
    private readonly scheduleSyncService: ScheduleSyncService,
  ) {}

  async createAgendamento(
    dto: CreateAgendamentoDto,
    requester: Requester,
    usuarioNome?: string,
  ): Promise<Agendamento> {
    const cronExpression = this.cronBuilder.build({
      frequencia: dto.frequencia,
      intervalo: dto.intervalo,
      horas: dto.horas,
      minutos: dto.minutos,
      diasSemana: dto.dias_semana,
    });

    const agendamento = this.agendamentoRepository.create({
      nome: dto.nome,
      ativo: dto.ativo,
      intervalo: dto.intervalo,
      frequencia: dto.frequencia,
      timezone: dto.timezone,
      horaInicio: dto.hora_inicio ?? null,
      diasSemana: dto.dias_semana,
      horas: dto.horas,
      minutos: dto.minutos,
      cronExpression,
      usuarioCadastrador: usuarioNome ?? requester.email,
      usuarioAtualizador: usuarioNome ?? requester.email,
    });

    return this.agendamentoRepository.save(agendamento);
  }

  async updateAgendamento(
    id: number,
    dto: UpdateAgendamentoDto,
    requester: Requester,
    usuarioNome?: string,
  ): Promise<Agendamento> {
    const agendamento = await this.agendamentoRepository.findOne({
      where: { id },
    });

    if (!agendamento) {
      throw new NotFoundException('Agendamento não localizado');
    }

    if (dto.nome !== undefined) agendamento.nome = dto.nome;
    if (dto.ativo !== undefined) agendamento.ativo = dto.ativo;
    if (dto.intervalo !== undefined) agendamento.intervalo = dto.intervalo;
    if (dto.frequencia !== undefined) agendamento.frequencia = dto.frequencia;
    if (dto.timezone !== undefined) agendamento.timezone = dto.timezone;
    if (dto.hora_inicio !== undefined) agendamento.horaInicio = dto.hora_inicio;
    if (dto.dias_semana !== undefined) agendamento.diasSemana = dto.dias_semana;
    if (dto.horas !== undefined) agendamento.horas = dto.horas;
    if (dto.minutos !== undefined) agendamento.minutos = dto.minutos;

    agendamento.cronExpression = this.cronBuilder.build({
      frequencia: agendamento.frequencia,
      intervalo: agendamento.intervalo,
      horas: agendamento.horas,
      minutos: agendamento.minutos,
      diasSemana: agendamento.diasSemana,
    });

    agendamento.usuarioAtualizador = usuarioNome ?? requester.email;

    const saved = await this.agendamentoRepository.save(agendamento);

    const vinculos = await this.vinculoRepository.find({
      where: { agendamentoId: saved.id, ativo: true },
      relations: { agendamento: true },
    });

    for (const vinculo of vinculos) {
      vinculo.agendamento = saved;
      if (saved.ativo) {
        await this.scheduleSyncService.syncVinculo(vinculo);
      } else {
        await this.scheduleSyncService.unsyncVinculo(vinculo);
      }
    }

    return saved;
  }

  async deleteAgendamento(id: number): Promise<void> {
    const agendamento = await this.agendamentoRepository.findOne({
      where: { id },
      relations: { vinculos: true },
    });

    if (!agendamento) {
      throw new NotFoundException('Agendamento não localizado');
    }

    for (const vinculo of agendamento.vinculos ?? []) {
      await this.scheduleSyncService.unsyncVinculo(vinculo);
    }

    await this.agendamentoRepository.remove(agendamento);
  }

  async createVinculo(
    agendamentoId: number,
    dto: CreateVinculoDto,
  ): Promise<AgendamentoVinculo> {
    const agendamento = await this.agendamentoRepository.findOne({
      where: { id: agendamentoId },
    });

    if (!agendamento) {
      throw new NotFoundException('Agendamento não localizado');
    }

    const existing = await this.vinculoRepository.findOne({
      where: {
        tipo: dto.tipo,
        entidadeTipo: dto.entidade_tipo,
        entidadeId: dto.entidade_id,
      },
    });

    if (existing) {
      throw new ConflictException('Já existe vínculo para esta entidade e tipo');
    }

    let vinculo = this.vinculoRepository.create({
      agendamentoId,
      tipo: dto.tipo,
      entidadeTipo: dto.entidade_tipo,
      entidadeId: dto.entidade_id,
      payload: dto.payload,
      ativo: dto.ativo,
      pgbossScheduleKey: `pending-${Date.now()}`,
    });

    vinculo = await this.vinculoRepository.save(vinculo);
    vinculo.pgbossScheduleKey = `vinculo-${vinculo.id}`;
    vinculo = await this.vinculoRepository.save(vinculo);
    vinculo.agendamento = agendamento;

    if (vinculo.ativo && agendamento.ativo) {
      await this.scheduleSyncService.syncVinculo(vinculo);
    }

    return vinculo;
  }

  async deleteVinculo(vinculoId: number): Promise<void> {
    const vinculo = await this.vinculoRepository.findOne({
      where: { id: vinculoId },
    });

    if (!vinculo) {
      throw new NotFoundException('Vínculo não localizado');
    }

    await this.scheduleSyncService.unsyncVinculo(vinculo);
    await this.vinculoRepository.remove(vinculo);
  }

  async listVinculos(filters: {
    entidadeTipo?: string;
    entidadeId?: number;
    tipo?: AgendamentoVinculoTipo;
  }): Promise<AgendamentoVinculo[]> {
    const where: Record<string, unknown> = {};

    if (filters.entidadeTipo) where.entidadeTipo = filters.entidadeTipo;
    if (filters.entidadeId) where.entidadeId = filters.entidadeId;
    if (filters.tipo) where.tipo = filters.tipo;

    return this.vinculoRepository.find({
      where,
      relations: { agendamento: true },
      order: { id: 'DESC' },
    });
  }

  async listExecucoesByVinculo(vinculoId: number): Promise<AgendamentoExecucao[]> {
    return this.execucaoRepository.find({
      where: { vinculoId },
      order: { iniciadoEm: 'DESC' },
      take: 100,
    });
  }

  async listExecucoesByEntity(
    entidadeTipo: string,
    entidadeId: number,
    tipo: AgendamentoVinculoTipo,
  ): Promise<AgendamentoExecucao[]> {
    const vinculo = await this.findVinculoByEntity(entidadeTipo, entidadeId, tipo);

    if (!vinculo) {
      return [];
    }

    return this.listExecucoesByVinculo(vinculo.id);
  }

  async pauseVinculoByEntity(
    entidadeTipo: string,
    entidadeId: number,
    tipo: AgendamentoVinculoTipo,
  ): Promise<void> {
    const vinculo = await this.findVinculoByEntity(entidadeTipo, entidadeId, tipo);

    if (!vinculo) {
      return;
    }

    vinculo.ativo = false;
    await this.vinculoRepository.save(vinculo);
    await this.scheduleSyncService.unsyncVinculo(vinculo);
  }

  async createReportSnapshotSchedule(
    relatorioId: number,
    userId: number,
    dto: CreateReportSnapshotScheduleDto,
    requester: Requester,
  ): Promise<{ agendamento: Agendamento; vinculo: AgendamentoVinculo }> {
    const existing = await this.findVinculoByEntity(
      'relatorio',
      relatorioId,
      AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
    );

    if (existing) {
      throw new ConflictException(
        'Já existe agendamento de snapshot para este relatório',
      );
    }

    const agendamento = await this.createAgendamento(
      {
        nome: dto.nome ?? `Snapshot relatório ${relatorioId}`,
        ativo: dto.ativo,
        intervalo: dto.intervalo,
        frequencia: dto.frequencia,
        timezone: dto.timezone,
        hora_inicio: dto.hora_inicio,
        dias_semana: dto.dias_semana,
        horas: dto.horas,
        minutos: dto.minutos,
      },
      requester,
    );

    const vinculo = await this.createVinculo(agendamento.id, {
      tipo: AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
      entidade_tipo: 'relatorio',
      entidade_id: relatorioId,
      payload: {
        userId,
        parametros_snapshot: dto.parametros_snapshot,
      },
      ativo: dto.ativo,
    });

    return { agendamento, vinculo };
  }

  async getReportSnapshotSchedule(
    relatorioId: number,
  ): Promise<{ agendamento: Agendamento; vinculo: AgendamentoVinculo } | null> {
    const vinculo = await this.findVinculoByEntity(
      'relatorio',
      relatorioId,
      AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
    );

    if (!vinculo) {
      return null;
    }

    const agendamento = vinculo.agendamento
      ?? (await this.agendamentoRepository.findOne({
        where: { id: vinculo.agendamentoId },
      }));

    if (!agendamento) {
      throw new BadRequestException('Agendamento do vínculo não encontrado');
    }

    return { agendamento, vinculo };
  }

  async deleteReportSnapshotSchedule(relatorioId: number): Promise<void> {
    const vinculo = await this.findVinculoByEntity(
      'relatorio',
      relatorioId,
      AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
    );

    if (!vinculo) {
      throw new NotFoundException('Agendamento de snapshot não localizado');
    }

    const agendamentoId = vinculo.agendamentoId;
    await this.deleteVinculo(vinculo.id);

    const remaining = await this.vinculoRepository.count({
      where: { agendamentoId },
    });

    if (remaining === 0) {
      await this.agendamentoRepository.delete(agendamentoId);
    }
  }

  private async findVinculoByEntity(
    entidadeTipo: string,
    entidadeId: number,
    tipo: AgendamentoVinculoTipo,
  ): Promise<AgendamentoVinculo | null> {
    return this.vinculoRepository.findOne({
      where: { entidadeTipo, entidadeId, tipo },
      relations: { agendamento: true },
    });
  }
}
