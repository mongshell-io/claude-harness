import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveOptions } from "../lib/config.mjs";
import { CHECKS } from "../lib/registry.mjs";
import { runPool, selectCheckScripts } from "../lib/run-all.mjs";
import { selectTargets as reactCompilerTargets } from "../checks/react-compiler.mjs";
import { captureConsole, makeRepo } from "./helpers.mjs";

/** 임시 저장소에서 검사 하나를 돌려 종료 코드와 출력을 돌려준다. */
function runCheck(t, name, files, section = {}) {
	const root = makeRepo(t, files);
	const out = captureConsole(t);
	const code = CHECKS[name].run({ root, options: resolveOptions(name, CHECKS[name].schema, section) });
	return { code, out: out.join("\n") };
}

const journalFiles = (entries, sqlTags = entries.map((e) => e.tag)) => ({
	"drizzle/meta/_journal.json": { entries },
	...Object.fromEntries(sqlTags.map((tag) => [`drizzle/${tag}.sql`, "select 1;"])),
});

describe("journal", () => {
	const e = (idx, when) => ({ idx, tag: `000${idx}_m`, when });

	it("러닝맥스 단조 증가면 통과", (t) => {
		assert.equal(runCheck(t, "journal", journalFiles([e(0, 1), e(1, 2), e(2, 3)])).code, 0);
	});

	it("직전보다 크더라도 러닝맥스 이하면 실패 (부풀린 when 뒤)", (t) => {
		const { code, out } = runCheck(t, "journal", journalFiles([e(0, 1), e(1, 100), e(2, 50), e(3, 60)]));
		assert.equal(code, 1);
		assert.match(out, /idx 2 .* idx 1/);
		assert.match(out, /idx 3 .* idx 1/);
	});

	it("knownNonMonotonic 의 idx 는 통과, 그 뒤도 러닝맥스 위여야 한다", (t) => {
		const files = journalFiles([e(0, 1), e(1, 100), e(2, 50), e(3, 101)]);
		assert.equal(runCheck(t, "journal", files, { knownNonMonotonic: [{ idx: 2, why: "적용 완료" }] }).code, 0);
	});

	it("더는 비단조가 아닌 knownNonMonotonic 은 낡은 설정이라 실패", (t) => {
		const { code, out } = runCheck(t, "journal", journalFiles([e(0, 1), e(1, 2)]), {
			knownNonMonotonic: [{ idx: 1, why: "옛 사고" }],
		});
		assert.equal(code, 1);
		assert.match(out, /knownNonMonotonic/);
	});

	it("journal 에 없는 .sql (고아 마이그레이션) 은 실패", (t) => {
		const { code, out } = runCheck(t, "journal", journalFiles([e(0, 1)], ["0000_m", "0001_orphan"]));
		assert.equal(code, 1);
		assert.match(out, /drizzle\/0001_orphan.sql 이 journal 에 없음/);
	});

	it("entries 가 비면 실패 (fail-open 방지)", (t) => {
		assert.equal(runCheck(t, "journal", journalFiles([])).code, 1);
	});

	it("journalPath 설정을 따른다", (t) => {
		const files = { "db/migrations/meta/_journal.json": { entries: [e(0, 1)] }, "db/migrations/0000_m.sql": "" };
		assert.equal(runCheck(t, "journal", files, { journalPath: "db/migrations/meta/_journal.json" }).code, 0);
	});
});

