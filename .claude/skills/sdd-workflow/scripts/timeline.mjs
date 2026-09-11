#!/usr/bin/env node
// SDD 워크플로우 단계별 수행 시간·토큰 사용량 기록/집계 도구.
//
//   node timeline.mjs mark <taskDir> <stage> <iteration|-> <start|end>
//     <taskDir>/.timeline.tsv 에 "시각, 세션 ID, 단계, iteration, 이벤트"를 한 줄 추가한다.
//
//   node timeline.mjs summary <taskDir>
//     타임라인과 Claude Code 세션 transcript(서브에이전트 포함)를 대조해
//     단계별 수행 시간과 토큰 사용량을 Markdown 표로 출력한다.

import { appendFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const STAGES = [
	"explore",
	"plan",
	"architecture",
	"implementation",
	"test",
	"review",
	"verification_gate",
	"report",
];
const OUTSIDE = "(단계 외)";

const [command, taskDir, ...rest] = process.argv.slice(2);

if (command === "mark") {
	mark(taskDir, ...rest);
} else if (command === "summary") {
	summary(taskDir);
} else {
	fail(
		"usage: timeline.mjs mark <taskDir> <stage> <iteration|-> <start|end>\n" +
			"       timeline.mjs summary <taskDir>",
	);
}

function mark(dir, stage, iteration, event) {
	if (!dir || !existsSync(dir)) fail(`task 디렉토리가 없습니다: ${dir}`);
	if (!STAGES.includes(stage)) fail(`알 수 없는 단계: ${stage} (허용: ${STAGES.join(", ")})`);
	if (!/^(\d+|-)$/.test(iteration ?? "")) fail(`iteration은 숫자 또는 '-' 여야 합니다: ${iteration}`);
	if (event !== "start" && event !== "end") fail(`이벤트는 start 또는 end 여야 합니다: ${event}`);
	const session = process.env.CLAUDE_CODE_SESSION_ID ?? "unknown";
	const line = [new Date().toISOString(), session, stage, iteration, event].join("\t");
	appendFileSync(join(dir, ".timeline.tsv"), `${line}\n`);
	console.log(line);
}

function summary(dir) {
	const file = join(dir ?? "", ".timeline.tsv");
	if (!existsSync(file)) fail(`타임라인 파일이 없습니다: ${file}`);
	const marks = readFileSync(file, "utf8")
		.split("\n")
		.filter(Boolean)
		.map((l) => {
			const [ts, session, stage, iteration, event] = l.split("\t");
			return { t: Date.parse(ts), session, stage, iteration, event };
		});
	if (marks.length === 0) fail("타임라인이 비어 있습니다.");

	const now = Date.now();
	const windows = buildWindows(marks, now);
	const begin = Math.min(...marks.map((m) => m.t));
	const end = Math.max(...windows.map((w) => w.end));

	const sessions = [...new Set(marks.map((m) => m.session))].filter((s) => s !== "unknown");
	const messages = loadAssistantMessages(sessions).filter((m) => m.t >= begin && m.t <= end);

	const usageByWindow = new Map();
	const usageByModel = new Map();
	const total = emptyUsage();
	for (const msg of messages) {
		const w = windows.find((x) => msg.t >= x.start && msg.t <= x.end);
		const key = w ? w.key : OUTSIDE;
		addUsage(getOrInit(usageByWindow, key), msg.usage);
		addUsage(getOrInit(usageByModel, msg.model), msg.usage);
		addUsage(total, msg.usage);
	}

	const out = [];
	out.push(`- 시작: ${fmtTime(begin)}`);
	out.push(`- 종료: ${fmtTime(end)}${windows.some((w) => w.open) ? " (종료 기록이 없는 단계는 집계 시점까지로 계산)" : ""}`);
	out.push(`- 총 경과 시간: ${fmtDuration(end - begin)}`);
	out.push(`- 집계 대상 세션: ${sessions.length > 0 ? sessions.join(", ") : "없음"}`);
	out.push("");
	out.push("### 단계별 수행 시간 및 토큰 사용량");
	out.push("");
	out.push("| 단계 | Iteration | 시작 | 종료 | 소요 시간 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |");
	out.push("|---|---|---|---|---|---:|---:|---:|---:|---:|");
	for (const w of windows) {
		const u = usageByWindow.get(w.key) ?? emptyUsage();
		out.push(
			`| ${w.stage} | ${w.iteration} | ${fmtTime(w.start)} | ${fmtTime(w.end)}${w.open ? " (미종료)" : ""} | ${fmtDuration(w.end - w.start)} | ${usageCells(u)} |`,
		);
	}
	const outside = usageByWindow.get(OUTSIDE);
	if (outside) out.push(`| ${OUTSIDE} | - | - | - | - | ${usageCells(outside)} |`);
	out.push(`| **합계** | | | | ${fmtDuration(end - begin)} | ${usageCells(total)} |`);
	out.push("");
	out.push("### 모델별 토큰 사용량");
	out.push("");
	out.push("| 모델 | Input | Cache 생성 | Cache 읽기 | Output | 합계 |");
	out.push("|---|---:|---:|---:|---:|---:|");
	for (const [model, u] of usageByModel) out.push(`| ${model} | ${usageCells(u)} |`);
	out.push("");
	out.push(
		"> 토큰은 Claude Code 세션 transcript의 assistant 메시지 usage를 message id 기준으로 중복 제거해 합산한 값이다. " +
			"서브에이전트 사용량을 포함하며, 집계 명령 실행 이후의 사용량은 포함하지 않는다.",
	);
	console.log(out.join("\n"));
}

// (stage, iteration) 쌍마다 첫 start부터 마지막 end까지를 하나의 구간으로 본다.
function buildWindows(marks, now) {
	const byKey = new Map();
	for (const m of marks) {
		const key = `${m.stage}#${m.iteration}`;
		const w = byKey.get(key) ?? { key, stage: m.stage, iteration: m.iteration, start: null, end: null };
		if (m.event === "start" && (w.start === null || m.t < w.start)) w.start = m.t;
		if (m.event === "end" && (w.end === null || m.t > w.end)) w.end = m.t;
		byKey.set(key, w);
	}
	return [...byKey.values()]
		.filter((w) => w.start !== null)
		.map((w) => ({ ...w, open: w.end === null, end: w.end ?? now }))
		.sort((a, b) => a.start - b.start);
}

function loadAssistantMessages(sessions) {
	const root = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), "projects");
	if (!existsSync(root)) return [];
	const files = [];
	for (const project of readdirSync(root)) {
		for (const sid of sessions) {
			const main = join(root, project, `${sid}.jsonl`);
			if (existsSync(main)) files.push(main);
			const subDir = join(root, project, sid, "subagents");
			if (existsSync(subDir)) {
				for (const f of readdirSync(subDir)) if (f.endsWith(".jsonl")) files.push(join(subDir, f));
			}
		}
	}
	// 스트리밍 중 같은 메시지가 여러 레코드로 기록되므로 message id로 중복을 제거한다.
	const byId = new Map();
	for (const f of files) {
		for (const line of readFileSync(f, "utf8").split("\n")) {
			if (!line) continue;
			let r;
			try {
				r = JSON.parse(line);
			} catch {
				continue;
			}
			if (r.type !== "assistant" || !r.message?.usage) continue;
			const id = r.message.id ?? r.uuid;
			byId.set(id, { t: Date.parse(r.timestamp), model: r.message.model ?? "unknown", usage: r.message.usage });
		}
	}
	return [...byId.values()];
}

function emptyUsage() {
	return { input: 0, cacheCreate: 0, cacheRead: 0, output: 0 };
}

function addUsage(acc, u) {
	acc.input += u.input_tokens ?? 0;
	acc.cacheCreate += u.cache_creation_input_tokens ?? 0;
	acc.cacheRead += u.cache_read_input_tokens ?? 0;
	acc.output += u.output_tokens ?? 0;
}

function getOrInit(map, key) {
	if (!map.has(key)) map.set(key, emptyUsage());
	return map.get(key);
}

function usageCells(u) {
	const n = (x) => x.toLocaleString("en-US");
	return [u.input, u.cacheCreate, u.cacheRead, u.output, u.input + u.cacheCreate + u.cacheRead + u.output]
		.map(n)
		.join(" | ");
}

function fmtTime(t) {
	const d = new Date(t);
	const p = (x) => String(x).padStart(2, "0");
	return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtDuration(ms) {
	const s = Math.max(0, Math.round(ms / 1000));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s` : `${m}m ${String(sec).padStart(2, "0")}s`;
}

function fail(message) {
	console.error(message);
	process.exit(1);
}
