import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Usuario } from 'src/database/entities/Usuarios';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { Foto } from 'src/database/entities/Fotos';
import { existsSync, statSync } from 'fs';
import { isAbsolute, join } from 'path';

const SALT_ROUNDS = 10;
const DEFAULT_PROFILE_PHOTO_NAME = 'profile.jpg';
const DEFAULT_PROFILE_PHOTO_LOCAL = 'shared/data/default/profile.jpg';
const DEFAULT_PROFILE_PHOTO_TYPE = 'image/jpeg';

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

  async create(user: Partial<Usuario>): Promise<Partial<Usuario>> {
    const defaultPhotoPath = this.resolvePhotoPath(DEFAULT_PROFILE_PHOTO_LOCAL);
    const defaultPhotoSize = statSync(defaultPhotoPath).size;

    const createdUser = await this.userRepository.manager.transaction(
      async (manager) => {
        const userRepository = manager.getRepository(Usuario);
        const fotoRepository = manager.getRepository(Foto);

        const newUser = userRepository.create({
          ...user,
          senha: user.senha
            ? await bcrypt.hash(user.senha, SALT_ROUNDS)
            : user.senha,
        });

        const savedUser = await userRepository.save(newUser);
        const defaultPhoto = this.fotoRepository.create({
          nome: DEFAULT_PROFILE_PHOTO_NAME,
          originalname: DEFAULT_PROFILE_PHOTO_NAME,
          tipo: DEFAULT_PROFILE_PHOTO_TYPE,
          tamanho: defaultPhotoSize,
          local: DEFAULT_PROFILE_PHOTO_LOCAL,
          url: `/user/${savedUser.id}/foto`,
        });

        savedUser.foto = await fotoRepository.save(defaultPhoto);

        return userRepository.save(savedUser);
      },
    );

    const { senha, ...userWithoutPassword } = createdUser;
    return userWithoutPassword;
  }

  async findOne(email: string): Promise<Usuario | undefined> {
    const user =
      (await this.userRepository.findOne({ where: { email } })) || undefined;

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
}
