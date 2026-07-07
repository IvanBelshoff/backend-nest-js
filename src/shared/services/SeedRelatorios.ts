import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conexao, TipoConexao } from 'src/database/entities/Conexoes';
import { EstadoRelatorio, Relatorio } from 'src/database/entities/Relatorios';
import { Usuario } from 'src/database/entities/Usuarios';
import { env } from '../env.schema';
import { logger } from './Logger';
import {
  REPORT_SEED_MARKER_NAME,
  reportSeedData,
} from '../seeds/report-seed.data';
import { encryptConnectionPassword } from '../utils/connection-encryption.util';

@Injectable()
export class SeedRelatoriosService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Relatorio)
    private relatorioRepository: Repository<Relatorio>,
    @InjectRepository(Conexao)
    private conexaoRepository: Repository<Conexao>,
    @InjectRepository(Usuario)
    private userRepository: Repository<Usuario>,
  ) {}

  private shouldRunBootstrapSeeds(): boolean {
    return env.SEED_RELATORIOS_ON_STARTUP === true;
  }

  private async seedRelatorios() {
    logger.info('Seeding relatórios...');

    const existing = await this.relatorioRepository.findOneBy({
      nome: REPORT_SEED_MARKER_NAME,
    });

    if (existing) {
      logger.info('Report seed data already exists');
      return;
    }

    const admin = await this.userRepository.findOneBy({
      email: env.EMAIL_USER_DEFAULT,
    });

    if (!admin) {
      logger.warn('Default admin user not found while seeding relatórios');
      return;
    }

    let conexao = await this.conexaoRepository.findOneBy({
      nome: '__seed_conexao_local__',
    });

    if (!conexao) {
      conexao = await this.conexaoRepository.save(
        this.conexaoRepository.create({
          nome: '__seed_conexao_local__',
          tipo: TipoConexao.POSTGRES,
          host: env.DB_HOST,
          porta: env.DB_PORT,
          database: env.DB_NAME,
          usuario: env.DB_USER,
          senha_criptografada: encryptConnectionPassword(env.DB_PASS),
          usuario_cadastrador: 'Sistema',
          usuario_atualizador: 'Sistema',
        }),
      );
    }

    const ownerName = `${admin.nome} ${admin.sobrenome}`;

    for (const seed of reportSeedData) {
      const relatorio = this.relatorioRepository.create({
        nome: seed.nome,
        icone: seed.icone,
        query: seed.query,
        id_conexao: conexao.id,
        parametros: seed.parametros,
        temporario: seed.temporario,
        privacidade: seed.privacidade,
        visivel: seed.visivel,
        estado: EstadoRelatorio.ONLINE,
        limite_linhas: env.REPORT_QUERY_MAX_ROWS,
        timeout_ms: env.REPORT_QUERY_TIMEOUT_MS,
        id_proprietario: admin.id,
        usuario_cadastrador: ownerName,
        usuario_atualizador: ownerName,
        usuario: [admin],
      });

      await this.relatorioRepository.save(relatorio);
    }

    logger.info(`Seeded ${reportSeedData.length} relatórios successfully`);
  }

  async onApplicationBootstrap() {
    if (!this.shouldRunBootstrapSeeds()) {
      return;
    }

    await this.seedRelatorios();
  }
}
