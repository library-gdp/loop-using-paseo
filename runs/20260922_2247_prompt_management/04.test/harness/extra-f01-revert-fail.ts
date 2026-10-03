// 보충 확인(판정 외, Gate iteration 1 피드백 F-01): 이슈 되돌림 UPDATE가 실패해도 onFatal이 호출되는가.
// 실제 DataSource를 쓰되, 워커가 되돌림(status=pending + lastError)을 쓰는 UPDATE만 실패시킨다.
import { psql, report, StubRunner } from "./common.js";
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { IssueEntity } from "../../../../app/src/db/entities/index.js";
import { IssueWorker } from "../../../../app/src/worker/issue-worker.js";

const env = getEnv();
const ds = await initializeDataSource(createDataSource(env));
const realGetRepository = ds.getRepository.bind(ds);
(ds as { getRepository: unknown }).getRepository = (entity: unknown) => {
  const repo = realGetRepository(entity as never);
  if (entity !== IssueEntity) return repo;
  return new Proxy(repo, {
    get(target, prop, receiver) {
      if (prop === "update") {
        return async (criteria: unknown, patch: Record<string, unknown>) => {
          if (patch.status === "pending" && "lastError" in patch) throw new Error("simulated DB failure on revert");
          return target.update(criteria as never, patch as never);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
};

const runner = new StubRunner();
const fatalErrors: string[] = [];
const worker = new IssueWorker(env, ds, runner, undefined, (error) => void fatalErrors.push(error.name));
let drainError: string | null = null;
await worker.drain().catch((error: Error) => { drainError = error.message; });
report({
  onFatalCalls: fatalErrors.length,
  fatalErrors,
  drainError,
  runnerCalls: runner.calls.length,
  issueRow: psql(`SELECT "issueId", status, attempts FROM issue;`).trim(),
});
await ds.destroy();
