import * as bcrypt from 'bcrypt';
import { UsersService } from './user.service';
import { Usuario } from 'src/database/entities/Usuarios';

describe('UsersService', () => {
  it('hashes the password, creates the default photo and returns the user without password', async () => {
    const savedUser = {
      id: 1,
      nome: 'Ivan',
      sobrenome: 'Belshoff',
      email: 'ivan@example.com',
      senha: '',
    } as Usuario;
    const transactionUserRepository = {
      create: jest.fn().mockImplementation((user) => user),
      save: jest.fn().mockImplementation((user) => {
        if (!user.id) {
          Object.assign(savedUser, user);
          return Promise.resolve(savedUser);
        }

        return Promise.resolve(user);
      }),
    };
    const transactionFotoRepository = {
      save: jest.fn().mockImplementation((foto) =>
        Promise.resolve({
          id: 1,
          ...foto,
        }),
      ),
    };
    const userRepository = {
      manager: {
        transaction: jest
          .fn()
          .mockImplementation((callback) =>
            callback({
              getRepository: (entity) =>
                entity === Usuario
                  ? transactionUserRepository
                  : transactionFotoRepository,
            }),
          ),
      },
    };
    const fotoRepository = {
      create: jest.fn().mockImplementation((foto) => foto),
    };
    const service = new UsersService(userRepository as any, fotoRepository as any);

    const user = await service.create({
      nome: 'Ivan',
      sobrenome: 'Belshoff',
      email: 'ivan@example.com',
      senha: 'senha-segura',
    });

    const hashedPassword = transactionUserRepository.create.mock.calls[0][0]
      .senha;

    expect(user.senha).toBeUndefined();
    expect(hashedPassword).not.toBe('senha-segura');
    expect(hashedPassword).toMatch(/^\$2[aby]\$/);
    await expect(bcrypt.compare('senha-segura', hashedPassword)).resolves.toBe(
      true,
    );
    expect(fotoRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        nome: 'profile.jpg',
        originalname: 'profile.jpg',
        tipo: 'image/jpeg',
        tamanho: expect.any(Number),
        local: 'shared/data/default/profile.jpg',
        url: '/user/1/foto',
      }),
    );
    expect(transactionFotoRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/user/1/foto',
      }),
    );
    expect(transactionUserRepository.save).toHaveBeenLastCalledWith(
      expect.objectContaining({
        foto: expect.objectContaining({
          id: 1,
          url: '/user/1/foto',
        }),
      }),
    );
  });
});
