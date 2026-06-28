import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Regra } from 'src/database/entities/Regras';
import { Permissao } from 'src/database/entities/Permissoes';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';

@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permissao)
    private permissionRepository: Repository<Permissao>,
    @InjectRepository(Regra)
    private roleRepository: Repository<Regra>,
  ) {}

  async create(permission: CreatePermissionDto) {
    const { nome, regra_id, descricao } = permission;

    const permissoesCadastradas = await this.permissionRepository.findAndCount(
      {
        where: {
          nome,
        },
      },
    );

    if (permissoesCadastradas[1] != 0) {
      throw new ConflictException('Permissao já cadastrada com este nome');
    }

    const regraCadastrada = await this.roleRepository.findOne({
      where: {
        id: regra_id,
      },
    });

    if (!regraCadastrada) {
      throw new NotFoundException('Regra não existe');
    }

    const newPermissao = this.permissionRepository.create({
      nome: nome,
      descricao: descricao,
      regra: regraCadastrada,
    });

    const result = await this.permissionRepository.save(newPermissao);

    if (typeof result === 'object') {
      return result.id;
    }

    if (typeof result === 'number') {
      return result;
    }

    throw new ConflictException('Erro ao cadastrar o registro');
  }

  async delete(id: number): Promise<void> {
    const result = await this.permissionRepository.findOne({
      where: {
        id: id,
      },
    });

    if (!result) {
      throw new NotFoundException('Registro não encontrado');
    }

    await this.permissionRepository.delete({ id: id });
  }

  async findAll(nome?: string): Promise<Permissao[]> {
    const result = this.permissionRepository
      .createQueryBuilder('permissao')
      .orderBy('permissao.id', 'DESC')
      .leftJoinAndSelect('permissao.regra', 'regra')
      .addOrderBy('regra.nome', 'ASC');

    if (nome) {
      result.where('permissao.nome like :nome', { nome: `%${nome}%` });
    }

    return result.getMany();
  }

  async findOne(id: number): Promise<Permissao | undefined> {
    const result = await this.permissionRepository.findOne({
      relations: {
        regra: true,
      },
      where: {
        id: id,
      },
    });

    if (!result) {
      throw new NotFoundException('Registro não encontrado');
    }

    return result;
  }

  async updateById(id: number, permission: UpdatePermissionDto): Promise<void> {
    const permissoesCadastradas = await this.permissionRepository.findOne({
      relations: {
        regra: true,
      },
      where: {
        id: id,
      },
    });

    if (!permissoesCadastradas) {
      throw new NotFoundException('Permissao não existe');
    }

    const permissoesNomes = await this.permissionRepository.findOneBy({
      nome: permission.nome,
    });

    let PermissoesNomesIguais = true;

    if (permissoesCadastradas.nome === permission.nome && permissoesNomes) {
      PermissoesNomesIguais = false;
    }

    if (permissoesNomes && PermissoesNomesIguais === true) {
      throw new ConflictException('Já existe Permissao com este nome');
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
        throw new NotFoundException('Regra não existe');
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
  }
}
