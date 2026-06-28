import { MigrationInterface, QueryRunner } from "typeorm";

export class Default1782657063668 implements MigrationInterface {
    name = 'Default1782657063668'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "fotos" ("id" SERIAL NOT NULL, "nome" text NOT NULL, "originalname" text NOT NULL, "tipo" text NOT NULL, "tamanho" integer NOT NULL, "local" text NOT NULL, "url" text NOT NULL, "data_criacao" date NOT NULL DEFAULT now(), "data_atualizacao" date NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, CONSTRAINT "PK_929dc0abc9924e9f2797dbca023" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "regras" ("id" BIGSERIAL NOT NULL, "nome" character varying NOT NULL, "descricao" character varying NOT NULL, "data_criacao" date NOT NULL DEFAULT now(), "data_atualizacao" date NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, CONSTRAINT "PK_1667a576d1e8d0a013f5479c6c8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "permissoes" ("id" BIGSERIAL NOT NULL, "nome" character varying NOT NULL, "descricao" character varying NOT NULL, "data_criacao" date NOT NULL DEFAULT now(), "data_atualizacao" date NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, "regra_id" bigint, CONSTRAINT "PK_5a83561e7be8610760090b45c98" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "usuarios" ("id" BIGSERIAL NOT NULL, "nome" text NOT NULL, "sobrenome" text NOT NULL, "email" text NOT NULL, "bloqueado" boolean NOT NULL DEFAULT false, "senha" character varying NOT NULL, "usuario_atualizador" text, "usuario_cadastrador" text, "ultimo_login" TIMESTAMP, "data_criacao" TIMESTAMP NOT NULL DEFAULT now(), "data_atualizacao" TIMESTAMP NOT NULL DEFAULT now(), "dashboards_favoritos" text, "foto_id" integer, CONSTRAINT "UQ_446adfc18b35418aac32ae0b7b5" UNIQUE ("email"), CONSTRAINT "REL_55052d24aed9dc9717268122d3" UNIQUE ("foto_id"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."dashboards_privacidade_enum" AS ENUM('privado', 'publico')`);
        await queryRunner.query(`CREATE TABLE "dashboards" ("id" BIGSERIAL NOT NULL, "nome" text NOT NULL, "icone" text NOT NULL DEFAULT 'insert_chart', "query" text, "url" text NOT NULL, "temporario" boolean NOT NULL DEFAULT false, "data_expiracao_inicial" date, "data_expiracao_final" date, "id_proprietario" integer, "privacidade" "public"."dashboards_privacidade_enum" NOT NULL DEFAULT 'privado', "visivel" boolean NOT NULL DEFAULT false, "usuario_cadastrador" text, "usuario_atualizador" text, "data_criacao" TIMESTAMP NOT NULL DEFAULT now(), "data_atualizacao" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_1c0154f2248e6b17d798ff1082d" UNIQUE ("nome"), CONSTRAINT "UQ_07b750540fc80b52e9bc1583b76" UNIQUE ("url"), CONSTRAINT "PK_1b4b4bc346118e0d335f16c5344" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" BIGSERIAL NOT NULL, "usuario_id" bigint NOT NULL, "token_hash" text NOT NULL, "expira_em" TIMESTAMP NOT NULL, "revogado_em" TIMESTAMP, "novo_token" text, "data_criacao" TIMESTAMP NOT NULL DEFAULT now(), "data_atualizacao" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a7838d2ba25be1342091b6695f1" UNIQUE ("token_hash"), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "usuarios_permissoes" ("usuario_id" bigint NOT NULL, "permissao_id" bigint NOT NULL, CONSTRAINT "PK_c2275cafd5b7251e1901e02768d" PRIMARY KEY ("usuario_id", "permissao_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a590446adec482807e08a9f17f" ON "usuarios_permissoes"  ("usuario_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_bc6db171d9b3fa0891abc5c204" ON "usuarios_permissoes"  ("permissao_id") `);
        await queryRunner.query(`CREATE TABLE "usuarios_regras" ("usuario_id" bigint NOT NULL, "regra_id" bigint NOT NULL, CONSTRAINT "PK_b18bfc09a181b19bced1775b6ab" PRIMARY KEY ("usuario_id", "regra_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0066c27e153d919f92134d975a" ON "usuarios_regras"  ("usuario_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_de8c8a4c69cba9ae0a401ec432" ON "usuarios_regras"  ("regra_id") `);
        await queryRunner.query(`CREATE TABLE "usuarios_dashboards" ("usuario_id" bigint NOT NULL, "dashboard_id" bigint NOT NULL, CONSTRAINT "PK_ff2df7628e5b74df5967eecc0d8" PRIMARY KEY ("usuario_id", "dashboard_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_ae13afe7d369c7dc054584a0eb" ON "usuarios_dashboards"  ("usuario_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_d2e252a75692e11c4d17f899f3" ON "usuarios_dashboards"  ("dashboard_id") `);
        await queryRunner.query(`ALTER TABLE "permissoes" ADD CONSTRAINT "FK_f560190caec0444d6751c2ba940" FOREIGN KEY ("regra_id") REFERENCES "regras"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "usuarios" ADD CONSTRAINT "FK_55052d24aed9dc9717268122d3e" FOREIGN KEY ("foto_id") REFERENCES "fotos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD CONSTRAINT "FK_c8349fdadc1bc791125bdd8c855" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "usuarios_permissoes" ADD CONSTRAINT "FK_a590446adec482807e08a9f17fc" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE SET NULL`);
        await queryRunner.query(`ALTER TABLE "usuarios_permissoes" ADD CONSTRAINT "FK_bc6db171d9b3fa0891abc5c204c" FOREIGN KEY ("permissao_id") REFERENCES "permissoes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "usuarios_regras" ADD CONSTRAINT "FK_0066c27e153d919f92134d975a5" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE SET NULL`);
        await queryRunner.query(`ALTER TABLE "usuarios_regras" ADD CONSTRAINT "FK_de8c8a4c69cba9ae0a401ec432f" FOREIGN KEY ("regra_id") REFERENCES "regras"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "usuarios_dashboards" ADD CONSTRAINT "FK_ae13afe7d369c7dc054584a0eb0" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE SET NULL`);
        await queryRunner.query(`ALTER TABLE "usuarios_dashboards" ADD CONSTRAINT "FK_d2e252a75692e11c4d17f899f39" FOREIGN KEY ("dashboard_id") REFERENCES "dashboards"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usuarios_dashboards" DROP CONSTRAINT "FK_d2e252a75692e11c4d17f899f39"`);
        await queryRunner.query(`ALTER TABLE "usuarios_dashboards" DROP CONSTRAINT "FK_ae13afe7d369c7dc054584a0eb0"`);
        await queryRunner.query(`ALTER TABLE "usuarios_regras" DROP CONSTRAINT "FK_de8c8a4c69cba9ae0a401ec432f"`);
        await queryRunner.query(`ALTER TABLE "usuarios_regras" DROP CONSTRAINT "FK_0066c27e153d919f92134d975a5"`);
        await queryRunner.query(`ALTER TABLE "usuarios_permissoes" DROP CONSTRAINT "FK_bc6db171d9b3fa0891abc5c204c"`);
        await queryRunner.query(`ALTER TABLE "usuarios_permissoes" DROP CONSTRAINT "FK_a590446adec482807e08a9f17fc"`);
        await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_c8349fdadc1bc791125bdd8c855"`);
        await queryRunner.query(`ALTER TABLE "usuarios" DROP CONSTRAINT "FK_55052d24aed9dc9717268122d3e"`);
        await queryRunner.query(`ALTER TABLE "permissoes" DROP CONSTRAINT "FK_f560190caec0444d6751c2ba940"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d2e252a75692e11c4d17f899f3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ae13afe7d369c7dc054584a0eb"`);
        await queryRunner.query(`DROP TABLE "usuarios_dashboards"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_de8c8a4c69cba9ae0a401ec432"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0066c27e153d919f92134d975a"`);
        await queryRunner.query(`DROP TABLE "usuarios_regras"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bc6db171d9b3fa0891abc5c204"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a590446adec482807e08a9f17f"`);
        await queryRunner.query(`DROP TABLE "usuarios_permissoes"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP TABLE "dashboards"`);
        await queryRunner.query(`DROP TYPE "public"."dashboards_privacidade_enum"`);
        await queryRunner.query(`DROP TABLE "usuarios"`);
        await queryRunner.query(`DROP TABLE "permissoes"`);
        await queryRunner.query(`DROP TABLE "regras"`);
        await queryRunner.query(`DROP TABLE "fotos"`);
    }

}
