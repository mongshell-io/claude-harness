/**
 * no-horizontal-scroll — 가로 스크롤 재발 방지 검사 (감바우 Decision #1888 · 셀캐디 Decision #351-1).
 *
 * 화면에 가로 스크롤을 두지 않는다 — 예외 없음. 그런데 `overflow-x-auto` 한 단어면 타입 검사도 린트도 빌드도 전부
 * 통과한 채 가로 스크롤이 다시 생기고, 넓은 화면에서는 넘치지 않아 사람 눈에도 늦게 띈다. 그래서 가로로 스크롤할 수
 * 있게 만드는 선언 자체를 원문에서 찾아 막는다. 넓은 표를 어떻게 맞추는지(설정 `hint`)와 근거 결정(설정 `decisionRef`)은
 * 저장소마다 다르므로 실패 안내에만 쓴다.
 *
 * ## 규칙 — 가로 스크롤 선언
 *   tailwind-class  `overflow-auto`·`overflow-scroll`·`overflow-x-auto`·`overflow-x-scroll` 클래스 토큰.
 *                   `sm:`·`data-[…]:`·`!` 같은 변형·접두는 앞에 붙어도 걸린다.
 *   inline-style    `overflow: "auto"|"scroll"`·`overflowX: "auto"|"scroll"` (style 객체). 두 값 단축형은 첫 값(x 축)이
 *                   auto·scroll 이면 걸린다 — `overflow: "auto hidden"`.
 *   css-property    `overflow: auto|scroll`·`overflow-x: auto|scroll` (CSS·Tailwind 임의 속성 `[overflow-x:auto]`)
 * 단축 속성 `overflow-auto` 를 막는 이유: 세로 스크롤을 의도해도 가로까지 스크롤 컨테이너가 된다.
 *
 * ## 규칙 — 세로 스크롤의 가로 짝 (vertical-scroll-pair)
 * CSS 사양상 한 축의 overflow 가 visible 이 아니면 다른 축의 visible 은 auto 로 계산된다. 그래서 `overflow-y-auto`
 * 하나만 두면 가로로 넘치는 내용이 생기는 순간 가로 스크롤바도 생긴다. 세로 스크롤 선언에는 같은 판정 단위 안에
 * 가로 축을 닫는 선언(`overflow-x-hidden`·`overflow-x-clip`)이 짝으로 있어야 한다. 판정 단위:
 *   클래스      문자열 리터럴 하나(따옴표·백틱). cn() 의 다른 인자에 짝을 두면 오탐이 된다 — 같은 리터럴에 붙여 쓴다.
 *   inline style `overflowY: "auto"|"scroll"` 앞뒤로 가장 가까운 `{`…`}` 구간(중첩 미고려)에 `overflowX: "hidden"|"clip"`.
 *   CSS         `overflow-y: auto|scroll` 앞뒤로 가장 가까운 `{`…`}` 선언 블록에 `overflow-x: hidden|clip`.
 *   단축형      `overflow: <x> auto|scroll` 두 값 단축형은 첫 값이 hidden·clip 이어야 한다(visible 이면 auto 로 계산).
 *
 * 텍스트 스캔의 한계: `overflow-${axis}-auto` 처럼 런타임에 조립되는 클래스는 보지 못한다.
 *
 * 주석 안의 언급은 보지 않는다 — 문자열·주석을 왼쪽부터 한 번에 토큰화해 주석만 공백으로 바꾼다(줄 번호 보존).
 * 문자열 안의 `/*`·`//`(`accept="image/*"`, URL)를 주석으로 오인하지 않는다. 따옴표 문자열은 한 줄로 제한한다.
 *
 * ## 대상
 *   `<srcDir>/**\/*.{ts,tsx,css}` — 테스트 파일(`*.test.*`)은 뺀다. 테스트는 "overflow-x-auto 가 없다" 를 단언하려고
 *   클래스 이름을 문자열로 쓴다. 폴더를 직접 걷되 숨김 폴더 · node_modules 는 내려가지 않는다(git 에 기대지 않는다 —
 *   Docker 빌드 컨텍스트에는 .git 이 없다).
 *
 * ## 허용 목록 — 없다
 * 결정이 예외를 두지 않기로 했으므로 허용 목록 메커니즘도 두지 않는다. 위반이면 고친다.
 */

import { readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { walkFiles } from "../lib/walk.mjs";

export const name = "no-horizontal-scroll";

export const schema = {
	srcDir: { type: "string", default: "src" },
	hint: { type: "string", required: true },
	decisionRef: { type: "string", required: true },
};

// ── 규칙 ─────────────────────────────────────────────────────────────────────

/** @type {Array<{id: string, pattern: RegExp}>} */
export const RULES = [
	// 앞이 글자·하이픈이면 다른 클래스의 일부다. `:`(변형)·`!`(important)·공백·따옴표는 앞에 와도 된다.
	{ id: "tailwind-class", pattern: /(?<![\w-])overflow-(?:x-)?(?:auto|scroll)(?![\w-])/g },
	// 두 번째 값(`(?:\s+\w+)?`)은 단축형 `overflow: "auto hidden"` — 첫 값이 x 축이다.
	{ id: "inline-style", pattern: /(?<![\w-])overflowX?\s*:\s*(['"`])(?:auto|scroll)(?:\s+\w+)?\1/g },
	{ id: "css-property", pattern: /(?<![\w-])overflow(?:-x)?\s*:\s*(?:auto|scroll)(?![\w-])/g },
];

const PAIR_RULE = "vertical-scroll-pair";
const Y_SCROLL_CLASS = /(?<![\w-])(?:overflow-y-(?:auto|scroll)|\[overflow-y:(?:auto|scroll)\])(?![\w-])/;
const X_CLOSED_CLASS = /(?<![\w-])(?:overflow-x-(?:hidden|clip)|\[overflow-x:(?:hidden|clip)\])(?![\w-])/;
const Y_SCROLL_STYLE = /(?<![\w-])overflowY\s*:\s*(['"`])(?:auto|scroll)\1/g;
const X_CLOSED_STYLE = /(?<![\w-])overflowX\s*:\s*(['"`])(?:hidden|clip)\1/;
const Y_SCROLL_CSS = /(?<![\w-])overflow-y\s*:\s*(?:auto|scroll)(?![\w-])/g;
const X_CLOSED_CSS = /(?<![\w-])overflow-x\s*:\s*(?:hidden|clip)(?![\w-])/;
// 두 값 단축형에서 둘째 값(y)이 스크롤인데 첫 값(x)이 hidden·clip 이 아니면 x 는 auto 로 계산된다.
const SHORTHAND_OPEN_X = /(?<![\w-])overflow\s*:\s*['"`]?(?!hidden\b|clip\b)[a-z]+\s+(?:auto|scroll)\b/g;

const STRING = String.raw`"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|\`(?:\\[\s\S]|[^\`\\])*\``;
const BLOCK_COMMENT = String.raw`\/\*[\s\S]*?\*\/`;
const LINE_COMMENT = String.raw`\/\/[^\n]*`;
// 문자열·주석을 왼쪽부터 한 번에 잡는다 — 먼저 시작한 쪽이 이긴다. CSS 에는 `//` 주석이 없다.
const TOKEN_TS = new RegExp(`${STRING}|${BLOCK_COMMENT}|${LINE_COMMENT}`, "g");
const TOKEN_CSS = new RegExp(`${STRING}|${BLOCK_COMMENT}`, "g");
const STRING_LITERAL = new RegExp(STRING, "g");

/**
 * 주석을 같은 길이의 공백으로 바꾼다 — 줄바꿈은 남겨 줄 번호가 원문과 맞는다. 문자열은 그대로 둔다.
 * @param {string} text
 * @param {boolean} isCss CSS 에는 `//` 주석이 없다
 */
export function blankComments(text, isCss) {
	const blank = (s) => s.replace(/[^\n]/g, " ");
	return text.replace(isCss ? TOKEN_CSS : TOKEN_TS, (m) => (m.startsWith("/") ? blank(m) : m));
}

/** idx 를 감싸는 가장 가까운 `{`…`}` 구간 (중첩은 보지 않는다). 없으면 앞뒤 끝까지. */
function enclosingBraces(code, idx) {
	const open = code.lastIndexOf("{", idx);
	const close = code.indexOf("}", idx);
	return code.slice(open === -1 ? 0 : open, close === -1 ? code.length : close + 1);
}

/**
 * 세로 스크롤 선언 중 가로 축을 닫는 짝이 없는 위치 (주석은 이미 걷어낸 code 를 받는다).
 * @param {string} code
 * @param {boolean} isCss
 * @returns {Array<{index: number, match: string}>}
 */
function findUnpairedVerticalScroll(code, isCss) {
	const found = [];
	if (isCss) {
		for (const m of code.matchAll(Y_SCROLL_CSS)) {
			if (!X_CLOSED_CSS.test(enclosingBraces(code, m.index))) found.push({ index: m.index, match: m[0] });
		}
	} else {
		for (const lit of code.matchAll(STRING_LITERAL)) {
			const y = Y_SCROLL_CLASS.exec(lit[0]);
			if (y && !X_CLOSED_CLASS.test(lit[0])) found.push({ index: lit.index + y.index, match: y[0] });
		}
		for (const m of code.matchAll(Y_SCROLL_STYLE)) {
			if (!X_CLOSED_STYLE.test(enclosingBraces(code, m.index))) found.push({ index: m.index, match: m[0] });
		}
	}
	for (const m of code.matchAll(SHORTHAND_OPEN_X)) found.push({ index: m.index, match: m[0] });
	return found;
}

function lineOf(text, idx) {
	return text.slice(0, idx).split("\n").length;
}

/**
 * 한 파일 원문에서 가로 스크롤 선언과 짝 없는 세로 스크롤 선언 위치를 찾는다 (순수 함수).
 * @param {string} text
 * @param {string} relFile
 * @returns {Array<{file: string, rule: string, line: number, match: string}>}
 */
export function findHorizontalScrollHits(text, relFile) {
	const isCss = relFile.endsWith(".css");
	const code = blankComments(text, isCss);
	const hits = [];
	for (const rule of RULES) {
		for (const m of code.matchAll(rule.pattern)) {
			hits.push({ file: relFile, rule: rule.id, line: lineOf(code, m.index), match: m[0] });
		}
	}
	for (const { index, match } of findUnpairedVerticalScroll(code, isCss)) {
		hits.push({ file: relFile, rule: PAIR_RULE, line: lineOf(code, index), match });
	}
	return hits.sort((a, b) => a.line - b.line);
}

// ── 스캔 대상 ────────────────────────────────────────────────────────────────

const TARGET_EXT = /\.(ts|tsx|css)$/;
const TEST_FILE = /\.test\.(ts|tsx)$/;

/**
 * 저장소 상대 경로 목록에서 검사 대상을 고른다 (순수 함수).
 * @param {string[]} files
 * @param {string} [srcDir]
 * @returns {string[]}
 */
export function selectTargets(files, srcDir = "src") {
	const prefix = `${srcDir.replace(/\/+$/, "")}/`;
	return files.filter((f) => f.startsWith(prefix) && TARGET_EXT.test(f) && !TEST_FILE.test(f));
}

export function run({ root, options }) {
	const relFiles = walkFiles(resolve(root, options.srcDir), (f) => TARGET_EXT.test(f)).map((f) =>
		relative(root, f).split(sep).join("/"),
	);
	const targets = selectTargets(relFiles, options.srcDir);

	if (targets.length === 0) {
		console.error(
			"[no-horizontal-scroll] 검사할 파일을 하나도 찾지 못했다 — 검사가 공회전했다는 뜻이라 통과로 치지 않는다.",
		);
		return 1;
	}

	const hits = targets.flatMap((rel) => findHorizontalScrollHits(readFileSync(join(root, rel), "utf8"), rel));

	if (hits.length > 0) {
		console.error(`[no-horizontal-scroll] 가로 스크롤 선언 ${hits.length}건 (파일 ${targets.length}개 대상)\n`);
		for (const h of hits) console.error(`  ✗ ${h.file}:${h.line}  \`${h.match}\` (${h.rule})`);
		console.error(
			`\n  가로 스크롤은 예외 없이 두지 않는다 — ${options.hint}` +
				"\n  세로 스크롤만 필요하면 overflow-y-auto overflow-x-hidden 을 같은 문자열에 함께 쓴다 — overflow-y-auto 만 두면" +
				"\n  CSS 사양상 가로 축이 auto 로 계산돼 가로 스크롤바가 생긴다. 허용 목록은 없다." +
				`\n  배경: ${options.decisionRef}`,
		);
		return 1;
	}

	console.log(`[no-horizontal-scroll] 정합 — 파일 ${targets.length}개, 가로 스크롤 선언 0건.`);
	return 0;
}
