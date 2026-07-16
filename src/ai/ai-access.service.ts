import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from 'src/database/entities/Usuarios';
import { UsuarioRelatorio } from 'src/database/entities/UsuarioRelatorio';

export const AI_USE_PERMISSION = 'PERMISSAO_USAR_IA';
export const ADMIN_ROLE_NAME = 'REGRA_ADMIN';

export interface AiAccessStatus {
  eligible: boolean;
  reason?: string;
  relatoriosDisponiveis: number;
  isAdmin: boolean;
}

@Injectable()
export class AiAccessService {
  constructor(
    @InjectRepository(Usuario)
    private readonly userRepository: Repository<Usuario>,
    @InjectRepository(UsuarioRelatorio)
    private readonly usuarioRelatorioRepository: Repository<UsuarioRelatorio>,
  ) {}

  async getAccessStatus(userId: number): Promise<AiAccessStatus> {
    const user = await this.loadUser(userId);
    return this.evaluateAccess(user);
  }

  async assertCanUseAi(userId: number): Promise<AiAccessStatus> {
    const status = await this.getAccessStatus(userId);

    if (!status.eligible) {
      throw new ForbiddenException(
        status.reason ?? 'Acesso à IA não permitido para este usuário.',
      );
    }

    return status;
  }

  async isAdmin(userId: number): Promise<boolean> {
    const user = await this.loadUser(userId);
    return this.userIsAdmin(user);
  }

  private async loadUser(userId: number): Promise<Usuario> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { regra: true, permissao: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    return user;
  }

  private async evaluateAccess(user: Usuario): Promise<AiAccessStatus> {
    if (user.bloqueado) {
      return {
        eligible: false,
        reason: 'Usuário bloqueado não pode usar a IA.',
        relatoriosDisponiveis: 0,
        isAdmin: false,
      };
    }

    const isAdmin = this.userIsAdmin(user);
    const hasPermission =
      isAdmin ||
      (user.permissao ?? []).some(
        (permissao) => permissao.nome === AI_USE_PERMISSION,
      );

    if (!hasPermission) {
      return {
        eligible: false,
        reason: 'Permissão PERMISSAO_USAR_IA não concedida.',
        relatoriosDisponiveis: 0,
        isAdmin,
      };
    }

    if (isAdmin) {
      return {
        eligible: true,
        relatoriosDisponiveis: Number.MAX_SAFE_INTEGER,
        isAdmin: true,
      };
    }

    return await this.evaluateReportGrants(Number(user.id));
  }

  private async evaluateReportGrants(userId: number): Promise<AiAccessStatus> {
    const relatoriosDisponiveis = await this.usuarioRelatorioRepository.count({
      where: {
        usuarioId: userId,
        permitirConhecimentoIa: true,
      },
    });

    if (relatoriosDisponiveis < 1) {
      return {
        eligible: false,
        reason:
          'Nenhum relatório com conhecimento da IA habilitado para este usuário.',
        relatoriosDisponiveis: 0,
        isAdmin: false,
      };
    }

    return {
      eligible: true,
      relatoriosDisponiveis,
      isAdmin: false,
    };
  }

  private userIsAdmin(user: Usuario): boolean {
    return (user.regra ?? []).some((regra) => regra.nome === ADMIN_ROLE_NAME);
  }
}
