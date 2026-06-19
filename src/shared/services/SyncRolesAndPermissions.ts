import { Inject } from '@nestjs/common';
import { Permissao } from 'src/database/entities/Permissoes';
import { Regra } from 'src/database/entities/Regras';
import { PermissionService } from 'src/permission/permission.service';
import { RoleService } from 'src/role/role.service';
import { Repository } from 'typeorm';

interface IPermissao {
  nome: string;
  nome_regra?: string;
}

interface IRegra {
  nome: string;
  permissoes: IPermissao[];
}

type RegrasPermissoesEnv = Record<string, string[]>;

export class SyncRolesAndPermissions {
  constructor(
    @Inject('PERMISSION_REPOSITORY')
    private permissionRepository?: Repository<Permissao>,
    @Inject('ROLE_REPOSITORY')
    private roleRepository?: Repository<Regra>,
    private readonly permissionService?: PermissionService,
    private readonly roleService?: RoleService,
  ) {}

  private extrairNomeEmMinusculo = (texto: string): string => {
    const partes = texto.split('_');
    return (partes[1] ?? texto).toLowerCase();
  };

  private convertRegras = (
    regrasDoBanco: Regra[],
  ): Record<string, string[]> => {
    const formattedResult: Record<string, string[]> = {};

    regrasDoBanco.forEach((regraBD) => {
      formattedResult[regraBD.nome] = regraBD.permissao.map(
        (permissao: Permissao) => permissao.nome,
      );
    });

    return formattedResult;
  };

  private loadRegrasPermissoesEnv = (): RegrasPermissoesEnv => {
    const rawValue = process.env.REGRAS_PERMISSOES || '{}';

    try {
      const parsedValue = JSON.parse(rawValue) as unknown;

      if (
        !parsedValue ||
        typeof parsedValue !== 'object' ||
        Array.isArray(parsedValue)
      ) {
        return {};
      }

      return parsedValue as RegrasPermissoesEnv;
    } catch (error) {
      return {};
    }
  };

  private hasSingleItemChange = (
    addedCount: number,
    removedCount: number,
  ): boolean => addedCount === 1 && removedCount === 1;

  private getCurrentRulesSnapshot = async (): Promise<
    Record<string, string[]>
  > => {
    return this.convertRegras(
      await this.roleRepository.find({ relations: { permissao: true } }),
    );
  };

  private renameRoleIfNeeded = async (
    regrasBD: Regra[],
    regrasAdicionadas: IRegra[],
    regrasRemovidas: Regra[],
  ): Promise<boolean> => {
    if (
      !this.hasSingleItemChange(
        regrasAdicionadas.length,
        regrasRemovidas.length,
      )
    ) {
      return false;
    }

    const regraAtualizada = regrasBD.find(
      (regra) => regra.nome === regrasRemovidas[0].nome,
    );

    if (!regraAtualizada) {
      return false;
    }

    const novaRegra = regrasAdicionadas[0];
    const atualizaRegra = await this.permissionService.updateById(
      regraAtualizada.id,
      {
        nome: novaRegra.nome,
        descricao: `Gerenciamento de ${this.extrairNomeEmMinusculo(novaRegra.nome)}`,
      },
    );

    return true;
  };

  private renamePermissionIfNeeded = async (
    permissoesBD: (Permissao & { regra: Regra })[],
    permissoesAdicionadas: IPermissao[],
    permissoesRemovidas: Permissao[],
  ): Promise<boolean> => {
    if (
      !this.hasSingleItemChange(
        permissoesAdicionadas.length,
        permissoesRemovidas.length,
      )
    ) {
      return false;
    }

    const permissaoAtualizada = permissoesBD.find(
      (permissao) => permissao.nome === permissoesRemovidas[0].nome,
    );

    if (!permissaoAtualizada) {
      return false;
    }

    const novaPermissao = permissoesAdicionadas[0];
    const atualizaPermissao = await this.permissionService.updateById(
      permissaoAtualizada.id,
      {
        nome: novaPermissao.nome,
        descricao: `Gerenciamento do método: ${this.extrairNomeEmMinusculo(permissaoAtualizada.regra.nome)} ${this.extrairNomeEmMinusculo(novaPermissao.nome)}`,
      },
    );

    return true;
  };

  private createPermissionsForRole = async (
    roleId: number,
    roleName: string,
    permissions: IPermissao[],
  ): Promise<void | Error> => {
    for (const permissaoAdicionada of permissions) {
      const result = await this.permissionService.create({
        regra_id: roleId,
        nome: permissaoAdicionada.nome,
        descricao: `Gerenciamento do método: ${this.extrairNomeEmMinusculo(permissaoAdicionada.nome)} ${this.extrairNomeEmMinusculo(roleName)}`,
      });
    }

    return;
  };

  private createAddedRoles = async (
    regrasAdicionadas: IRegra[],
  ): Promise<void | Error> => {
    for (const regraAdicionada of regrasAdicionadas) {
      const regra = await this.roleService.create({
        nome: regraAdicionada.nome,
        descricao: `Gerenciamento de ${this.extrairNomeEmMinusculo(regraAdicionada.nome)}`,
      });

      if (regraAdicionada.nome === 'REGRA_ADMIN') {
        continue;
      }

      const permissionsResult = await this.createPermissionsForRole(
        regra,
        regraAdicionada.nome,
        regraAdicionada.permissoes,
      );

      if (permissionsResult instanceof Error) {
        return permissionsResult;
      }
    }

    return;
  };

