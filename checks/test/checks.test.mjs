import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveOptions } from "../lib/config.mjs";
import { CHECKS } from "../lib/registry.mjs";
import { runPool, selectCheckScripts } from "../lib/run-all.mjs";
import { CLOCK_SKEW_TOLERANCE_MS, findFutureWhen, findIdxGaps } from "../checks/journal.mjs";
import { selectTargets as reactCompilerTargets } from "../checks/react-compiler.mjs";
import { isRelativeSpecifier, moduleCandidates } from "../checks/ui-barrel.mjs";
import { captureConsole, makeRepo } from "./helpers.mjs";

/** 임시 저장소에서 검사 하나를 돌려 종료 코드와 출력을 돌려준다. `input` 은 run 에 더 넘길 값(journal 의 `now` 등). */
function runCheck(t, name, files, section = {}, input = {}) {
	const root = makeRepo(t, files);
	const out = captureConsole(t);
	const code = CHECKS[name].run({ root, options: resolveOptions(name, CHECKS[name].schema, section), ...input });
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

	it("idx · when 이 정수가 아니면 실패 (NaN 비교로 조용히 통과하지 않게)", (t) => {
		for (const bad of [{ idx: 1, tag: "0001_m" }, { idx: "1", tag: "0001_m", when: 5 }, { idx: 1, tag: "0001_m", when: 1.5 }]) {
			const { code, out } = runCheck(t, "journal", journalFiles([e(0, 1), bad]));
			assert.equal(code, 1, JSON.stringify(bad));
			assert.match(out, /형식이 틀린 entry 1건/);
		}
	});

	it("journalPath 설정을 따른다", (t) => {
		const files = { "db/migrations/meta/_journal.json": { entries: [e(0, 1)] }, "db/migrations/0000_m.sql": "" };
		assert.equal(runCheck(t, "journal", files, { journalPath: "db/migrations/meta/_journal.json" }).code, 0);
	});

	describe("미래 시각 when — 지금 시각은 run({ now }) 로 고정한다", () => {
		// 실제 사고의 모양: 손으로 적은 라운드 넘버가 그날의 실제 시각보다 약 16시간 앞섰다.
		const NOW = Date.UTC(2026, 6, 4, 5, 0, 0);
		const FUTURE = Date.UTC(2026, 6, 4, 21, 20, 0);

		it("when 이 지금보다 미래면 실패 — 단조 증가여도 걸린다 (다음 마이그레이션이 생기기 전에 막는다)", (t) => {
			const { code, out } = runCheck(t, "journal", journalFiles([e(0, NOW - 2000), e(1, NOW - 1000), e(2, FUTURE)]), {}, { now: NOW });
			assert.equal(code, 1);
			assert.match(out, /journal when 이 미래 시각/);
			assert.match(out, /idx 2 \(0002_m\) when=1783200000000 \(2026-07-04T21:20:00\.000Z\)/);
			assert.doesNotMatch(out, /비단조/);
		});

		it("같은 journal 이 그 시각을 지난 뒤에는 통과한다 — 시간이 흘러 실패로 바뀌는 일은 없다", (t) => {
			const files = journalFiles([e(0, NOW - 2000), e(1, NOW - 1000), e(2, FUTURE)]);
			assert.equal(runCheck(t, "journal", files, {}, { now: FUTURE }).code, 0);
		});

		it("허용치 안(개발 PC 시계가 조금 앞선 경우)은 통과, 허용치를 1ms 넘으면 실패", (t) => {
			const at = (when) => runCheck(t, "journal", journalFiles([e(0, NOW - 1000), e(1, when)]), {}, { now: NOW }).code;
			assert.equal(at(NOW + CLOCK_SKEW_TOLERANCE_MS), 0);
			assert.equal(at(NOW + CLOCK_SKEW_TOLERANCE_MS + 1), 1);
		});

		it("now 를 넣지 않으면 실행 시각이 기준이다", (t) => {
			const { code, out } = runCheck(t, "journal", journalFiles([e(0, 1), e(1, Date.now() + 24 * 60 * 60 * 1000)]));
			assert.equal(code, 1);
			assert.match(out, /미래 시각/);
		});

		it("미래 when 은 knownNonMonotonic 으로 면제되지 않는다", (t) => {
			const files = journalFiles([e(0, NOW - 3000), e(1, FUTURE), e(2, NOW - 1000)]);
			const { code, out } = runCheck(t, "journal", files, { knownNonMonotonic: [{ idx: 2, why: "적용 완료" }] }, { now: NOW });
			assert.equal(code, 1);
			assert.match(out, /미래 시각/);
			assert.doesNotMatch(out, /비단조/);
		});

		it("Date 로 표기할 수 없는 값도 죽지 않고 위반으로 보고한다", (t) => {
			const { code, out } = runCheck(t, "journal", journalFiles([e(0, 1), e(1, 1e17)]), {}, { now: NOW });
			assert.equal(code, 1);
			assert.match(out, /날짜로 표기할 수 없는 값/);
		});

		it("findFutureWhen — 허용치를 넘는 entry 만 돌려준다 (순수 함수)", () => {
			const entries = [e(0, 10), e(1, 100 + CLOCK_SKEW_TOLERANCE_MS), e(2, 101 + CLOCK_SKEW_TOLERANCE_MS)];
			assert.deepEqual(findFutureWhen(entries, 100), [entries[2]]);
		});
	});

	describe("idx 연속 — 0 부터 빈틈 · 중복 없이", () => {
		it("빈틈이 있으면 실패 — 끊긴 자리만 보고한다", (t) => {
			const { code, out } = runCheck(t, "journal", journalFiles([e(0, 1), e(1, 2), e(3, 3), e(4, 4)]));
			assert.equal(code, 1);
			assert.match(out, /idx 3 \(0003_m\) — 이 자리에 올 idx 는 2 입니다/);
			assert.doesNotMatch(out, /idx 4 \(0004_m\) — 이 자리/);
		});

		it("0 이 아닌 값으로 시작하면 실패", (t) => {
			const { code, out } = runCheck(t, "journal", journalFiles([e(1, 1), e(2, 2)]));
			assert.equal(code, 1);
			assert.match(out, /idx 1 \(0001_m\) — 이 자리에 올 idx 는 0 입니다/);
		});

		it("같은 idx 가 두 번 있으면 실패", (t) => {
			const entries = [e(0, 1), e(1, 2), { idx: 1, tag: "0001_other", when: 3 }, e(2, 4)];
			const { code, out } = runCheck(t, "journal", journalFiles(entries));
			assert.equal(code, 1);
			assert.match(out, /idx 1 \(0001_other\) — 이 자리에 올 idx 는 2 입니다/);
		});

		it("파일 안의 순서가 뒤섞여 있어도 idx 집합이 연속이면 이 판정은 통과한다 (idx 순으로 놓고 본다)", (t) => {
			assert.equal(runCheck(t, "journal", journalFiles([e(1, 2), e(0, 1), e(2, 3)])).code, 0);
		});

		it("findIdxGaps — 끊긴 자리마다 하나 (순수 함수)", () => {
			const at = (...idxs) => findIdxGaps(idxs.map((idx) => ({ idx, tag: `t${idx}` }))).map((g) => [g.entry.idx, g.expected]);
			assert.deepEqual(at(0, 1, 2), []);
			assert.deepEqual(at(0, 2, 3, 5), [[2, 1], [5, 4]]);
			assert.deepEqual(at(0, 0), [[0, 1]]);
		});
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

	it("여러 줄 블록 주석 뒤의 위반도 원문 줄 번호로 보고한다", (t) => {
		const src = '/**\n * 설명\n * 둘째 줄\n */\nexport const a = 1;\nexport const b = "bg-app-nope";\n';
		const { code, out } = runCheck(t, "design-tokens", { "src/styles/design-tokens.css": css, "src/a.tsx": src });
		assert.equal(code, 1);
		assert.match(out, /src\/a\.tsx:6\b/);
	});

	it("주석 안의 이름은 보지 않는다", (t) => {
		const files = { "src/styles/design-tokens.css": css, "src/a.tsx": "// bg-app-nope 는 없다\n/* text-app-gone */" };
		assert.equal(runCheck(t, "design-tokens", files).code, 0);
	});

	it("검사할 파일이 0개면 실패 (공회전)", (t) => {
		assert.equal(runCheck(t, "design-tokens", { "src/styles/design-tokens.css": css }).code, 1);
	});

	it("prefix 로 시작하는 정의 토큰이 0개면 실패 (prefix 오타로 검사 범위가 비지 않게)", (t) => {
		const files = { "src/styles/design-tokens.css": css, "src/a.tsx": '<div className="bg-ap-nope" />' };
		const { code, out } = runCheck(t, "design-tokens", files, { prefix: "ap-" });
		assert.equal(code, 1);
		assert.match(out, /ap- 로 시작하는 토큰이 하나도 없습니다/);
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

	it("패키지 · 경로 별칭 re-export 는 깨진 것으로 보지 않는다", (t) => {
		const index = [
			'export { Button } from "./Button";',
			'export * from "@radix-ui/react-dialog";',
			'export * as Popover from "@radix-ui/react-popover";',
			'export { cn } from "@/lib/utils";',
			'export type { ClassValue } from "clsx";',
			'export { z } from "~/schema";',
		].join("\n");
		const { code, out } = runCheck(t, "ui-barrel", ui(index));
		assert.equal(code, 0);
		assert.doesNotMatch(out, /broken-reexport/);
		assert.match(out, /re-export 6개 — 상대경로 1개 확인, 패키지 · 별칭 5개는 판정 제외/);
	});

	it("패키지 · 별칭 사이에 섞인 깨진 상대경로는 여전히 실패", (t) => {
		const index = 'export * from "@radix-ui/react-dialog";\nexport { cn } from "@/lib/utils";\nexport { Gone } from "./Gone";';
		const { code, out } = runCheck(t, "ui-barrel", ui(index));
		assert.equal(code, 1);
		assert.match(out, /\[broken-reexport\] index.ts 의 "\.\/Gone"/);
		assert.match(out, /1개 항목 drift/);
	});

	it("확장자를 적은 상대경로는 그 파일을 찾는다 — `.js` 로 적은 것은 같은 이름의 TypeScript 파일도", (t) => {
		const index = [
			'export * from "./Button.tsx";',
			'export { Button as B } from "./Button.js";',
			'export * from "./table/index.ts";',
			'export * from "./table/index.js";',
		].join("\n");
		const { code, out } = runCheck(t, "ui-barrel", ui(index));
		assert.equal(code, 0, out);
		assert.match(out, /re-export 4개, drift 없음/);
	});

	it("확장자를 적었는데 그 파일이 없으면 실패 — 다른 확장자의 같은 이름으로 넘기지 않는다", (t) => {
		// Button.tsx 는 있지만 Button.ts 는 없다. `.jsx` 는 `.tsx` 로만 풀린다(table/index 는 .ts).
		const index = 'export * from "./Button.ts";\nexport * from "./table/index.jsx";\nexport * from "./Gone.tsx";';
		const { code, out } = runCheck(t, "ui-barrel", ui(index));
		assert.equal(code, 1);
		assert.match(out, /"\.\/Button\.ts"/);
		assert.match(out, /"\.\/table\/index\.jsx"/);
		assert.match(out, /"\.\/Gone\.tsx"/);
		assert.match(out, /3개 항목 drift/);
	});

	it("index 가 없는 폴더를 가리키면 실패 — 폴더가 있다는 것만으로 통과하지 않는다", (t) => {
		const files = { ...ui('export * from "./icons";'), "src/components/ui/icons/Arrow.tsx": "export const Arrow = 1;" };
		const { code, out } = runCheck(t, "ui-barrel", files);
		assert.equal(code, 1);
		assert.match(out, /\[broken-reexport\] index.ts 의 "\.\/icons"/);
	});

	it("상위 폴더(`../`)를 가리키는 상대경로도 확인한다", (t) => {
		const files = { ...ui('export * from "../shared/tokens";\nexport * from "../shared/gone";'), "src/components/shared/tokens.ts": "export const t = 1;" };
		const { code, out } = runCheck(t, "ui-barrel", files);
		assert.equal(code, 1);
		assert.match(out, /"\.\.\/shared\/gone"/);
		assert.doesNotMatch(out, /"\.\.\/shared\/tokens"/);
	});

	it("re-export 가 전부 패키지 · 별칭이면 실패 (확인한 파일이 0개 — 공회전)", (t) => {
		const { code, out } = runCheck(t, "ui-barrel", ui('export * from "@radix-ui/react-dialog";\nexport { cn } from "@/lib/utils";'));
		assert.equal(code, 1);
		assert.match(out, /전부 패키지 · 별칭 지정자라 확인할 파일이 없습니다/);
	});

	it("isRelativeSpecifier · moduleCandidates (순수 함수)", () => {
		for (const mod of ["./Button", "../shared/x", ".", ".."]) assert.equal(isRelativeSpecifier(mod), true, mod);
		for (const mod of ["@radix-ui/react-dialog", "@/lib/utils", "clsx", "~/schema", ".hidden/x", "/abs/x"]) {
			assert.equal(isRelativeSpecifier(mod), false, mod);
		}
		const candidates = moduleCandidates("ui", "./Button.js");
		for (const expected of ["ui/Button.js", "ui/Button.ts", "ui/Button.tsx"]) assert.ok(candidates.includes(expected), expected);
		assert.ok(moduleCandidates("ui", "./table").includes("ui/table/index.ts"));
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
