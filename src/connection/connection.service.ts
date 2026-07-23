import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conexao } from 'src/database/entities/Conexoes';
import { CreateConnectionDto } from './dto/create-connection.dto';
import { UpdateConnectionDto } from './dto/update-connection.dto';
import {
  decryptConnectionPassword,
  encryptConnectionPassword,
} from 'src/shared/utils/connection-encryption.util';
import { testConnection } from 'src/report/execution/dynamic-connection.factory';
import { AuditService } from 'src/audit/audit.service';
import { AUDIT_ACTIONS } from 'src/audit/constants/audit-actions';
import { toAuditActor, toResourceId } from 'src/audit/utils/audit-actor.util';

interface Requester {
  sub: number;
  email: string;
}

export interface ConnectionListParams {
  page: number;
  limit: number;
  nome?: string;
  tipo?: string;
}

@Injectable()
export class ConnectionService {
  constructor(
    @InjectRepository(Conexao)
    private readonly connectionRepository: Repository<Conexao>,
    private readonly auditService: AuditService,
  ) {}

  async create(dto: CreateConnectionDto, requester: Requester): Promise<Conexao> {
    const existing = await this.connectionRepository.findOne({
      where: { nome: dto.nome },
    });

    if (existing) {
      throw new ConflictException('Já existe conexão com este nome.');
    }

    const connection = this.connectionRepository.create({
      nome: dto.nome,
      tipo: dto.tipo,
      host: dto.host,
      porta: dto.porta,
      database: dto.database,
      usuario: dto.usuario,
      senha_criptografada: encryptConnectionPassword(dto.senha),
      opcoes: dto.opcoes ?? null,
      usuario_cadastrador: requester.email,
      usuario_atualizador: requester.email,
    });

    const saved = await this.connectionRepository.save(connection);
    this.auditService.record({
      actor: toAuditActor(requester),
      action: AUDIT_ACTIONS.CONNECTION_CREATE,
      category: 'connection',
      outcome: 'success',
      resource: { type: 'conexao', id: toResourceId(saved.id) },
      metadata: { nome: saved.nome, tipo: saved.tipo },
    });
    return this.sanitize(saved);
  }

  async findAllPaginated(
    params: ConnectionListParams,
  ): Promise<{ data: Conexao[]; total: number }> {
    const query = this.connectionRepository
      .createQueryBuilder('conexao')
      .orderBy('conexao.nome', 'ASC');

    if (params.nome) {
      query.andWhere('LOWER(conexao.nome) LIKE LOWER(:nome)', {
        nome: `%${params.nome}%`,
      });
    }

    if (params.tipo) {
      query.andWhere('conexao.tipo = :tipo', { tipo: params.tipo });
    }

    query.skip((params.page - 1) * params.limit).take(params.limit);

    const [data, total] = await query.getManyAndCount();
    return { data: data.map((item) => this.sanitize(item)), total };
  }

  async findById(id: number): Promise<Conexao> {
    const connection = await this.connectionRepository.findOne({ where: { id } });

    if (!connection) {
      throw new NotFoundException('Conexão não localizada');
    }

    return this.sanitize(connection);
  }

  async update(
    id: number,
    dto: UpdateConnectionDto,
    requester: Requester,
  ): Promise<Conexao> {
    const connection = await this.connectionRepository.findOne({ where: { id } });

    if (!connection) {
      throw new NotFoundException('Conexão não localizada');
    }

    if (dto.nome && dto.nome !== connection.nome) {
      const duplicate = await this.connectionRepository.findOne({
        where: { nome: dto.nome },
      });

      if (duplicate) {
        throw new ConflictException('Já existe conexão com este nome.');
      }
    }

    connection.nome = dto.nome ?? connection.nome;
    connection.tipo = dto.tipo ?? connection.tipo;
    connection.host = dto.host ?? connection.host;
    connection.porta = dto.porta ?? connection.porta;
    connection.database = dto.database ?? connection.database;
    connection.usuario = dto.usuario ?? connection.usuario;

    if (dto.senha !== undefined) {
      connection.senha_criptografada = encryptConnectionPassword(dto.senha);
    }

    if (dto.opcoes !== undefined) {
      connection.opcoes = dto.opcoes;
    }

    connection.usuario_atualizador = requester.email;

    const saved = await this.connectionRepository.save(connection);
    this.auditService.record({
      actor: toAuditActor(requester),
      action: AUDIT_ACTIONS.CONNECTION_UPDATE,
      category: 'connection',
      outcome: 'success',
      resource: { type: 'conexao', id },
      metadata: { nome: saved.nome },
    });
    return this.sanitize(saved);
  }

  async delete(
    id: number,
    requester?: { sub: number; email: string },
  ): Promise<void> {
    const connection = await this.connectionRepository.findOne({ where: { id } });

    if (!connection) {
      throw new NotFoundException('Conexão não localizada');
    }

    const nome = connection.nome;
    await this.connectionRepository.delete({ id });

    if (requester) {
      this.auditService.record({
        actor: toAuditActor(requester),
        action: AUDIT_ACTIONS.CONNECTION_DELETE,
        category: 'connection',
        outcome: 'success',
        resource: { type: 'conexao', id },
        metadata: { nome },
      });
    }
  }

  async test(
    id: number,
    requester?: { sub: number; email: string },
  ): Promise<{ ok: true }> {
    const connection = await this.connectionRepository.findOne({ where: { id } });

    if (!connection) {
      throw new NotFoundException('Conexão não localizada');
    }

    await testConnection(connection);

    if (requester) {
      this.auditService.record({
        actor: toAuditActor(requester),
        action: AUDIT_ACTIONS.CONNECTION_TEST,
        category: 'connection',
        outcome: 'success',
        resource: { type: 'conexao', id },
        metadata: { nome: connection.nome },
      });
    }

    return { ok: true };
  }

  async findByIdWithPassword(id: number): Promise<Conexao> {
    const connection = await this.connectionRepository.findOne({ where: { id } });

    if (!connection) {
      throw new NotFoundException('Conexão não localizada');
    }

    return connection;
  }

  getDecryptedPassword(connection: Conexao): string {
    return decryptConnectionPassword(connection.senha_criptografada);
  }

  private sanitize(connection: Conexao): Conexao {
    const sanitized = { ...connection };
    delete (sanitized as Partial<Conexao>).senha_criptografada;
    return sanitized as Conexao;
  }
}
