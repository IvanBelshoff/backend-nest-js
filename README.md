# DataDash Backend (NestJS)

API REST para o DataDash: autenticação JWT, gestão de usuários, dashboards e ícones.

## Pré-requisitos

- Node.js 22+
- PostgreSQL 14+
- npm

## Setup rápido

```bash
npm install
cp .env.example .env
# Edite .env com credenciais reais do PostgreSQL e secrets
npm run migration:run
npm run start:dev
```

Servidor: `http://localhost:3000`  
Swagger (dev): `http://localhost:3000/docs`

## Variáveis de ambiente

Todas as variáveis obrigatórias estão documentadas em [`.env.example`](.env.example) e validadas em [`src/shared/env.schema.ts`](src/shared/env.schema.ts).

| Variável | Descrição |
|----------|-----------|
| `PORT` | Porta HTTP (default 3000) |
| `DB_*` | Conexão PostgreSQL |
| `JWT_SECRET` | Secret do access token |
| `REFRESH_TOKEN_PEPPER` | Pepper do refresh token (mín. 32 chars) |
| `CORS_ORIGIN` | Origin do frontend (credentials) |
| `REGRAS_PERMISSOES` | JSON de roles → permissões |
| `SYNC_ROLES_ON_STARTUP` | Sincronizar RBAC no bootstrap |
| `SWAGGER_ENABLED` | Força `/docs` mesmo em production |
| `PG_BOSS_*` | Filas pg-boss (schema, filas snapshot/export) |
| `REPORT_EXPORT_DIR` | Diretório local dos CSVs exportados |

## Filas (pg-boss)

Snapshots e exportações CSV rodam em filas **pg-boss** no mesmo PostgreSQL da aplicação. API e workers iniciam no **mesmo processo** NestJS (`npm run start:dev`).

- Schema `pgboss` criado automaticamente pelo pg-boss
- Tabela `relatorio_jobs` — entidade `RelatorioJobs` em `src/database/entities/`
- Desabilitar em testes: `PG_BOSS_ENABLED=false`

### Endpoints de jobs

| Método | Rota | Descrição |
|--------|------|-----------|
| `GET` | `/relatorios/jobs/:jobId` | Status e progresso do job |
| `GET` | `/relatorios/jobs/:jobId/download` | Download CSV (quando concluído) |
| `POST` | `/relatorios/:id/exportar` | Enfileira export CSV (202 + `jobId`) |

Respostas 202 de snapshot (`PATCH` offline, `POST /snapshot/atualizar`) incluem `jobId` adicional.

## Usuário padrão

Após o primeiro startup, é criado um admin (se não existir) com as credenciais de:

- `EMAIL_USER_DEFAULT`
- `SENHA_USER_DEFAULT`

Valores padrão no `.env.example`: `admin@example.com` / `ChangeMe123`.

## Endpoints principais

| Grupo | Prefixo | Auth |
|-------|---------|------|
| Health | `GET /`, `GET /health` | Público |
| Auth | `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/profile` | Login/refresh públicos |
| Users | `/user/*` | JWT + role/permission/ownership |
| Dashboards | `/dashboards/*` | JWT (+ rotas `/public` públicas) |
| Ícones | `/GET /icones` | JWT |

Listagens paginadas retornam o total no header **`x-total-count`** (exposto via CORS).

Matriz completa de autorização: [`src/shared/constants/auth-endpoints.ts`](src/shared/constants/auth-endpoints.ts).

## Autenticação (frontend)

1. `POST /auth/login` — body `{ email, senha }` → `{ access_token, expires_in }` + cookie `refresh_token`
2. Enviar `Authorization: Bearer <access_token>` nas rotas protegidas
3. `POST /auth/refresh` — renova token usando cookie (credentials: include)
4. `POST /auth/logout` — revoga refresh

## Scripts

```bash
npm run start:dev      # desenvolvimento com watch
npm run build          # compilar
npm run start:prod     # produção (dist/)
npm run lint           # ESLint
npm run test           # testes unitários
npm run test:e2e       # testes e2e
npm run migration:run  # aplicar migrations
npm run migration:revert
```

## Migrations

Migrations TypeORM em `src/database/migrations/`. Sempre rode `migration:run` após pull com novas migrations.

Índices de performance (dashboards/usuarios): migration `1783000000000-dashboard-indexes`.

## Estrutura

```
src/
  auth/          # JWT, refresh, guards
  user/          # CRUD usuários
  dashboard/     # CRUD dashboards
  icon/          # Catálogo de ícones
  shared/        # Guards, filters, env, swagger
  queue/         # pg-boss (filas)
  database/      # Entities, migrations, TypeORM
  report/        # Relatórios, jobs, export CSV
```

## Licença

UNLICENSED — uso privado.
