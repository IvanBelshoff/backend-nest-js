import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Usuario } from 'src/database/entities/Usuarios';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Foto } from 'src/database/entities/Fotos';
import { Regra } from 'src/database/entities/Regras';
import { Permissao } from 'src/database/entities/Permissoes';
import { Dashboard, Privacidade } from 'src/database/entities/Dashboards';
import { Relatorio } from 'src/database/entities/Relatorios';
import { existsSync, statSync, unlinkSync } from 'fs';
import { isAbsolute, join } from 'path';
import { env } from '../shared/env.schema';
import { UpdateUserDto } from './dto/update-user.dto';
import type { UpdateUserPreferencesDto } from './dto/update-user-preferences.dto';
import type { UsuarioPreferenciasUi } from './types/usuario-preferencias-ui.types';
import {
  mergeUsuarioPreferenciasUi,
  resolveUsuarioPreferenciasUi,
} from './usuario-preferencias-ui.util';
import { assertRolePermissionAssignment } from '../shared/services/RolePermissionPolicy';
import { RefreshTokenService } from '../auth/refresh-token.service';

export interface UserListParams {
  page: number;
  limit: number;
  filter?: string;
  bloqueado?: boolean;
  regra?: string;
  permissao?: string;
}

export interface UserSummary {
  id: number;
  nome: string;
}

export interface UsuariosByDashboard {
  usuarios: Usuario[];
  usuariosDisponiveis: Omit<Usuario, 'dashboard'>[];
}

export interface UsuariosByRelatorio {
  usuarios: Usuario[];
  usuariosDisponiveis: Omit<Usuario, 'relatorio'>[];
}

export const BLOCKED_USER_OPERATION_MESSAGE =
  'Operação não permitida pois o usuário está bloqueado';

