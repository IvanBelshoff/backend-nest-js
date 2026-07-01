import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Dashboard, Privacidade } from 'src/database/entities/Dashboards';
import { Foto } from 'src/database/entities/Fotos';
import { Permissao } from 'src/database/entities/Permissoes';
import { Regra } from 'src/database/entities/Regras';
import { Usuario } from 'src/database/entities/Usuarios';
import { UsersService } from 'src/user/user.service';
import { In, Repository } from 'typeorm';
import { env } from '../env.schema';
import {
  USER_SEED_MARKER_EMAIL,
  userSeedData,
} from '../seeds/user-seed.data';
import { logger } from './Logger';

@Injectable()
export class SeedUsersService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Usuario)
    private userRepository: Repository<Usuario>,
    @InjectRepository(Dashboard)
    private dashboardRepository: Repository<Dashboard>,
    private userService: UsersService,
  ) {}

  private shouldRunBootstrapSeeds(): boolean {
    if (env.SEED_USERS_ON_STARTUP !== true) {
      return false;
    }

    if (
      env.SYNC_ROLES_ON_STARTUP !== undefined &&
      String(env.SYNC_ROLES_ON_STARTUP) !== 'true' &&
      env.NODE_ENV !== 'development'
    ) {
      return false;
    }

    return true;
  }

  private async seedUsers(): Promise<{ users: Usuario[]; created: boolean }> {
    logger.info('Seeding users...');

    const existing = await this.userRepository.findOneBy({
      email: USER_SEED_MARKER_EMAIL,
    });

    if (existing) {
      logger.info('User seed data already exists');
      const users = await this.userRepository.find({
        where: { email: In(userSeedData.map((seed) => seed.email)) },
      });

      return { users, created: false };
    }

    const admin = await this.userRepository.findOneBy({
      email: env.EMAIL_USER_DEFAULT,
    });

    if (!admin) {
      logger.warn('Default admin user not found while seeding users');
      return { users: [], created: false };
    }

    const adminName = `${admin.nome} ${admin.sobrenome}`;
    const hashPassword = await bcrypt.hash(
      env.SENHA_USER_SEED_DEFAULT,
      await bcrypt.genSalt(env.SALT_ROUNDS),
    );

    const createdUsers: Usuario[] = [];

    await this.userRepository.manager.transaction(async (manager) => {
      const userRepository = manager.getRepository(Usuario);
      const fotoRepository = manager.getRepository(Foto);
      const roleRepository = manager.getRepository(Regra);
      const permissionRepository = manager.getRepository(Permissao);

      for (const seed of userSeedData) {
        const regras = await roleRepository.find({
          where: { nome: In(seed.regras) },
        });

        const permissoes = seed.permissoes.length
          ? await permissionRepository.find({
              where: { nome: In(seed.permissoes) },
              relations: { regra: true },
            })
          : [];

        const novoUsuario = userRepository.create({
          nome: seed.nome,
          sobrenome: seed.sobrenome,
          email: seed.email,
          senha: hashPassword,
          bloqueado: seed.bloqueado,
          regra: regras,
          permissao: permissoes,
          usuario_cadastrador: adminName,
          usuario_atualizador: adminName,
        });

        const savedUser = await userRepository.save(novoUsuario);
        const userPhoto = fotoRepository.create(
          this.userService.buildPhotoData(savedUser.id, undefined),
        );

        novoUsuario.foto = await fotoRepository.save(userPhoto);
        await userRepository.save(novoUsuario);
        createdUsers.push(novoUsuario);
      }
    });

    logger.info(`Seeded ${createdUsers.length} users successfully`);
    return { users: createdUsers, created: true };
  }

  private async seedDashboardAccess(seedUsers: Usuario[]): Promise<void> {
    const admin = await this.userRepository.findOneBy({
      email: env.EMAIL_USER_DEFAULT,
    });

    if (!admin) {
      return;
    }

    const activeSeedUsers = seedUsers.filter((user) => !user.bloqueado);

    if (activeSeedUsers.length === 0) {
      return;
    }

    const privateDashboards = await this.dashboardRepository.find({
      where: { privacidade: Privacidade.PRIVAT },
      relations: { usuario: true },
      order: { id: 'ASC' },
    });

    const dashboardsToLink = privateDashboards.slice(0, 8);

    for (const [index, dashboard] of dashboardsToLink.entries()) {
      const start = (index * 2) % activeSeedUsers.length;
      const count = 2 + (index % 4);
      const selectedUsers = Array.from({ length: count }, (_, offset) => {
        return activeSeedUsers[(start + offset) % activeSeedUsers.length];
      });

      const uniqueUsers = new Map<number, Usuario>();
      uniqueUsers.set(Number(admin.id), admin);

      for (const user of selectedUsers) {
        uniqueUsers.set(Number(user.id), user);
      }

      dashboard.usuario = Array.from(uniqueUsers.values());
      await this.dashboardRepository.save(dashboard);
    }

    logger.info(
      `Linked seed users to ${dashboardsToLink.length} private dashboards`,
    );
  }

  async onApplicationBootstrap() {
    if (!this.shouldRunBootstrapSeeds()) {
      return;
    }

    const { users, created } = await this.seedUsers();

    if (created && users.length > 0) {
      await this.seedDashboardAccess(users);
    }
  }
}
