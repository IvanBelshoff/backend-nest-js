import { TipoConexao } from 'src/database/entities/Conexoes';
import { Privacidade } from 'src/database/entities/privacidade.enum';
import { EstadoRelatorio, Relatorio } from 'src/database/entities/Relatorios';
import { toPublicReportResponse } from './public-report.response';

describe('toPublicReportResponse', () => {
  it('exposes only safe fields and strips query and connection secrets', () => {
    const relatorio = {
      id: 1,
      nome: 'Relatório público',
      icone: 'table_chart',
      query: 'SELECT * FROM secret_table',
      temporario: false,
      privacidade: Privacidade.PUBLIC,
      visivel: true,
      estado: EstadoRelatorio.ONLINE,
      snapshot_valido: true,
      conexao: {
        id: 10,
        nome: 'Postgres',
        tipo: TipoConexao.POSTGRES,
        host: 'db.internal',
        porta: 5432,
        database: 'app',
        usuario: 'admin',
        senha_criptografada: 'encrypted-secret',
      },
    } as Relatorio;

    const response = toPublicReportResponse(relatorio);

    expect(response).toEqual({
      id: 1,
      nome: 'Relatório público',
      icone: 'table_chart',
      privacidade: Privacidade.PUBLIC,
      visivel: true,
      estado: EstadoRelatorio.ONLINE,
      temporario: false,
      data_expiracao_inicial: null,
      data_expiracao_final: null,
      snapshot_atualizado_em: null,
      snapshot_valido: true,
      conexao: {
        id: 10,
        nome: 'Postgres',
        tipo: TipoConexao.POSTGRES,
      },
    });
    expect(response).not.toHaveProperty('query');
    expect(response.conexao).not.toHaveProperty('host');
    expect(response.conexao).not.toHaveProperty('senha_criptografada');
  });
});
