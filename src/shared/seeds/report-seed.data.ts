import { Privacidade } from 'src/database/entities/Dashboards';

export const REPORT_SEED_MARKER_NAME = '__seed_relatorio_demo__';

export const reportSeedData = [
  {
    nome: REPORT_SEED_MARKER_NAME,
    icone: 'table_chart',
    query: 'SELECT 1 AS valor',
    privacidade: Privacidade.PRIVAT,
    visivel: true,
    temporario: false,
    parametros: [],
  },
];
