import * as bcrypt from 'bcrypt';
import { UsersService } from './user.service';
import { Usuario } from 'src/database/entities/Usuarios';

describe('UsersService', () => {
  function buildServiceMocks() {
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
    const service = new UsersService(
      userRepository as any,
      fotoRepository as any,
    );

    return {
      service,
      fotoRepository,
      transactionFotoRepository,
      transactionUserRepository,
    };
  }

  it('hashes the password, creates the default photo and returns the user without password', async () => {
    const {
      service,
      fotoRepository,
      transactionFotoRepository,
      transactionUserRepository,
    } = buildServiceMocks();

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

  it('uses uploaded photo metadata when a file is provided', async () => {
    const {
      service,
      fotoRepository,
      transactionFotoRepository,
      transactionUserRepository,
    } = buildServiceMocks();
    const foto = {
      filename: 'foto-gerada.webp',
      originalname: 'perfil.webp',
      mimetype: 'image/webp',
      size: 1024,
      path: 'C:\\uploads\\foto-gerada.webp',
    } as Express.Multer.File;

    const user = await service.create(
      {
        nome: 'Ivan',
        sobrenome: 'Belshoff',
        email: 'ivan@example.com',
        senha: 'senha-segura',
      },
      foto,
    );

    const hashedPassword = transactionUserRepository.create.mock.calls[0][0]
      .senha;

    expect(user.senha).toBeUndefined();
    expect(hashedPassword).not.toBe('senha-segura');
    await expect(bcrypt.compare('senha-segura', hashedPassword)).resolves.toBe(
      true,
    );
    expect(fotoRepository.create).toHaveBeenCalledWith({
      nome: 'foto-gerada.webp',
      originalname: 'perfil.webp',
      tipo: 'image/webp',
      tamanho: 1024,
      local: 'C:\\uploads\\foto-gerada.webp',
      url: '/user/1/foto',
    });
    expect(transactionFotoRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        local: 'C:\\uploads\\foto-gerada.webp',
      }),
    );
  });
});
