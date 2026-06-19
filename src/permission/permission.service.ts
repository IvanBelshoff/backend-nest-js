import { Inject, Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Regra } from 'src/database/entities/Regras';
import { Permissao } from 'src/database/entities/Permissoes';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionService {
  constructor(
    @Inject('PERMISSION_REPOSITORY')
    private permissionRepository: Repository<Permissao>,
    @Inject('ROLE_REPOSITORY')
    private roleRepository: Repository<Regra>,
  ) {}

  async create(permission: CreatePermissionDto) {
    try {
      const { nome, regra_id, descricao } = permission;

      const permissoesCadastradas =
        await this.permissionRepository.findAndCount({
          where: {
            nome,
          },
        });

      if (permissoesCadastradas[1] != 0) {
        throw new Error('Permissao já cadastrada com este nome');
      }

      const regraCadastrada = await this.roleRepository.findOne({
        where: {
          id: regra_id,
        },
      });

      if (!regraCadastrada) {
        throw new Error('Regra não existe');
      }

      const newPermissao = this.permissionRepository.create({
        nome: nome,
        descricao: descricao,
        regra: regraCadastrada,
      });

      const result = await this.permissionRepository.save(newPermissao);

      if (typeof result === 'object') {
        return result.id;
      } else if (typeof result === 'number') {
        return result;
      }

      throw new Error('Erro ao cadastrar o registro');
    } catch (error) {
      throw new Error('Erro ao cadastrar o registro', { cause: error });
    }
  }

  async delete(id: number): Promise<void> {
    try {
      const result = await this.permissionRepository.findOne({
        where: {
          id: id,
        },
      });

      if (result) {
        await this.permissionRepository.delete({ id: id });
        return;
      }

      throw new Error('Erro ao apagar o registro');
    } catch (error) {
      throw new Error('Erro ao apagar o registro', { cause: error });
    }
  }

  async findAll(nome?: string): Promise<Permissao[]> {
    try {
      const result = this.permissionRepository
        .createQueryBuilder('permissao')
        .orderBy('permissao.id', 'DESC')
        .leftJoinAndSelect('permissao.regra', 'regra')
        .addOrderBy('regra.nome', 'ASC');

      if (nome) {
        result.where('permissao.nome like :nome', { nome: `%${nome}%` });
      }

      return result.getMany();
    } catch (error) {
      throw new Error('Erro ao buscar os registros', { cause: error });
    }
  }

  async findOne(id: number): Promise<Permissao | undefined> {
    try {
      const result = await this.permissionRepository.findOne({
        relations: {
          regra: true,
        },
        where: {
          id: id,
        },
      });

      if (result) {
        return result;
      }

      throw new Error('Registro não encontrado');
    } catch (error) {
      throw new Error('Registro não encontrado', { cause: error });
    }
  }

  async updateById(id: number, permission: UpdatePermissionDto): Promise<void> {
    try {
      const permissoesCadastradas = await this.permissionRepository.findOne({
        relations: {
          regra: true,
        },
        where: {
          id: id,
        },
      });

      if (!permissoesCadastradas) {
        throw new Error('Permissao não existe');
      }

      //Verifica se já existe uma regra com o nome fornecido.
      const permissoesNomes = await this.permissionRepository.findOneBy({
        nome: permission.nome,
      });

      let PermissoesNomesIguais = true;

      if (permissoesCadastradas.nome === permission.nome && permissoesNomes) {
        PermissoesNomesIguais = false;
      }

      if (permissoesNomes && PermissoesNomesIguais === true) {
        throw new Error('Já existe Permissao com este nome');
      }

      const {
        nome = permission.nome || permissoesCadastradas.nome,
        descricao = permission.descricao || permissoesCadastradas.descricao,
        regra_id = permission.regra_id || permissoesCadastradas.regra.id,
      } = permission;

      if (permission.regra_id) {
        const regrasCadastradas = await this.roleRepository.findAndCount({
          where: {
            id: regra_id,
          },
        });

        if (regrasCadastradas[1] == 0) {
          throw new Error('Regra não existe');
        }
      }

      await this.permissionRepository.update(
        { id: id },
        {
          nome: nome,
          descricao: descricao,
          regra: {
            id: regra_id,
          },
        },
      );

      return;
    } catch (error) {
      throw new Error('Erro ao atualizar o registro', { cause: error });
    }
  }
}
