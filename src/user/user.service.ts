import { Inject, Injectable } from '@nestjs/common';
import { Usuario } from 'src/database/entities/Usuarios';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @Inject('USER_REPOSITORY')
    private userRepository: Repository<Usuario>,
  ) {}

  async findAll(): Promise<Usuario[]> {
    return this.userRepository.find();
  }

  async create(user: Partial<Usuario>): Promise<Partial<Usuario>> {
    
    const newUser = this.userRepository.create({
      ...user,
      senha: user.senha
        ? await bcrypt.hash(user.senha, SALT_ROUNDS)
        : user.senha,
    });

    const createdUser = await this.userRepository.save(newUser);

    const { senha, ...userWithoutPassword } = createdUser;
    return userWithoutPassword;
  }

  async findOne(email: string): Promise<Usuario | undefined> {
    const user =
      (await this.userRepository.findOne({ where: { email } })) || undefined;

    return user;
  }

}
