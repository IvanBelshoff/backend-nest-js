/* eslint-disable no-useless-catch */
import { Inject, Injectable } from '@nestjs/common';
import { Permissao } from 'src/database/entities/Permissoes';
import { Regra } from 'src/database/entities/Regras';
import { Repository } from 'typeorm';

@Injectable()
export class RoleService {
  constructor(
    @Inject('ROLE_REPOSITORY')
    private roleRepository: Repository<Regra>,
    @Inject('PERMISSION_REPOSITORY')
    private permissaoRepository: Repository<Permissao>,
  ) {}

  async create(role: Partial<Regra>): Promise<number> {
    // eslint-disable-next-line no-useless-catch
    try {
      const { nome } = role;

      const permissoesCadastradas = await this.roleRepository.findAndCount({
        where: {
          nome: nome,
        },
      });

      if (permissoesCadastradas[1] != 0) {
        throw new Error('Regra já cadastrada');
      }

      const newRegra = this.roleRepository.create(role);

      const result = await this.roleRepository.save(newRegra);

      if (typeof result === 'object') {
        return result.id;
      } else {
        return result;
      }
    } catch (error) {
      throw error;
    }
  }

  async delete(id: number): Promise<void> {
    // eslint-disable-next-line no-useless-catch
    try {
      const result = await this.roleRepository.findOne({
        where: {
          id: id,
        },
      });

      if (result) {
        await this.roleRepository.delete({ id: id });
        return;
      }

      throw new Error('Erro ao apagar o registro');
    } catch (error) {
      throw error;
    }
  }

  async findAll(nome?: string): Promise<Regra[]> {
    // eslint-disable-next-line no-useless-catch
    try {
      const result = this.roleRepository
        .createQueryBuilder('regra')
        .orderBy('regra.id', 'DESC')
        .leftJoinAndSelect('regra.permissao', 'permissao')
        .addOrderBy('permissao.nome', 'ASC');

      if (nome) {
        result.where('regra.nome like :nome', { nome: `%${nome}%` });
      }

      const regras = await result.getMany();

      return regras;
    } catch (error) {
      throw error;
    }
  }

  async findOne(id: number): Promise<Regra | undefined> {
    try {
      const result = await this.roleRepository.findOne({
        relations: {
          permissao: true,
        },
        where: {
          id: id,
        },
      });

      if (result) {
        return result;
      }

      return undefined;
    } catch (error) {
      throw error;
    }
  }

  async findRolesById(id: number): Promise<Regra[]> {
    try {
      const permissoesFiltradas = await this.permissaoRepository.find({
        relations: {
          regra: true,
        },
        where: {
          usuario: {
            id: id,
          },
        },
      });

      const regrasFiltradas = await this.roleRepository.find({
        relations: {
          permissao: true,
        },
        where: {
          usuario: {
            id: id,
          },
        },
      });

      if (regrasFiltradas instanceof Error) {
        throw new Error('Registro não encontrado');
      }

      // Filtrar as permissões de cada regra
      const regrasFiltradasComPermissoes = regrasFiltradas.map((regra) => {
        const permissoesDaRegra = regra.permissao.filter((permissaoDaRegra) =>
          permissoesFiltradas.some(
            (permissaoFiltrada) => permissaoFiltrada.id === permissaoDaRegra.id,
          ),
        );

        return {
          ...regra,
          permissao: permissoesDaRegra,
        };
      });

      return regrasFiltradasComPermissoes || [];
    } catch (error) {
      throw error;
    }
  }

  async updateById(id: number, role: Partial<Regra>): Promise<void> {
    try {
      const regrasCadastradas = await this.roleRepository.findOne({
        where: {
          id: id,
        },
      });

      if (!regrasCadastradas) {
        throw new Error('Regra não existe');
      }

      //Verifica se já existe uma regra com o nome fornecido.
      const regrasNomes = await this.roleRepository.findOneBy({
        nome: role.nome,
      });

      let RegrasNomesIguais = true;

      if (regrasCadastradas.nome === role.nome && regrasCadastradas) {
        RegrasNomesIguais = false;
      }

      if (regrasNomes && RegrasNomesIguais === true) {
        throw new Error('Já existe Permissao com este nome');
      }

      const {
        nome = role.nome || regrasCadastradas.nome,
        descricao = role.descricao || regrasCadastradas.descricao,
      } = role;

      await this.roleRepository.update(
        { id: id },
        {
          nome: nome,
          descricao: descricao,
        },
      );

      return;
    } catch (error) {
      throw error;
    }
  }
}
