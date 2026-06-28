import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Permissao } from 'src/database/entities/Permissoes';
import { Regra } from 'src/database/entities/Regras';
import { Repository } from 'typeorm';

@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Regra)
    private roleRepository: Repository<Regra>,
    @InjectRepository(Permissao)
    private permissaoRepository: Repository<Permissao>,
  ) {}

  async create(role: Partial<Regra>): Promise<number> {
    const { nome } = role;

    const permissoesCadastradas = await this.roleRepository.findAndCount({
      where: {
        nome: nome,
      },
    });

    if (permissoesCadastradas[1] != 0) {
      throw new ConflictException('Regra já cadastrada');
    }

    const newRegra = this.roleRepository.create(role);
    const result = await this.roleRepository.save(newRegra);

    if (typeof result === 'object') {
      return result.id;
    }

    return result;
  }

  async delete(id: number): Promise<void> {
    const result = await this.roleRepository.findOne({
      where: {
        id: id,
      },
    });

    if (!result) {
      throw new NotFoundException('Registro não encontrado');
    }

    await this.roleRepository.delete({ id: id });
  }

  async findAll(nome?: string): Promise<Regra[]> {
    const result = this.roleRepository
      .createQueryBuilder('regra')
      .orderBy('regra.id', 'DESC')
      .leftJoinAndSelect('regra.permissao', 'permissao')
      .addOrderBy('permissao.nome', 'ASC');

    if (nome) {
      result.where('regra.nome like :nome', { nome: `%${nome}%` });
    }

    return result.getMany();
  }

  async findOne(id: number): Promise<Regra | undefined> {
    const result = await this.roleRepository.findOne({
      relations: {
        permissao: true,
      },
      where: {
        id: id,
      },
    });

    return result ?? undefined;
  }

  async findRolesById(id: number): Promise<Regra[]> {
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

    if (regrasFiltradas.length === 0) {
      throw new NotFoundException('Registro não encontrado');
    }

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

    return regrasFiltradasComPermissoes;
  }

  async updateById(id: number, role: Partial<Regra>): Promise<void> {
    const regrasCadastradas = await this.roleRepository.findOne({
      where: {
        id: id,
      },
    });

    if (!regrasCadastradas) {
      throw new NotFoundException('Regra não existe');
    }

    const regrasNomes = await this.roleRepository.findOneBy({
      nome: role.nome,
    });

    let RegrasNomesIguais = true;

    if (regrasCadastradas.nome === role.nome && regrasCadastradas) {
      RegrasNomesIguais = false;
    }

    if (regrasNomes && RegrasNomesIguais === true) {
      throw new ConflictException('Já existe regra com este nome');
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
  }
}
