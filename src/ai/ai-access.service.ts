import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from 'src/database/entities/Usuarios';
import { ReportService } from 'src/report/report.service';

export const AI_ROLE_NAME = 'REGRA_IA';
export const ADMIN_ROLE_NAME = 'REGRA_ADMIN';
export const USER_ROLE_NAME = 'REGRA_USUARIO';
export const DASHBOARD_ROLE_NAME = 'REGRA_DASHBOARD';

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
    private readonly reportService: ReportService,
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

  async hasRole(userId: number, roleName: string): Promise<boolean> {
    const user = await this.loadUser(userId);
    if (this.userIsAdmin(user)) {
      return true;
    }

    return (user.regra ?? []).some((regra) => regra.nome === roleName);
  }

  async canMentionUsers(userId: number): Promise<boolean> {
    return this.hasRole(userId, USER_ROLE_NAME);
  }

  async canMentionDashboards(userId: number): Promise<boolean> {
    return this.hasRole(userId, DASHBOARD_ROLE_NAME);
  }

  private async loadUser(userId: number): Promise<Usuario> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { regra: true },
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
    const hasAiAccess =
      isAdmin ||
      (user.regra ?? []).some((regra) => regra.nome === AI_ROLE_NAME);

    if (!hasAiAccess) {
      return {
        eligible: false,
        reason: 'Regra REGRA_IA não concedida.',
        relatoriosDisponiveis: 0,
        isAdmin,
      };
    }

    if (isAdmin) {
      const relatoriosDisponiveis =
        await this.reportService.countReportsWithAiKnowledge(Number(user.id));

      return {
        eligible: true,
        relatoriosDisponiveis,
        isAdmin: true,
      };
    }

    return await this.evaluateReportGrants(Number(user.id));
  }

  private async evaluateReportGrants(userId: number): Promise<AiAccessStatus> {
    const relatoriosDisponiveis =
      await this.reportService.countReportsWithAiKnowledge(userId);

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
