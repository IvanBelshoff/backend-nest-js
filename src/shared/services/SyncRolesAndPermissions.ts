import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Permissao } from 'src/database/entities/Permissoes';
import { Regra } from 'src/database/entities/Regras';
import { PermissionService } from 'src/permission/permission.service';
import { RoleService } from 'src/role/role.service';
import { Repository } from 'typeorm';
import { logger } from './Logger';

interface IPermissao {
  nome: string;
  nome_regra?: string;
}

interface IRegra {
  nome: string;
  permissoes: IPermissao[];
}

type RegrasPermissoesEnv = Record<string, string[]>;

@Injectable()
export class SyncRolesAndPermissions implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(Permissao)
    private permissionRepository: Repository<Permissao>,
    @InjectRepository(Regra)
    private roleRepository: Repository<Regra>,
    private readonly permissionService: PermissionService,
    private readonly roleService: RoleService,
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
        logger.warn('REGRAS_PERMISSOES is not a valid object', { rawValue });
        return {};
      }

      return parsedValue as RegrasPermissoesEnv;
    } catch (error) {
      logger.error('Failed to parse REGRAS_PERMISSOES', {
        error: error instanceof Error ? error.message : String(error),
      });
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

    await this.permissionService.updateById(regraAtualizada.id, {
      nome: novaRegra.nome,
      descricao: `Gerenciamento de ${this.extrairNomeEmMinusculo(novaRegra.nome)}`,
    });

    logger.info('Role renamed during sync', {
      from: regrasRemovidas[0].nome,
      to: novaRegra.nome,
    });

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
    await this.permissionService.updateById(permissaoAtualizada.id, {
      nome: novaPermissao.nome,
      descricao: `Gerenciamento do método: ${this.extrairNomeEmMinusculo(permissaoAtualizada.regra.nome)} ${this.extrairNomeEmMinusculo(novaPermissao.nome)}`,
    });

    logger.info('Permission renamed during sync', {
      from: permissoesRemovidas[0].nome,
      to: novaPermissao.nome,
    });
    return true;
  };

  private createPermissionsForRole = async (
    roleId: number,
    roleName: string,
    permissions: IPermissao[],
  ): Promise<void | Error> => {
    for (const permissaoAdicionada of permissions) {
      await this.permissionService.create({
        regra_id: roleId,
        nome: permissaoAdicionada.nome,
        descricao: `Gerenciamento do método: ${this.extrairNomeEmMinusculo(permissaoAdicionada.nome)} ${this.extrairNomeEmMinusculo(roleName)}`,
      });

      logger.info('Permission created for role during sync', {
        roleName,
        permissionName: permissaoAdicionada.nome,
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

      logger.info('Role created during sync', {
        roleName: regraAdicionada.nome,
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
        logger.error('Failed to create permission for new role during sync', {
          roleName: regraAdicionada.nome,
          error: permissionsResult.message,
        });
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
        logger.warn('Permission has no role during sync', {
          permissionName: permissaoAdicionada.nome,
        });
        continue;
      }

      await this.permissionService.create({
        regra_id: regra.id,
        nome: permissaoAdicionada.nome,
        descricao: `Gerenciamento do método: ${this.extrairNomeEmMinusculo(regra.nome)} ${this.extrairNomeEmMinusculo(permissaoAdicionada.nome)}`,
      });

      logger.info('Standalone permission created during sync', {
        permissionName: permissaoAdicionada.nome,
        roleName: regra.nome,
      });
    }

    return;
  };

  private removeRoles = async (
    regrasRemovidas: Regra[],
  ): Promise<void | Error> => {
    for (const regraRemovida of regrasRemovidas) {
      if (regraRemovida.nome === 'REGRA_ADMIN') {
        logger.warn('Attempt to remove REGRA_ADMIN blocked during sync', {
          restoreValue: await this.getCurrentRulesSnapshot(),
        });
        continue;
      }

      logger.info('Role removed during sync', { roleName: regraRemovida.nome });
    }

    return;
  };

  private removePermissions = async (
    permissoesRemovidas: Permissao[],
  ): Promise<void | Error> => {
    for (const permissaoRemovida of permissoesRemovidas) {
      await this.permissionService.delete(permissaoRemovida.id);

      logger.info('Permission removed during sync', {
        permissionName: permissaoRemovida.nome,
      });
    }

    return;
  };

  public async syncRolesAndPermissions() {
    console.log('Sincronizando regras e permissões...');

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
      logger.warn(
        'Sync blocked because no roles were provided in environment',
        {
          restoreValue: await this.getCurrentRulesSnapshot(),
        },
      );

      return;
    }

    const createdRolesResult = await this.createAddedRoles(regras_adicionadas);

    if (createdRolesResult instanceof Error) {
      return;
    }

    const permissoesBDPosRoles = await this.permissionRepository.find({
      relations: { regra: true },
    });

    const permissoes_adicionadas_restantes = permissoesEnv.filter(
      (permissaoEnv) =>
        !permissoesBDPosRoles.some(
          (permissaoBD) => permissaoBD.nome === permissaoEnv.nome,
        ),
    );

    const createdPermissionsResult = await this.createAddedPermissions(
      permissoes_adicionadas_restantes,
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
      regras_mantidas.length === regrasBD.length &&
      regras_adicionadas.length === 0 &&
      regras_removidas.length === 0 &&
      permissoes_mantidas.length === permissoesBD.length &&
      permissoes_adicionadas.length === 0 &&
      permissoes_removidas.length === 0
    ) {
      logger.info('Roles and permissions are synchronized with database');
      return;
    }

    if (
      regras_mantidas.length === regrasBD.length &&
      regras_adicionadas.length === 0 &&
      regras_removidas.length === 0
    ) {
      logger.info('Roles are synchronized with database');
      return;
    }

    if (
      permissoes_mantidas.length === permissoesBD.length &&
      permissoes_adicionadas.length === 0 &&
      permissoes_removidas.length === 0
    ) {
      logger.info('Permissions are synchronized with database');
      return;
    }

    const regrasConvertidas = this.convertRegras(
      await this.roleRepository.find({ relations: { permissao: true } }),
    );

    logger.warn(
      'Many sync operations were performed. Consider restoring REGRAS_PERMISSOES',
      {
        restoreValue: regrasConvertidas,
      },
    );

    return;
  }

  async onApplicationBootstrap() {

    if (
      process.env.SYNC_ROLES_ON_STARTUP !== undefined &&
      String(process.env.SYNC_ROLES_ON_STARTUP) !== 'true' &&
      process.env.NODE_ENV !== 'development'
    ) {
      return;
    }

    await this.syncRolesAndPermissions();
  }
}
