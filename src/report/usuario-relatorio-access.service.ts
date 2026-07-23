import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Privacidade } from 'src/database/entities/privacidade.enum';
import { Relatorio } from 'src/database/entities/Relatorios';
import { Usuario } from 'src/database/entities/Usuarios';
import { UsuarioRelatorio } from 'src/database/entities/UsuarioRelatorio';
import { isPublicVisibleReport } from './report-ai-knowledge.util';
import {
  relatorioHasUserGrant,
  userHasRelatorioGrant,
} from 'src/shared/utils/usuario-relatorio.util';
import { AuditService } from 'src/audit/audit.service';
import { AUDIT_ACTIONS } from 'src/audit/constants/audit-actions';
import { toAuditActor } from 'src/audit/utils/audit-actor.util';
import { buildAuditChanges } from 'src/audit/utils/build-audit-changes.util';
import { ACL_IA_KNOWLEDGE_AUDIT_PROFILE } from 'src/audit/utils/audit-field-profiles';
import { toAuditRecordMetadata } from 'src/audit/utils/audit-metadata.util';

@Injectable()
export class UsuarioRelatorioAccessService {
  constructor(
    @InjectRepository(Usuario)
    private readonly userRepository: Repository<Usuario>,
    @InjectRepository(Relatorio)
    private readonly relatorioRepository: Repository<Relatorio>,
    @InjectRepository(UsuarioRelatorio)
    private readonly usuarioRelatorioRepository: Repository<UsuarioRelatorio>,
    private readonly auditService: AuditService,
  ) {}

  async ensureOwnerGrant(relatorioId: number): Promise<void> {
    const relatorio = await this.relatorioRepository.findOne({
      where: { id: relatorioId },
    });

    if (
      !relatorio ||
      relatorio.privacidade !== Privacidade.PRIVAT ||
      !relatorio.id_proprietario
    ) {
      return;
    }

    await this.usuarioRelatorioRepository
      .createQueryBuilder()
      .insert()
      .into(UsuarioRelatorio)
      .values({
        usuarioId: Number(relatorio.id_proprietario),
        relatorioId: Number(relatorio.id),
        permitirConhecimentoIa: false,
      })
      .orIgnore()
      .execute();
  }

  async updatePermitirConhecimentoIa(
    usuarioId: number,
    relatorioId: number,
    permitirConhecimentoIa: boolean,
    requester?: { sub: number; email: string },
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: usuarioId },
      relations: { usuarioRelatorios: true },
    });

    if (!user) {
      throw new NotFoundException('Usuário não localizado');
    }

    if (user.bloqueado) {
      throw new ForbiddenException('Usuário bloqueado');
    }

    const relatorio = await this.relatorioRepository.findOne({
      where: { id: relatorioId },
      relations: { usuarioRelatorios: true },
    });

    if (!relatorio) {
      throw new NotFoundException('Relatório não localizado');
    }

    if (isPublicVisibleReport(relatorio)) {
      throw new BadRequestException(
        'Relatórios públicos visíveis já possuem conhecimento da IA habilitado automaticamente.',
      );
    }

    if (relatorio.privacidade === Privacidade.PRIVAT) {
      const isOwner = Number(relatorio.id_proprietario) === Number(usuarioId);
      const hasGrant =
        userHasRelatorioGrant(user, relatorioId) ||
        relatorioHasUserGrant(relatorio, usuarioId);

      if (!isOwner && !hasGrant) {
        throw new ForbiddenException(
          'Usuário não possui acesso a este relatório privado.',
        );
      }
    }

    const existingGrant = user.usuarioRelatorios?.find(
      (grant) => Number(grant.relatorioId) === relatorioId,
    );
    const beforeSnapshot = {
      permitirConhecimentoIa: existingGrant?.permitirConhecimentoIa ?? false,
    };

    await this.usuarioRelatorioRepository
      .createQueryBuilder()
      .insert()
      .into(UsuarioRelatorio)
      .values({
        usuarioId,
        relatorioId,
        permitirConhecimentoIa,
      })
      .orUpdate(['permitir_conhecimento_ia'], ['usuario_id', 'relatorio_id'])
      .execute();

    if (requester) {
      this.auditService.record({
        actor: toAuditActor(requester),
        action: AUDIT_ACTIONS.REPORT_ACL_IA_KNOWLEDGE_UPDATE,
        category: 'acl',
        outcome: 'success',
        resource: { type: 'relatorio', id: relatorioId },
        metadata: toAuditRecordMetadata(
          buildAuditChanges(
            beforeSnapshot,
            { permitirConhecimentoIa },
            ACL_IA_KNOWLEDGE_AUDIT_PROFILE,
          ),
          { usuarioId },
        ),
      });
    }
  }
}
