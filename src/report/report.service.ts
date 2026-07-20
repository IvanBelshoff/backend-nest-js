import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Privacidade } from 'src/database/entities/Dashboards';
import { Conexao } from 'src/database/entities/Conexoes';
import {
  EstadoRelatorio,
  ParametroRelatorio,
  Relatorio,
} from 'src/database/entities/Relatorios';
import { Usuario } from 'src/database/entities/Usuarios';
import { UsuarioRelatorio } from 'src/database/entities/UsuarioRelatorio';
import { env } from 'src/shared/env.schema';
import {
  buildRelatorioUsuarioGrants,
  getRelatorioAssignedUsers,
  relatorioHasUserGrant,
  userHasRelatorioGrant,
} from 'src/shared/utils/usuario-relatorio.util';
import { CreateReportDto, UpdateReportDto } from './dto/create-report.dto';
import { ReportSnapshotService } from './report-snapshot.service';
import { SchedulerService } from 'src/scheduler/scheduler.service';
import { AgendamentoVinculoTipo } from 'src/scheduler/entities/scheduler.enums';

interface Requester {
  sub: number;
  email: string;
}

export interface ReportListParams {
  page: number;
  limit: number;
  nome?: string;
  id_criador?: string;
  visivel?: string;
  privacidade?: string;
  temporario?: string;
  expiracao?: string;
  estado?: string;
}

export interface UserPrivateReportListParams {
  page: number;
  limit: number;
  nome?: string;
  favoritos?: boolean;
  privacidade?: 'privado' | 'publico';
  temporario?: boolean;
}

@Injectable()
export class ReportService {
  constructor(
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
    @InjectRepository(Usuario)
    private readonly userRepository: Repository<Usuario>,
    @InjectRepository(UsuarioRelatorio)
    private readonly usuarioRelatorioRepository: Repository<UsuarioRelatorio>,
    @InjectRepository(Conexao)
    private readonly conexaoRepository: Repository<Conexao>,
    @Inject(forwardRef(() => ReportSnapshotService))
    private readonly reportSnapshotService: ReportSnapshotService,
    private readonly schedulerService: SchedulerService,
  ) {}

  async create(dto: CreateReportDto, requester: Requester): Promise<Relatorio> {
    const existing = await this.relatorioRepository.findOne({
      where: { nome: dto.nome },
    });

    if (existing) {
      throw new ConflictException('Já existe relatório com este nome.');
    }

    const conexao = await this.conexaoRepository.findOne({
      where: { id: dto.id_conexao },
    });

    if (!conexao) {
      throw new BadRequestException('Conexão não encontrada.');
    }

    const owner = await this.userRepository.findOne({
      where: { id: requester.sub },
    });

    const fullName = owner ? `${owner.nome} ${owner.sobrenome}` : 'Sistema';

    const relatorio = this.relatorioRepository.create({
      nome: dto.nome,
      icone: dto.icone ?? 'table_chart',
      query: dto.query,
      id_conexao: dto.id_conexao,
      parametros: dto.parametros ?? null,
      temporario: dto.temporario ?? false,
      data_expiracao_inicial: dto.temporario
        ? (dto.data_expiracao_inicial ?? null)
        : null,
      data_expiracao_final: dto.temporario
        ? (dto.data_expiracao_final ?? null)
        : null,
      privacidade: dto.privacidade,
      visivel: dto.visivel ?? false,
      estado: EstadoRelatorio.ONLINE,
      limite_linhas: dto.limite_linhas ?? env.REPORT_QUERY_MAX_ROWS,
      timeout_ms: dto.timeout_ms ?? env.REPORT_QUERY_TIMEOUT_MS,
      id_proprietario: requester.sub,
      usuario_cadastrador: fullName,
      usuario_atualizador: fullName,
    });

    const saved = await this.relatorioRepository.save(relatorio);

    if (owner) {
      await this.usuarioRelatorioRepository.save({
        usuarioId: Number(owner.id),
        relatorioId: Number(saved.id),
        permitirConhecimentoIa: false,
      });
    }

    return saved;
  }