  private createAddedPermissions = async (
    permissoesAdicionadas: IPermissao[],
  ): Promise<void | Error> => {
    for (const permissaoAdicionada of permissoesAdicionadas) {
      const regra = await this.roleRepository.findOne({
        where: { nome: permissaoAdicionada.nome_regra },
      });

      if (!regra) {
        continue;
      }

      const permissao = await this.permissionService.create({
        regra_id: regra.id,
        nome: permissaoAdicionada.nome,
        descricao: `Gerenciamento do método: ${this.extrairNomeEmMinusculo(regra.nome)} ${this.extrairNomeEmMinusculo(permissaoAdicionada.nome)}`,
      });
    }

    return;
  };

  private removeRoles = async (
    regrasRemovidas: Regra[],
  ): Promise<void | Error> => {
    for (const regraRemovida of regrasRemovidas) {
      if (regraRemovida.nome === 'REGRA_ADMIN') {
        await this.getCurrentRulesSnapshot();
        continue;
      }

      const regra = await this.roleService.delete(regraRemovida.id);
    }

    return;
  };

  private removePermissions = async (
    permissoesRemovidas: Permissao[],
  ): Promise<void | Error> => {
    for (const permissaoRemovida of permissoesRemovidas) {
      const permissao = await this.permissionService.delete(
        permissaoRemovida.id,
      );
    }

    return;
  };

  public async syncRolesAndPermissions() {
    const regrasPermissoesEnv = this.loadRegrasPermissoesEnv();

    const permissoesEnv: IPermissao[] = Object.entries(
      regrasPermissoesEnv,
    ).flatMap(([regra, permissoes]) =>
      permissoes.map((permissao) => ({ nome: permissao, nome_regra: regra })),
    );

    const regrasEnv = Object.keys(regrasPermissoesEnv);

    const regrasEPermissoesEnv: IRegra[] = Object.entries(
      regrasPermissoesEnv,
    ).map(([regra, permissoes]) => ({
      nome: regra,
      permissoes: permissoes.map((permissao) => ({ nome: permissao })),
    }));

    const regrasBD = await this.roleRepository.find({
      relations: { permissao: true },
    });

    const permissoesBD = await this.permissionRepository.find({
      relations: { regra: true },
    });

    const regras_mantidas = regrasBD.filter((regra) => {
      return regrasEPermissoesEnv.some(
        (regraEnv) => regraEnv.nome === regra.nome,
      );
    });

    const regras_adicionadas: IRegra[] = regrasEPermissoesEnv.filter(
      (regraEnv) => {
        return !regrasBD.some((regraBD) => regraBD.nome === regraEnv.nome);
      },
    );

    const regras_removidas = regrasBD.filter((regraBD) => {
      return !regrasEPermissoesEnv.some(
        (regraEnv) => regraEnv.nome === regraBD.nome,
      );
    });

    const permissoesBDFiltradas = regrasEPermissoesEnv
      .map((regraEnv) =>
        regras_mantidas
          .filter((regraMantida) => regraMantida.nome === regraEnv.nome)
          .flatMap((permissao) => permissao.permissao),
      )
      .flat();

    const permissoes_mantidas = permissoesBDFiltradas.filter((permissaoBD) => {
      return permissoesEnv.some(
        (permissaoEnv) => permissaoEnv.nome === permissaoBD.nome,
      );
    });

    const permissoes_adicionadas: IPermissao[] = permissoesEnv.filter(
      (permissaoEnv) => {
        return !permissoesBDFiltradas.some(
          (permissaoBD) => permissaoBD.nome === permissaoEnv.nome,
        );
      },
    );

    const permissoes_removidas = permissoesBDFiltradas.filter((permissaoBD) => {
      return !permissoesEnv.some(
        (permissaoEnv) => permissaoEnv.nome === permissaoBD.nome,
      );
    });

    if (
      await this.renameRoleIfNeeded(
        regrasBD,
        regras_adicionadas,
        regras_removidas,
      )
    ) {
      return;
    }

    if (
      await this.renamePermissionIfNeeded(
        permissoesBD,
        permissoes_adicionadas,
        permissoes_removidas,
      )
    ) {
      return;
    }

    if (regrasEnv.length === 0) {
      await this.getCurrentRulesSnapshot();
      return;
    }

    const createdRolesResult = await this.createAddedRoles(regras_adicionadas);
    if (createdRolesResult instanceof Error) {
      return;
    }

    const createdPermissionsResult = await this.createAddedPermissions(
      permissoes_adicionadas,
    );
    if (createdPermissionsResult instanceof Error) {
      return;
    }

    const removedRolesResult = await this.removeRoles(regras_removidas);
    if (removedRolesResult instanceof Error) {
      return;
    }

    const removedPermissionsResult =
      await this.removePermissions(permissoes_removidas);
    if (removedPermissionsResult instanceof Error) {
      return;
    }

    if (
      regras_mantidas.length === 0 &&
      regras_adicionadas.length === 0 &&
      regras_removidas.length === 0 &&
      permissoes_mantidas.length === 0 &&
      permissoes_adicionadas.length === 0 &&
      permissoes_removidas.length === 0
    ) {
      return;
    }

    if (
      regras_mantidas.length === 0 &&
      regras_adicionadas.length === 0 &&
      regras_removidas.length === 0
    ) {
      return;
    }

    if (
      permissoes_mantidas.length === 0 &&
      permissoes_adicionadas.length === 0 &&
      permissoes_removidas.length === 0
    ) {
      return;
    }

    const regrasConvertidas = this.convertRegras(
      await this.roleRepository.find({ relations: { permissao: true } }),
    );

    console.log(
      'Regras e Permissões sincronizadas com sucesso!',
      regrasConvertidas,
    );

    return;
  }
}
