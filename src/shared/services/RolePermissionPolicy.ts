import { BadRequestException } from '@nestjs/common';
import { Permissao } from 'src/database/entities/Permissoes';
import { Regra } from 'src/database/entities/Regras';
import { logger } from './Logger';

export const ADMIN_ROLE_NAME = 'REGRA_ADMIN';

export const ADMIN_WITH_PERMISSIONS_ERROR =
  'REGRA_ADMIN não pode possuir permissões';

export const ADMIN_WITH_OTHER_ROLES_ERROR =
  'REGRA_ADMIN não pode ser combinada com outras regras';

export interface IncompatiblePermissionDetail {
  permissao: string;
  regra_da_permissao: string;
  regras_selecionadas: string[];
}

export function assertAdminPolicy(
  regras: Regra[],
  permissoes: Permissao[],
): void {
  const hasAdmin = regras.some((regra) => regra.nome === ADMIN_ROLE_NAME);

  if (hasAdmin && regras.length > 1) {
    throw new BadRequestException(ADMIN_WITH_OTHER_ROLES_ERROR);
  }

  if (hasAdmin && permissoes.length > 0) {
    throw new BadRequestException(ADMIN_WITH_PERMISSIONS_ERROR);
  }
}

export function findIncompatiblePermissions(
  regras: Regra[],
  permissoes: Permissao[],
): IncompatiblePermissionDetail[] {
  const roleIds = new Set(regras.map((regra) => Number(regra.id)));

  return permissoes
    .filter(
      (permissao) =>
        !permissao.regra || !roleIds.has(Number(permissao.regra.id)),
    )
    .map((permissao) => ({
      permissao: permissao.nome,
      regra_da_permissao: permissao.regra?.nome ?? 'desconhecida',
      regras_selecionadas: regras.map((regra) => regra.nome),
    }));
}

export function filterCompatiblePermissions(
  regras: Regra[],
  permissoes: Permissao[],
): Permissao[] {
  const roleIds = new Set(regras.map((regra) => Number(regra.id)));

  return permissoes.filter(
    (permissao) =>
      permissao.regra && roleIds.has(Number(permissao.regra.id)),
  );
}

export function assertRolePermissionAssignment(
  regras: Regra[],
  permissoes: Permissao[],
  requestedRegraIds: number[],
  requestedPermissaoIds: number[],
  context?: {
    userId?: number;
    sourceUserId?: number;
    operation?: string;
  },
): void {
  if (regras.length !== requestedRegraIds.length) {
    throw new BadRequestException({
      message: 'Uma ou mais regras informadas não foram encontradas',
      regras_solicitadas: requestedRegraIds,
      regras_encontradas: regras.map((regra) => regra.id),
    });
  }

  if (permissoes.length !== requestedPermissaoIds.length) {
    throw new BadRequestException({
      message: 'Uma ou mais permissões informadas não foram encontradas',
      permissoes_solicitadas: requestedPermissaoIds,
      permissoes_encontradas: permissoes.map((permissao) => permissao.id),
    });
  }

  assertAdminPolicy(regras, permissoes);

  if (permissoes.length > 0 && regras.length === 0) {
    throw new BadRequestException(
      'Permissões não podem ser atribuídas sem regras compatíveis',
    );
  }

  const incompatible = findIncompatiblePermissions(regras, permissoes);

  if (incompatible.length === 0) {
    return;
  }

  for (const detail of incompatible) {
    logger.warn('Permission not allowed for selected roles', {
      ...context,
      permissionName: detail.permissao,
      permissionRole: detail.regra_da_permissao,
      selectedRoles: detail.regras_selecionadas,
    });
  }

  throw new BadRequestException({
    message: 'Permissões incompatíveis com as regras selecionadas',
    errors: incompatible,
  });
}
