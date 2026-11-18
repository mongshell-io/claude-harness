/**
 * doc-symbols — 권위 문서가 백틱으로 인용하는 코드 심볼(함수·상수·타입)이 소스에 실제로 존재하는지 대조한다.
 *
 * 왜: 문서가 없는 이름을 부르는 것은 lint·typecheck·test·build 를 전부 통과하고 아무 신호도 내지 않는다. 게다가 사람
 * 눈으로도 잘 안 잡힌다 — 감바우 `architecture.md` 는 인접한 두 줄에서 같은 함수를 존재하지 않는 이름과 실재하는
 * 이름으로 다르게 부른 채 머물러 있었다. 드리프트(코드가 이름을 바꿔 뒤처짐)와 오기재(처음부터 실물 미확인)를 함께 잡는다.
 *
 * ⚠️ **fail-open 을 막는 것이 이 게이트 설계의 전부다.** 감바우 초판이 네 방향으로 새어 전부 실측으로 재현됐다 —
 * 대상 문서 일부가 구조적으로 통과, 절단 오타 통과, 게이트를 만든 계기가 된 이름조차 통과. `SOURCE_EXTENSIONS`·
 * haystack 제외·토큰 `Set` 매칭이 각각 그 구멍 하나씩을 막는다. 넓히기 전에 음성 테스트부터 할 것.
 *
 * ⚠️ **남아 있는 한계 — 주석도 증거로 인정한다.** 토큰 인덱스를 파일 원문에서 뽑으므로, 코드에 선언이 없고 주석에만
 * 이름이 남은 경우 그 인용이 통과한다. 주석을 걸러내려면 파서가 필요해 지금은 감수한다.
 *
 * 설정(전부 저장소마다 다르다):
 *   docs            검사 대상 문서. 결정 로그 · 외부 문서 미러 · 조사 기록처럼 우리 소스에 없는 이름을 인용하는 것이
 *                   본 역할인 문서는 넣지 않는다. 목록의 문서가 없으면 실패한다(이름이 바뀌면 범위가 말없이 줄지 않게).
 *   sourceDirs      심볼이 실재하는지 확인할 폴더. `drizzle/` 은 넣지 않는다 — 마이그레이션은 append-only 라 DROP 된
 *                   이름을 영구 보존해, 도메인째 제거된 이름을 문서가 계속 불러도 통과한다.
 *   sourceFiles     같은 목적의 개별 파일(package.json · 설정 파일).
 *   haystackExclude 증거에서 뺄 파일 — 사례 심볼을 주석에 담은 훅 스크립트처럼, 문서가 그 이름을 다시 써도 통과하게
 *                   만드는 파일.
 *   allow           소스에 없는 것이 정상인 외부 세계의 식별자 { symbol, why }. "일단 통과시키려고" 넣기 시작하면
 *                   게이트가 무의미해진다.
 *
 * **harness.config.json 은 설정과 무관하게 항상 증거에서 뺀다** — 허용 목록 리터럴이 자기 자신을 증명하면 허용 목록이
 * 무동작이 된다(항목을 지워도 그 이름이 설정 파일에 남아 통과한다).
 *
 * 검사 범위: 백틱 안이 **단일 식별자**이거나 무인자 호출형(`foo()`)인 것만. 스크립트명(`db:migrate`)·인자 있는 호출형·
 * 멤버 접근(`user.role`)은 대상이 아니다 — 넓히면 산문과의 경계가 흐려져 오탐이 는다.
 */

import { existsSync, readFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { CONFIG_FILE } from "../lib/config.mjs";
import { walkFiles } from "../lib/walk.mjs";

export const name = "doc-symbols";

export const schema = {
	docs: { type: "string[]", required: true },
	sourceDirs: { type: "string[]", default: ["src", "scripts"] },
	sourceFiles: {
		type: "string[]",
		default: ["package.json", "drizzle.config.ts", "vitest.config.ts", "biome.json"],
	},
	haystackExclude: { type: "string[]", default: [] },
	allow: { type: "items", fields: { symbol: "string" }, default: [] },
};

/**
 * haystack 에 넣을 확장자. **`.md` 가 빠진 것이 핵심이다** — sourceDirs 아래에 검사 대상 문서(`src/**\/CLAUDE.md` 등)가
 * 있어서, 확장자를 안 거르면 그 문서가 자기가 쓴 이름을 자기가 증명한다. 바이너리·자동생성물 혼입으로 인한 우연 일치도
 * 함께 막는다. `.sql` 도 뺀다 — 일회성 정리 SQL 은 DROP 된 테이블 이름을 보존한다(`drizzle/` 을 빼는 것과 같은 이유).
 */
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".mts", ".js", ".jsx", ".json", ".sh"]);

/** 최소 길이 — 너무 짧은 토큰은 산문 속 영단어와 구분되지 않는다. */
const MIN_SYMBOL_LENGTH = 4;

/**
 * 백틱 인용 중 단일 식별자와 무인자 호출형(`foo()`)만. 경로·명령줄·문장은 걸러진다.
 * ⚠️ `()` 를 빼면 `getSslConfig()` 같은 1급 함수 인용이 통째로 검사에서 빠진다(감바우에서 빼 봤다가 되돌렸다).
 */
