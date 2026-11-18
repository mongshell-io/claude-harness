import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { makeRepo } from "./helpers.mjs";

const BIN = fileURLToPath(new URL("../bin/mongshell-check.mjs", import.meta.url));

/** `pnpm run <이름>` 만 흉내 내는 가짜 pnpm — package.json 의 그 스크립트 본문을 sh 로 돌린다. */
const FAKE_PNPM = `#!/bin/sh
[ "$1" = run ] || { echo "가짜 pnpm: run 만 안다" >&2; exit 99; }
body=$(node -e 'console.log(require(process.cwd() + "/package.json").scripts[process.argv[1]])' "$2")
exec sh -c "$body"
`;

function runBin(t, scripts, args = ["all"], extraEnv = {}) {
	const root = makeRepo(t, { "package.json": { scripts } });
	const fakeBin = join(root, ".fake-bin");
	mkdirSync(fakeBin);
	writeFileSync(join(fakeBin, "pnpm"), FAKE_PNPM);
	chmodSync(join(fakeBin, "pnpm"), 0o755);
	const env = { ...process.env, PATH: `${fakeBin}${delimiter}${process.env.PATH}`, ...extraEnv };
	delete env.GITHUB_ACTIONS;
	if (!("MONGSHELL_CHECK_ALL" in extraEnv)) delete env.MONGSHELL_CHECK_ALL;
	return spawnSync(process.execPath, [BIN, ...args], { cwd: root, env, encoding: "utf8" });
}

describe("mongshell-check all (가짜 pnpm)", () => {
	it("전부 통과하면 exit 0 과 종 수", (t) => {
		const r = runBin(t, { "check:a": "echo a-ok", "check:b": "echo b-ok", lint: "exit 9" });
		assert.equal(r.status, 0, r.stderr);
		assert.match(r.stdout, /a-ok[\s\S]*b-ok/);
		assert.match(r.stdout, /전수 통과 2종/);
	});

	it("하나가 실패해도 끝까지 돌고 exit 1 + 실패 목록", (t) => {
		const r = runBin(t, { "check:bad": "echo boom; exit 3", "check:ok": "echo fine" });
		assert.equal(r.status, 1);
		assert.match(r.stdout, /boom/);
		assert.match(r.stdout, /fine/);
		assert.match(r.stderr, /실패: check:bad \(대상 2종\)/);
	});

	it("다른 경로로 all 에 닿는 check:* 는 중첩 실행으로 거부된다", (t) => {
		// `node <bin> all` 은 이름 안내 정규식에 걸리지 않는다 — 환경변수 표식만이 막는다.
		const r = runBin(t, { "check:nested": `node ${JSON.stringify(BIN)} all`, "check:ok": "echo fine" });
		assert.equal(r.status, 1);
		assert.match(r.stdout, /중첩 실행/);
		assert.match(r.stderr, /실패: check:nested/);
	});

	it("표식이 이미 있으면 시작하자마자 exit 1", (t) => {
		const r = runBin(t, { "check:ok": "echo fine" }, ["all"], { MONGSHELL_CHECK_ALL: "1" });
		assert.equal(r.status, 1);
		assert.match(r.stderr, /중첩 실행/);
		assert.doesNotMatch(r.stdout, /fine/);
	});

	it("check:* 본문이 mongshell-check all 이면 실행 전에 이름으로 거부", (t) => {
		const r = runBin(t, { "check:all": "mongshell-check all", "check:ok": "echo fine" });
		assert.equal(r.status, 1);
		assert.match(r.stderr, /check:all 가 이 실행기/);
	});
});

describe("사용법 오류 (exit 2)", () => {
	for (const [label, args] of [
		["all 에 모르는 인자", ["all", "--verbose"]],
		["all --jobs 값 없음", ["all", "--jobs"]],
		["all --jobs 0", ["all", "--jobs", "0"]],
		["all --jobs 뒤 남는 인자", ["all", "--jobs", "2", "x"]],
		["단일 검사에 남는 인자", ["journal", "drizzle/meta/_journal.json"]],
		["Object 프로토타입 이름", ["constructor"]],
	]) {
		it(label, (t) => {
			const r = runBin(t, { "check:ok": "echo fine" }, args);
			assert.equal(r.status, 2, r.stderr);
		});
	}

	it("all --jobs 2 는 받는다", (t) => {
		assert.equal(runBin(t, { "check:ok": "echo fine" }, ["all", "--jobs", "2"]).status, 0);
	});
});
