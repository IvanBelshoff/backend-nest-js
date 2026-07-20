import { MigrationInterface, QueryRunner } from 'typeorm';

export class OwnerGrantTriggers1785000000000 implements MigrationInterface {
  name = 'OwnerGrantTriggers1785000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO usuarios_relatorios (usuario_id, relatorio_id, permitir_conhecimento_ia)
      SELECT r.id_proprietario, r.id, false
      FROM relatorios r
      WHERE r.privacidade = 'privado'
        AND r.id_proprietario IS NOT NULL
      ON CONFLICT (usuario_id, relatorio_id) DO NOTHING
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION ensure_relatorio_owner_grant()
      RETURNS trigger AS $$
      BEGIN
        IF NEW.privacidade = 'privado' AND NEW.id_proprietario IS NOT NULL THEN
          INSERT INTO usuarios_relatorios (usuario_id, relatorio_id, permitir_conhecimento_ia)
          VALUES (NEW.id_proprietario, NEW.id, false)
          ON CONFLICT (usuario_id, relatorio_id) DO NOTHING;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_relatorios_ensure_owner_grant
      AFTER INSERT OR UPDATE OF privacidade, id_proprietario ON relatorios
      FOR EACH ROW
      EXECUTE FUNCTION ensure_relatorio_owner_grant()
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_owner_grant_delete()
      RETURNS trigger AS $$
      DECLARE
        owner_id integer;
        privacy text;
      BEGIN
        SELECT id_proprietario, privacidade::text
        INTO owner_id, privacy
        FROM relatorios
        WHERE id = OLD.relatorio_id;

        IF privacy = 'privado'
          AND owner_id IS NOT NULL
          AND OLD.usuario_id = owner_id THEN
          RAISE EXCEPTION 'Não é permitido remover o grant do proprietário em relatório privado';
        END IF;

        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_usuarios_relatorios_prevent_owner_delete
      BEFORE DELETE ON usuarios_relatorios
      FOR EACH ROW
      EXECUTE FUNCTION prevent_owner_grant_delete()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_usuarios_relatorios_prevent_owner_delete ON usuarios_relatorios`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_owner_grant_delete()`);
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_relatorios_ensure_owner_grant ON relatorios`,
    );
    await queryRunner.query(`DROP FUNCTION IF EXISTS ensure_relatorio_owner_grant()`);
  }
}
