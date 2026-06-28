import { MigrationInterface, QueryRunner } from 'typeorm';

export class DashboardIndexes1783000000000 implements MigrationInterface {
  name = 'DashboardIndexes1783000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dashboards_nome" ON "dashboards" ("nome")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dashboards_id_proprietario" ON "dashboards" ("id_proprietario")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dashboards_privacidade_visivel" ON "dashboards" ("privacidade", "visivel")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_dashboards_temporario" ON "dashboards" ("temporario")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_usuarios_nome_sobrenome" ON "usuarios" ("nome", "sobrenome")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_usuarios_nome_sobrenome"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dashboards_temporario"`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_dashboards_privacidade_visivel"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_dashboards_id_proprietario"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_dashboards_nome"`);
  }
}
