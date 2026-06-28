import { BadRequestException } from '@nestjs/common';
import {
  assertRolePermissionAssignment,
  filterCompatiblePermissions,
  findIncompatiblePermissions,
} from './RolePermissionPolicy';
import { Permissao } from 'src/database/entities/Permissoes';
import { Regra } from 'src/database/entities/Regras';

describe('RolePermissionPolicy', () => {
  const regraUsuario = {
    id: 1,
    nome: 'REGRA_USUARIO',
  } as Regra;

  const regraDashboard = {
    id: 2,
    nome: 'REGRA_DASHBOARD',
  } as Regra;

  const permissaoCriarUsuario = {
    id: 10,
    nome: 'PERMISSAO_CRIAR_USUARIO',
    regra: regraUsuario,
  } as Permissao;

  const permissaoCriarDashboard = {
    id: 20,
    nome: 'PERMISSAO_CRIAR_DASHBOARD',
    regra: regraDashboard,
  } as Permissao;

  it('accepts permissions that belong to assigned roles', () => {
    expect(() =>
      assertRolePermissionAssignment(
        [regraUsuario],
        [permissaoCriarUsuario],
        [1],
        [10],
      ),
    ).not.toThrow();
  });

  it('rejects permissions that do not belong to assigned roles', () => {
    expect(() =>
      assertRolePermissionAssignment(
        [regraUsuario],
        [permissaoCriarDashboard],
        [1],
        [20],
      ),
    ).toThrow(BadRequestException);
  });

  it('identifies incompatible permissions', () => {
    const incompatible = findIncompatiblePermissions(
      [regraUsuario],
      [permissaoCriarDashboard],
    );

    expect(incompatible).toEqual([
      {
        permissao: 'PERMISSAO_CRIAR_DASHBOARD',
        regra_da_permissao: 'REGRA_DASHBOARD',
        regras_selecionadas: ['REGRA_USUARIO'],
      },
    ]);
  });

  it('filters only compatible permissions for runtime authorization', () => {
    const compatible = filterCompatiblePermissions(
      [regraUsuario],
      [permissaoCriarUsuario, permissaoCriarDashboard],
    );

    expect(compatible.map((permissao) => permissao.nome)).toEqual([
      'PERMISSAO_CRIAR_USUARIO',
    ]);
  });

  it('rejects permissions without any assigned role', () => {
    expect(() =>
      assertRolePermissionAssignment([], [permissaoCriarUsuario], [], [10]),
    ).toThrow(BadRequestException);
  });
});