  async findAllPaginated(
    params: ReportListParams,
  ): Promise<{ data: Relatorio[]; total: number }> {
    const query = this.baseQuery();
    this.applyCommonFilters(query, params);
    query.skip((params.page - 1) * params.limit).take(params.limit);
    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  async findAllPrivate(
    userId: number,
    params: UserPrivateReportListParams,
  ): Promise<{ data: Relatorio[]; total: number; favoritos: number[] }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    const query = this.baseQuery();
    this.applyMyReportsAccessRules(query, userId);

    if (params.favoritos) {
      const favoriteIds = user.relatorios_favoritos?.length
        ? user.relatorios_favoritos.map((id) => Number(id))
        : [0];
      query.andWhere('relatorio.id IN (:...favoriteIds)', { favoriteIds });
    }

    if (params.nome) {
      this.applyNameFilter(query, params.nome);
    }

    if (params.privacidade) {
      this.applyPrivacyFilter(query, params.privacidade);
    }

    if (typeof params.temporario === 'boolean') {
      this.applyTemporaryFilter(query, params.temporario ? 'sim' : 'nao');
    }

    query.skip((params.page - 1) * params.limit).take(params.limit);
    const [data, total] = await query.getManyAndCount();
    const dataWithAiKnowledge = data.map((relatorio) =>
      this.attachAiKnowledgeFlag(relatorio, userId),
    );

    return {
      data: dataWithAiKnowledge,
      total,
      favoritos: user.relatorios_favoritos ?? [],
    };
  }

  async findAllPublic(
    page: number,
    limit: number,
    nome?: string,
  ): Promise<{ data: Relatorio[]; total: number }> {
    const query = this.baseQuery();
    this.applyPublicAccessRules(query);
    this.applyNameFilter(query, nome);
    query.skip((page - 1) * limit).take(limit);
    const [data, total] = await query.getManyAndCount();
    return { data, total };
  }

  async getFilters(params: ReportListParams) {
    const query = this.baseQuery();
    this.applyCommonFilters(query, params);
    const relatorios = await query.getMany();

    const nomes = new Set<string>();
    const idsCriador = new Set<number>();
    const estados = new Set<string>();

    for (const relatorio of relatorios) {
      if (relatorio.nome) nomes.add(relatorio.nome);
      if (relatorio.id_proprietario) idsCriador.add(relatorio.id_proprietario);
      estados.add(relatorio.estado);
    }

    const nomesArray = [...nomes].sort();
    const idsCriadorArray = [...idsCriador].sort((a, b) => a - b);
    const estadosArray = [...estados].sort();

    return {
      nomes: nomesArray,
      nomesCount: nomesArray.length,
      ids_criador: idsCriadorArray,
      ids_criadorCount: idsCriadorArray.length,
      estados: estadosArray,
      estadosCount: estadosArray.length,
    };
  }

  async findPublicById(id: number): Promise<Relatorio> {
    const relatorio = await this.relatorioRepository.findOne({
      where: { id },
      relations: { conexao: true },
    });

    if (!relatorio) {
      throw new NotFoundException('Relatório não localizado');
    }

    if (relatorio.privacidade === Privacidade.PRIVAT) {
      throw new ForbiddenException('Permissão negada: o relatório está privado');
    }

    this.assertNotExpired(relatorio);
    return relatorio;
  }

  async findPrivateById(id: number, userId: number): Promise<Relatorio> {
    const relatorio = await this.findAccessibleById(id, userId);
    this.assertNotExpired(relatorio);
    return this.attachAiKnowledgeFlag(relatorio, userId);
  }

  async findById(id: number, userId: number): Promise<Relatorio> {
    return this.findAccessibleById(id, userId);
  }

  async getStatus(id: number, userId: number) {
    const relatorio = await this.findAccessibleById(id, userId);
    return {
      estado: relatorio.estado,
      snapshot_atualizado_em: relatorio.snapshot_atualizado_em,
      snapshot_valido: relatorio.snapshot_valido,
      erro_ultima_geracao: relatorio.erro_ultima_geracao,
    };
  }

  async update(
    id: number,
    dto: UpdateReportDto,
    requester: Requester,
  ): Promise<{ relatorio: Relatorio; shouldGenerateSnapshot: boolean }> {
    const relatorio = await this.relatorioRepository.findOne({
      where: { id },
      relations: { conexao: true },
    });

    if (!relatorio) {
      throw new NotFoundException('Relatório não localizado');
    }

    const user = await this.userRepository.findOne({
      where: { id: requester.sub },
      relations: { regra: true },
    });

    const isAdmin = (user?.regra ?? []).some(
      (regra) => regra.nome === 'REGRA_ADMIN',
    );
    const isOwner = relatorio.id_proprietario === Number(user?.id);

    if (dto.privacidade && !isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Usuário não possui permissão para alterar a privacidade deste relatório',
      );
    }

