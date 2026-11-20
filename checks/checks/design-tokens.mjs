/**
 * design-tokens — 코드가 쓰는 `<prefix>*` 유틸리티 클래스가 토큰 CSS 에 실제로 정의돼 있는지 대조한다.
 *
 * 왜: Tailwind 는 정의되지 않은 토큰을 참조해도 **오류를 내지 않고 그 클래스를 생성하지 않는다**.
 * `bg-app-surface-secondary` 처럼 없는 이름을 쓰면 타입 검사도 린트도 빌드도 전부 통과하지만 화면에서는 배경이
 * 조용히 사라진다. 사람 눈으로만 잡히는 종류의 결함이라 스크립트로 강제한다.
 *
 * 검사 범위는 접두(`prefix`, 기본 `app-`)로 시작하는 이름뿐이다. Tailwind 빌트인(`rounded-full`, `text-xs` 등)은
 * 저장소가 정의하는 대상이 아니므로 대조하지 않는다 — 그쪽까지 넓히면 게이트가 Tailwind 버전에 묶인다.
 * 정의 집합은 토큰 CSS 에서 읽으므로 저장소마다 토큰이 달라도 손댈 곳이 없다.
 */

import { readFileSync } from "node:fs";
import { extname, relative, resolve } from "node:path";
import { walkFiles } from "../lib/walk.mjs";

export const name = "design-tokens";

export const schema = {
	tokensCss: { type: "string", default: "src/styles/design-tokens.css" },
	srcDir: { type: "string", default: "src" },
	prefix: { type: "string", default: "app-" },
};

/**
 * 유틸리티 접두어 → Tailwind 가 그 유틸을 만들 때 참조하는 `@theme` 네임스페이스.
 * `text-` 는 두 곳을 본다 — 컬러와 서체 크기가 같은 접두어를 쓴다. `shadow-` 도 두 곳 — 그림자와 그림자 색.
 */
const PREFIX_NAMESPACE = {
	bg: ["color"],
	text: ["color", "text"],
	border: ["color"],
	divide: ["color"],
	"ring-offset": ["color"],
	ring: ["color"],
	outline: ["color"],
	fill: ["color"],
	stroke: ["color"],
	from: ["color"],
	via: ["color"],
	to: ["color"],
	decoration: ["color"],
	shadow: ["color", "shadow"],
	accent: ["color"],
	caret: ["color"],
	placeholder: ["color"],
	rounded: ["radius"],
	animate: ["animate"],
};
const NAMESPACES = ["color", "radius", "text", "animate", "shadow"];

// `border-l-` / `rounded-tl-` 처럼 접두어와 토큰 이름 사이에 끼는 방향·모서리 조각.
const SIDES = "t|r|b|l|x|y|s|e|tl|tr|br|bl|ss|se|ee|es";

// 긴 접두어를 먼저 시도해야 `ring-offset-` 이 `ring-` 으로 잘리지 않는다.
const PREFIXES = Object.keys(PREFIX_NAMESPACE).sort((a, b) => b.length - a.length);

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function usagePattern(prefix) {
	return new RegExp(
		String.raw`(?<![-\w])(${PREFIXES.join("|")})(?:-(?:${SIDES}))?-(${escapeRegExp(prefix)}[a-z0-9-]+?)(?:/\d+)?(?![-\w])`,
		"g",
	);
}

/** 네임스페이스별 정의 토큰 집합 — `--color-app-muted` → defined.color 에 `app-muted` (순수 함수). */
export function parseDefinedTokens(css) {
	const defined = {};
	for (const ns of NAMESPACES) {
		defined[ns] = new Set([...css.matchAll(new RegExp(String.raw`--${ns}-([a-z0-9-]+?)\s*:`, "g"))].map((m) => m[1]));
	}
	return defined;
}

/**
 * 주석 안의 토큰 이름은 검사 대상이 아니다 — 설명문이 게이트를 깨지 않도록 먼저 걷어낸다.
 * 블록 주석은 줄바꿈을 남기고 지운다 — 보고하는 줄 번호가 원문과 맞아야 한다.
 */
function stripComments(text, ext) {
	const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
	if (ext === ".css") return noBlock;
	return noBlock.replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * 한 파일에서 정의되지 않은 토큰 사용을 찾는다 (순수 함수).
 * @returns {Array<{klass: string, line: number}>}
 */
export function findUndefinedTokens(text, ext, defined, prefix = "app-") {
	const code = stripComments(text, ext);
	const hits = [];
	for (const m of code.matchAll(usagePattern(prefix))) {
		const [, utility, token] = m;
		if (PREFIX_NAMESPACE[utility].some((ns) => defined[ns].has(token))) continue;
		// 방향 조각(`border-l-`)까지 포함한 실제 클래스명으로 보고한다 — grep 으로 바로 찾을 수 있게.
		hits.push({ klass: m[0].replace(/\/\d+$/, ""), line: code.slice(0, m.index).split("\n").length });
	}
	return hits;
}

export function run({ root, options }) {
	const tokensCss = resolve(root, options.tokensCss);
	let css;
	try {
		css = readFileSync(tokensCss, "utf8");
	} catch (err) {
		console.error(`check-design-tokens: 토큰 CSS 를 읽을 수 없습니다: ${options.tokensCss} (${err.code ?? err.message})`);
		return 1;
	}
	const defined = parseDefinedTokens(css);
	const definedCount = Object.values(defined).reduce((n, s) => n + s.size, 0);
	// 접두가 틀리면(설정 오타 · 토큰 이름 체계 변경) 모든 사용이 "정의 안 됨" 이 아니라 검사 범위 밖이 돼 조용히 통과한다.
	const prefixedCount = Object.values(defined).reduce(
		(n, s) => n + [...s].filter((t) => t.startsWith(options.prefix)).length,
		0,
	);
	if (prefixedCount === 0) {
		console.error(
			`check-design-tokens: ${options.tokensCss} 에 ${options.prefix} 로 시작하는 토큰이 하나도 없습니다 — prefix 설정을 확인하세요(공회전이라 통과로 치지 않습니다).`,
		);
		return 1;
	}

	const files = walkFiles(resolve(root, options.srcDir), (f) => [".tsx", ".ts", ".css"].includes(extname(f))).filter(
		(f) => f !== tokensCss,
	);
	if (files.length === 0) {
		console.error(`check-design-tokens: ${options.srcDir} 에서 검사할 파일을 하나도 찾지 못했습니다 — 공회전이라 통과로 치지 않습니다.`);
		return 1;
	}

	const offenders = new Map();
	for (const file of files) {
		for (const { klass, line } of findUndefinedTokens(readFileSync(file, "utf8"), extname(file), defined, options.prefix)) {
			if (!offenders.has(klass)) offenders.set(klass, []);
			offenders.get(klass).push(`${relative(root, file)}:${line}`);
		}
	}

	if (offenders.size === 0) {
		console.log(
			`check-design-tokens: OK (정의된 ${options.prefix}* 토큰 ${definedCount}개, 파일 ${files.length}개, 미정의 사용 0)`,
		);
		return 0;
	}
	for (const [klass, sites] of [...offenders].sort()) {
		console.error(
			`[undefined-token] \`${klass}\` 는 ${options.tokensCss} 에 정의되지 않았습니다 — 클래스가 생성되지 않아 무시됩니다.`,
		);
		for (const site of sites) console.error(`    ${site}`);
	}
	console.error(`check-design-tokens: ${offenders.size}개 미정의 토큰 발견`);
	return 1;
}
