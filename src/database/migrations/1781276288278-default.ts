import { MigrationInterface, QueryRunner } from "typeorm";

export class Default1781276288278 implements MigrationInterface {
    name = 'Default1781276288278'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "regras" ("id" BIGSERIAL NOT NULL, "nome" character varying NOT NULL, "descricao" character varying NOT NULL, "data_criacao" date NOT NULL DEFAULT now(), "data_atualizacao" date NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, CONSTRAINT "PK_1667a576d1e8d0a013f5479c6c8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "permissoes" ("id" BIGSERIAL NOT NULL, "nome" character varying NOT NULL, "descricao" character varying NOT NULL, "data_criacao" date NOT NULL DEFAULT now(), "data_atualizacao" date NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, "regra_id" bigint, CONSTRAINT "PK_5a83561e7be8610760090b45c98" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "usuarios" ("id" BIGSERIAL NOT NULL, "nome" text NOT NULL, "sobrenome" text NOT NULL, "email" text NOT NULL, "bloqueado" boolean NOT NULL DEFAULT false, "senha" character varying NOT NULL, "usuario_atualizador" text, "usuario_cadastrador" text, "ultimo_login" TIMESTAMP, "data_criacao" TIMESTAMP NOT NULL DEFAULT now(), "data_atualizacao" TIMESTAMP NOT NULL DEFAULT now(), "foto_id" integer, CONSTRAINT "UQ_446adfc18b35418aac32ae0b7b5" UNIQUE ("email"), CONSTRAINT "REL_55052d24aed9dc9717268122d3" UNIQUE ("foto_id"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "fotos" ("id" SERIAL NOT NULL, "nome" text NOT NULL, "originalname" text NOT NULL, "tipo" text NOT NULL, "tamanho" integer NOT NULL, "local" text NOT NULL, "url" text NOT NULL, "data_criacao" date NOT NULL DEFAULT now(), "data_atualizacao" date NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, CONSTRAINT "PK_929dc0abc9924e9f2797dbca023" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "usuarios_permissoes" ("usuario_id" bigint NOT NULL, "permissao_id" bigint NOT NULL, CONSTRAINT "PK_c2275cafd5b7251e1901e02768d" PRIMARY KEY ("usuario_id", "permissao_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_a590446adec482807e08a9f17f" ON "usuarios_permissoes"  ("usuario_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_bc6db171d9b3fa0891abc5c204" ON "usuarios_permissoes"  ("permissao_id") `);
        await queryRunner.query(`CREATE TABLE "usuarios_regras" ("usuario_id" bigint NOT NULL, "regra_id" bigint NOT NULL, CONSTRAINT "PK_b18bfc09a181b19bced1775b6ab" PRIMARY KEY ("usuario_id", "regra_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0066c27e153d919f92134d975a" ON "usuarios_regras"  ("usuario_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_de8c8a4c69cba9ae0a401ec432" ON "usuarios_regras"  ("regra_id") `);
        await queryRunner.query(`ALTER TABLE "permissoes" ADD CONSTRAINT "FK_f560190caec0444d6751c2ba940" FOREIGN KEY ("regra_id") REFERENCES "regras"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "usuarios" ADD CONSTRAINT "FK_55052d24aed9dc9717268122d3e" FOREIGN KEY ("foto_id") REFERENCES "fotos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "usuarios_permissoes" ADD CONSTRAINT "FK_a590446adec482807e08a9f17fc" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE SET NULL`);
        await queryRunner.query(`ALTER TABLE "usuarios_permissoes" ADD CONSTRAINT "FK_bc6db171d9b3fa0891abc5c204c" FOREIGN KEY ("permissao_id") REFERENCES "permissoes"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "usuarios_regras" ADD CONSTRAINT "FK_0066c27e153d919f92134d975a5" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE SET NULL`);
        await queryRunner.query(`ALTER TABLE "usuarios_regras" ADD CONSTRAINT "FK_de8c8a4c69cba9ae0a401ec432f" FOREIGN KEY ("regra_id") REFERENCES "regras"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usuarios_regras" DROP CONSTRAINT "FK_de8c8a4c69cba9ae0a401ec432f"`);
        await queryRunner.query(`ALTER TABLE "usuarios_regras" DROP CONSTRAINT "FK_0066c27e153d919f92134d975a5"`);
        await queryRunner.query(`ALTER TABLE "usuarios_permissoes" DROP CONSTRAINT "FK_bc6db171d9b3fa0891abc5c204c"`);
        await queryRunner.query(`ALTER TABLE "usuarios_permissoes" DROP CONSTRAINT "FK_a590446adec482807e08a9f17fc"`);
        await queryRunner.query(`ALTER TABLE "usuarios" DROP CONSTRAINT "FK_55052d24aed9dc9717268122d3e"`);
        await queryRunner.query(`ALTER TABLE "permissoes" DROP CONSTRAINT "FK_f560190caec0444d6751c2ba940"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_de8c8a4c69cba9ae0a401ec432"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0066c27e153d919f92134d975a"`);
        await queryRunner.query(`DROP TABLE "usuarios_regras"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bc6db171d9b3fa0891abc5c204"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a590446adec482807e08a9f17f"`);
        await queryRunner.query(`DROP TABLE "usuarios_permissoes"`);
        await queryRunner.query(`DROP TABLE "fotos"`);
        await queryRunner.query(`DROP TABLE "usuarios"`);
        await queryRunner.query(`DROP TABLE "permissoes"`);
        await queryRunner.query(`DROP TABLE "regras"`);
    }

}
