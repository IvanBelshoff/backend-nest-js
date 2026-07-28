import { TipoConexao } from 'src/database/entities/Conexoes';
import { Privacidade } from 'src/database/entities/privacidade.enum';
import { EstadoRelatorio, Relatorio } from 'src/database/entities/Relatorios';

export interface PublicReportConnectionDto {
  id: number;
  nome: string;
  tipo: TipoConexao;
}

export interface PublicReportResponseDto {
  id: number;
  nome: string;
  icone?: string;
  privacidade?: Privacidade;
  visivel?: boolean;
  estado: EstadoRelatorio;
  temporario: boolean;
  data_expiracao_inicial?: Date | null;
  data_expiracao_final?: Date | null;
  snapshot_atualizado_em?: Date | null;
  snapshot_valido: boolean;
  conexao?: PublicReportConnectionDto | null;
}

export function toPublicReportResponse(
  relatorio: Relatorio,
): PublicReportResponseDto {
  return {
    id: Number(relatorio.id),
    nome: relatorio.nome,
    icone: relatorio.icone,
    privacidade: relatorio.privacidade,
    visivel: relatorio.visivel,
    estado: relatorio.estado,
    temporario: relatorio.temporario,
    data_expiracao_inicial: relatorio.data_expiracao_inicial ?? null,
    data_expiracao_final: relatorio.data_expiracao_final ?? null,
    snapshot_atualizado_em: relatorio.snapshot_atualizado_em ?? null,
    snapshot_valido: relatorio.snapshot_valido,
    conexao: relatorio.conexao
      ? {
          id: Number(relatorio.conexao.id),
          nome: relatorio.conexao.nome,
          tipo: relatorio.conexao.tipo,
        }
      : null,
  };
}

export function toPublicReportResponseList(
  relatorios: Relatorio[],
): PublicReportResponseDto[] {
  return relatorios.map(toPublicReportResponse);
}
