import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';
import {
  generateOpaqueRefreshToken,
  hashRefreshToken,
} from './utils/hash-refresh-token.util';

describe('RefreshTokenService', () => {
  const createRepositoryMock = () => ({
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    createQueryBuilder: jest.fn(),
  });

  const createService = (
    repository: ReturnType<typeof createRepositoryMock>,
    transactionImpl?: (callback: (manager: { getRepository: () => typeof repository }) => Promise<unknown>) => Promise<unknown>,
  ) => {
    const dataSource = {
      transaction: jest.fn(transactionImpl ?? (async (callback) => callback({
        getRepository: () => repository,
      }))),
    };

    return new RefreshTokenService(repository as any, dataSource as any);
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('issues a refresh token and stores only its hash', async () => {
    const repository = createRepositoryMock();
    repository.save.mockResolvedValue({ id: 1 });
    const service = createService(repository);

    const result = await service.issue(10);

    expect(result.rawToken).toBeDefined();
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(repository.save).toHaveBeenCalledWith({
      usuario_id: 10,
      token_hash: hashRefreshToken(result.rawToken),
      expira_em: result.expiresAt,
    });
  });

  it('rotates a valid refresh token and revokes the previous one', async () => {
    const repository = createRepositoryMock();
    const rawToken = generateOpaqueRefreshToken();
    const storedToken = {
      id: 1,
      usuario_id: 10,
      token_hash: hashRefreshToken(rawToken),
      expira_em: new Date(Date.now() + 60_000),
      revogado_em: null,
    };

    repository.findOne.mockResolvedValue(storedToken);
    repository.update.mockResolvedValue(undefined);
    repository.save.mockResolvedValue({ id: 2 });

    const service = createService(repository);
    const result = await service.rotate(rawToken);

    expect(result.usuarioId).toBe(10);
    expect(result.rawToken).not.toBe(rawToken);
    expect(repository.update).toHaveBeenCalledWith(
      storedToken.id,
      expect.objectContaining({
        revogado_em: expect.any(Date),
        novo_token: hashRefreshToken(result.rawToken),
      }),
    );
    expect(repository.save).toHaveBeenCalledWith({
      usuario_id: 10,
      token_hash: hashRefreshToken(result.rawToken),
      expira_em: result.expiresAt,
    });
  });

  it('throws when the refresh token does not exist', async () => {
    const repository = createRepositoryMock();
    repository.findOne.mockResolvedValue(null);
    const service = createService(repository);

    await expect(service.rotate('missing-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes all user tokens when a revoked token is reused', async () => {
    const repository = createRepositoryMock();
    const rawToken = generateOpaqueRefreshToken();
    const storedToken = {
      id: 1,
      usuario_id: 10,
      token_hash: hashRefreshToken(rawToken),
      expira_em: new Date(Date.now() + 60_000),
      revogado_em: new Date(),
    };
    const execute = jest.fn().mockResolvedValue(undefined);
    const andWhere = jest.fn().mockReturnValue({ execute });
    const where = jest.fn().mockReturnValue({ andWhere });
    const set = jest.fn().mockReturnValue({ where });
    repository.findOne.mockResolvedValue(storedToken);
    repository.createQueryBuilder.mockReturnValue({ update: () => ({ set }) });

    const service = createService(repository);

    await expect(service.rotate(rawToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(execute).toHaveBeenCalled();
  });

  it('throws and revokes when the refresh token is expired', async () => {
    const repository = createRepositoryMock();
    const rawToken = generateOpaqueRefreshToken();
    const storedToken = {
      id: 1,
      usuario_id: 10,
      token_hash: hashRefreshToken(rawToken),
      expira_em: new Date(Date.now() - 60_000),
      revogado_em: null,
    };

    repository.findOne.mockResolvedValue(storedToken);
    repository.update.mockResolvedValue(undefined);

    const service = createService(repository);

    await expect(service.rotate(rawToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(repository.update).toHaveBeenCalledWith(storedToken.id, {
      revogado_em: expect.any(Date),
    });
  });

  it('revokes an active refresh token on logout', async () => {
    const repository = createRepositoryMock();
    const rawToken = generateOpaqueRefreshToken();
    const storedToken = {
      id: 1,
      usuario_id: 10,
      token_hash: hashRefreshToken(rawToken),
      revogado_em: null,
    };

    repository.findOne.mockResolvedValue(storedToken);
    repository.update.mockResolvedValue(undefined);

    const service = createService(repository);
    await service.revoke(rawToken);

    expect(repository.update).toHaveBeenCalledWith(storedToken.id, {
      revogado_em: expect.any(Date),
    });
  });

  it('ignores logout when the refresh token is already revoked', async () => {
    const repository = createRepositoryMock();
    const rawToken = generateOpaqueRefreshToken();

    repository.findOne.mockResolvedValue({
      id: 1,
      usuario_id: 10,
      token_hash: hashRefreshToken(rawToken),
      revogado_em: new Date(),
    });

    const service = createService(repository);
    await service.revoke(rawToken);

    expect(repository.update).not.toHaveBeenCalled();
  });
});
