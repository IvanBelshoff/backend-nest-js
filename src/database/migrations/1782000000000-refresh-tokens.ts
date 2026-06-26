import { MigrationInterface, QueryRunner } from 'typeorm';

export class RefreshTokens1782000000000 implements MigrationInterface {
  name = 'RefreshTokens1782000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id" BIGSERIAL NOT NULL,
        "usuario_id" bigint NOT NULL,
        "token_hash" text NOT NULL,
        "expira_em" TIMESTAMP NOT NULL,
        "revogado_em" TIMESTAMP,
        "novo_token" text,
        "data_criacao" TIMESTAMP NOT NULL DEFAULT now(),
        "data_atualizacao" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_refresh_tokens_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_usuario_id" ON "refresh_tokens" ("usuario_id")
    `);
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD CONSTRAINT "FK_refresh_tokens_usuario_id"
      FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id")
      ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" DROP CONSTRAINT "FK_refresh_tokens_usuario_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_refresh_tokens_usuario_id"`);
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
