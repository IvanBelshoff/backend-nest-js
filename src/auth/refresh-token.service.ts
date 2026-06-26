import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, Repository } from 'typeorm';
import { RefreshToken } from 'src/database/entities/RefreshTokens';
import { refreshTokenConstants } from './constants';
import {
  generateOpaqueRefreshToken,
  hashRefreshToken,
} from './utils/hash-refresh-token.util';

export interface IssuedRefreshToken {
  rawToken: string;
  expiresAt: Date;
}

export interface RotatedRefreshToken extends IssuedRefreshToken {
  usuarioId: number;
}

@Injectable()
export class RefreshTokenService {
  constructor(
    @Inject('REFRESH_TOKEN_REPOSITORY')
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @Inject('DATA_SOURCE')
    private readonly dataSource: DataSource,
  ) {}

  async issue(usuarioId: number): Promise<IssuedRefreshToken> {
    const rawToken = generateOpaqueRefreshToken();
    const expiresAt = this.getExpirationDate();
    const tokenHash = hashRefreshToken(rawToken);

    await this.refreshTokenRepository.save({
      usuario_id: usuarioId,
      token_hash: tokenHash,
      expira_em: expiresAt,
    });

    return { rawToken, expiresAt };
  }

  async rotate(rawToken: string): Promise<RotatedRefreshToken> {
    const tokenHash = hashRefreshToken(rawToken);

    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RefreshToken);
      const storedToken = await repository.findOne({
        where: { token_hash: tokenHash },
      });

      if (!storedToken) {
        throw new UnauthorizedException();
      }

      if (storedToken.revogado_em) {
        await this.revokeAllForUser(repository, storedToken.usuario_id);
        throw new UnauthorizedException();
      }

      if (storedToken.expira_em.getTime() < Date.now()) {
        await repository.update(storedToken.id, {
          revogado_em: new Date(),
        });
        throw new UnauthorizedException();
      }

      const newRawToken = generateOpaqueRefreshToken();
      const newExpiresAt = this.getExpirationDate();
      const newTokenHash = hashRefreshToken(newRawToken);

      await repository.update(storedToken.id, {
        revogado_em: new Date(),
        novo_token: newTokenHash,
      });

      await repository.save({
        usuario_id: storedToken.usuario_id,
        token_hash: newTokenHash,
        expira_em: newExpiresAt,
      });

      return {
        usuarioId: storedToken.usuario_id,
        rawToken: newRawToken,
        expiresAt: newExpiresAt,
      };
    });
  }

  async revoke(rawToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(rawToken);
    const storedToken = await this.refreshTokenRepository.findOne({
      where: { token_hash: tokenHash },
    });

    if (!storedToken || storedToken.revogado_em) {
      return;
    }

    await this.refreshTokenRepository.update(storedToken.id, {
      revogado_em: new Date(),
    });
  }

  private async revokeAllForUser(
    repository: Repository<RefreshToken>,
    usuarioId: number,
  ): Promise<void> {
    await repository
      .createQueryBuilder()
      .update(RefreshToken)
      .set({ revogado_em: new Date() })
      .where('usuario_id = :usuarioId', { usuarioId })
      .andWhere('revogado_em IS NULL')
      .execute();
  }

  private getExpirationDate(): Date {
    return new Date(Date.now() + refreshTokenConstants.ttlMs);
  }
}
