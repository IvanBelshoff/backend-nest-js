import { Inject, Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Foto } from 'src/database/entities/Fotos';
import { Regra } from 'src/database/entities/Regras';
import { Usuario } from 'src/database/entities/Usuarios';
import { Repository } from 'typeorm';
import { logger } from './Logger';
import * as bcrypt from 'bcrypt';
import { env } from '../env.schema';
import { UsersService } from 'src/user/user.service';

@Injectable()
export class DefaultUserService implements OnApplicationBootstrap {
  constructor(
    @Inject('USER_REPOSITORY')
    private userRepository: Repository<Usuario>,
    private userService: UsersService,
  ) {}

  private async createDefaultUser() {
    logger.info('Seeding default user...');

    const email = env.EMAIL_USER_DEFAULT;

    const usuarioExiste = await this.userRepository.findOneBy({ email });

    if (usuarioExiste) {
      logger.info('Default user already exists');
      return;
    } else {
      await this.userRepository.manager.transaction(async (manager) => {
        const userRepository = manager.getRepository(Usuario);
        const fotoRepository = manager.getRepository(Foto);
        const roleRepository = manager.getRepository(Regra);

        const senha = env.SENHA_USER_DEFAULT;

        const hashPassword = await bcrypt.hash(
          senha,
          await bcrypt.genSalt(env.SALT_ROUNDS),
        );

        const regraAdmin = await roleRepository.find({
          where: {
            nome: 'REGRA_ADMIN',
          },
        });

        if (!regraAdmin) {
          logger.warn('Admin role not found while seeding default user');
        }

        const novoUsuario = userRepository.create({
          nome: env.NAME_USER_DEFAULT,
          sobrenome: env.SOBRENOME_USER_DEFAULT,
          email: email,
          senha: hashPassword,
          regra: regraAdmin,
          usuario_cadastrador: `${env.NAME_USER_DEFAULT}.${env.SOBRENOME_USER_DEFAULT}`,
          usuario_atualizador: `${env.NAME_USER_DEFAULT}.${env.SOBRENOME_USER_DEFAULT}`,
        });

        const savedUser = await userRepository.save(novoUsuario);
        const userPhoto = fotoRepository.create(
          this.userService.buildPhotoData(savedUser.id, undefined),
        );

        novoUsuario.foto = await fotoRepository.save(userPhoto);

        logger.info('Default user seeded successfully');

        return userRepository.save(savedUser);
      });
    }
  }

  async onApplicationBootstrap() {
    if (
      env.SYNC_ROLES_ON_STARTUP !== undefined &&
      String(env.SYNC_ROLES_ON_STARTUP) !== 'true' &&
      env.NODE_ENV !== 'development'
    ) {
      return;
    }

    await this.createDefaultUser();
  }
}
