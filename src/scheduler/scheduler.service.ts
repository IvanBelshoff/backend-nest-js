import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Agendamento } from './entities/Agendamento';
import { AgendamentoExecucao } from './entities/AgendamentoExecucao';
import { AgendamentoVinculo } from './entities/AgendamentoVinculo';
import {
  AgendamentoExecucaoStatus,
  AgendamentoVinculoTipo,
} from './entities/scheduler.enums';
import { Relatorio } from 'src/database/entities/Relatorios';
import type { ListAdminScheduleExecutionsQueryDto } from 'src/admin-jobs/dto/list-admin-schedule-executions-query.dto';
import { ScheduleCronBuilder } from './schedule-cron.builder';
import { ScheduleSyncService } from './schedule-sync.service';
import { CreateAgendamentoDto } from './dto/create-agendamento.dto';
import { UpdateAgendamentoDto } from './dto/update-agendamento.dto';
import { CreateVinculoDto } from './dto/create-vinculo.dto';
import { CreateReportSnapshotScheduleDto } from './dto/create-report-snapshot-schedule.dto';
import { AuditService } from 'src/audit/audit.service';
import { AUDIT_ACTIONS } from 'src/audit/constants/audit-actions';
import { toAuditActor, toResourceId } from 'src/audit/utils/audit-actor.util';
import {
  buildAuditChanges,
  buildAuditCreateChanges,
  buildAuditDeleteChanges,
} from 'src/audit/utils/build-audit-changes.util';
import {
  AGENDAMENTO_AUDIT_PROFILE,
  VINCULO_AUDIT_PROFILE,
  pickAgendamentoAuditSnapshot,
  pickVinculoAuditSnapshot,
} from 'src/audit/utils/audit-field-profiles';
import { toAuditRecordMetadata } from 'src/audit/utils/audit-metadata.util';

interface Requester {
  sub: number;
  email: string;
}

export interface AdminScheduleExecutionItem {
  id: number;
  vinculoId: number;
  status: AgendamentoExecucaoStatus;
  jobId: string | null;
  erro: string | null;
  iniciadoEm: Date;
  concluidoEm: Date | null;
  relatorioId: number | null;
  relatorioNome: string | null;
  agendamentoNome: string;
}

export interface AdminScheduleExecutionListResult {
  items: AdminScheduleExecutionItem[];
  page: number;
  pageSize: number;
  total: number;
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
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
    private readonly scheduleSyncService: ScheduleSyncService,
    private readonly auditService: AuditService,
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

    const saved = await this.agendamentoRepository.save(agendamento);
    this.auditService.record({
      actor: toAuditActor(requester),
      action: AUDIT_ACTIONS.SCHEDULER_CREATE,
      category: 'scheduler',
      outcome: 'success',
      resource: { type: 'agendamento', id: toResourceId(saved.id) },
      metadata: toAuditRecordMetadata(
        buildAuditCreateChanges(pickAgendamentoAuditSnapshot(saved), AGENDAMENTO_AUDIT_PROFILE),
        { nome: saved.nome },
      ),
    });
    return saved;
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

    const beforeSnapshot = pickAgendamentoAuditSnapshot(agendamento);

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

    this.auditService.record({
      actor: toAuditActor(requester),
      action: AUDIT_ACTIONS.SCHEDULER_UPDATE,
      category: 'scheduler',
      outcome: 'success',
      resource: { type: 'agendamento', id },
      metadata: toAuditRecordMetadata(
        buildAuditChanges(
          beforeSnapshot,
          pickAgendamentoAuditSnapshot(saved),
          AGENDAMENTO_AUDIT_PROFILE,
        ),
        { nome: saved.nome, ativo: saved.ativo },
      ),
    });