export const BLOCKED_USER_SOURCE_MESSAGE =
  'Usuário de origem está bloqueado e não pode ser usado como referência';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Usuario)
    private userRepository: Repository<Usuario>,
    @InjectRepository(Foto)
    private fotoRepository: Repository<Foto>,
    @InjectRepository(Regra)
    private regraRepository: Repository<Regra>,
    @InjectRepository(Permissao)
    private permissaoRepository: Repository<Permissao>,
    @InjectRepository(Dashboard)
    private dashboardRepository: Repository<Dashboard>,
    @InjectRepository(Relatorio)
    private relatorioRepository: Repository<Relatorio>,
    @Inject(forwardRef(() => RefreshTokenService))
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  private assertUserNotBlocked(user: Usuario): void {
    if (user.bloqueado) {
      throw new BadRequestException(BLOCKED_USER_OPERATION_MESSAGE);
    }
  }

  private assertUserNotBlockedAsSource(user: Usuario): void {
    if (user.bloqueado) {
      throw new BadRequestException(BLOCKED_USER_SOURCE_MESSAGE);
    }
  }

  private isUnblockOnlyUpdate(
    user: Usuario,
    dto: UpdateUserDto,
    foto?: Express.Multer.File,
  ): boolean {
    return (
      dto.bloqueado === false &&
      !foto &&
      (dto.nome === undefined || dto.nome === user.nome) &&
      (dto.sobrenome === undefined || dto.sobrenome === user.sobrenome) &&
      (dto.email === undefined || dto.email === user.email)
    );
  }

  async findAll(): Promise<Usuario[]> {
    return this.userRepository.find({ relations: { foto: true } });
  }

  async findAllPaginated(
    params: UserListParams,
  ): Promise<{ data: Omit<Usuario, 'senha'>[]; total: number }> {
    const query = this.userRepository
      .createQueryBuilder('usuario')
      .leftJoinAndSelect('usuario.regra', 'regra')
      .leftJoinAndSelect('usuario.permissao', 'permissao')
      .leftJoinAndSelect('permissao.regra', 'permissao_regra')
      .leftJoinAndSelect('usuario.foto', 'foto')
      .orderBy('usuario.id', 'DESC')
      .skip((params.page - 1) * params.limit)
      .take(params.limit);

    this.applyTextFilter(query, params.filter);
    this.applyBlockedFilter(query, params.bloqueado);
    this.applyRoleFilter(query, params.regra);
    this.applyPermissionFilter(query, params.permissao);

    const [usuarios, total] = await query.getManyAndCount();

    const data = usuarios.map(({ senha: _senha, ...rest }) => rest);

    return { data, total };
  }

  private applyTextFilter(
    query: SelectQueryBuilder<Usuario>,
    filter?: string,
  ): void {
    if (typeof filter !== 'string' || filter.trim().length === 0) {
      return;
    }

    const normalizedFilter = `%${filter.trim()}%`;

    query.andWhere(
      `(
        LOWER(usuario.nome) LIKE LOWER(:textFilter)
        OR LOWER(usuario.sobrenome) LIKE LOWER(:textFilter)
        OR LOWER(usuario.email) LIKE LOWER(:textFilter)
        OR EXISTS (
          SELECT 1
          FROM usuarios_regras usuario_regra_filter
          INNER JOIN regras regra_filter ON regra_filter.id = usuario_regra_filter.regra_id
          WHERE usuario_regra_filter.usuario_id = usuario.id
            AND LOWER(regra_filter.nome) LIKE LOWER(:textFilter)
        )
        OR EXISTS (
          SELECT 1
          FROM usuarios_permissoes usuario_permissao_filter
          INNER JOIN permissoes permissao_filter ON permissao_filter.id = usuario_permissao_filter.permissao_id
          WHERE usuario_permissao_filter.usuario_id = usuario.id
            AND LOWER(permissao_filter.nome) LIKE LOWER(:textFilter)
        )
      )`,
      { textFilter: normalizedFilter },
    );
  }

  private applyBlockedFilter(
    query: SelectQueryBuilder<Usuario>,
    bloqueado?: boolean,
  ): void {
    if (typeof bloqueado !== 'boolean') {
      return;
    }

    query.andWhere('usuario.bloqueado = :bloqueado', { bloqueado });
  }

  private applyRoleFilter(
    query: SelectQueryBuilder<Usuario>,
    regra?: string,
  ): void {
    if (typeof regra !== 'string' || regra.trim().length === 0) {
      return;
    }

    query.andWhere(
      `EXISTS (
        SELECT 1
        FROM usuarios_regras usuario_regra_exact
        INNER JOIN regras regra_exact ON regra_exact.id = usuario_regra_exact.regra_id
        WHERE usuario_regra_exact.usuario_id = usuario.id
          AND regra_exact.nome = :regraNome
      )`,
      { regraNome: regra.trim() },
    );
  }

  private applyPermissionFilter(
    query: SelectQueryBuilder<Usuario>,
    permissao?: string,
  ): void {
    if (typeof permissao !== 'string' || permissao.trim().length === 0) {
      return;
    }

    query.andWhere(
      `EXISTS (
        SELECT 1
        FROM usuarios_permissoes usuario_permissao_exact
        INNER JOIN permissoes permissao_exact ON permissao_exact.id = usuario_permissao_exact.permissao_id
        WHERE usuario_permissao_exact.usuario_id = usuario.id
          AND permissao_exact.nome = :permissaoNome
      )`,
      { permissaoNome: permissao.trim() },
    );
  }

  async getUserIds(excludeId?: number): Promise<UserSummary[]> {
    const usuarios = await this.userRepository.find();

    return usuarios
      .filter(
        (usuario) =>
          usuario.bloqueado === false &&
          (excludeId ? usuario.id !== excludeId : true),
      )
      .map((usuario) => ({
        id: Number(usuario.id),
        nome: `${usuario.nome} ${usuario.sobrenome}`,
      }));
  }

  async findByIdWithRelations(id: number): Promise<Omit<Usuario, 'senha'>> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: {
        foto: true,
        regra: true,
        permissao: { regra: true },
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    const { senha: _senha, ...rest } = user;
    return rest;
  }

  async update(
    id: number,
    dto: UpdateUserDto,
    requester: { sub: number; email: string },
    foto?: Express.Multer.File,
  ): Promise<Omit<Usuario, 'senha'>> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { foto: true },
    });

    if (!user) {
      if (foto?.path && existsSync(foto.path)) {
        unlinkSync(foto.path);
      }
      throw new NotFoundException('Usuário não localizado');
    }

    const wasBlocked = user.bloqueado;

    if (wasBlocked && !this.isUnblockOnlyUpdate(user, dto, foto)) {
      if (foto?.path && existsSync(foto.path)) {
        unlinkSync(foto.path);
      }
      throw new BadRequestException(BLOCKED_USER_OPERATION_MESSAGE);
    }

    try {
      const updated = await this.userRepository.manager.transaction(
        async (manager) => {
          const userRepository = manager.getRepository(Usuario);
          const fotoRepository = manager.getRepository(Foto);

          const requesterUser = await userRepository.findOne({
            where: { id: requester.sub },
          });

          const nome = dto.nome ?? user.nome;
          const sobrenome = dto.sobrenome ?? user.sobrenome;
          const email = dto.email ?? user.email;
          const bloqueado = dto.bloqueado ?? user.bloqueado;
          const usuario_atualizador = requesterUser
            ? `${requesterUser.nome} ${requesterUser.sobrenome}`
            : 'Sistema';

          let fotoEntity = user.foto;

          if (foto) {
            const previousLocal = user.foto?.local;
            const photoData = this.buildPhotoData(user.id, foto);

            if (user.foto) {
              Object.assign(user.foto, photoData);
              fotoEntity = await fotoRepository.save(user.foto);
            } else {
              fotoEntity = await fotoRepository.save(
                fotoRepository.create(photoData),
              );
            }

            if (
              previousLocal &&
              previousLocal !== env.DEFAULT_PROFILE_PHOTO_LOCAL &&
              existsSync(previousLocal)
            ) {
              unlinkSync(previousLocal);
            }
          }

          await userRepository.update(id, {
            nome,
            sobrenome,
            email,
            bloqueado,
            usuario_atualizador,
            ...(fotoEntity ? { foto: { id: fotoEntity.id } } : {}),
          });

          const reloaded = await userRepository.findOne({
            where: { id },
            relations: { foto: true },
          });

          if (!reloaded) {
            throw new NotFoundException('Usuário não localizado');
          }

          return reloaded;
        },
      );

      if (dto.bloqueado === true && !wasBlocked) {
        await this.refreshTokenService.revokeAllForUser(id);
      }

      const { senha: _senha, ...rest } = updated;

      return rest;
    } catch (error) {
      if (foto?.path && existsSync(foto.path)) {
        unlinkSync(foto.path);
      }
      throw error;
    }
  }

  async updatePassword(id: number, senha: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    this.assertUserNotBlocked(user);

    const hashedPassword = await bcrypt.hash(
      senha,
      await bcrypt.genSalt(env.SALT_ROUNDS),
    );

    await this.userRepository.update(id, { senha: hashedPassword });
  }

  async updateRolesAndPermissions(
    id: number,
    regrasIds: number[],
    permissoesIds: number[],
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { regra: true, permissao: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    this.assertUserNotBlocked(user);

    const regras = regrasIds.length
      ? await this.regraRepository.find({
          where: { id: In(regrasIds) },
          relations: { permissao: true },
        })
      : [];

    const permissoes = permissoesIds.length
      ? await this.permissaoRepository.find({
          where: { id: In(permissoesIds) },
          relations: { regra: true },
        })
      : [];

    assertRolePermissionAssignment(
      regras,
      permissoes,
      regrasIds,
      permissoesIds,
      { userId: id, operation: 'updateRolesAndPermissions' },
    );

    user.regra = regras;
    user.permissao = permissoes;

    await this.userRepository.save(user);
  }

  async copyRolesAndPermissions(
    idUsuario: number,
    idCopiado: number,
  ): Promise<void> {
    if (idUsuario === idCopiado) {
      throw new BadRequestException(
        'Regras e permissões não podem ser copiadas para o mesmo usuário',
      );
    }

    const target = await this.userRepository.findOne({
      where: { id: idUsuario },
    });

    if (!target) {
      throw new NotFoundException('Usuário não localizado');
    }

    this.assertUserNotBlocked(target);

    const source = await this.userRepository.findOne({
      where: { id: idCopiado },
      relations: { regra: true, permissao: { regra: true } },
    });

    if (!source) {
      throw new NotFoundException('Usuário copiado não localizado');
    }

    this.assertUserNotBlockedAsSource(source);

    const sourceRegras = source.regra ?? [];
    const sourcePermissoes = source.permissao ?? [];

    assertRolePermissionAssignment(
      sourceRegras,
      sourcePermissoes,
      sourceRegras.map((regra) => Number(regra.id)),
      sourcePermissoes.map((permissao) => Number(permissao.id)),
      {
        userId: idUsuario,
        operation: 'copyRolesAndPermissions',
        sourceUserId: idCopiado,
      },
    );

    target.regra = sourceRegras;
    target.permissao = sourcePermissoes;

    await this.userRepository.save(target);
  }

  async deletePhoto(id: number): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { foto: true },
    });

    if (!user?.foto) {
      throw new NotFoundException('Foto não localizada');
    }

    this.assertUserNotBlocked(user);

    const previousLocal = user.foto.local;

    Object.assign(user.foto, this.buildPhotoData(user.id));

    await this.fotoRepository.save(user.foto);

    if (
      previousLocal &&
      previousLocal !== env.DEFAULT_PROFILE_PHOTO_LOCAL &&
      existsSync(previousLocal)
    ) {
      unlinkSync(previousLocal);
    }
  }

  async delete(id: number): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { foto: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    const fotoId = user.foto?.id;
    const fotoLocal = user.foto?.local;

    await this.userRepository.manager.transaction(async (manager) => {
      await manager.getRepository(Usuario).delete(id);

      if (fotoId) {
        await manager.getRepository(Foto).delete(fotoId);
      }
    });

    if (
      fotoLocal &&
      fotoLocal !== env.DEFAULT_PROFILE_PHOTO_LOCAL &&
      existsSync(fotoLocal)
    ) {
      unlinkSync(fotoLocal);
    }
  }

  async copyDashboards(idUsuario: number, idCopiado: number): Promise<void> {
    if (idUsuario === idCopiado) {
      throw new BadRequestException(
        'Dashboards não podem ser copiados para o mesmo usuário',
      );
    }

    const target = await this.userRepository.findOne({
      where: { id: idUsuario },
    });

    if (!target) {
      throw new NotFoundException('Usuário não localizado');
    }

    this.assertUserNotBlocked(target);

    const source = await this.userRepository.findOne({
      where: { id: idCopiado },
      relations: { dashboard: true },
    });

    if (!source) {
      throw new NotFoundException('Usuário copiado não localizado');
    }

    this.assertUserNotBlockedAsSource(source);

    target.dashboard = source.dashboard ?? [];

    await this.userRepository.save(target);
  }

  async updateFavorites(id: number, favoritos: number[]): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { dashboard: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    this.assertUserNotBlocked(user);

    const validatedIds: number[] = [];

    for (const favoriteId of favoritos) {
      const dashboard = await this.dashboardRepository.findOne({
        where: { id: favoriteId },
        relations: { usuario: true },
      });

      if (!dashboard) {
        continue;
      }

      if (dashboard.privacidade === Privacidade.PRIVAT) {
        const hasAccess =
          dashboard.usuario?.some((usuario) => usuario.id === user.id) ||
          dashboard.id_proprietario === Number(user.id);

        if (!hasAccess) {
          throw new ForbiddenException(
            `Você não possui acesso ao ${dashboard.nome}`,
          );
        }
      }

      validatedIds.push(dashboard.id);
    }

    user.dashboards_favoritos = validatedIds;

    await this.userRepository.save(user);
  }

  async assignDashboards(id: number, dashboards: number[]): Promise<void> {
    await this.userRepository.manager.transaction(async (manager) => {
      const userRepository = manager.getRepository(Usuario);
      const dashboardRepository = manager.getRepository(Dashboard);

      const user = await userRepository.findOne({
        where: { id },
        relations: { dashboard: true },
      });

      if (!user) {
        throw new NotFoundException('Usuário não localizado');
      }

      this.assertUserNotBlocked(user);

      const dashboardEntities = dashboards.length
        ? await dashboardRepository.find({ where: { id: In(dashboards) } })
        : [];

      if (dashboardEntities.length !== dashboards.length) {
        throw new BadRequestException('Algum dashboard não foi encontrado.');
      }

      const publicNotOwned = dashboardEntities.find(
        (dashboard) =>
          dashboard.id_proprietario != null &&
          dashboard.id_proprietario !== Number(user.id) &&
          dashboard.privacidade === Privacidade.PUBLIC,
      );

      if (publicNotOwned) {
        throw new BadRequestException(
          `Dashboard ${publicNotOwned.nome} está público`,
        );
      }

      const owned = await dashboardRepository.find({
        where: { id_proprietario: Number(user.id) },
      });

      const missingOwned = owned.filter(
        (dashboard) => !dashboards.includes(Number(dashboard.id)),
      );

      if (missingOwned.length > 0) {
        throw new BadRequestException(
          `Alguns dashboards que o usuário ${user.nome} ${user.sobrenome} é proprietário não foram listados`,
        );
      }

      user.dashboard = dashboardEntities;

      if (user.dashboards_favoritos?.length) {
        const assignedIds = dashboardEntities.map((dashboard) => dashboard.id);
        user.dashboards_favoritos = user.dashboards_favoritos.filter(
          (favoriteId) => assignedIds.includes(favoriteId),
        );
      }

      await userRepository.save(user);
    });
  }

  async getUsersByDashboard(dashboardId: number): Promise<UsuariosByDashboard> {
    const dashboard = await this.dashboardRepository.findOne({
      where: { id: dashboardId },
    });

    if (!dashboard) {
      throw new NotFoundException('Dashboard não localizado');
    }

    const usuarios = await this.userRepository.find({
      relations: { foto: true },
      where: { dashboard: { id: dashboardId } },
      order: { nome: 'ASC' },
    });

    const todosUsuarios = await this.userRepository.find({
      relations: { dashboard: true, foto: true },
    });

    const disponiveis = todosUsuarios
      .filter(
        (usuario) =>
          !usuarios.some((associado) => associado.id === usuario.id) &&
          !usuario.bloqueado,
      )
      .map(({ dashboard: _dashboard, ...rest }) => rest);

    return {
      usuarios: usuarios.filter((usuario) => !usuario.bloqueado),
      usuariosDisponiveis:
        dashboard.privacidade === Privacidade.PUBLIC ? [] : disponiveis,
    };
  }

  async copyRelatorios(idUsuario: number, idCopiado: number): Promise<void> {
    if (idUsuario === idCopiado) {
      throw new BadRequestException(
        'Relatórios não podem ser copiados para o mesmo usuário',
      );
    }

    const target = await this.userRepository.findOne({
      where: { id: idUsuario },
    });

    if (!target) {
      throw new NotFoundException('Usuário não localizado');
    }

    this.assertUserNotBlocked(target);

    const source = await this.userRepository.findOne({
      where: { id: idCopiado },
      relations: { relatorio: true },
    });

    if (!source) {
      throw new NotFoundException('Usuário copiado não localizado');
    }

    this.assertUserNotBlockedAsSource(source);

    target.relatorio = source.relatorio ?? [];
    await this.userRepository.save(target);
  }

  async updateRelatorioFavorites(
    id: number,
    favoritos: number[],
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { relatorio: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    this.assertUserNotBlocked(user);

    const validatedIds: number[] = [];

    for (const favoriteId of favoritos) {
      const relatorio = await this.relatorioRepository.findOne({
        where: { id: favoriteId },
        relations: { usuario: true },
      });

      if (!relatorio) {
        continue;
      }

      if (relatorio.privacidade === Privacidade.PRIVAT) {
        const hasAccess =
          relatorio.usuario?.some((usuario) => usuario.id === user.id) ||
          relatorio.id_proprietario === Number(user.id);

        if (!hasAccess) {
          throw new ForbiddenException(
            `Você não possui acesso ao ${relatorio.nome}`,
          );
        }
      }

      validatedIds.push(relatorio.id);
    }

    user.relatorios_favoritos = validatedIds;
    await this.userRepository.save(user);
  }

  async assignRelatorios(id: number, relatorios: number[]): Promise<void> {
    await this.userRepository.manager.transaction(async (manager) => {
      const userRepository = manager.getRepository(Usuario);
      const relatorioRepository = manager.getRepository(Relatorio);

      const user = await userRepository.findOne({
        where: { id },
        relations: { relatorio: true },
      });

      if (!user) {
        throw new NotFoundException('Usuário não localizado');
      }

      this.assertUserNotBlocked(user);

      const relatorioEntities = relatorios.length
        ? await relatorioRepository.find({ where: { id: In(relatorios) } })
        : [];

      if (relatorioEntities.length !== relatorios.length) {
        throw new BadRequestException('Algum relatório não foi encontrado.');
      }

      const publicNotOwned = relatorioEntities.find(
        (relatorio) =>
          relatorio.id_proprietario != null &&
          relatorio.id_proprietario !== Number(user.id) &&
          relatorio.privacidade === Privacidade.PUBLIC,
      );

      if (publicNotOwned) {
        throw new BadRequestException(
          `Relatório ${publicNotOwned.nome} está público`,
        );
      }

      const owned = await relatorioRepository.find({
        where: { id_proprietario: Number(user.id) },
      });

      const missingOwned = owned.filter(
        (relatorio) => !relatorios.includes(Number(relatorio.id)),
      );

      if (missingOwned.length > 0) {
        throw new BadRequestException(
          `Alguns relatórios que o usuário ${user.nome} ${user.sobrenome} é proprietário não foram listados`,
        );
      }

      user.relatorio = relatorioEntities;

      if (user.relatorios_favoritos?.length) {
        const assignedIds = relatorioEntities.map((relatorio) => relatorio.id);
        user.relatorios_favoritos = user.relatorios_favoritos.filter(
          (favoriteId) => assignedIds.includes(favoriteId),
        );
      }

      await userRepository.save(user);
    });
  }

  async getUsersByRelatorio(relatorioId: number): Promise<UsuariosByRelatorio> {
    const relatorio = await this.relatorioRepository.findOne({
      where: { id: relatorioId },
    });

    if (!relatorio) {
      throw new NotFoundException('Relatório não localizado');
    }

    const usuarios = await this.userRepository.find({
      relations: { foto: true },
      where: { relatorio: { id: relatorioId } },
      order: { nome: 'ASC' },
    });

    const todosUsuarios = await this.userRepository.find({
      relations: { relatorio: true, foto: true },
    });

    const disponiveis = todosUsuarios
      .filter(
        (usuario) =>
          !usuarios.some((associado) => associado.id === usuario.id) &&
          !usuario.bloqueado,
      )
      .map(({ relatorio: _relatorio, ...rest }) => rest);

    return {
      usuarios: usuarios.filter((usuario) => !usuario.bloqueado),
      usuariosDisponiveis:
        relatorio.privacidade === Privacidade.PUBLIC ? [] : disponiveis,
    };
  }

  async findOne(email: string): Promise<Usuario | undefined> {
    const user =
      (await this.userRepository.findOne({
        where: { email },
        relations: {
          foto: true,
          regra: true,
          permissao: { regra: true },
        },
      })) || undefined;

    return user;
  }

  async create(
    user: Partial<Usuario>,
    requester: {
      sub: number;
      email: string;
      iat: number;
      exp: number;
    },
    foto?: Express.Multer.File,
  ): Promise<Partial<Usuario>> {
    try {
      const requesterUser = await this.userRepository.findOne({
        where: { id: requester.sub },
      });

      const createdUser = await this.userRepository.manager.transaction(
        async (manager) => {
          const userRepository = manager.getRepository(Usuario);
          const fotoRepository = manager.getRepository(Foto);

          const newUser = userRepository.create({
            ...user,
            usuario_atualizador: requesterUser
              ? `${requesterUser.nome} ${requesterUser.sobrenome}`
              : 'Sistema',
            usuario_cadastrador: requesterUser
              ? `${requesterUser.nome} ${requesterUser.sobrenome}`
              : 'Sistema',
            senha: user.senha
              ? await bcrypt.hash(
                  user.senha,
                  await bcrypt.genSalt(env.SALT_ROUNDS),
                )
              : user.senha,
          });

          const savedUser = await userRepository.save(newUser);
          const userPhoto = this.fotoRepository.create(
            this.buildPhotoData(savedUser.id, foto),
          );

          savedUser.foto = await fotoRepository.save(userPhoto);

          return userRepository.save(savedUser);
        },
      );

      const { senha, ...userWithoutPassword } = createdUser;
      return userWithoutPassword;
    } catch (error) {
      if (foto?.path && existsSync(foto.path)) {
        unlinkSync(foto.path);
      }

      throw error;
    }
  }

  async findById(id: number): Promise<Usuario | undefined> {
    const user =
      (await this.userRepository.findOne({
        where: { id },
      })) || undefined;

    return user;
  }

  async updateUltimoLogin(id: number): Promise<void> {
    await this.userRepository.update(id, { ultimo_login: new Date() });
  }

  async getPreferences(id: number): Promise<UsuarioPreferenciasUi> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    return resolveUsuarioPreferenciasUi(user.preferencias_ui);
  }

  async updatePreferences(
    id: number,
    patch: UpdateUserPreferencesDto,
  ): Promise<UsuarioPreferenciasUi> {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    this.assertUserNotBlocked(user);

    const merged = mergeUsuarioPreferenciasUi(user.preferencias_ui, patch);
    await this.userRepository.update(id, { preferencias_ui: merged });

    return merged;
  }

  async findPhotoFileByUserId(
    userId: number,
  ): Promise<{ path: string; type: string }> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { foto: true },
    });

    if (!user?.foto) {
      throw new NotFoundException('Foto do usuário não encontrada');
    }

    const photoPath = this.resolvePhotoPath(user.foto.local);

    if (!existsSync(photoPath)) {
      const defaultPhotoPath = this.resolvePhotoPath(
        env.DEFAULT_PROFILE_PHOTO_LOCAL,
      );

      if (existsSync(defaultPhotoPath)) {
        return {
          path: defaultPhotoPath,
          type: env.DEFAULT_PROFILE_PHOTO_TYPE,
        };
      }

      throw new NotFoundException('Arquivo da foto não encontrado');
    }

    return {
      path: photoPath,
      type: user.foto.tipo,
    };
  }

  private resolvePhotoPath(local: string): string {
    return isAbsolute(local) ? local : join(__dirname, '..', local);
  }

  public buildPhotoData(
    userId: number,
    foto?: Express.Multer.File,
  ): Partial<Foto> {
    if (foto) {
      return {
        nome: foto.filename,
        originalname: foto.originalname,
        tipo: foto.mimetype,
        tamanho: foto.size,
        local: foto.path,
        url: `/user/${userId}/foto`,
      };
    }

    const defaultPhotoPath = this.resolvePhotoPath(
      env.DEFAULT_PROFILE_PHOTO_LOCAL,
    );

    return {
      nome: env.DEFAULT_PROFILE_PHOTO_NAME,
      originalname: env.DEFAULT_PROFILE_PHOTO_NAME,
      tipo: env.DEFAULT_PROFILE_PHOTO_TYPE,
      tamanho: statSync(defaultPhotoPath).size,
      local: env.DEFAULT_PROFILE_PHOTO_LOCAL,
      url: `/user/${userId}/foto`,
    };
  }
}