    if (dto.nome && dto.nome !== relatorio.nome) {
      const duplicate = await this.relatorioRepository.findOne({
        where: { nome: dto.nome },
      });

      if (duplicate) {
        throw new ConflictException('Já existe relatório com este nome.');
      }
    }

    if (dto.id_conexao) {
      const conexao = await this.conexaoRepository.findOne({
        where: { id: dto.id_conexao },
      });

      if (!conexao) {
        throw new BadRequestException('Conexão não encontrada.');
      }
    }

    const snapshotAffectingChange =
      (dto.query !== undefined && dto.query !== relatorio.query) ||
      (dto.parametros !== undefined &&
        JSON.stringify(dto.parametros) !== JSON.stringify(relatorio.parametros)) ||
      (dto.id_conexao !== undefined && dto.id_conexao !== relatorio.id_conexao) ||
      (dto.limite_linhas !== undefined &&
        dto.limite_linhas !== relatorio.limite_linhas);

    if (snapshotAffectingChange && relatorio.estado === EstadoRelatorio.OFFLINE) {
      relatorio.snapshot_valido = false;
    }

    relatorio.nome = dto.nome ?? relatorio.nome;
    relatorio.icone = dto.icone ?? relatorio.icone;
    relatorio.query = dto.query ?? relatorio.query;
    relatorio.id_conexao = dto.id_conexao ?? relatorio.id_conexao;

    if (dto.parametros !== undefined) {
      relatorio.parametros = dto.parametros as ParametroRelatorio[] | null;
    }

    relatorio.privacidade = dto.privacidade ?? relatorio.privacidade;
    relatorio.visivel = dto.visivel ?? relatorio.visivel;
    relatorio.limite_linhas = dto.limite_linhas ?? relatorio.limite_linhas;
    relatorio.timeout_ms = dto.timeout_ms ?? relatorio.timeout_ms;

    const novoTemporario = dto.temporario ?? relatorio.temporario;
    relatorio.temporario = novoTemporario;
    relatorio.data_expiracao_inicial = novoTemporario
      ? (dto.data_expiracao_inicial ?? relatorio.data_expiracao_inicial)
      : null;
    relatorio.data_expiracao_final = novoTemporario
      ? (dto.data_expiracao_final ?? relatorio.data_expiracao_final)
      : null;

    let shouldGenerateSnapshot = false;

    if (dto.estado === EstadoRelatorio.OFFLINE) {
      relatorio.estado = EstadoRelatorio.GERANDO_SNAPSHOT;
      relatorio.erro_ultima_geracao = null;
      shouldGenerateSnapshot = true;
    } else if (dto.estado === EstadoRelatorio.ONLINE) {
      relatorio.estado = EstadoRelatorio.ONLINE;
      await this.reportSnapshotService.deleteSnapshot(id);
      await this.schedulerService.pauseVinculoByEntity(
        'relatorio',
        id,
        AgendamentoVinculoTipo.REPORT_SNAPSHOT_REFRESH,
      );
    } else if (dto.estado) {
      relatorio.estado = dto.estado;
    }

    relatorio.usuario_atualizador = user
      ? `${user.nome} ${user.sobrenome}`
      : relatorio.usuario_atualizador;

