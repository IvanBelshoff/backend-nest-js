export type UserSeedRole = 'REGRA_USUARIO' | 'REGRA_DASHBOARD';

export type UserSeedInput = {
  nome: string;
  sobrenome: string;
  email: string;
  bloqueado: boolean;
  regras: UserSeedRole[];
  permissoes: string[];
};

export const USER_SEED_MARKER_EMAIL = 'seed.user.01@datadash.dev';

export const userSeedData: UserSeedInput[] = [
  {
    nome: 'Bianca',
    sobrenome: 'Rezende',
    email: 'seed.user.01@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_USUARIO'],
    permissoes: ['PERMISSAO_CRIAR_USUARIO', 'PERMISSAO_ATUALIZAR_USUARIO'],
  },
  {
    nome: 'Caio',
    sobrenome: 'Nunes',
    email: 'seed.user.02@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_USUARIO'],
    permissoes: [
      'PERMISSAO_ATUALIZAR_USUARIO',
      'PERMISSAO_CONCEDER_ACESSO_DASHBOARD',
    ],
  },
  {
    nome: 'Daniela',
    sobrenome: 'Moura',
    email: 'seed.user.03@datadash.dev',
    bloqueado: true,
    regras: ['REGRA_USUARIO'],
    permissoes: ['PERMISSAO_CRIAR_USUARIO', 'PERMISSAO_EXCLUIR_USUARIO'],
  },
  {
    nome: 'Eduardo',
    sobrenome: 'Farias',
    email: 'seed.user.04@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_DASHBOARD'],
    permissoes: ['PERMISSAO_CRIAR_DASHBOARD', 'PERMISSAO_ATUALIZAR_DASHBOARD'],
  },
  {
    nome: 'Fernanda',
    sobrenome: 'Lima',
    email: 'seed.user.05@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_DASHBOARD'],
    permissoes: [
      'PERMISSAO_ATUALIZAR_DASHBOARD',
      'PERMISSAO_CONCEDER_ACESSO_USUARIO',
    ],
  },
  {
    nome: 'Gabriel',
    sobrenome: 'Souza',
    email: 'seed.user.06@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_DASHBOARD'],
    permissoes: ['PERMISSAO_CRIAR_DASHBOARD', 'PERMISSAO_EXCLUIR_DASHBOARD'],
  },
  {
    nome: 'Helena',
    sobrenome: 'Costa',
    email: 'seed.user.07@datadash.dev',
    bloqueado: true,
    regras: ['REGRA_DASHBOARD'],
    permissoes: ['PERMISSAO_ATUALIZAR_DASHBOARD'],
  },
  {
    nome: 'Igor',
    sobrenome: 'Martins',
    email: 'seed.user.08@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_USUARIO'],
    permissoes: [
      'PERMISSAO_CRIAR_USUARIO',
      'PERMISSAO_ATUALIZAR_USUARIO',
      'PERMISSAO_EXCLUIR_USUARIO',
    ],
  },
  {
    nome: 'Juliana',
    sobrenome: 'Ribeiro',
    email: 'seed.user.09@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_USUARIO'],
    permissoes: ['PERMISSAO_CONCEDER_ACESSO_DASHBOARD'],
  },
  {
    nome: 'Kleber',
    sobrenome: 'Alves',
    email: 'seed.user.10@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_DASHBOARD'],
    permissoes: [
      'PERMISSAO_CRIAR_DASHBOARD',
      'PERMISSAO_ATUALIZAR_DASHBOARD',
      'PERMISSAO_EXCLUIR_DASHBOARD',
    ],
  },
  {
    nome: 'Larissa',
    sobrenome: 'Pires',
    email: 'seed.user.11@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_USUARIO'],
    permissoes: ['PERMISSAO_ATUALIZAR_USUARIO'],
  },
  {
    nome: 'Marcelo',
    sobrenome: 'Teixeira',
    email: 'seed.user.12@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_DASHBOARD'],
    permissoes: ['PERMISSAO_CONCEDER_ACESSO_USUARIO'],
  },
  {
    nome: 'Natália',
    sobrenome: 'Barros',
    email: 'seed.user.13@datadash.dev',
    bloqueado: true,
    regras: ['REGRA_USUARIO'],
    permissoes: ['PERMISSAO_CRIAR_USUARIO'],
  },
  {
    nome: 'Otávio',
    sobrenome: 'Campos',
    email: 'seed.user.14@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_DASHBOARD'],
    permissoes: [
      'PERMISSAO_ATUALIZAR_DASHBOARD',
      'PERMISSAO_CONCEDER_ACESSO_USUARIO',
    ],
  },
  {
    nome: 'Patrícia',
    sobrenome: 'Duarte',
    email: 'seed.user.15@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_USUARIO'],
    permissoes: [
      'PERMISSAO_CRIAR_USUARIO',
      'PERMISSAO_CONCEDER_ACESSO_DASHBOARD',
    ],
  },
  {
    nome: 'Rafael',
    sobrenome: 'Gomes',
    email: 'seed.user.16@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_DASHBOARD'],
    permissoes: ['PERMISSAO_CRIAR_DASHBOARD'],
  },
  {
    nome: 'Sabrina',
    sobrenome: 'Vieira',
    email: 'seed.user.17@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_USUARIO'],
    permissoes: ['PERMISSAO_EXCLUIR_USUARIO'],
  },
  {
    nome: 'Thiago',
    sobrenome: 'Mendes',
    email: 'seed.user.18@datadash.dev',
    bloqueado: false,
    regras: ['REGRA_DASHBOARD'],
    permissoes: [
      'PERMISSAO_CRIAR_DASHBOARD',
      'PERMISSAO_EXCLUIR_DASHBOARD',
      'PERMISSAO_CONCEDER_ACESSO_USUARIO',
    ],
  },
];
