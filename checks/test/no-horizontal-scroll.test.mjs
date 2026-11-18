import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { blankComments, findHorizontalScrollHits, selectTargets } from "../checks/no-horizontal-scroll.mjs";

const TSX = "src/components/example.tsx";
const CSS = "src/app/example.css";

function rulesHit(src, file = TSX) {
	return findHorizontalScrollHits(src, file).map((h) => h.rule);
}

describe("findHorizontalScrollHits — 양성 (가로 스크롤 선언)", () => {
	for (const [label, src, rule] of [
		["가로 스크롤 클래스", '<div className="overflow-x-auto rounded-app">', "tailwind-class"],
		["가로 스크롤 고정 클래스", '<div className="overflow-x-scroll">', "tailwind-class"],
		["단축 auto 클래스", '<div className="overflow-auto">', "tailwind-class"],
		["단축 scroll 클래스", "cn('p-2 overflow-scroll')", "tailwind-class"],
		["반응형 접두", '<div className="sm:overflow-x-auto">', "tailwind-class"],
		["임의 변형 접두", '<div className="data-[open=true]:overflow-auto">', "tailwind-class"],
		["important 접두", '<div className="!overflow-x-auto">', "tailwind-class"],
		["inline style overflowX", 'style={{ overflowX: "auto" }}', "inline-style"],
		["inline style overflow scroll", "style={{ overflow: 'scroll' }}", "inline-style"],
		["inline style 두 값 단축형 (x=auto)", 'style={{ overflow: "auto hidden" }}', "inline-style"],
		["CSS overflow-x", ".box { overflow-x: auto; }", "css-property"],
		["CSS 단축 속성", ".box{overflow:scroll}", "css-property"],
		["Tailwind 임의 속성", '<div className="[overflow-x:auto]">', "css-property"],
	]) {
		it(label, () => {
		assert.ok(rulesHit(src).includes(rule));
		});
	}

	it("CSS 파일도 검사한다", () => {
		assert.deepEqual(rulesHit(".t { overflow-x: scroll; }", CSS), ["css-property"]);
	});

	it("줄 번호를 1부터 센다", () => {
		const hits = findHorizontalScrollHits('const a = 1;\n\n<div className="overflow-x-auto" />', TSX);
		assert.deepEqual(hits, [{ file: TSX, rule: "tailwind-class", line: 3, match: "overflow-x-auto" }]);
	});
});

describe("findHorizontalScrollHits — 음성 (허용·오탐 방지)", () => {
	for (const [label, src, rule] of [
		["세로 스크롤 클래스", '<div className="overflow-y-auto overflow-x-hidden">'],
		["세로 scroll 클래스 + clip 짝", '<div className="sm:overflow-y-scroll overflow-x-clip">'],
		["넘침 자르기", '<div className="relative overflow-x-clip">'],
		["숨김·보임", '<div className="overflow-hidden overflow-visible">'],
		["inline style 세로 + 가로 짝", 'style={{ overflowY: "auto", overflowX: "hidden" }}'],
		["inline style 두 값 단축형 (x=hidden)", 'style={{ overflow: "hidden auto" }}'],
		["inline style visible", 'style={{ overflow: "visible" }}'],
		["CSS 세로 + 가로 짝", ".box { overflow-y: auto; overflow-x: hidden; }"],
		["computed style 비교", 'if (overflowY === "auto") return node;'],
		["computed style 읽기", "const { overflowX, overflow } = getComputedStyle(el);"],
		["다른 단어의 일부", "const overflow-autoplay = 1; scroll-overflow-auto"],
		["줄 주석", "// 예전에는 overflow-x-auto 로 감쌌다"],
		["블록 주석", "/* style overflow:auto 를 덮는다 */"],
		["JSX 주석", '{/* v4 Panel 은 overflow: "auto" 를 넣는다 */}'],
		["줄 끝 주석", 'const a = 1; // overflowX: "scroll"'],
	]) {
		it(label, () => {
		assert.deepEqual(rulesHit(src), []);
		});
	}

	it("URL 의 // 는 주석으로 보지 않는다", () => {
		assert.deepEqual(rulesHit('const u = "https://x.test"; <div className="overflow-x-auto" />'), ["tailwind-class"]);
	});
});

