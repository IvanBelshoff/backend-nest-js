import { Inject, Injectable } from '@nestjs/common';
import { Usuario } from 'src/database/entities/Usuarios';
import { Repository } from 'typeorm';

@Injectable()
export class UsersService {

  constructor(
    @Inject('USER_REPOSITORY')
    private userRepository: Repository<Usuario>,
  ) { }

  async findAll(): Promise<Usuario[]> {
    return this.userRepository.find();
  }

  async create(user: Partial<Usuario>): Promise<Usuario> {
    const newUser = this.userRepository.create(user);
    return this.userRepository.save(newUser);
  }

  async findOne(email: string): Promise<Usuario | undefined> {
    const user =
      (await this.userRepository.findOne({ where: { email } })) || undefined;

    return user;
  }
  

}
