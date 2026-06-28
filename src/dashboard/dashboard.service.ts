import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Dashboard, Privacidade } from 'src/database/entities/Dashboards';
import { Usuario } from 'src/database/entities/Usuarios';
import { CreateDashboardDto } from './dto/create-dashboard.dto';
import { UpdateDashboardDto } from './dto/update-dashboard.dto';

interface Requester {
  sub: number;
  email: string;
}

export interface DashboardListParams {
  page: number;
  limit: number;
  nome?: string;
  id_criador?: string;
  visivel?: string;
  privacidade?: string;
  temporario?: string;
  expiracao?: string;
}

export interface DashboardFilters {
  nomes: string[];
  nomesCount: number;
  ids_criador: number[];
  ids_criadorCount: number;
  visiveis: string[];
  visiveisCount: number;
  privacidades: string[];
  privacidadesCount: number;
  temporarios: string[];
  temporariosCount: number;
  expiracoes: string[];
  expiracoesCount: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject('DASHBOARD_REPOSITORY')
    private dashboardRepository: Repository<Dashboard>,
    @Inject('USER_REPOSITORY')
    private userRepository: Repository<Usuario>,
  ) {}

  async create(
    dto: CreateDashboardDto,
    requester: Requester,
  ): Promise<Dashboard> {
    const existing = await this.dashboardRepository.find({
      where: [{ nome: dto.nome }, { url: dto.url }],
    });

    if (existing.length > 0) {
      const errors: { nome?: string; url?: string } = {};

      if (existing.some((dash) => dash.nome === dto.nome)) {
        errors.nome = 'Já existe Dashboard com este nome.';
      }

      if (existing.some((dash) => dash.url === dto.url)) {
        errors.url = 'Já existe Dashboard com esta URL.';
      }

      throw new ConflictException({
        message: 'Dashboard já cadastrado com essas informações.',
        errors,
      });
    }

    const owner = await this.userRepository.findOne({
      where: { id: requester.sub },
    });

    const fullName = owner ? `${owner.nome} ${owner.sobrenome}` : 'Sistema';

    const dashboard = this.dashboardRepository.create({
      ...dto,
      data_expiracao_inicial: dto.temporario
        ? (dto.data_expiracao_inicial ?? null)
        : null,
      data_expiracao_final: dto.temporario
        ? (dto.data_expiracao_final ?? null)
        : null,
      id_proprietario: requester.sub,
      usuario_cadastrador: fullName,
      usuario_atualizador: fullName,
      usuario: owner ? [owner] : [],
    });

    return this.dashboardRepository.save(dashboard);
  }

  async findAllPaginated(
    params: DashboardListParams,
  ): Promise<{ data: Dashboard[]; total: number }> {
    const query = this.baseQuery();

    this.applyNameFilter(query, params.nome);
    this.applyOwnerFilter(query, params.id_criador);
    this.applyVisibilityFilter(query, params.visivel);
    this.applyPrivacyFilter(query, params.privacidade);
    this.applyTemporaryFilter(query, params.temporario);
    this.applyExpirationFilter(query, params.expiracao);

    query.skip((params.page - 1) * params.limit).take(params.limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total };
  }

  async findAllPrivate(
    userId: number,
    page: number,
    limit: number,
    nome?: string,
    favoritos?: boolean,
  ): Promise<{ data: Dashboard[]; total: number; favoritos: number[] }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    const query = this.baseQuery();

    this.applyPrivateAccessRules(query, userId);

    if (favoritos) {
      const favoriteIds = user.dashboards_favoritos?.length
        ? user.dashboards_favoritos.map((id) => Number(id))
        : [0];
      query.andWhere('dashboard.id IN (:...favoriteIds)', { favoriteIds });
    }

    this.applyNameFilter(query, nome);

    query.skip((page - 1) * limit).take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total, favoritos: user.dashboards_favoritos ?? [] };
  }

  async findAllPublic(
    page: number,
    limit: number,
    nome?: string,
  ): Promise<{ data: Dashboard[]; total: number }> {
    const query = this.baseQuery();

    this.applyPublicAccessRules(query);
    this.applyNameFilter(query, nome);

    query.skip((page - 1) * limit).take(limit);

    const [data, total] = await query.getManyAndCount();

    return { data, total };
  }

  async getFilters(params: DashboardListParams): Promise<DashboardFilters> {
    const query = this.baseQuery();

    this.applyNameFilter(query, params.nome);
    this.applyOwnerFilter(query, params.id_criador);
    this.applyVisibilityFilter(query, params.visivel);
    this.applyPrivacyFilter(query, params.privacidade);
    this.applyTemporaryFilter(query, params.temporario);
    this.applyExpirationFilter(query, params.expiracao);

    const dashboards = await query.getMany();

    const nomes = new Set<string>();
    const idsCriador = new Set<number>();
    const visiveis = new Set<string>();
    const privacidades = new Set<string>();
    const temporarios = new Set<string>();
    const expiracoes = new Set<string>();

    const now = new Date();
    const month = 30 * 24 * 60 * 60 * 1000;

    for (const dash of dashboards) {
      if (dash.nome) nomes.add(dash.nome);
      if (dash.id_proprietario) idsCriador.add(dash.id_proprietario);
      visiveis.add(String(Boolean(dash.visivel)));
      if (dash.privacidade) privacidades.add(dash.privacidade);
      temporarios.add(String(Boolean(dash.temporario)));

      if (dash.temporario && dash.data_expiracao_final) {
        const garantia = new Date(dash.data_expiracao_final);

        if (garantia <= new Date(now.getTime() - month)) {
          expiracoes.add('vencidos');
        } else if (garantia <= now && garantia.getTime() + month > now.getTime()) {
          expiracoes.add('expirados');
        } else if (
          garantia.getTime() - month <= now.getTime() &&
          garantia > now
        ) {
          expiracoes.add('aexpirar');
        } else if (garantia.getTime() - month > now.getTime()) {
          expiracoes.add('validos');
        }
      }
    }

    const nomesArray = [...nomes].sort();
    const idsCriadorArray = [...idsCriador].sort((a, b) => a - b);
    const visiveisArray = [...visiveis].sort();
    const privacidadesArray = [...privacidades].sort();
    const temporariosArray = [...temporarios].sort();
    const expiracoesArray = [...expiracoes].sort();

    return {
      nomes: nomesArray,
      nomesCount: nomesArray.length,
      ids_criador: idsCriadorArray,
      ids_criadorCount: idsCriadorArray.length,
      visiveis: visiveisArray,
      visiveisCount: visiveisArray.length,
      privacidades: privacidadesArray,
      privacidadesCount: privacidadesArray.length,
      temporarios: temporariosArray,
      temporariosCount: temporariosArray.length,
      expiracoes: expiracoesArray,
      expiracoesCount: expiracoesArray.length,
    };
  }

  async findPublicById(id: number): Promise<Dashboard> {
    const dashboard = await this.dashboardRepository.findOne({ where: { id } });

    if (!dashboard) {
      throw new NotFoundException('Dashboard não localizado');
    }

    if (dashboard.privacidade === Privacidade.PRIVAT) {
      throw new ForbiddenException('Permissão negada: o Dashboard está privado');
    }

    this.assertNotExpired(dashboard);

    return dashboard;
  }

  async findPrivateById(id: number, userId: number): Promise<Dashboard> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { dashboard: true, regra: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    const dashboard = await this.dashboardRepository.findOne({
      where: { id },
      relations: { usuario: true },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard não localizado');
    }

    this.assertNotExpired(dashboard);

    const associado = user.dashboard.some((dash) => dash.id === dashboard.id);
    const admin = this.isAdminOrDashboardRole(user);
    const proprietario = dashboard.id_proprietario === Number(user.id);

    if (
      (!associado &&
        !admin &&
        !proprietario &&
        dashboard.privacidade === Privacidade.PRIVAT) ||
      user.bloqueado
    ) {
      throw new ForbiddenException(
        'Permissão negada: o usuário não possui acesso a este dashboard',
      );
    }

    if (
      associado ||
      admin ||
      proprietario ||
      dashboard.privacidade === Privacidade.PUBLIC
    ) {
      return dashboard;
    }

    throw new NotFoundException('Registro não encontrado');
  }

  async findById(id: number, userId: number): Promise<Dashboard> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { dashboard: true, regra: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    const dashboard = await this.dashboardRepository.findOne({
      where: { id },
      relations: { usuario: true },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard não localizado');
    }

    const associado = user.dashboard.some((dash) => dash.id === dashboard.id);
    const admin = this.isAdminOrDashboardRole(user);
    const proprietario = dashboard.id_proprietario === Number(user.id);

    if ((!associado && !admin && !proprietario) || user.bloqueado) {
      throw new ForbiddenException(
        'Permissão negada: o usuário não possui acesso a este dashboard',
      );
    }

    return dashboard;
  }

  async update(
    id: number,
    dto: UpdateDashboardDto,
    requester: Requester,
  ): Promise<Dashboard> {
    const dashboard = await this.dashboardRepository.findOne({ where: { id } });

    if (!dashboard) {
      throw new NotFoundException('Dashboard não localizado');
    }

    const user = await this.userRepository.findOne({
      where: { id: requester.sub },
      relations: { regra: true },
    });

    const isAdmin = (user?.regra ?? []).some(
      (regra) => regra.nome === 'REGRA_ADMIN',
    );

    const isOwner = dashboard.id_proprietario === Number(user?.id);

    if (dto.privacidade && !isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Usuário não possui permissão para alterar a privacidade deste dashboard',
      );
    }

    if (
      dashboard.privacidade === Privacidade.PRIVAT &&
      dashboard.id_proprietario &&
      !isOwner &&
      !isAdmin
    ) {
      throw new ForbiddenException(
        'Usuário não possui permissão para editar este dashboard',
      );
    }

    if (dto.nome || dto.url) {
      const duplicates = await this.dashboardRepository.find({
        where: [
          dto.nome ? { nome: dto.nome } : {},
          dto.url ? { url: dto.url } : {},
        ],
      });

      const errors: { nome?: string; url?: string } = {};

      for (const dash of duplicates) {
        if (Number(dash.id) === Number(id)) continue;
        if (dto.nome && dash.nome === dto.nome) {
          errors.nome = 'Já existe dashboard com este nome.';
        }
        if (dto.url && dash.url === dto.url) {
          errors.url = 'Já existe dashboard com esta URL.';
        }
      }

      if (errors.nome || errors.url) {
        throw new ConflictException({
          message: 'Dashboard já cadastrado com essas informações.',
          errors,
        });
      }
    }

    const novoTemporario = dto.temporario ?? dashboard.temporario;

    dashboard.nome = dto.nome ?? dashboard.nome;
    dashboard.url = dto.url ?? dashboard.url;
    dashboard.icone = dto.icone ?? dashboard.icone;
    dashboard.query =
      dto.query !== undefined ? (dto.query ?? undefined) : dashboard.query;
    dashboard.privacidade = dto.privacidade ?? dashboard.privacidade;
    dashboard.visivel = dto.visivel ?? dashboard.visivel;
    dashboard.temporario = novoTemporario;
    dashboard.data_expiracao_inicial = novoTemporario
      ? (dto.data_expiracao_inicial ?? dashboard.data_expiracao_inicial)
      : null;
    dashboard.data_expiracao_final = novoTemporario
      ? (dto.data_expiracao_final ?? dashboard.data_expiracao_final)
      : null;
    dashboard.usuario_atualizador = user
      ? `${user.nome} ${user.sobrenome}`
      : dashboard.usuario_atualizador;

    return this.dashboardRepository.save(dashboard);
  }

  async assignUsers(dashboardId: number, usuarios: number[]): Promise<void> {
    await this.dashboardRepository.manager.transaction(async (manager) => {
      const dashboardRepository = manager.getRepository(Dashboard);
      const userRepository = manager.getRepository(Usuario);

      const dashboard = await dashboardRepository.findOne({
        where: { id: dashboardId },
        relations: { usuario: true },
      });

      if (!dashboard) {
        throw new NotFoundException('Dashboard não localizado');
      }

      if (
        dashboard.id_proprietario &&
        !usuarios.includes(dashboard.id_proprietario)
      ) {
        throw new BadRequestException(
          'Usuário proprietário não pode ser removido da lista de permissão',
        );
      }

      if (dashboard.privacidade === Privacidade.PUBLIC) {
        throw new BadRequestException(
          'Operação não permitida pois o dashboard está público',
        );
      }

      const users = usuarios.length
        ? await userRepository.find({ where: { id: In(usuarios) } })
        : [];

      if (users.length !== usuarios.length) {
        throw new BadRequestException('Algum usuário não foi encontrado.');
      }

      const blocked = users.find(
        (user) =>
          user.bloqueado &&
          !dashboard.usuario.some((associado) => associado.id === user.id),
      );

      if (blocked) {
        throw new BadRequestException(
          `Usuário ${blocked.nome} já está bloqueado`,
        );
      }

      dashboard.usuario = users;

      await dashboardRepository.save(dashboard);
    });
  }

  async delete(id: number): Promise<void> {
    await this.dashboardRepository.manager.transaction(async (manager) => {
      const dashboardRepository = manager.getRepository(Dashboard);
      const userRepository = manager.getRepository(Usuario);

      const dashboard = await dashboardRepository.findOne({
        where: { id },
        relations: { usuario: true },
      });

      if (!dashboard) {
        throw new NotFoundException('Dashboard não localizado');
      }

      for (const user of dashboard.usuario ?? []) {
        if (user.dashboards_favoritos?.includes(id)) {
          user.dashboards_favoritos = user.dashboards_favoritos.filter(
            (dashboardId) => dashboardId !== id,
          );
          await userRepository.save(user);
        }
      }

      dashboard.usuario = [];
      await dashboardRepository.save(dashboard);

      await dashboardRepository.delete({ id });
    });
  }

  private baseQuery(): SelectQueryBuilder<Dashboard> {
    return this.dashboardRepository
      .createQueryBuilder('dashboard')
      .leftJoinAndSelect('dashboard.usuario', 'usuario')
      .orderBy('dashboard.nome', 'ASC');
  }

  private isAdminOrDashboardRole(user: Usuario): boolean {
    return (user.regra ?? []).some(
      (regra) =>
        regra.nome === 'REGRA_ADMIN' || regra.nome === 'REGRA_DASHBOARD',
    );
  }

  private assertNotExpired(dashboard: Dashboard): void {
    if (!dashboard.temporario) {
      return;
    }

    const now = new Date();

    if (
      dashboard.data_expiracao_final &&
      new Date(dashboard.data_expiracao_final) < now
    ) {
      throw new ForbiddenException('Dashboard expirado');
    }

    if (
      dashboard.data_expiracao_inicial &&
      new Date(dashboard.data_expiracao_inicial) > now
    ) {
      throw new ForbiddenException('Dashboard ainda não disponível');
    }
  }

  private applyNameFilter(
    query: SelectQueryBuilder<Dashboard>,
    nome?: string,
  ): void {
    if (typeof nome === 'string' && nome.length > 0) {
      query.andWhere('LOWER(dashboard.nome) LIKE LOWER(:nome)', {
        nome: `%${nome}%`,
      });
    }
  }

  private applyOwnerFilter(
    query: SelectQueryBuilder<Dashboard>,
    idCriador?: string,
  ): void {
    if (typeof idCriador === 'string' && idCriador.length > 0) {
      query.andWhere('dashboard.id_proprietario = :idProprietario', {
        idProprietario: Number(idCriador),
      });
    }
  }

  private applyVisibilityFilter(
    query: SelectQueryBuilder<Dashboard>,
    visivel?: string,
  ): void {
    if (visivel === 'sim') {
      query.andWhere('dashboard.visivel = :visivel', { visivel: true });
    } else if (visivel === 'nao') {
      query.andWhere('dashboard.visivel = :visivel', { visivel: false });
    }
  }

  private applyTemporaryFilter(
    query: SelectQueryBuilder<Dashboard>,
    temporario?: string,
  ): void {
    if (temporario === 'sim') {
      query.andWhere('dashboard.temporario = :temporario', {
        temporario: true,
      });
    } else if (temporario === 'nao') {
      query.andWhere('dashboard.temporario = :temporario', {
        temporario: false,
      });
    }
  }

  private applyPrivacyFilter(
    query: SelectQueryBuilder<Dashboard>,
    privacidade?: string,
  ): void {
    if (privacidade === 'privado') {
      query.andWhere('dashboard.privacidade = :privacidade', {
        privacidade: Privacidade.PRIVAT,
      });
    } else if (privacidade === 'publico') {
      query.andWhere('dashboard.privacidade = :privacidade', {
        privacidade: Privacidade.PUBLIC,
      });
    }
  }

  private applyExpirationFilter(
    query: SelectQueryBuilder<Dashboard>,
    expiracao?: string,
  ): void {
    if (typeof expiracao !== 'string' || expiracao.length === 0) {
      return;
    }

    const now = new Date();

    query.andWhere('dashboard.temporario = true');

    switch (expiracao) {
      case 'vencidos':
        query.andWhere('dashboard.data_expiracao_final <= :date', {
          date: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        });
        break;
      case 'expirados':
        query.andWhere(
          "dashboard.data_expiracao_final <= :now AND dashboard.data_expiracao_final + INTERVAL '1 month' > :now",
          { now },
        );
        break;
      case 'aexpirar':
        query.andWhere(
          "dashboard.data_expiracao_final - INTERVAL '1 month' <= :now AND dashboard.data_expiracao_final > :now",
          { now },
        );
        break;
      case 'validos':
        query.andWhere(
          "dashboard.data_expiracao_final > :now AND dashboard.data_expiracao_final - INTERVAL '1 month' > :now",
          { now },
        );
        break;
    }
  }

  private applyPrivateAccessRules(
    query: SelectQueryBuilder<Dashboard>,
    userId: number,
  ): void {
    query
      .where('dashboard.visivel = :visivel', { visivel: true })
      .andWhere('dashboard.privacidade = :privado', {
        privado: Privacidade.PRIVAT,
      })
      .andWhere('usuario.id = :userId', { userId })
      .andWhere(
        '(dashboard.temporario = false OR (dashboard.temporario = true AND :now >= dashboard.data_expiracao_inicial AND :now <= dashboard.data_expiracao_final))',
        { now: new Date() },
      );
  }

  private applyPublicAccessRules(query: SelectQueryBuilder<Dashboard>): void {
    query
      .where('dashboard.privacidade = :privacidade', {
        privacidade: Privacidade.PUBLIC,
      })
      .andWhere('dashboard.visivel = :visivel', { visivel: true })
      .andWhere(
        '(dashboard.temporario = false OR (dashboard.temporario = true AND :now >= dashboard.data_expiracao_inicial AND :now <= dashboard.data_expiracao_final))',
        { now: new Date() },
      );
  }
}