describe("design-tokens", () => {
	const css = "@theme { --color-app-muted: #888; --radius-app: 4px; }";

	it("정의된 토큰만 쓰면 통과", (t) => {
		const files = { "src/styles/design-tokens.css": css, "src/a.tsx": '<div className="bg-app-muted rounded-app" />' };
		assert.equal(runCheck(t, "design-tokens", files).code, 0);
	});

	it("정의되지 않은 토큰은 실패 — 방향 조각까지 붙여 보고한다", (t) => {
		const files = { "src/styles/design-tokens.css": css, "src/a.tsx": '<div className="border-l-app-nope" />' };
		const { code, out } = runCheck(t, "design-tokens", files);
		assert.equal(code, 1);
		assert.match(out, /`border-l-app-nope`/);
	});

	it("주석 안의 이름은 보지 않는다", (t) => {
		const files = { "src/styles/design-tokens.css": css, "src/a.tsx": "// bg-app-nope 는 없다\n/* text-app-gone */" };
		assert.equal(runCheck(t, "design-tokens", files).code, 0);
	});

	it("검사할 파일이 0개면 실패 (공회전)", (t) => {
		assert.equal(runCheck(t, "design-tokens", { "src/styles/design-tokens.css": css }).code, 1);
	});

	it("prefix 설정을 따른다", (t) => {
		const files = {
			"src/styles/design-tokens.css": "@theme { --color-ui-ink: #000; }",
			"src/a.tsx": '<p className="text-ui-ink bg-ui-nope" />',
		};
		const { code, out } = runCheck(t, "design-tokens", files, { prefix: "ui-" });
		assert.equal(code, 1);
		assert.match(out, /bg-ui-nope/);
		assert.doesNotMatch(out, /text-ui-ink/);
	});
});

describe("doc-symbols", () => {
	const base = { "src/a.ts": "export function realThing() {}\nexport const teamName = 1;" };

	it("소스에 있는 이름 · snake_case 컬럼명은 통과", (t) => {
		const files = { ...base, "docs/a.md": "`realThing()` 과 `team_name` 컬럼" };
		assert.equal(runCheck(t, "doc-symbols", files, { docs: ["docs/a.md"] }).code, 0);
	});

	it("소스에 없는 이름은 실패", (t) => {
		const files = { ...base, "docs/a.md": "줄1\n`realThin` 을 부른다" };
		const { code, out } = runCheck(t, "doc-symbols", files, { docs: ["docs/a.md"] });
		assert.equal(code, 1);
		assert.match(out, /docs\/a.md:2 — `realThin`/);
	});

	it("allow 의 외부 이름은 통과", (t) => {
		const files = { ...base, "docs/a.md": "`workflow_run` 이벤트" };
		const section = { docs: ["docs/a.md"], allow: [{ symbol: "workflow_run", why: "GitHub Actions 이벤트" }] };
		assert.equal(runCheck(t, "doc-symbols", files, section).code, 0);
	});

	it("음성 — harness.config.json 은 증거가 아니다 (허용 목록이 자기를 증명하지 않는다)", (t) => {
		// 이름이 설정 파일 안(다른 항목의 why · 지운 항목의 흔적)에만 있으면 여전히 실패해야 한다.
		const files = {
			...base,
			"docs/a.md": "`workflow_run` 이벤트",
			"harness.config.json": '{"note": "workflow_run"}',
		};
		const section = {
			docs: ["docs/a.md"],
			sourceDirs: ["src", "."],
			sourceFiles: ["harness.config.json"],
			allow: [{ symbol: "deny_paths", why: "workflow_run 호출 입력" }],
		};
		const { code, out } = runCheck(t, "doc-symbols", files, section);
		assert.equal(code, 1);
		assert.match(out, /`workflow_run`/);
	});

	it("음성 — .md 는 증거가 아니다 (문서가 자기를 증명하지 않는다)", (t) => {
		const files = { ...base, "src/CLAUDE.md": "`ghostName` 을 쓴다" };
		assert.equal(runCheck(t, "doc-symbols", files, { docs: ["src/CLAUDE.md"] }).code, 1);
	});

	it("haystackExclude 의 파일은 증거에서 빠진다", (t) => {
		const files = { ...base, "scripts/pre-push.sh": "# 예: ghostName", "docs/a.md": "`ghostName`" };
		const section = { docs: ["docs/a.md"], haystackExclude: ["scripts/pre-push.sh"] };
		assert.equal(runCheck(t, "doc-symbols", files, section).code, 1);
		assert.equal(runCheck(t, "doc-symbols", files, { docs: ["docs/a.md"] }).code, 0);
	});

	it("대상 문서가 없으면 실패", (t) => {
		const { code, out } = runCheck(t, "doc-symbols", base, { docs: ["docs/gone.md"] });
		assert.equal(code, 1);
		assert.match(out, /missing-target/);
	});

	it("docs 가 비면 실패 (공회전)", (t) => {
		assert.equal(runCheck(t, "doc-symbols", base, { docs: [] }).code, 1);
	});
});

