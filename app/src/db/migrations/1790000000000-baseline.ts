import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `issue`, `prompt_version` 테이블을 만드는 출발점.
 *
 * 제약·인덱스 이름과 컬럼 정의는 자동 동기화(`DB_SYNCHRONIZE=true`)가 빈 DB에 내놓는 DDL과 같다.
 * 자동 동기화로 이미 만들어진 DB에서도 실패하지 않도록 `IF NOT EXISTS`를 쓴다.
 * 그런 DB에서는 아무것도 만들지 않고 적용 기록만 남는다.
 */
export class Baseline1790000000000 implements MigrationInterface {
  name = "Baseline1790000000000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "issue" (
        "id" SERIAL NOT NULL,
        "repository" character varying(255) NOT NULL,
        "issueId" character varying(128) NOT NULL,
        "title" character varying(512) NOT NULL,
        "body" text,
        "url" character varying(512) NOT NULL,
        "labels" text NOT NULL DEFAULT '',
        "status" character varying(16) NOT NULL DEFAULT 'pending',
        "issueUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "result" character varying(16),
        "workspaceId" character varying(128),
        "agentId" character varying(128),
        "branch" character varying(255),
        "promptVersion" integer,
        "summary" text,
        "error" text,
        "startedAt" TIMESTAMP WITH TIME ZONE,
        "finishedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_issue_repo_issue_id" UNIQUE ("repository", "issueId"),
        CONSTRAINT "PK_f80e086c249b9f3f3ff2fd321b7" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_issue_status" ON "issue" ("status")`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "prompt_version" (
        "id" SERIAL NOT NULL,
        "version" integer NOT NULL,
        "content" text NOT NULL,
        "description" character varying(512),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_1c4aebce69bf91205bcd40f50be" UNIQUE ("version"),
        CONSTRAINT "PK_cb9ff9b4ab70babd62914aa97a5" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_prompt_version_version" ON "prompt_version" ("version")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_prompt_version_version"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "prompt_version"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_issue_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "issue"`);
  }
}
