import * as bcrypt from 'bcrypt';
import { UsersService } from './user.service';
import { Usuario } from 'src/database/entities/Usuarios';

describe('UsersService', () => {
  function createRefreshTokenServiceMock() {
    return {
      revokeAllForUser: jest.fn().mockResolvedValue(undefined),
    };
  }

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
      findOne: jest.fn().mockResolvedValue({
        id: 1,
        nome: 'Admin',
        sobrenome: 'User',
      }),
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
      findOne: jest.fn().mockResolvedValue(undefined),
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
    const regraRepository = {};
    const permissaoRepository = {};
    const dashboardRepository = {};
    const relatorioRepository = {};
    const refreshTokenService = createRefreshTokenServiceMock();
    const service = new UsersService(
      userRepository as any,
      fotoRepository as any,
      regraRepository as any,
      permissaoRepository as any,
      dashboardRepository as any,
      relatorioRepository as any,
      refreshTokenService as any,
    );

    return {
      service,
      fotoRepository,
      transactionFotoRepository,
      transactionUserRepository,
      userRepository,
      refreshTokenService,
    };
  }

  it('hashes the password, creates the default photo and returns the user without password', async () => {
    const {
      service,
      fotoRepository,
      transactionFotoRepository,
      transactionUserRepository,
    } = buildServiceMocks();

    const user = await service.create(
      {
        nome: 'Ivan',
        sobrenome: 'Belshoff',
        email: 'ivan@example.com',
        senha: 'senha-segura',
      },
      { sub: 1, email: 'ivan@example.com', iat: 0, exp: 0 },
    );

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
      { sub: 1, email: 'ivan@example.com', iat: 0, exp: 0 },
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

  describe('findAllPaginated', () => {
    function buildListQueryMocks() {
      const queryBuilder = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([
          [
            {
              id: 1,
              nome: 'Ivan',
              sobrenome: 'Belshoff',
              email: 'ivan@example.com',
              senha: 'hashed',
            },
          ],
          1,
        ]),
      };
      const userRepository = {
        createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
      };
      const service = new UsersService(
        userRepository as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        createRefreshTokenServiceMock() as any,
      );

      return { service, queryBuilder };
    }

    it('does not apply text filter when filter is empty', async () => {
      const { service, queryBuilder } = buildListQueryMocks();

      await service.findAllPaginated({ page: 1, limit: 10, filter: '' });

      expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    });

    it('applies text filter across nome, sobrenome, email, regra and permissao', async () => {
      const { service, queryBuilder } = buildListQueryMocks();

      await service.findAllPaginated({ page: 1, limit: 10, filter: 'admin' });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('usuario.email'),
        { textFilter: '%admin%' },
      );
    });

    it('applies bloqueado filter when provided', async () => {
      const { service, queryBuilder } = buildListQueryMocks();

      await service.findAllPaginated({
        page: 1,
        limit: 10,
        bloqueado: true,
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        'usuario.bloqueado = :bloqueado',
        { bloqueado: true },
      );
    });

    it('applies regra filter when provided', async () => {
      const { service, queryBuilder } = buildListQueryMocks();

      await service.findAllPaginated({
        page: 1,
        limit: 10,
        regra: 'REGRA_USUARIO',
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('regra_exact.nome = :regraNome'),
        { regraNome: 'REGRA_USUARIO' },
      );
    });

    it('applies permissao filter when provided', async () => {
      const { service, queryBuilder } = buildListQueryMocks();

      await service.findAllPaginated({
        page: 1,
        limit: 10,
        permissao: 'PERMISSAO_CRIAR_USUARIO',
      });

      expect(queryBuilder.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('permissao_exact.nome = :permissaoNome'),
        { permissaoNome: 'PERMISSAO_CRIAR_USUARIO' },
      );
    });

    it('returns users without password', async () => {
      const { service } = buildListQueryMocks();

      const result = await service.findAllPaginated({ page: 1, limit: 10 });

      expect(result.total).toBe(1);
      expect(result.data[0]).not.toHaveProperty('senha');
      expect(result.data[0]).toMatchObject({
        id: 1,
        nome: 'Ivan',
        email: 'ivan@example.com',
      });
    });
  });

  describe('update', () => {
    it('revokes all refresh tokens when bloqueado changes from false to true', async () => {
      const {
        service,
        userRepository,
        transactionUserRepository,
        refreshTokenService,
      } = buildServiceMocks();

      userRepository.findOne.mockResolvedValue({
        id: 2,
        nome: 'User',
        sobrenome: 'Test',
        email: 'user@example.com',
        bloqueado: false,
      });
      transactionUserRepository.save.mockImplementation((user) =>
        Promise.resolve({ ...user, bloqueado: true }),
      );

      await service.update(
        2,
        { bloqueado: true },
        { sub: 1, email: 'admin@example.com' },
      );

      expect(refreshTokenService.revokeAllForUser).toHaveBeenCalledWith(2);
    });

    it('does not revoke refresh tokens when bloqueado remains false', async () => {
      const {
        service,
        userRepository,
        transactionUserRepository,
        refreshTokenService,
      } = buildServiceMocks();

      userRepository.findOne.mockResolvedValue({
        id: 2,
        nome: 'User',
        sobrenome: 'Test',
        email: 'user@example.com',
        bloqueado: false,
      });
      transactionUserRepository.save.mockImplementation((user) =>
        Promise.resolve(user),
      );

      await service.update(
        2,
        { nome: 'Updated' },
        { sub: 1, email: 'admin@example.com' },
      );

      expect(refreshTokenService.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('does not revoke refresh tokens when user is already blocked', async () => {
      const {
        service,
        userRepository,
        transactionUserRepository,
        refreshTokenService,
      } = buildServiceMocks();

      userRepository.findOne.mockResolvedValue({
        id: 2,
        nome: 'User',
        sobrenome: 'Test',
        email: 'user@example.com',
        bloqueado: true,
      });
      transactionUserRepository.save.mockImplementation((user) =>
        Promise.resolve(user),
      );

      await service.update(
        2,
        { bloqueado: true, nome: 'Updated' },
        { sub: 1, email: 'admin@example.com' },
      );

      expect(refreshTokenService.revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});