describe("ui-barrel", () => {
	const ui = (index, indexFile = "index.ts") => ({
		[`src/components/ui/${indexFile}`]: index,
		"src/components/ui/Button.tsx": "export const Button = 1;",
		"src/components/ui/table/index.ts": "export const T = 1;",
	});

	it("re-export 가 전부 파일을 가리키면 통과 (export * · 폴더 index 포함)", (t) => {
		const index = 'export { Button } from "./Button";\nexport * from "./table";\nexport * as tbl from "./table";';
		const { code, out } = runCheck(t, "ui-barrel", ui(index));
		assert.equal(code, 0);
		assert.match(out, /re-export 3개/);
	});

	it("index.tsx barrel 도 읽는다", (t) => {
		assert.equal(runCheck(t, "ui-barrel", ui('export { Button } from "./Button";', "index.tsx")).code, 0);
	});

	it("깨진 re-export 는 실패", (t) => {
		const { code, out } = runCheck(t, "ui-barrel", ui('export { Gone } from "./Gone";'));
		assert.equal(code, 1);
		assert.match(out, /\[broken-reexport\] index.ts 의 "\.\/Gone"/);
	});

	it("re-export 가 0개면 실패 (fail-open 방지)", (t) => {
		assert.equal(runCheck(t, "ui-barrel", ui("export const x = 1;")).code, 1);
	});

	it("barrel 이 없으면 실패", (t) => {
		assert.equal(runCheck(t, "ui-barrel", { "src/a.ts": "" }).code, 1);
	});
});

describe("react-compiler", () => {
	it("selectTargets — 테스트 · .d.ts · skipDirs 를 뺀다", () => {
		assert.deepEqual(
			reactCompilerTargets(
				["src/a.tsx", "src/a.test.tsx", "src/t.d.ts", "src/app/api/r.ts", "src/test/setup.ts", "src/b.js", "src/c.md"],
				["src/app/api", "src/test/"],
			),
			["src/a.tsx", "src/b.js"],
		);
	});

	it("앱에 next · babel-plugin-react-compiler 가 없으면 실패한다 (조용히 통과하지 않는다)", (t) => {
		assert.equal(runCheck(t, "react-compiler", { "src/a.tsx": "export function A() { return null; }" }).code, 1);
	});
});

describe("run-all", () => {
	it("check:* 만 고르고, 자기 자신을 부르는 스크립트는 따로 돌려준다", () => {
		assert.deepEqual(
			selectCheckScripts({
				check: "mongshell-check all",
				"check:all": "mongshell-check all --jobs 2",
				"check:journal": "mongshell-check journal",
				"check:local": "node scripts/x.mjs",
				lint: "biome check .",
			}),
			{ names: ["check:journal", "check:local"], recursive: ["check:all"] },
		);
	});

	it("runPool — 동시에 돌려도 결과는 입력 순서", async () => {
		const results = await runPool([30, 10, 20], 2, (ms) => new Promise((r) => setTimeout(() => r(ms), ms)));
		assert.deepEqual(results, [30, 10, 20]);
	});
});

describe("숨김 폴더 — src/app/.well-known 같은 실제 라우트", () => {
	const section = { hint: "폭 안에 맞춘다", decisionRef: "Decision #1" };

	it("no-horizontal-scroll 은 src 아래 숨김 폴더도 검사한다", (t) => {
		const files = { "src/app/.well-known/x/route.ts": 'const c = "overflow-x-auto";' };
		const { code, out } = runCheck(t, "no-horizontal-scroll", files, section);
		assert.equal(code, 1);
		assert.match(out, /\.well-known\/x\/route.ts:1/);
	});

	it("no-horizontal-scroll 은 node_modules 에 내려가지 않는다", (t) => {
		const files = { "src/a.ts": "", "src/node_modules/p/x.ts": 'const c = "overflow-x-auto";' };
		assert.equal(runCheck(t, "no-horizontal-scroll", files, section).code, 0);
	});

	it("doc-symbols 는 숨김 폴더(.next 산출물 등)를 증거로 쓰지 않는다", (t) => {
		const files = { "src/a.ts": "export const x = 1;", "src/.next/chunk.js": "ghostName", "docs/a.md": "`ghostName`" };
		assert.equal(runCheck(t, "doc-symbols", files, { docs: ["docs/a.md"] }).code, 1);
	});
});
