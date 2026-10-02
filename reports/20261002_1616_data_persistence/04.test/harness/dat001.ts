// DAT-001 검증: 프로덕션 IssueCollector·IssueWorker에 스텁 소스·러너를 주입한다.
// 사용: dat001.ts collect | drain | restart-a | restart-b
import { report, StubRunner, StubSource, sql, SOURCE_ISSUES } from "./common.js";
import { getEnv } from "../../../../app/src/config/env.js";
import { createDataSource, initializeDataSource } from "../../../../app/src/db/data-source.js";
import { IssueCollector } from "../../../../app/src/issues/issue-collector.js";
import { IssueWorker } from "../../../../app/src/worker/issue-worker.js";

const phase = process.argv[2];
const env = getEnv();
const { dataSource, schema } = await initializeDataSource(createDataSource(env));
const collector = new IssueCollector(new StubSource(), dataSource);

const insertPrompt = () =>
  sql(`INSERT INTO prompt_version (version, content) VALUES (1, 'at #{{issueId}}')`);

switch (phase) {
  case "collect": {
    const collected = await collector.collect();
    report({ phase, schema, collected, source: SOURCE_ISSUES });
    break;
  }
  case "drain": {
    const runner = new StubRunner();
    await new IssueWorker(env, dataSource, runner).drain();
    report({ phase, schema, runnerCalls: runner.calls.map((call) => call.issueId) });
    break;
  }
  case "restart-a": {
    await insertPrompt();
    const collected = await collector.collect();
    // 첫 이슈(101)를 끝낸 직후 종료 신호를 보내 102는 집지 않는다.
    const controller = new AbortController();
    const runner = new StubRunner(controller);
    await new IssueWorker(env, dataSource, runner, controller.signal).drain();
    report({
      phase,
      pid: process.pid,
      schema,
      collected,
      runnerCalls: runner.calls.map((call) => call.issueId),
    });
    break;
  }
  case "restart-b": {
    const collected = await collector.collect();
    const runner = new StubRunner();
    await new IssueWorker(env, dataSource, runner).drain();
    report({
      phase,
      pid: process.pid,
      schema,
      recollected: collected,
      runnerCalls: runner.calls.map((call) => call.issueId),
    });
    break;
  }
  default:
    throw new Error(`알 수 없는 phase: ${phase}`);
}
await dataSource.destroy();