    const saved = await this.relatorioRepository.save(relatorio);
    return { relatorio: saved, shouldGenerateSnapshot };
  }

  async rollbackSnapshotEnqueue(id: number, message: string): Promise<void> {
    const relatorio = await this.relatorioRepository.findOne({ where: { id } });

    if (!relatorio) {
      return;
    }

    relatorio.estado = EstadoRelatorio.ONLINE;
    relatorio.erro_ultima_geracao = message;
    await this.relatorioRepository.save(relatorio);
  }

  async startSnapshotRefresh(
    id: number,
    requester: Requester,
    parametrosSnapshot: Record<string, unknown>,
  ): Promise<{ relatorio: Relatorio; jobId: string }> {
    const relatorio = await this.relatorioRepository.findOne({ where: { id } });

    if (!relatorio) {
      throw new NotFoundException('Relatório não localizado');
    }

    if (relatorio.estado === EstadoRelatorio.GERANDO_SNAPSHOT) {
      throw new BadRequestException('Snapshot já está sendo gerado');
    }

    relatorio.estado = EstadoRelatorio.GERANDO_SNAPSHOT;
    relatorio.erro_ultima_geracao = null;
    await this.relatorioRepository.save(relatorio);

    try {
      const jobId = await this.reportSnapshotService.scheduleSnapshotGeneration(
        id,
        requester.sub,
        parametrosSnapshot,
      );

      return { relatorio, jobId };
    } catch (error) {
      relatorio.estado = EstadoRelatorio.ONLINE;
      relatorio.erro_ultima_geracao =
        error instanceof Error
          ? error.message
          : 'Falha ao enfileirar geração de snapshot';
      await this.relatorioRepository.save(relatorio);
      throw error;
    }
  }

  async getRelatoriosByUser(userId: number) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { usuarioRelatorios: { relatorio: true } },
    });

    if (!user) {
      throw new NotFoundException('Usuario não localizado');
    }

    const relatorios = (user.usuarioRelatorios ?? [])
      .map((grant) => {
        if (!grant.relatorio) {
          return null;
        }

        return {
          ...grant.relatorio,
          permitirConhecimentoIa: grant.permitirConhecimentoIa,
        };
      })
      .filter((relatorio): relatorio is Relatorio & { permitirConhecimentoIa: boolean } => {
        return (
          relatorio != null && relatorio.privacidade === Privacidade.PRIVAT
        );
      })
      .sort((left, right) => left.nome.localeCompare(right.nome));

    const relatoriosDisponiveis = await this.relatorioRepository
      .createQueryBuilder('relatorio')
      .where('relatorio.privacidade = :privacidade', {
        privacidade: Privacidade.PRIVAT,
      })
      .andWhere(
        '(relatorio.id_proprietario IS NULL OR relatorio.id_proprietario != :userId)',
        { userId },
      )
      .andWhere(
        `NOT EXISTS (
          SELECT 1
          FROM usuarios_relatorios usuariosRelatorios
          WHERE usuariosRelatorios.relatorio_id = relatorio.id
            AND usuariosRelatorios.usuario_id = :userId
        )`,
        { userId },
      )
      .orderBy('relatorio.nome', 'ASC')
      .getMany();

    return { relatorios, relatoriosDisponiveis };
  }

  async assignUsers(
    relatorioId: number,
    usuarios: Array<{ id: number; permitirConhecimentoIa?: boolean }>,
  ): Promise<void> {
    await this.relatorioRepository.manager.transaction(async (manager) => {
      const relatorioRepository = manager.getRepository(Relatorio);
      const userRepository = manager.getRepository(Usuario);
      const usuarioRelatorioRepository =
        manager.getRepository(UsuarioRelatorio);

      const relatorio = await relatorioRepository.findOne({
        where: { id: relatorioId },
        relations: { usuarioRelatorios: true },
      });

      if (!relatorio) {
        throw new NotFoundException('Relatório não localizado');
      }

      const usuarioIds = usuarios.map((item) => item.id);

      if (
        relatorio.id_proprietario &&
        !usuarioIds.includes(relatorio.id_proprietario)
      ) {
        throw new BadRequestException(
          'Usuário proprietário não pode ser removido da lista de permissão',
        );
      }

      if (relatorio.privacidade === Privacidade.PUBLIC) {
        throw new BadRequestException(
          'Operação não permitida pois o relatório está público',
        );
      }

      const users = usuarioIds.length
        ? await userRepository.find({ where: { id: In(usuarioIds) } })
        : [];

      if (users.length !== usuarioIds.length) {
        throw new BadRequestException('Algum usuário não foi encontrado.');
      }

      const blocked = users.find(
        (user) =>
          user.bloqueado && !relatorioHasUserGrant(relatorio, Number(user.id)),
      );

      if (blocked) {
        throw new BadRequestException(
          `Usuário ${blocked.nome} já está bloqueado`,
        );
      }

      await usuarioRelatorioRepository.delete({ relatorioId });
      if (usuarios.length > 0) {
        const grants = buildRelatorioUsuarioGrants(
          relatorioId,
          usuarios,
          relatorio.usuarioRelatorios ?? [],
        );
        await usuarioRelatorioRepository.save(grants);
      }
    });
  }

  async delete(id: number): Promise<void> {
    await this.relatorioRepository.manager.transaction(async (manager) => {
      const relatorioRepository = manager.getRepository(Relatorio);
      const userRepository = manager.getRepository(Usuario);

      const relatorio = await relatorioRepository.findOne({
        where: { id },
        relations: { usuarioRelatorios: { usuario: true } },
      });

      if (!relatorio) {
        throw new NotFoundException('Relatório não localizado');
      }

      for (const grant of relatorio.usuarioRelatorios ?? []) {
        const user = grant.usuario;
        if (!user) continue;
        if (user.relatorios_favoritos?.includes(id)) {
          user.relatorios_favoritos = user.relatorios_favoritos.filter(
            (relatorioId) => relatorioId !== id,
          );
          await userRepository.save(user);
        }
      }

      await manager.getRepository(UsuarioRelatorio).delete({ relatorioId: id });
      await relatorioRepository.delete({ id });
    });

    await this.reportSnapshotService.deleteSnapshot(id);
  }

  private async findAccessibleById(
    id: number,
    userId: number,
  ): Promise<Relatorio> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { usuarioRelatorios: true, regra: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    const relatorio = await this.relatorioRepository.findOne({
      where: { id },
      relations: { usuarioRelatorios: { usuario: { foto: true } }, conexao: true },
    });

    if (!relatorio) {
      throw new NotFoundException('Relatório não localizado');
    }

    const associado = userHasRelatorioGrant(user, relatorio.id);
    const admin = this.isAdminOrReportRole(user);
    const proprietario = relatorio.id_proprietario === Number(user.id);

    if (
      (!associado &&
        !admin &&
        !proprietario &&
        relatorio.privacidade === Privacidade.PRIVAT) ||
      user.bloqueado
    ) {
      throw new ForbiddenException(
        'Permissão negada: o usuário não possui acesso a este relatório',
      );
    }

    return relatorio;
  }

  private attachAiKnowledgeFlag(
    relatorio: Relatorio,
    userId: number,
  ): Relatorio & { permitir_conhecimento_ia: boolean } {
    const grant = relatorio.usuarioRelatorios?.find(
      (usuarioRelatorio) =>
        Number(usuarioRelatorio.usuarioId) === Number(userId),
    );

    return {
      ...relatorio,
      permitir_conhecimento_ia: grant?.permitirConhecimentoIa ?? false,
    };
  }

  private baseQuery(): SelectQueryBuilder<Relatorio> {
    return this.relatorioRepository
      .createQueryBuilder('relatorio')
      .leftJoinAndSelect('relatorio.usuarioRelatorios', 'usuarioRelatorio')
      .leftJoinAndSelect('usuarioRelatorio.usuario', 'usuario')
      .leftJoinAndSelect('relatorio.conexao', 'conexao')
      .orderBy('relatorio.nome', 'ASC');
  }

  private isAdminOrReportRole(user: Usuario): boolean {
    return (user.regra ?? []).some(
      (regra) =>
        regra.nome === 'REGRA_ADMIN' || regra.nome === 'REGRA_RELATORIO',
    );
  }

  private assertNotExpired(relatorio: Relatorio): void {
    if (!relatorio.temporario) return;

    const now = new Date();

    if (
      relatorio.data_expiracao_final &&
      new Date(relatorio.data_expiracao_final) < now
    ) {
      throw new ForbiddenException('Relatório expirado');
    }

    if (
      relatorio.data_expiracao_inicial &&
      new Date(relatorio.data_expiracao_inicial) > now
    ) {
      throw new ForbiddenException('Relatório ainda não disponível');
    }
  }

  private applyNameFilter(
    query: SelectQueryBuilder<Relatorio>,
    nome?: string,
  ): void {
    if (typeof nome === 'string' && nome.length > 0) {
      query.andWhere('LOWER(relatorio.nome) LIKE LOWER(:nome)', {
        nome: `%${nome}%`,
      });
    }
  }

  private applyOwnerFilter(
    query: SelectQueryBuilder<Relatorio>,
    idCriador?: string,
  ): void {
    if (typeof idCriador === 'string' && idCriador.length > 0) {
      query.andWhere('relatorio.id_proprietario = :idProprietario', {
        idProprietario: Number(idCriador),
      });
    }
  }

  private applyVisibilityFilter(
    query: SelectQueryBuilder<Relatorio>,
    visivel?: string,
  ): void {
    if (visivel === 'sim') {
      query.andWhere('relatorio.visivel = :visivel', { visivel: true });
    } else if (visivel === 'nao') {
      query.andWhere('relatorio.visivel = :visivel', { visivel: false });
    }
  }

  private applyTemporaryFilter(
    query: SelectQueryBuilder<Relatorio>,
    temporario?: string,
  ): void {
    if (temporario === 'sim') {
      query.andWhere('relatorio.temporario = :temporario', { temporario: true });
    } else if (temporario === 'nao') {
      query.andWhere('relatorio.temporario = :temporario', {
        temporario: false,
      });
    }
  }

  private applyPrivacyFilter(
    query: SelectQueryBuilder<Relatorio>,
    privacidade?: string,
  ): void {
    if (privacidade === 'privado') {
      query.andWhere('relatorio.privacidade = :privacidade', {
        privacidade: Privacidade.PRIVAT,
      });
    } else if (privacidade === 'publico') {
      query.andWhere('relatorio.privacidade = :privacidade', {
        privacidade: Privacidade.PUBLIC,
      });
    }
  }

  private applyExpirationFilter(
    query: SelectQueryBuilder<Relatorio>,
    expiracao?: string,
  ): void {
    if (typeof expiracao !== 'string' || expiracao.length === 0) return;

    const now = new Date();
    query.andWhere('relatorio.temporario = true');

    switch (expiracao) {
      case 'vencidos':
        query.andWhere('relatorio.data_expiracao_final <= :date', {
          date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        });
        break;
      case 'expirados':
        query.andWhere(
          "relatorio.data_expiracao_final <= :now AND relatorio.data_expiracao_final + INTERVAL '1 month' > :now",
          { now },
        );
        break;
      case 'aexpirar':
        query.andWhere(
          "relatorio.data_expiracao_final - INTERVAL '1 month' <= :now AND relatorio.data_expiracao_final > :now",
          { now },
        );
        break;
      case 'validos':
        query.andWhere(
          "relatorio.data_expiracao_final > :now AND relatorio.data_expiracao_final - INTERVAL '1 month' > :now",
          { now },
        );
        break;
    }
  }

  private applyStateFilter(
    query: SelectQueryBuilder<Relatorio>,
    estado?: string,
  ): void {
    if (estado) {
      query.andWhere('relatorio.estado = :estado', { estado });
    }
  }

  private applyCommonFilters(
    query: SelectQueryBuilder<Relatorio>,
    params: ReportListParams,
  ): void {
    this.applyNameFilter(query, params.nome);
    this.applyOwnerFilter(query, params.id_criador);
    this.applyVisibilityFilter(query, params.visivel);
    this.applyPrivacyFilter(query, params.privacidade);
    this.applyTemporaryFilter(query, params.temporario);
    this.applyExpirationFilter(query, params.expiracao);
    this.applyStateFilter(query, params.estado);
  }

  private applyMyReportsAccessRules(
    query: SelectQueryBuilder<Relatorio>,
    userId: number,
  ): void {
    const now = new Date();

    query
      .distinct(true)
      .where('relatorio.visivel = :visivel', { visivel: true })
      .andWhere(
        '(relatorio.temporario = false OR (relatorio.temporario = true AND :now >= relatorio.data_expiracao_inicial AND :now <= relatorio.data_expiracao_final))',
        { now },
      )
      .andWhere(
        `(
          relatorio.privacidade = :publico
          OR (relatorio.privacidade = :privado AND usuarioRelatorio.usuario_id = :userId)
        )`,
        {
          publico: Privacidade.PUBLIC,
          privado: Privacidade.PRIVAT,
          userId,
        },
      );
  }

  private applyPublicAccessRules(query: SelectQueryBuilder<Relatorio>): void {
    query
      .where('relatorio.privacidade = :privacidade', {
        privacidade: Privacidade.PUBLIC,
      })
      .andWhere('relatorio.visivel = :visivel', { visivel: true })
      .andWhere(
        '(relatorio.temporario = false OR (relatorio.temporario = true AND :now >= relatorio.data_expiracao_inicial AND :now <= relatorio.data_expiracao_final))',
        { now: new Date() },
      );
  }
}