describe("findHorizontalScrollHits — 문자열 안의 주석 표식", () => {
	it("문자열 안의 /* 는 주석 시작이 아니다 — 뒤 코드도 검사한다", () => {
		const src = '<input accept="image/*" />\n<div className="overflow-x-auto" />\n/** doc */';
		assert.deepEqual(findHorizontalScrollHits(src, TSX), [
			{ file: TSX, rule: "tailwind-class", line: 2, match: "overflow-x-auto" },
		]);
	});

	it("줄 주석 안의 /* 는 블록 주석을 열지 않는다", () => {
		const src = '// /api/partner/*\n<div className="overflow-x-auto" />\n/** doc */';
		assert.deepEqual(rulesHit(src), ["tailwind-class"]);
	});

	it("CSS 문자열 안의 /* 도 주석 시작이 아니다", () => {
		assert.deepEqual(rulesHit('.a { content: "/*"; }\n.b { overflow-x: auto; }\n/* c */', CSS), ["css-property"]);
	});
});

describe("findHorizontalScrollHits — 세로 스크롤의 가로 짝 (vertical-scroll-pair)", () => {
	for (const [label, src, rule] of [
		["클래스 단독", '<div className="max-h-60 overflow-y-auto">'],
		["접두 붙은 클래스 단독", '<div className="max-sm:overflow-y-scroll">'],
		["Tailwind 임의 속성", '<div className="[overflow-y:auto]">'],
		["cn 의 다른 인자에 짝 — 같은 리터럴이 아니면 짝으로 치지 않는다", 'cn("overflow-y-auto", "overflow-x-hidden")'],
		["inline style 세로 단독", 'style={{ maxHeight, overflowY: "auto" }}'],
		["inline style 짝이 다른 객체", 'const a = { overflowY: "auto" }; const b = { overflowX: "hidden" };'],
		["두 값 단축형 (x=visible)", 'style={{ overflow: "visible auto" }}'],
	]) {
		it(label, () => {
		assert.ok(rulesHit(src).includes("vertical-scroll-pair"));
		});
	}

	it("CSS 선언 블록 단독", () => {
		assert.deepEqual(rulesHit(".a { overflow-y: auto; }\n.b { overflow-x: hidden; }", CSS), ["vertical-scroll-pair"]);
	});

	for (const [label, src, rule] of [
		["같은 리터럴의 hidden 짝", '<div className="overflow-x-hidden max-h-60 overflow-y-auto">'],
		["템플릿 리터럴 안의 짝", "className={`overflow-y-auto $" + "{x} overflow-x-hidden`}"],
		["임의 속성 짝", '<div className="[overflow-y:auto] [overflow-x:hidden]">'],
		["주석 안의 언급", "// overflow-y-auto 하나면 가로 스크롤바가 생긴다"],
	]) {
		it(`음성 — ${label}`, () => {
		assert.deepEqual(rulesHit(src), []);
		});
	}
});

describe("blankComments — 줄 번호 보존", () => {
	it("블록 주석을 지워도 줄 수가 같다", () => {
		const src = "a\n/* 1\n2\n3 */\nb";
		const out = blankComments(src, false);
		assert.equal(out.split("\n").length, src.split("\n").length);
		assert.ok(!out.includes("1"));
	});

	it("CSS 는 // 를 주석으로 보지 않는다", () => {
		assert.equal(blankComments("a // b", true), "a // b");
	});
});

describe("selectTargets — 검사 대상 고르기", () => {
	it("src 의 ts·tsx·css 만 고르고 테스트·다른 디렉토리·다른 확장자는 뺀다", () => {
		assert.deepEqual(
			selectTargets([
				"src/a.tsx",
				"src/b.ts",
				"src/app/globals.css",
				"src/a.test.tsx",
				"src/b.test.ts",
				"src/readme.md",
				"scripts/x.mjs",
				"docs/design.md",
			]),
			["src/a.tsx", "src/b.ts", "src/app/globals.css"],
		);
	});
});

describe("selectTargets — srcDir 설정", () => {
	it("srcDir 이 다르면 그 폴더만 고른다", () => {
		assert.deepEqual(selectTargets(["app/a.tsx", "src/b.tsx"], "app"), ["app/a.tsx"]);
	});
});
