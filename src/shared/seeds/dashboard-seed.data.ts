import { Privacidade } from 'src/database/entities/Dashboards';

export type DashboardSeedInput = {
  nome: string;
  url: string;
  icone: string;
  privacidade: Privacidade;
  visivel: boolean;
  temporario: boolean;
  data_expiracao_inicial?: string | null;
  data_expiracao_final?: string | null;
  query?: string | null;
};

export const DASHBOARD_ICON_POOL = [
  'insert_chart',
  'bar_chart',
  'attach_money',
  'shopping_cart',
  'folder',
  'analytics',
  'pie_chart',
  'trending_up',
  'inventory',
  'groups',
  'monitoring',
  'account_balance',
  'storefront',
  'local_shipping',
  'school',
  'health_and_safety',
  'engineering',
  'dashboard',
  'savings',
  'factory',
  'real_estate_agent',
] as const;

export const DASHBOARD_SEED_MARKER_NAME = 'Dashboard Seed 01';

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function pickIcon(index: number): string {
  return DASHBOARD_ICON_POOL[index % DASHBOARD_ICON_POOL.length];
}

function buildDashboardSeedData(): DashboardSeedInput[] {
  const today = new Date();

  return [
    {
      nome: 'BI Senac',
      url: 'https://app.powerbi.com/view?r=bi-senac',
      icone: pickIcon(2),
      privacidade: Privacidade.PRIVAT,
      visivel: true,
      temporario: false,
      query: 'SELECT 1',
    },
    {
      nome: 'Dashboard Seed 01',
      url: 'https://app.powerbi.com/view?r=seed-01',
      icone: pickIcon(1),
      privacidade: Privacidade.PUBLIC,
      visivel: true,
      temporario: false,
    },
    {
      nome: 'Dashboard Seed 02',
      url: 'https://app.powerbi.com/view?r=seed-02',
      icone: pickIcon(3),
      privacidade: Privacidade.PRIVAT,
      visivel: false,
      temporario: true,
      data_expiracao_inicial: formatDate(addDays(today, -120)),
      data_expiracao_final: formatDate(addDays(today, -60)),
    },
    {
      nome: 'Dashboard Seed 03',
      url: 'https://app.powerbi.com/view?r=seed-03',
      icone: pickIcon(4),
      privacidade: Privacidade.PRIVAT,
      visivel: true,
      temporario: true,
      data_expiracao_inicial: formatDate(addDays(today, -30)),
      data_expiracao_final: formatDate(addDays(today, -5)),
    },
    {
      nome: 'Dashboard Seed 04',
      url: 'https://app.powerbi.com/view?r=seed-04',
      icone: pickIcon(0),
      privacidade: Privacidade.PUBLIC,
      visivel: true,
      temporario: false,
      query: 'SELECT COUNT(*) FROM vendas',
    },
    {
      nome: 'Dashboard Seed 05',
      url: 'https://app.powerbi.com/view?r=seed-05',
      icone: pickIcon(5),
      privacidade: Privacidade.PUBLIC,
      visivel: false,
      temporario: false,
    },
    {
      nome: 'Dashboard Seed 06',
      url: 'https://app.powerbi.com/view?r=seed-06',
      icone: pickIcon(6),
      privacidade: Privacidade.PRIVAT,
      visivel: true,
      temporario: false,
    },
    {
      nome: 'Dashboard Seed 07',
      url: 'https://app.powerbi.com/view?r=seed-07',
      icone: pickIcon(7),
      privacidade: Privacidade.PUBLIC,
      visivel: true,
      temporario: true,
      data_expiracao_inicial: formatDate(addDays(today, -10)),
      data_expiracao_final: formatDate(addDays(today, 15)),
    },
    {
      nome: 'Dashboard Seed 08',
      url: 'https://app.powerbi.com/view?r=seed-08',
      icone: pickIcon(8),
      privacidade: Privacidade.PRIVAT,
      visivel: false,
      temporario: false,
    },
    {
      nome: 'Dashboard Seed 09',
      url: 'https://app.powerbi.com/view?r=seed-09',
      icone: pickIcon(9),
      privacidade: Privacidade.PRIVAT,
      visivel: true,
      temporario: true,
      data_expiracao_inicial: formatDate(addDays(today, -5)),
      data_expiracao_final: formatDate(addDays(today, 90)),
    },
    {
      nome: 'Dashboard Seed 10',
      url: 'https://app.powerbi.com/view?r=seed-10',
      icone: pickIcon(10),
      privacidade: Privacidade.PUBLIC,
      visivel: true,
      temporario: false,
    },
    {
      nome: 'Dashboard Seed 11',
      url: 'https://app.powerbi.com/view?r=seed-11',
      icone: pickIcon(11),
      privacidade: Privacidade.PRIVAT,
      visivel: false,
      temporario: true,
      data_expiracao_inicial: formatDate(addDays(today, -20)),
      data_expiracao_final: formatDate(addDays(today, 120)),
    },
    {
      nome: 'Dashboard Seed 12',
      url: 'https://app.powerbi.com/view?r=seed-12',
      icone: pickIcon(12),
      privacidade: Privacidade.PUBLIC,
      visivel: true,
      temporario: false,
    },
    {
      nome: 'Dashboard Seed 13',
      url: 'https://app.powerbi.com/view?r=seed-13',
      icone: pickIcon(13),
      privacidade: Privacidade.PRIVAT,
      visivel: true,
      temporario: false,
    },
    {
      nome: 'Dashboard Seed 14',
      url: 'https://app.powerbi.com/view?r=seed-14',
      icone: pickIcon(14),
      privacidade: Privacidade.PUBLIC,
      visivel: false,
      temporario: true,
      data_expiracao_inicial: formatDate(addDays(today, -15)),
      data_expiracao_final: formatDate(addDays(today, 45)),
    },
    {
      nome: 'Dashboard Seed 15',
      url: 'https://app.powerbi.com/view?r=seed-15',
      icone: pickIcon(15),
      privacidade: Privacidade.PRIVAT,
      visivel: true,
      temporario: false,
    },
    {
      nome: 'Dashboard Seed 16',
      url: 'https://app.powerbi.com/view?r=seed-16',
      icone: pickIcon(16),
      privacidade: Privacidade.PUBLIC,
      visivel: true,
      temporario: true,
      data_expiracao_inicial: formatDate(addDays(today, -2)),
      data_expiracao_final: formatDate(addDays(today, 30)),
    },
    {
      nome: 'Dashboard Seed 17',
      url: 'https://app.powerbi.com/view?r=seed-17',
      icone: pickIcon(17),
      privacidade: Privacidade.PRIVAT,
      visivel: false,
      temporario: false,
    },
    {
      nome: 'Dashboard Seed 18',
      url: 'https://app.powerbi.com/view?r=seed-18',
      icone: pickIcon(18),
      privacidade: Privacidade.PRIVAT,
      visivel: true,
      temporario: true,
      data_expiracao_inicial: formatDate(addDays(today, -1)),
      data_expiracao_final: formatDate(addDays(today, 180)),
    },
    {
      nome: 'Dashboard Seed 19',
      url: 'https://app.powerbi.com/view?r=seed-19',
      icone: pickIcon(19),
      privacidade: Privacidade.PUBLIC,
      visivel: true,
      temporario: false,
    },
    {
      nome: 'Dashboard Seed 20',
      url: 'https://app.powerbi.com/view?r=seed-20',
      icone: pickIcon(20),
      privacidade: Privacidade.PRIVAT,
      visivel: false,
      temporario: true,
      data_expiracao_inicial: formatDate(addDays(today, -45)),
      data_expiracao_final: formatDate(addDays(today, -35)),
    },
  ];
}

export const dashboardSeedData = buildDashboardSeedData();
