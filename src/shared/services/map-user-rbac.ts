import type { Usuario } from 'src/database/entities/Usuarios';
import { filterCompatiblePermissions } from './RolePermissionPolicy';

export type UserRbacDto = {
  regras: string[];
  permissoes: string[];
};

export function mapUserRbac(user: Usuario): UserRbacDto {
  const regras = user.regra ?? [];
  const permissoes = filterCompatiblePermissions(regras, user.permissao ?? []);

  return {
    regras: regras.map((regra) => regra.nome),
    permissoes: permissoes.map((permissao) => permissao.nome),
  };
}
