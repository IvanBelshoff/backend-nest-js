import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import 'dotenv/config';
import { Usuario } from 'src/database/entities/Usuarios';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Foto } from 'src/database/entities/Fotos';
import { existsSync, statSync, unlinkSync } from 'fs';
import { isAbsolute, join } from 'path';
import { env } from '../shared/env.schema';
@Injectable()
export class UsersService {
  constructor(
    @Inject('USER_REPOSITORY')
    private userRepository: Repository<Usuario>,
    @Inject('FOTO_REPOSITORY')
    private fotoRepository: Repository<Foto>,
  ) {}

  async findAll(): Promise<Usuario[]> {
    return this.userRepository.find({ relations: { foto: true } });
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

  async findOne(email: string): Promise<Usuario | undefined> {
    const user =
      (await this.userRepository.findOne({
        where: { email },
        relations: {
          foto: true,
          regra: true,
          permissao: true,
        },
      })) || undefined;

    return user;
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