const SYMBOL_PATTERN = /`([A-Za-z_][A-Za-z0-9_]*)(?:\(\))?`/g;

/** 소스 토큰 추출용 — 부분 문자열이 아니라 식별자 단위로 담아야 절단 오타를 잡는다. */
const TOKEN_PATTERN = /[A-Za-z_][A-Za-z0-9_]*/g;

/**
 * snake_case → camelCase. Drizzle 은 `teamName: text()` 선언을 DB 컬럼 `team_name` 으로 변환하므로, 문서가 컬럼명을
 * 인용하면 소스에는 camelCase 로만 존재한다. 둘 다 정당한 표기라 허용 목록에 쌓지 않고 여기서 대응시킨다.
 */
function toCamelCase(symbol) {
	return symbol.replace(/_([a-z0-9])/g, (_, ch) => ch.toUpperCase());
}

/** haystack 파일 목록 (설정 파일은 항상 제외). */
export function collectHaystack(root, options) {
	const exclude = new Set([resolve(root, CONFIG_FILE), ...options.haystackExclude.map((f) => resolve(root, f))]);
	const accept = (f) => !f.startsWith(".") && SOURCE_EXTENSIONS.has(extname(f));
	const files = [];
	for (const dir of options.sourceDirs) files.push(...walkFiles(join(root, dir), accept));
	for (const file of options.sourceFiles) {
		const full = join(root, file);
		if (existsSync(full)) files.push(full);
	}
	return files.filter((f) => !exclude.has(f));
}

/** 파일 원문들에서 식별자 집합을 만든다 (순수 함수). */
export function buildTokenIndex(contents) {
	const tokens = new Set();
	for (const content of contents) for (const m of content.matchAll(TOKEN_PATTERN)) tokens.add(m[0]);
	return tokens;
}

/**
 * 문서 한 편에서 소스에 없는 심볼을 찾는다 (순수 함수).
 * @param {string} text
 * @param {Set<string>} tokens
 * @param {Set<string>} allowed
 * @returns {Array<{line: number, symbol: string}>}
 */
export function findUnknownSymbols(text, tokens, allowed) {
	const findings = [];
	text.split("\n").forEach((line, idx) => {
		for (const match of line.matchAll(SYMBOL_PATTERN)) {
			const symbol = match[1];
			if (symbol.length < MIN_SYMBOL_LENGTH) continue;
			if (allowed.has(symbol)) continue;
			if (tokens.has(symbol)) continue;
			if (symbol.includes("_") && tokens.has(toCamelCase(symbol))) continue;
			findings.push({ line: idx + 1, symbol });
		}
	});
	return findings;
}

export function run({ root, options }) {
	if (options.docs.length === 0) {
		console.error("check-doc-symbols: 검사 대상 문서(docs)가 비어 있습니다 — 공회전이라 통과로 치지 않습니다.");
		return 1;
	}
	const haystack = collectHaystack(root, options);
	if (haystack.length === 0) {
		console.error("check-doc-symbols: 증거로 쓸 소스 파일을 하나도 찾지 못했습니다 — sourceDirs · sourceFiles 를 확인하세요.");
		return 1;
	}
	const contents = [];
	for (const file of haystack) {
		try {
			contents.push(readFileSync(file, "utf8"));
		} catch {
			// 읽을 수 없는 파일은 증거에서 빠질 뿐이다 — 증거가 줄면 실패 쪽으로 기운다(fail-closed).
		}
	}
	const tokens = buildTokenIndex(contents);
	const allowed = new Set(options.allow.map((a) => a.symbol));

	const findings = [];
	const missingDocs = [];
	let scannedDocs = 0;
	for (const doc of options.docs) {
		const full = join(root, doc);
		if (!existsSync(full)) {
			missingDocs.push(doc);
			continue;
		}
		scannedDocs++;
		for (const f of findUnknownSymbols(readFileSync(full, "utf8"), tokens, allowed)) findings.push({ doc, ...f });
	}

	if (findings.length === 0 && missingDocs.length === 0) {
		console.log(
			`check-doc-symbols: OK (문서 ${scannedDocs}개 / 소스 ${haystack.length}파일 ${tokens.size}심볼 / 허용 목록 ${allowed.size}건)`,
		);
		return 0;
	}
	if (missingDocs.length > 0) {
		console.error(`check-doc-symbols: 대상 문서 ${missingDocs.length}건이 존재하지 않습니다\n`);
		for (const doc of missingDocs) console.error(`  [missing-target] ${doc}`);
		console.error(`\n문서가 이름이 바뀌었거나 삭제됐습니다. ${CONFIG_FILE} checks.doc-symbols.docs 를 갱신하세요.\n`);
	}
	if (findings.length > 0) {
		console.error(`check-doc-symbols: 소스에 없는 심볼 ${findings.length}건\n`);
		for (const { doc, line, symbol } of findings) console.error(`  [unknown-symbol] ${doc}:${line} — \`${symbol}\``);
		console.error("\n문서가 부르는 이름이 소스에 없습니다. 코드가 이름을 바꿨다면 문서를 맞추고,");
		console.error(`우리가 정의하지 않는 외부 이름이라면 ${CONFIG_FILE} checks.doc-symbols.allow 에 이유와 함께 추가하세요.`);
	}
	return 1;
}
