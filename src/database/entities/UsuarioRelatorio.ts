import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { Usuario } from './Usuarios';
import { Relatorio } from './Relatorios';

@Entity('usuarios_relatorios')
export class UsuarioRelatorio {
  @PrimaryColumn({ name: 'usuario_id', type: 'bigint' })
  usuarioId: number;

  @PrimaryColumn({ name: 'relatorio_id', type: 'bigint' })
  relatorioId: number;

  @Column({
    name: 'permitir_conhecimento_ia',
    type: 'boolean',
    nullable: false,
    default: false,
  })
  permitirConhecimentoIa: boolean;

  @ManyToOne(() => Usuario, (usuario) => usuario.usuarioRelatorios, {
    onDelete: 'CASCADE',
    onUpdate: 'SET NULL',
  })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @ManyToOne(() => Relatorio, (relatorio) => relatorio.usuarioRelatorios, {
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({ name: 'relatorio_id' })
  relatorio: Relatorio;
}