    return saved;
  }

  async deleteAgendamento(
    id: number,
    requester?: { sub: number; email: string },
  ): Promise<void> {
    const agendamento = await this.agendamentoRepository.findOne({
      where: { id },
      relations: { vinculos: true },
    });

    if (!agendamento) {
      throw new NotFoundException('Agendamento não localizado');
    }

    const deleteSnapshot = pickAgendamentoAuditSnapshot(agendamento);

    for (const vinculo of agendamento.vinculos ?? []) {
      await this.scheduleSyncService.unsyncVinculo(vinculo);
    }

    await this.agendamentoRepository.remove(agendamento);

    if (requester) {
      this.auditService.record({
        actor: toAuditActor(requester),
        action: AUDIT_ACTIONS.SCHEDULER_DELETE,
        category: 'scheduler',
        outcome: 'success',
        resource: { type: 'agendamento', id },
        metadata: toAuditRecordMetadata(
          buildAuditDeleteChanges(deleteSnapshot, AGENDAMENTO_AUDIT_PROFILE),
          { nome: deleteSnapshot.nome },
        ),
      });
    }
  }

  async createVinculo(
    agendamentoId: number,
    dto: CreateVinculoDto,
    requester?: { sub: number; email: string },
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

    if (requester) {
      this.auditService.record({
        actor: toAuditActor(requester),
        action: AUDIT_ACTIONS.SCHEDULER_VINCULO_CREATE,
        category: 'scheduler',
        outcome: 'success',
        resource: { type: 'agendamento_vinculo', id: toResourceId(vinculo.id) },
        metadata: toAuditRecordMetadata(
          buildAuditCreateChanges(pickVinculoAuditSnapshot(vinculo), VINCULO_AUDIT_PROFILE),
          {
            agendamentoId,
            entidadeTipo: dto.entidade_tipo,
            entidadeId: dto.entidade_id,
          },
        ),
      });
    }

    return vinculo;
  }

  async deleteVinculo(
    vinculoId: number,
    requester?: { sub: number; email: string },
  ): Promise<void> {
    const vinculo = await this.vinculoRepository.findOne({
      where: { id: vinculoId },
    });

    if (!vinculo) {
      throw new NotFoundException('Vínculo não localizado');
    }

    const deleteSnapshot = pickVinculoAuditSnapshot(vinculo);

    await this.scheduleSyncService.unsyncVinculo(vinculo);
    await this.vinculoRepository.remove(vinculo);

    if (requester) {
      this.auditService.record({
        actor: toAuditActor(requester),
        action: AUDIT_ACTIONS.SCHEDULER_VINCULO_DELETE,
        category: 'scheduler',
        outcome: 'success',
        resource: { type: 'agendamento_vinculo', id: vinculoId },
        metadata: toAuditRecordMetadata(
          buildAuditDeleteChanges(deleteSnapshot, VINCULO_AUDIT_PROFILE),
        ),
      });
    }
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
    }, requester);

    this.auditService.record({
      actor: toAuditActor(requester),
      action: AUDIT_ACTIONS.REPORT_SNAPSHOT_SCHEDULE_CREATE,
      category: 'scheduler',
      outcome: 'success',
      resource: { type: 'relatorio', id: relatorioId },
      metadata: toAuditRecordMetadata(
        buildAuditCreateChanges(pickVinculoAuditSnapshot(vinculo), VINCULO_AUDIT_PROFILE),
        { agendamentoId: agendamento.id, vinculoId: vinculo.id },
      ),
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

  async deleteReportSnapshotSchedule(
    relatorioId: number,
    requester?: { sub: number; email: string },
  ): Promise<void> {
    const vinculo = await this.findVinculoByEntity(
      'relatorio',
      relatorioId,
      AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
    );

    if (!vinculo) {
      throw new NotFoundException('Agendamento de snapshot não localizado');
    }

    const agendamentoId = vinculo.agendamentoId;
    await this.deleteVinculo(vinculo.id, requester);

    const remaining = await this.vinculoRepository.count({
      where: { agendamentoId },
    });

    if (remaining === 0) {
      await this.agendamentoRepository.delete(agendamentoId);
    }

    if (requester) {
      this.auditService.record({
        actor: toAuditActor(requester),
        action: AUDIT_ACTIONS.REPORT_SNAPSHOT_SCHEDULE_DELETE,
        category: 'scheduler',
        outcome: 'success',
        resource: { type: 'relatorio', id: relatorioId },
      });
    }
  }

  async listExecucoesAdmin(
    query: ListAdminScheduleExecutionsQueryDto,
  ): Promise<AdminScheduleExecutionListResult> {
    const page = query.page;
    const pageSize = query.page_size;
    const sortDesc = query.sort === 'iniciado_em:desc';

    const qb = this.execucaoRepository
      .createQueryBuilder('execucao')
      .innerJoinAndSelect('execucao.vinculo', 'vinculo')
      .leftJoinAndSelect('vinculo.agendamento', 'agendamento');

    if (query.status) {
      qb.andWhere('execucao.status = :status', { status: query.status });
    }

    if (query.relatorio_id) {
      qb.andWhere('vinculo.entidade_tipo = :entidadeTipo', {
        entidadeTipo: 'relatorio',
      }).andWhere('vinculo.entidade_id = :relatorioId', {
        relatorioId: query.relatorio_id,
      });
    }

    if (query.created_from) {
      qb.andWhere('execucao.iniciado_em >= :createdFrom', {
        createdFrom: query.created_from,
      });
    }

    if (query.created_to) {
      qb.andWhere('execucao.iniciado_em <= :createdTo', {
        createdTo: query.created_to,
      });
    }

    qb.orderBy('execucao.iniciado_em', sortDesc ? 'DESC' : 'ASC');
    qb.skip((page - 1) * pageSize).take(pageSize);

    const [rows, total] = await qb.getManyAndCount();

    const relatorioIds = [
      ...new Set(
        rows
          .filter((row) => row.vinculo.entidadeTipo === 'relatorio')
          .map((row) => Number(row.vinculo.entidadeId)),
      ),
    ];

    const relatorios =
      relatorioIds.length > 0
        ? await this.relatorioRepository.find({
            where: { id: In(relatorioIds) },
          })
        : [];
    const relatoriosById = new Map(
      relatorios.map((relatorio) => [Number(relatorio.id), relatorio]),
    );

    const items: AdminScheduleExecutionItem[] = rows.map((execucao) => {
      const relatorioId =
        execucao.vinculo.entidadeTipo === 'relatorio'
          ? Number(execucao.vinculo.entidadeId)
          : null;
      const relatorio =
        relatorioId != null ? relatoriosById.get(relatorioId) : undefined;

      return {
        id: Number(execucao.id),
        vinculoId: Number(execucao.vinculoId),
        status: execucao.status,
        jobId: execucao.jobId,
        erro: execucao.erro,
        iniciadoEm: execucao.iniciadoEm,
        concluidoEm: execucao.concluidoEm,
        relatorioId,
        relatorioNome: relatorio?.nome ?? null,
        agendamentoNome:
          execucao.vinculo.agendamento?.nome ?? `Agendamento #${execucao.vinculo.agendamentoId}`,
      };
    });

    return { items, page, pageSize, total };
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
