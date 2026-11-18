import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { ConfigError, enabledCheckNames, resolveOptions, resolveRoot, validateConfigShape } from "../lib/config.mjs";
import { makeRepo } from "./helpers.mjs";

const BIN = fileURLToPath(new URL("../bin/mongshell-check.mjs", import.meta.url));
const SCHEMA = {
	path: { type: "string", default: "a/b.json" },
	dirs: { type: "string[]", default: ["src"] },
	need: { type: "string", required: true },
	allowed: { type: "items", fields: { idx: "integer" }, default: [] },
};

describe("resolveRoot", () => {
	it("cwd 에 package.json 이 없으면 실패한다", () => {
		assert.throws(() => resolveRoot(mkdtempSync(join(tmpdir(), "no-pkg-"))), ConfigError);
	});
});

describe("resolveOptions — fail-closed", () => {
	it("섹션이 없으면 실패한다 (켰는데 설정이 없음)", () => {
		assert.throws(() => resolveOptions("x", SCHEMA, undefined), /섹션이 없습니다/);
	});

	it("모르는 키는 실패한다 (오타가 조용히 기본값으로 돌아가지 않게)", () => {
		assert.throws(() => resolveOptions("x", SCHEMA, { need: "y", pth: "z" }), /모르는 키 "pth"/);
	});

	it("필수 키가 없으면 실패한다", () => {
		assert.throws(() => resolveOptions("x", SCHEMA, {}), /need 가 필요합니다/);
	});

	it("예외 항목에 why 가 없으면 실패한다", () => {
		assert.throws(() => resolveOptions("x", SCHEMA, { need: "y", allowed: [{ idx: 3 }] }), /why/);
	});

	it("예외 항목의 정수 칸이 정수가 아니면 실패한다", () => {
		assert.throws(() => resolveOptions("x", SCHEMA, { need: "y", allowed: [{ idx: "3", why: "w" }] }), /idx/);
	});

	it("타입이 틀리면 실패한다", () => {
		assert.throws(() => resolveOptions("x", SCHEMA, { need: "y", dirs: "src" }), /문자열의 배열/);
	});

	it("빠진 키는 기본값으로 채운다", () => {
		assert.deepEqual(resolveOptions("x", SCHEMA, { need: "y", allowed: [{ idx: 3, why: "w" }] }), {
			path: "a/b.json",
			dirs: ["src"],
			need: "y",
			allowed: [{ idx: 3, why: "w" }],
		});
	});
});

describe("validateConfigShape", () => {
	const known = ["journal", "ui-barrel"];

	it("설정 파일이 없으면 모양 문제는 없다 (섹션 누락은 검사 실행 때 잡는다)", () => {
		assert.deepEqual(validateConfigShape(null, ["journal"], known), []);
	});

	it("모르는 검사 이름 · 켜지지 않은 검사의 섹션 · 모르는 최상위 키를 모두 잡는다", () => {
		const problems = validateConfigShape(
			{ checks: { jornal: {}, "ui-barrel": {} }, extra: 1 },
			["journal"],
			known,
		);
		assert.equal(problems.length, 3);
		assert.match(problems.join("\n"), /extra/);
		assert.match(problems.join("\n"), /jornal — 모르는 검사 이름/);
		assert.match(problems.join("\n"), /ui-barrel — package.json 에 check:ui-barrel 가 없어/);
	});
});

describe("enabledCheckNames", () => {
	it("check:* 스크립트 이름에서 접두를 뗀다", () => {
		assert.deepEqual(enabledCheckNames({ scripts: { check: "x", "check:journal": "y", lint: "z" } }), ["journal"]);
	});
});

describe("CLI", () => {
	const run = (cwd, ...args) => spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });

	it("package.json 에 check:journal 이 있는데 섹션이 없으면 exit 1", (t) => {
		const root = makeRepo(t, { "package.json": { scripts: { "check:journal": "mongshell-check journal" } } });
		const r = run(root, "journal");
		assert.equal(r.status, 1);
		assert.match(r.stderr, /checks.journal 섹션이 없습니다/);
	});

	it("설정대로 검사를 돌린다 — 통과면 exit 0", (t) => {
		const root = makeRepo(t, {
			"package.json": { scripts: { "check:journal": "mongshell-check journal" } },
			"harness.config.json": { checks: { journal: {} } },
			"drizzle/meta/_journal.json": { entries: [{ idx: 0, tag: "0000_init", when: 1 }] },
			"drizzle/0000_init.sql": "select 1;",
		});
		const r = run(root, "journal");
		assert.equal(r.status, 0, r.stderr);
		assert.match(r.stdout, /OK \(1 entries/);
	});

	it("모르는 검사 이름은 exit 2", (t) => {
		const root = makeRepo(t, {});
		assert.equal(run(root, "nope").status, 2);
	});

	it("package.json 이 없는 곳에서는 exit 1", () => {
		const r = run(mkdtempSync(join(tmpdir(), "no-pkg-")), "journal");
		assert.equal(r.status, 1);
		assert.match(r.stderr, /package.json 이 없습니다/);
	});
});
