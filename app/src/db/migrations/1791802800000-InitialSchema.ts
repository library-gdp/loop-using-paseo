import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `issue`, `prompt_version` 테이블을 만든다.
 *
 * DDL은 엔티티로 synchronize했을 때 TypeORM이 내는 것과 같다 (제약·인덱스 이름 포함).
 * `IF NOT EXISTS`가 붙어 있어, synchronize로 이미 테이블이 만들어진 DB에서는
 * 아무것도 바꾸지 않고 적용 기록만 남는다.
 */
export class InitialSchema1791802800000 implements MigrationInterface {
  name = "InitialSchema1791802800000";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "issue" ("id" SERIAL NOT NULL, "repository" character varying(255) NOT NULL, "issueId" character varying(128) NOT NULL, "title" character varying(512) NOT NULL, "body" text, "url" character varying(512) NOT NULL, "labels" text NOT NULL DEFAULT '', "status" character varying(16) NOT NULL DEFAULT 'pending', "issueUpdatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "result" character varying(16), "workspaceId" character varying(128), "agentId" character varying(128), "branch" character varying(255), "promptVersion" integer, "summary" text, "error" text, "startedAt" TIMESTAMP WITH TIME ZONE, "finishedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_issue_repo_issue_id" UNIQUE ("repository", "issueId"), CONSTRAINT "PK_f80e086c249b9f3f3ff2fd321b7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_issue_status" ON "issue" ("status")`);
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "prompt_version" ("id" SERIAL NOT NULL, "version" integer NOT NULL, "content" text NOT NULL, "description" character varying(512), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_1c4aebce69bf91205bcd40f50be" UNIQUE ("version"), CONSTRAINT "PK_cb9ff9b4ab70babd62914aa97a5" PRIMARY KEY ("id"))`,
    );
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
