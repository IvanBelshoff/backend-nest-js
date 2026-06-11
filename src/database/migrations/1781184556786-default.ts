import { MigrationInterface, QueryRunner } from "typeorm";

export class Default1781184556786 implements MigrationInterface {
    name = 'Default1781184556786'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "fotos" ("id" SERIAL NOT NULL, "nome" text NOT NULL, "originalname" text NOT NULL, "tipo" text NOT NULL, "tamanho" integer NOT NULL, "local" text NOT NULL, "url" text NOT NULL, "data_criacao" date NOT NULL DEFAULT now(), "data_atualizacao" date NOT NULL DEFAULT ('now'::text)::timestamp(6) with time zone, CONSTRAINT "PK_929dc0abc9924e9f2797dbca023" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "usuarios" ("id" BIGSERIAL NOT NULL, "nome" text NOT NULL, "sobrenome" text NOT NULL, "email" text NOT NULL, "bloqueado" boolean NOT NULL DEFAULT false, "senha" character varying NOT NULL, "usuario_atualizador" text, "usuario_cadastrador" text, "ultimo_login" TIMESTAMP, "data_criacao" TIMESTAMP NOT NULL DEFAULT now(), "data_atualizacao" TIMESTAMP NOT NULL DEFAULT now(), "foto_id" integer, CONSTRAINT "UQ_446adfc18b35418aac32ae0b7b5" UNIQUE ("email"), CONSTRAINT "REL_55052d24aed9dc9717268122d3" UNIQUE ("foto_id"), CONSTRAINT "PK_d7281c63c176e152e4c531594a8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "usuarios" ADD CONSTRAINT "FK_55052d24aed9dc9717268122d3e" FOREIGN KEY ("foto_id") REFERENCES "fotos"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "usuarios" DROP CONSTRAINT "FK_55052d24aed9dc9717268122d3e"`);
        await queryRunner.query(`DROP TABLE "usuarios"`);
        await queryRunner.query(`DROP TABLE "fotos"`);
    }

}
