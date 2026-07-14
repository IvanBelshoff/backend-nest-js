import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Dashboard } from 'src/database/entities/Dashboards';
import { Usuario } from 'src/database/entities/Usuarios';
import { In, Repository } from 'typeorm';
import { env } from '../env.schema';
import { logger } from './Logger';
import {
  dashboardSeedData,
} from '../seeds/dashboard-seed.data';

@Injectable()
export class SeedDashboardsService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Dashboard)
    private dashboardRepository: Repository<Dashboard>,
    @InjectRepository(Usuario)
    private userRepository: Repository<Usuario>,
  ) {}

  private shouldRunBootstrapSeeds(): boolean {
    if (env.SEED_DASHBOARDS_ON_STARTUP !== true) {
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

  private async seedDashboards() {
    logger.info('Seeding dashboards...');

    const seedNames = dashboardSeedData.map((seed) => seed.nome);
    const existingCount = await this.dashboardRepository.count({
      where: { nome: In(seedNames) },
    });

    if (existingCount === seedNames.length) {
      logger.info('Dashboard seed data already exists');
      return;
    }

    const admin = await this.userRepository.findOneBy({
      email: env.EMAIL_USER_DEFAULT,
    });

    if (!admin) {
      logger.warn('Default admin user not found while seeding dashboards');
      return;
    }

    const ownerName = `${admin.nome} ${admin.sobrenome}`;
    let created = 0;
    let skipped = 0;

    await this.dashboardRepository.manager.transaction(async (manager) => {
      const dashboardRepository = manager.getRepository(Dashboard);

      for (const seed of dashboardSeedData) {
        const alreadyExists = await dashboardRepository.existsBy({ nome: seed.nome });

        if (alreadyExists) {
          skipped += 1;
          continue;
        }

        const dashboard = dashboardRepository.create({
          nome: seed.nome,
          url: seed.url,
          icone: seed.icone,
          ...(seed.query ? { query: seed.query } : {}),
          temporario: seed.temporario,
          data_expiracao_inicial: seed.temporario
            ? (seed.data_expiracao_inicial ?? null)
            : null,
          data_expiracao_final: seed.temporario
            ? (seed.data_expiracao_final ?? null)
            : null,
          privacidade: seed.privacidade,
          visivel: seed.visivel,
          id_proprietario: admin.id,
          usuario_cadastrador: ownerName,
          usuario_atualizador: ownerName,
          usuario: [admin],
        });

        await dashboardRepository.save(dashboard);
        created += 1;
      }
    });

    if (created === 0) {
      logger.info('Dashboard seed data already exists');
      return;
    }

    logger.info(
      `Seeded ${created} dashboards successfully${skipped > 0 ? ` (${skipped} skipped, already present)` : ''}`,
    );
  }

  async onApplicationBootstrap() {
    if (!this.shouldRunBootstrapSeeds()) {
      return;
    }

    await this.seedDashboards();
  }
}
