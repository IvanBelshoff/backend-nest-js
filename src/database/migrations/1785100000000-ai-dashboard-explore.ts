import { MigrationInterface, QueryRunner } from 'typeorm';

export class AiDashboardExplore1785100000000 implements MigrationInterface {
  name = 'AiDashboardExplore1785100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "ai_dashboard_explore_fase_enum" AS ENUM ('discovery', 'analysis')
    `);
    await queryRunner.query(`
      CREATE TYPE "ai_dashboard_explore_status_enum" AS ENUM ('queued', 'processing', 'completed', 'failed')
    `);

    await queryRunner.query(`
      CREATE TABLE "ai_dashboard_explore_jobs" (
        "id" uuid NOT NULL,
        "user_id" integer NOT NULL,
        "thread_id" uuid NOT NULL,
        "dashboard_id" bigint NOT NULL,
        "fase" "ai_dashboard_explore_fase_enum" NOT NULL,
        "status" "ai_dashboard_explore_status_enum" NOT NULL DEFAULT 'queued',
        "progress" integer NOT NULL DEFAULT 0,
        "mapa" jsonb,
        "plano" jsonb,
        "extract" jsonb,
        "insight_message_id" uuid,
        "error_message" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "completed_at" TIMESTAMP,
        CONSTRAINT "PK_ai_dashboard_explore_jobs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_ai_dash_explore_user_id" ON "ai_dashboard_explore_jobs" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_ai_dash_explore_thread_id" ON "ai_dashboard_explore_jobs" ("thread_id")
    `);

    await queryRunner.query(`
      ALTER TYPE "user_notifications_type_enum"
      ADD VALUE IF NOT EXISTS 'ai_dashboard_discovery_ready'
    `);
    await queryRunner.query(`
      ALTER TYPE "user_notifications_type_enum"
      ADD VALUE IF NOT EXISTS 'ai_dashboard_explore_ready'
    `);
    await queryRunner.query(`
      ALTER TYPE "user_notifications_type_enum"
      ADD VALUE IF NOT EXISTS 'ai_dashboard_explore_failed'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "ai_dashboard_explore_jobs"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "ai_dashboard_explore_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "ai_dashboard_explore_fase_enum"`,
    );
    // Enum values on user_notifications_type_enum are not removed (PG limitation).
  }
}
