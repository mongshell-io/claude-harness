/**
 * decision-banners — 결정 기록(Decision 문서)이 「지금 참인 것만 적는다」 는 모양을 지키는지 검사한다.
 *
 * 결정 기록마다 `## 상태 인덱스` 행(칸 수 · 제목 · 상태)과 각 Decision 본문(폐기류는 헤더 직후 상태 배너, active 는
 * 본문 전체의 모양)이 서로 맞는지 대조한다.
 *
 * 왜: 결정 기록은 통독하지 않는 문서라 실제 진입은 전부 검색이고, 검색은 문서 상단의 상태 인덱스를 지나친다. 배너가
 * 없으면 폐기된 Decision 이 현행 서술로 읽혀 과거 결정을 번복하게 된다. 반대로 현행 Decision 위에 「일부 바뀜」 주석을
 * 덧대기 시작하면, 읽는 쪽이 여러 겹을 순서대로 적용해야 유효한 조항을 알 수 있게 된다. 둘 다 lint · typecheck · test ·
 * build 를 전부 통과하고 아무 신호도 내지 않아 다시 쌓인 뒤에야 발견되므로 스크립트로 막는다.
 *
 * **이 검사는 켜야 돈다.** 결정 기록을 이 모양으로 정리한 저장소만 package.json 에 `check:decision-banners` 를
 * `mongshell-check decision-banners` 로 두고 설정 섹션을 적는다. 정리 전의 문서는 위반이 수백 건 나온다.
 *
 * ## 상태 어휘 — 접두 토큰으로 판정한다
 * 인덱스 상태 칸은 `active` / `폐기` / `superseded` 중 하나로 시작하고, 배너 라벨은 `폐기` / `superseded` 로 시작한다.
 * 현행이 아닌 상태의 화살표 · `by` · `—` 같은 뒷부분 표기는 규정하지 않는다 — 형태까지 고정하면 같은 사실을 적은 배너가
 * 표기 차이만으로 걸린다. 대신 어느 토큰으로도 시작하지 않는 상태는 `unknown-status` 로 **막는다**: 열거형을 통과
 * 조건으로 쓰면 모르는 어휘가 조용히 active 로 흘러 이 검사가 막으려는 fail-open 이 그대로 남는다.
 *
 * **`부분` 은 금지 토큰이다.** 일부 조항만 바뀐 Decision 은 배너를 덧대지 않고 그 자리에서 고쳐 써 `active` 로 둔다
 * (고쳐 쓰기 전 원문은 그 결정 기록의 archive 문서로 내린다). `부분` 을 허용하면 원문 위에 배너가 다시 쌓인다. 그래서
 * 두 자리에서 모두 막는다: 인덱스 상태가 `부분` 으로 시작하면 `partial-status`, 본문 배너가 `부분` 으로 시작하면
 * 인덱스가 active 일 때 `stray-banner` · 폐기류일 때 `partial-banner` 다.
 *
 * ## 인덱스 행은 3칸이다
 * 번호 · 결정 한 줄 · 상태. 칸이 더 있거나 모자라면 `index-shape` 이고, 그 행은 어느 칸이 상태인지 믿을 수 없어 거기서
 * 판정을 멈춘다. 칸 안의 `|` 는 `\|` 로 적은 것만 글자로 읽는다.
 *
 * ## active Decision 의 모양은 하나다
 * 덧댄 것은 본문보다 우선하는 두 번째 권위가 되어 `부분` 과 같은 결과를 낸다. 덧대는 자리와 이름은 얼마든지 바꿀 수
 * 있으므로 금지할 모양을 나열하지 않고 **있어야 할 모양**을 검사한다 — 아래에서 벗어난 것은 이름이 무엇이든 걸린다.
 *   annotated-status  인덱스 상태 칸은 **`active` 한 낱말**이다. 세부(`active (amend …)` · `active — …`)가 붙으면 걸린다.
 *   index-title       인덱스 「결정 한 줄」 칸은 **본문 헤더 제목과 같다**. 제목과 다른 요약은 인덱스 칸에 세부를 덧대는
 *                     또 하나의 자리다. 폐기류 행은 비교하지 않는다(본문이 배너만 남은 자리다).
 *   head-overlay      헤더 뒤 **첫 비어 있지 않은 줄은 `- **도입**:`** 이다. 그 사이에 무엇이든(인용 · 목록 항목 · 단락 ·
 *                     내용 없는 `>`) 끼어 있거나 도입 줄이 아예 없으면 걸린다.
 *   stray-block       도입 줄부터 구간 끝까지 **최상위 줄(공백 들여쓰기 2칸 미만)은 전부 `- **라벨**` 로 시작한다**.
 *                     인용 · 맨 단락 · 소제목 · 표 · `*` 글머리 · 굵은 라벨 없는 항목 · 1칸 들여쓴 줄 · 탭으로 들여쓴 줄 ·
 *                     코드 펜스가 걸린다. 조항에 속한 내용은 그 항목 아래 2칸 이상 들여쓴 줄이라 보지 않는다. 구간 맨 끝의
 *                     구분선 `---` 한 줄만 예외다(Decision 사이를 가르는 선이지 내용이 아니다).
 *   history-label     최상위 항목이 **이력 항목**이면 걸린다. 굵은 표시를 걷고 머리의 번호(`Decision 7` · `결정 3` ·
 *                     `#12` · 날짜) · 괄호 · 구분 기호를 벗긴 뒤 `후속` · `정정` · `번복` · `적용 기록` · `개정` · `보강` ·
 *                     `재결정` · `갱신` · `부분 수정` · `amend` 로 **시작**하면 잡는다. 라벨 중간에 그 낱말이 든 것
 *                     (`다시 볼 조건` · `넘어간 것 (후속 …)`)은 지금 참인 조항이라 통과한다. 모양이 맞아도 이름이 이력이면
 *                     덧댄 것이라, 이 항목만은 낱말로 본다 — 목록 밖 이름으로 덧댄 항목은 리뷰 몫이다.
 * Decision 구간은 헤더부터 다음 `## Decision N:` 헤더 전까지다. Decision 이 아닌 `## ` 제목은 구간을 끊지 않는다(끊으면
 * 그 아래에 덧댄 것이 판정에서 빠진다) — active 구간 안에서는 그 줄이 `stray-block` 이다. 최상위 코드 펜스는 여는 줄만
 * `stray-block` 으로 내고 닫는 줄까지는 읽지 않는다(펜스 안 예시 줄을 본문으로 판정하지 않는다). 다만 `## Decision N:`
 * 줄은 펜스 안이어도 헤더로 읽는다 — 닫히지 않은 펜스가 뒤따르는 Decision 을 통째로 삼켜 조용히 통과시키는 쪽보다, 이미
 * 위반인 최상위 펜스 안의 예시를 헤더로 읽는 쪽이 안전하다.
 *
 * ## 폐기류 Decision 은 상태 배너만 본다
 * 헤더 직후(빈 줄만 건너뛴 첫 줄)의 인용 `> **라벨**` 이 배너다. 토큰 밖으로 시작하는 인용은 배너가 아니고
 * (`missing-banner`), 그 아래 본문은 판정하지 않는다.
 *
 * ## 이 검사가 보지 않는 것
 * 인덱스 행과 본문 헤더의 **짝 자체**(한쪽에만 존재 · 중복)는 보지 않는다 — 번호 집합 대조는 다른 검사 몫이라, 짝이 없는
 * 항목은 조용히 건너뛴다(중복 보고 방지). 번호의 `#` 접두는 보존해서 짝을 맞춘다(`## Decision #12` ↔ `| 12 |` 는 짝이
 * 아니다). **`## 상태 인덱스` 섹션 부재는 여기서 막는다**(`missing-index`) — 넘기면 섹션 제목만 바뀌어도 그 문서 검사가
 * 통째로 빠진 채 통과한다.
 *
 * ## 대상
 * 설정 `docs` 의 결정 기록을 적힌 순서로 전부 검사한다. 건너뛰는 문서는 없다 — 목록의 파일이 없으면 `missing-target`,
 * `## 상태 인덱스` 섹션이 없거나 표에 행이 없으면 `missing-index` 다. 파일 이름이나 섹션 제목이 바뀌었을 때 검사 범위가
 * 조용히 줄지 않게. 결정 기록이 하나뿐인 저장소는 `docs` 에 그 하나만 적는다. archive 문서는 대상이 아니다(원문 보관처라
 * 이 모양을 따르지 않는다). 문서마다 OK 한 줄 또는 위반 목록(고칠 자리는 그 문서의 `파일:줄`)을 내고, 한 문서에서 위반이
 * 나와도 나머지를 끝까지 본 뒤 전체 건수로 종료 코드를 정한다.
 *
 * 판정부(`findDecisionBannerViolations` 와 그 아래 파서, 문서 하나의 결과를 묶는 `checkDecisionDoc`, 그것을 출력 줄로
 * 옮기는 `formatDocCheck`)는 순수 함수다. 판정은 문서 줄 배열만 받아 어느 문서인지 모른다.
 *
 * 규약 권위: 각 저장소 결정 기록의 머리말(결정 기록을 쓰는 방식).
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG_FILE } from "../lib/config.mjs";

export const name = "decision-banners";

export const schema = {
	docs: { type: "string[]", default: ["docs/architecture-decisions.md", "docs/harness-decisions.md"] },
};

/**
 * 현행이 아님을 알리는 접두 토큰. `부분` 은 금지 토큰이지만 여기 넣어 둔다 — 인덱스에서는
 * `partial-status` 로, 배너에서는 `stray-banner` · `partial-banner` 로 잡으려면 먼저 알아봐야 한다.
 */
const DEAD = /^(폐기|superseded|부분)/;
/** active 선언의 접두. 뒤에 무엇이 붙었는지는 `BARE_ACTIVE` 와의 비교로 따로 본다. */
const ACTIVE = /^active/;
/** active 상태 칸의 유일하게 허용되는 모양 — 세부가 붙으면 `annotated-status` 다. */
const BARE_ACTIVE = "active";
/** 금지 토큰 — 인덱스 상태에서도 본문 배너에서도 쓰지 않는다. */
const PARTIAL = /^부분/;

/** 인덱스 표를 여는 섹션 제목. */
const INDEX_SECTION = "## 상태 인덱스";
/** 인덱스 행의 칸 수 — 번호 · 결정 한 줄 · 상태. */
const INDEX_CELL_COUNT = 3;
/** 인덱스 행의 번호 칸 — 구분선(`|---|`)과 헤더행(`| # | … |`)은 이 형식이 아니라 행으로 읽히지 않는다. */
const INDEX_NUMBER = /^#?\d+(-\d+)?$/;
/** 칸을 가르는 `|` — `\|` 는 칸 안의 글자다. */
const CELL_SEPARATOR = /(?<!\\)\|/;

/** 본문 Decision 헤더 — 번호는 `#` 접두를 보존해 잡고, 콜론 뒤가 제목이다. */
const DECISION_HEADER = /^## Decision (#?\d+(?:-\d+)?):(.*)$/;
/** 헤더 다음 몇 줄 안에서 배너를 찾는가 — 헤더 · 빈 줄 · 배너가 규약이라 빈 줄이 여럿 끼면 배너 자리가 아니다. */
const BANNER_WINDOW = 3;
/** 굵은 라벨로 시작하는 인용 줄 — 상태 배너가 이 모양이다. */
const QUOTE_LABEL = /^> \*\*(.+?)\*\*/;
/** active Decision 본문의 첫 줄. */
const INTRO_LINE = /^- \*\*도입\*\*:/;
/** 최상위 줄의 유일하게 허용되는 모양 — 줄 머리(들여쓰기 없음)에서 굵은 라벨로 시작하는 목록 항목. */
const TOP_ITEM_LABEL = /^- \*\*(.+?)\*\*/;
/** 이 글자로 시작하는 줄은 어느 항목 아래에 속한 내용이다 — 탭 · 1칸 들여쓰기는 여기 들지 않는다. */
const NESTED_INDENT = "  ";
/** 구간 맨 끝에서만 허용되는 구분선. */
const SECTION_RULE = /^---$/;
/** 코드 펜스를 여닫는 줄. */
const FENCE = /^\s*(```|~~~)/;
/** 최상위(들여쓰기 2칸 미만)에서 여는 코드 펜스. */
const TOP_FENCE = /^ ?(```|~~~)/;

/** 항목 머리에서 벗겨 내는 것 — 번호(`Decision 7` · `결정 3` · `D7` · `#12` · 날짜의 숫자) · 괄호 · 구분 기호. */
const LABEL_PREFIX = /^(?:Decision\s+#?\d+|결정\s*\d+|D\d+|#?\d+|\([^)]*\)|[\s[\]「」(·,:—–/-])+/i;
/** 이력 항목의 접두 낱말 — 지금 참인 규칙이 아니라 바뀐 경위를 적는 항목이다. `amend` 는 `amendment` 도 덮는다. */
const HISTORY_LABEL = /^(?:후속|정정|번복|적용 기록|개정|보강|재결정|갱신|부분 (?:수정|갱신)|amend)/i;

/** 줄 머리의 모양에 붙이는 이름 — 메시지에서 끼어든 줄이 무엇인지 알린다. 위에서부터 처음 맞는 것. */
const LINE_SHAPES = [
	{ pattern: /^\t/, name: "탭으로 들여쓴 줄" },
	{ pattern: /^ /, name: "1칸만 들여쓴 줄" },
	{ pattern: /^>/, name: "인용" },
	{ pattern: /^#{1,6}(\s|$)/, name: "소제목" },
	{ pattern: /^\|/, name: "표" },
	{ pattern: /^(```|~~~)/, name: "코드 펜스" },
	{ pattern: /^(-{3,}|\*{3,}|_{3,})\s*$/, name: "구분선" },
	{ pattern: /^([-*+]|\d+[.)])\s/, name: "목록 항목" },
];
const DEFAULT_LINE_SHAPE = "단락";

/** 메시지에 싣는 인용의 최대 글자 수 — 인덱스 상태 칸은 수백 자까지 간다. */
const QUOTE_MAX = 40;
/** 배너 · 끼어든 줄 · 본문 항목의 라벨, 그리고 배너가 주어인 문장에 곁들이는 상태 인용은 더 짧게 끊는다. */
const SHORT_QUOTE_MAX = 30;

/** 고쳐 쓰기 전 원문을 내리는 곳 — 판정부는 어느 문서의 줄인지 모르므로 파일 이름을 적지 않는다. */
const ARCHIVE = "그 결정 기록의 archive";

/** 덧댄 것을 걷어 내는 법 — active 모양 위반 문구가 함께 쓴다. */
const REWRITE_HINT = `바뀐 내용은 해당 조항을 지금 참인 것만 남게 고쳐 쓰고 이 줄은 지웁니다 — 고쳐 쓰기 전 본문은 ${ARCHIVE} 로 내립니다.`;

/** 문서 전체에 걸린 위반이 가리키는 줄 — 고칠 자리가 한 줄로 정해지지 않는다. */
const DOC_LEVEL_LINE = 1;

/**
 * @typedef {"missing-index" | "index-shape" | "unknown-status" | "partial-status" | "annotated-status" | "index-title" | "stray-banner" | "head-overlay" | "stray-block" | "history-label" | "missing-banner" | "partial-banner"} ViolationKind
 * @typedef {{ kind: ViolationKind, msg: string, lines: number[] }} Violation 위반 하나 — `lines` 는 고칠 자리(1부터 센 줄 번호).
 * @typedef {{ title: string, status: string, cellCount: number, line: number }} IndexRow 인덱스 행의 둘째 · 셋째 칸(없으면 빈 문자열)과 칸 수, 줄 번호.
 * @typedef {{ label: string, line: number }} StatusBanner 헤더 직후 인용 줄의 굵은 라벨과 그 줄 번호.
 * @typedef {{ text: string, line: number }} SectionLine Decision 구간의 비어 있지 않은 줄.
 * @typedef {{ line: number, title: string, banner: StatusBanner | null, hasIntro: boolean, head: SectionLine[], body: SectionLine[] }} DecisionSection
 *   헤더 줄 번호 · 제목 · 상태 배너와 구간의 줄. `head` 는 헤더와 첫 `- **도입**:` 줄 사이, `body` 는 도입 줄부터 구간 끝까지다.
 *   도입 줄이 없으면(`hasIntro` false) `head` 는 비고 전부 `body` 다.
 * @typedef {{ decisionCount: number, inactiveCount: number, violations: Violation[] }} DocCheck
 *   문서 하나의 결과 — 인덱스 행 수, 그 가운데 상태가 폐기류 토큰(`DEAD`)으로 시작하는 행 수, 위반.
 */

// ── `## 상태 인덱스` 표 파싱 ────────────────────────────────────────────────

/**
 * 표의 한 줄을 칸으로 나눈다. 줄 양끝의 `|` 는 칸을 만들지 않는다.
 * @param {string} line
 * @returns {string[]} 칸의 내용(앞뒤 공백 제외, `\|` 는 `|` 로 되돌림).
 */
function splitTableRow(line) {
	const inner = line
		.trim()
		.replace(/^\|/, "")
		.replace(/(?<!\\)\|$/, "");
	return inner.split(CELL_SEPARATOR).map((cell) => cell.trim().replaceAll("\\|", "|"));
}

/**
 * `## 상태 인덱스` 표를 읽는다 (순수 함수).
 * @param {string[]} lines 문서를 줄 단위로 나눈 배열.
 * @returns {Map<string, IndexRow> | null} 번호(`#` 접두 보존) → 인덱스 행. 섹션이 없으면 null.
 */
export function parseStatusIndex(lines) {
	const start = lines.findIndex((l) => l.startsWith(INDEX_SECTION));
	if (start === -1) return null;
	const nextSection = lines.findIndex((l, i) => i > start && l.startsWith("## "));
	const end = nextSection === -1 ? lines.length : nextSection;

	/** @type {Map<string, IndexRow>} */
	const index = new Map();
	for (let i = start; i < end; i++) {
		if (!lines[i].includes("|")) continue;
		const cells = splitTableRow(lines[i]);
		if (!INDEX_NUMBER.test(cells[0])) continue;
		index.set(cells[0], { title: cells[1] ?? "", status: cells[2] ?? "", cellCount: cells.length, line: i + 1 });
	}
	return index;
}

// ── 본문 Decision 구간 파싱 ─────────────────────────────────────────────────

/**
 * 헤더 직후의 상태 배너. 빈 줄을 건너뛰고 처음 만나는 인용 블록만 배너 후보로 본다. 그 앞에
 * `- **도입**:` 같은 본문이 오면 배너가 없는 것으로 친다 — 배너는 헤더 직후가 규약이다.
 * @param {string[]} lines
 * @param {number} headerAt 헤더 줄의 배열 위치(0부터).
 * @returns {StatusBanner | null}
 */
function readStatusBanner(lines, headerAt) {
	for (let j = headerAt + 1; j <= Math.min(headerAt + BANNER_WINDOW, lines.length - 1); j++) {
		if (lines[j].trim() === "") continue;
		const label = QUOTE_LABEL.exec(lines[j])?.[1];
		return label === undefined ? null : { label, line: j + 1 };
	}
	return null;
}

/**
 * 구간의 비어 있지 않은 줄. 최상위 코드 펜스는 여는 줄만 싣고 닫는 줄까지 건너뛴다 — 펜스 안은 본문이 아니다.
 * 들여쓴 펜스는 따로 다루지 않는다: 그 안의 줄도 들여쓰여 있어 어차피 최상위 줄로 읽히지 않는다.
 * @param {string[]} lines
 * @param {number} from 구간 첫 줄의 배열 위치(0부터, 헤더 다음 줄).
 * @param {number} to 구간 끝(이 위치는 포함하지 않는다).
 * @returns {SectionLine[]}
 */
function readSectionLines(lines, from, to) {
	/** @type {SectionLine[]} */
	const content = [];
	let insideTopFence = false;
	for (let j = from; j < to; j++) {
		const text = lines[j];
		if (insideTopFence) {
			if (FENCE.test(text)) insideTopFence = false;
			continue;
		}
		if (text.trim() === "") continue;
		content.push({ text, line: j + 1 });
		insideTopFence = TOP_FENCE.test(text);
	}
	return content;
}

/**
 * 본문의 Decision 구간을 읽는다 (순수 함수). 구간은 헤더 다음 줄부터 다음 `## Decision N:` 헤더 전까지다 —
 * Decision 이 아닌 `## ` 제목은 구간을 끊지 않는다.
 * @param {string[]} lines 문서를 줄 단위로 나눈 배열.
 * @returns {Map<string, DecisionSection>} 번호(`#` 접두 보존) → 구간.
 */
export function parseDecisionSections(lines) {
	const headerAts = lines.flatMap((line, at) => (DECISION_HEADER.test(line) ? [at] : []));

	/** @type {Map<string, DecisionSection>} */
	const sections = new Map();
	headerAts.forEach((headerAt, nth) => {
		const [, num, title] = DECISION_HEADER.exec(lines[headerAt]);
		const content = readSectionLines(lines, headerAt + 1, headerAts[nth + 1] ?? lines.length);
		const introAt = content.findIndex((l) => INTRO_LINE.test(l.text));
		const hasIntro = introAt !== -1;
		sections.set(num, {
			line: headerAt + 1,
			title: title.trim(),
			banner: readStatusBanner(lines, headerAt),
			hasIntro,
			head: hasIntro ? content.slice(0, introAt) : [],
			body: hasIntro ? content.slice(introAt) : content,
		});
	});
	return sections;
}

// ── 대조 ───────────────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @returns {string} 줄 머리 모양의 이름(인용 · 소제목 · 단락 …).
 */
function shapeOf(text) {
	return LINE_SHAPES.find(({ pattern }) => pattern.test(text))?.name ?? DEFAULT_LINE_SHAPE;
}

/**
 * 메시지에 싣는 줄 묶음의 요약 — 첫 줄의 모양과 앞머리, 나머지는 줄 수만.
 * @param {SectionLine[]} sectionLines 하나 이상.
 * @returns {string} 예: `인용 "> **amendment (상태는 active)" 외 2줄`
 */
function summarizeLines(sectionLines) {
	const [first, ...rest] = sectionLines;
	const more = rest.length > 0 ? ` 외 ${rest.length}줄` : "";
	return `${shapeOf(first.text)} "${first.text.trim().slice(0, SHORT_QUOTE_MAX)}"${more}`;
}

/**
 * 최상위 항목이 이력 항목인가 — 굵은 표시를 걷고 머리의 번호 · 괄호 · 구분 기호를 벗긴 뒤의 첫 낱말로 본다.
 * 굵은 표시를 걷고 보는 까닭: `- **Decision 7** 부분 수정:` 처럼 번호만 굵게 써도 같은 항목이다.
 * @param {string} text `- **라벨**` 로 시작하는 줄.
 * @returns {boolean}
 */
function isHistoryItem(text) {
	const plain = text.slice(1).replaceAll("*", "");
	return HISTORY_LABEL.test(plain.replace(LABEL_PREFIX, ""));
}

/**
 * 두 제목이 갈라지는 자리부터의 조각 — 긴 제목은 앞머리가 같아 앞에서 끊으면 차이가 보이지 않는다.
 * @param {string} indexTitle
 * @param {string} headerTitle
 * @returns {{ at: number, inIndex: string, inHeader: string }} `at` 은 처음 달라지는 글자의 순번(1부터).
 */
function firstDifference(indexTitle, headerTitle) {
	let same = 0;
	while (same < indexTitle.length && indexTitle[same] === headerTitle[same]) same++;
	return {
		at: same + 1,
		inIndex: indexTitle.slice(same, same + QUOTE_MAX),
		inHeader: headerTitle.slice(same, same + QUOTE_MAX),
	};
}

/**
 * active 행 — 상태 칸은 `active` 한 낱말이고, 「결정 한 줄」 칸은 본문 헤더 제목과 같다.
 * @param {string} num
 * @param {IndexRow} row
 * @param {DecisionSection | undefined} section 짝이 없으면 제목은 대조하지 않는다.
 * @returns {Violation[]}
 */
function judgeActiveRow(num, row, section) {
	/** @type {Violation[]} */
	const found = [];

	if (row.status !== BARE_ACTIVE) {
		found.push({
			kind: "annotated-status",
			msg: `Decision ${num} 의 인덱스 상태 "${row.status.slice(0, QUOTE_MAX)}" 가 \`active\` 한 낱말이 아닙니다 — 인덱스 행에는 번호 · 제목 · 상태만 적습니다. 세부는 본문을 지금 참인 것만 남게 고쳐 써서 담고 상태 칸은 \`active\` 로 둡니다 — 원문은 ${ARCHIVE} 로 내립니다.`,
			lines: [row.line],
		});
	}

	if (section !== undefined && row.title !== section.title) {
		const { at, inIndex, inHeader } = firstDifference(row.title, section.title);
		found.push({
			kind: "index-title",
			msg: `Decision ${num} 의 인덱스 「결정 한 줄」 이 본문 헤더 제목과 다릅니다(${at}번째 글자부터 — 인덱스 "${inIndex}", 헤더 "${inHeader}") — active 행에는 헤더 제목을 그대로 적습니다. 인덱스 칸에 요약 · 세부를 따로 적은 것이면 본문 해당 조항을 고쳐 써서 담고, 두 제목을 지금 참인 쪽으로 같게 맞춥니다.`,
			lines: [row.line, section.line],
		});
	}

	return found;
}

/**
 * active 구간의 머리 — 헤더 뒤 첫 비어 있지 않은 줄이 `- **도입**:` 이다.
 * @param {string} num
 * @param {DecisionSection} section
 * @param {StatusBanner | null} strayBanner `stray-banner` 로 이미 낸 배너 — 같은 줄 · 같은 문제를 다시 내지 않는다.
 * @returns {Violation[]}
 */
function judgeActiveHead(num, section, strayBanner) {
	if (!section.hasIntro) {
		// 배너만 남은 본문이면 인덱스와 본문 중 어느 쪽이 맞는지가 먼저다 — stray-banner 가 그것을 묻는다.
		if (strayBanner !== null) return [];
		const first = section.body.at(0);
		const instead = first === undefined ? "" : `(헤더 다음 줄은 ${summarizeLines([first])})`;
		return [
			{
				kind: "head-overlay",
				msg: `Decision ${num} 은 인덱스 상태가 active 인데 \`- **도입**:\` 줄이 없습니다${instead} — active Decision 은 헤더 뒤 첫 줄이 곧바로 \`- **도입**:\` 입니다. 헤더 바로 아래에 도입 줄을 둡니다.`,
				lines: [section.line],
			},
		];
	}

	const overlays = section.head.filter((l) => l.line !== strayBanner?.line);
	if (overlays.length === 0) return [];
	return [
		{
			kind: "head-overlay",
			msg: `Decision ${num} 은 인덱스 상태가 active 인데 헤더와 \`- **도입**:\` 줄 사이에 끼어 있는 줄이 있습니다(${summarizeLines(overlays)}) — active Decision 은 헤더 뒤 첫 줄이 곧바로 \`- **도입**:\` 입니다. ${REWRITE_HINT} 인덱스는 \`active\` 로 둡니다.`,
			lines: overlays.map((l) => l.line),
		},
	];
}

/**
 * active 구간의 본문 — 최상위 줄은 전부 `- **라벨**` 항목이고, 그 가운데 이력 항목이 없다.
 * @param {string} num
 * @param {DecisionSection} section
 * @param {StatusBanner | null} strayBanner `stray-banner` 로 이미 낸 배너 줄은 뺀다.
 * @returns {Violation[]}
 */
function judgeActiveBody(num, section, strayBanner) {
	/** @type {Violation[]} */
	const found = [];
	const closingRule = SECTION_RULE.test(section.body.at(-1)?.text ?? "") ? section.body.at(-1) : undefined;
	const topLines = section.body.filter(
		(l) => !l.text.startsWith(NESTED_INDENT) && l !== closingRule && l.line !== strayBanner?.line,
	);

	const strayBlocks = topLines.filter((l) => !TOP_ITEM_LABEL.test(l.text));
	if (strayBlocks.length > 0) {
		found.push({
			kind: "stray-block",
			msg: `Decision ${num} 은 인덱스 상태가 active 인데 본문 최상위에 \`- **라벨**\` 항목이 아닌 줄이 있습니다(${summarizeLines(strayBlocks)}) — active Decision 의 최상위 줄(공백 들여쓰기 2칸 미만)은 전부 \`- **라벨**\` 로 시작합니다. 어느 조항에 속한 내용이면 그 항목 아래로 공백 2칸 이상 들여씁니다. 덧댄 것이면 ${REWRITE_HINT}`,
			lines: strayBlocks.map((l) => l.line),
		});
	}

	const historyItems = topLines.filter((l) => TOP_ITEM_LABEL.test(l.text) && isHistoryItem(l.text));
	if (historyItems.length > 0) {
		const [first, ...rest] = historyItems;
		const label = TOP_ITEM_LABEL.exec(first.text)?.[1] ?? "";
		const more = rest.length > 0 ? ` 외 ${rest.length}개` : "";
		found.push({
			kind: "history-label",
			msg: `Decision ${num} 은 인덱스 상태가 active 인데 본문에 이력 항목을 덧붙였습니다("${label.slice(0, SHORT_QUOTE_MAX)}"${more}) — 덧붙인 항목은 앞 조항을 이기는 두 번째 권위가 됩니다. 현행 규칙은 해당 조항에 녹이고 이 항목은 없앱니다 — 고쳐 쓰기 전 본문은 ${ARCHIVE} 로 내립니다.`,
			lines: historyItems.map((l) => l.line),
		});
	}

	return found;
}

/**
 * 인덱스가 active 인 Decision — 인덱스 행(상태 한 낱말 · 제목 일치)과 본문의 모양(머리 · 최상위 줄)을 본다.
 * @param {string} num
 * @param {IndexRow} row
 * @param {DecisionSection | undefined} section
 * @returns {Violation[]}
 */
function judgeActive(num, row, section) {
	// 인덱스 행만의 문제는 본문 짝이 없어도 낸다.
	const found = judgeActiveRow(num, row, section);

	// 짝이 없으면 본문 판정은 건너뛴다 — 인덱스 ↔ 헤더 집합 대조는 이 검사의 몫이 아니다.
	if (!section) return found;

	// active 에 폐기류 · `부분` 배너가 붙었으면 권위(인덱스)와 미러(배너)가 역전된 상태다. 그 줄은 아래 모양
	// 판정에서 뺀다: 같은 줄을 두 종류로 내면 고칠 방법이 둘로 갈린다(상태를 맞출지 · 본문에 녹일지).
	const strayBanner = section.banner !== null && DEAD.test(section.banner.label) ? section.banner : null;
	if (strayBanner !== null) {
		found.push({
			kind: "stray-banner",
			msg: `Decision ${num} 은 본문에 "${strayBanner.label.slice(0, SHORT_QUOTE_MAX)}" 배너가 있으나 인덱스 상태는 "${row.status.slice(0, QUOTE_MAX)}" 입니다 — 상태의 권위는 인덱스이므로 둘 중 하나가 갱신되지 않았습니다.`,
			lines: [section.line, row.line],
		});
	}

	return [...found, ...judgeActiveHead(num, section, strayBanner), ...judgeActiveBody(num, section, strayBanner)];
}

/**
 * 인덱스가 폐기 · superseded 인 Decision — 헤더 직후에 같은 계열의 상태 배너가 있어야 한다.
 * @param {string} num
 * @param {IndexRow} row
 * @param {DecisionSection | undefined} section
 * @returns {Violation[]}
 */
function judgeInactive(num, row, section) {
	// 짝이 없으면 건너뛴다 — 인덱스 ↔ 헤더 집합 대조는 이 검사의 몫이 아니다.
	if (!section) return [];

	const label = section.banner?.label ?? "";
	if (!DEAD.test(label)) {
		return [
			{
				kind: "missing-banner",
				msg: `Decision ${num} 은 인덱스 상태가 "${row.status.slice(0, QUOTE_MAX)}" 인데 본문 헤더 직후 상태 배너(\`> **폐기 …**\` · \`> **superseded …**\`)가 없습니다 — 검색으로 들어오면 현행 서술로 읽힙니다.`,
				lines: [section.line, row.line],
			},
		];
	}
	if (PARTIAL.test(label)) {
		return [
			{
				kind: "partial-banner",
				msg: `Decision ${num} 의 배너가 "부분" 으로 시작합니다 — \`부분\` 은 쓰지 않습니다. 인덱스 상태 "${row.status.slice(0, SHORT_QUOTE_MAX)}" 에 맞는 \`폐기\` / \`superseded\` 배너로 바꿉니다.`,
				lines: [section.line, row.line],
			},
		];
	}
	return [];
}

/**
 * 인덱스 행 하나를 판정한다. 행의 칸 수가 어긋나거나 상태 어휘를 읽을 수 없으면 거기서 멈춘다 — 본문과 무엇을 대조할지 정할 수 없다.
 * @param {string} num
 * @param {IndexRow} row
 * @param {DecisionSection | undefined} section 같은 번호의 본문 구간 — 짝이 없으면 undefined.
 * @returns {Violation[]}
 */
function judgeDecision(num, row, section) {
	if (row.cellCount !== INDEX_CELL_COUNT) {
		return [
			{
				kind: "index-shape",
				msg: `Decision ${num} 의 인덱스 행이 ${row.cellCount}칸입니다 — 인덱스 행은 번호 · 결정 한 줄 · 상태 ${INDEX_CELL_COUNT}칸입니다. 덧붙인 칸의 내용은 본문 해당 조항을 지금 참인 것만 남게 고쳐 써서 담고 칸은 지웁니다 — 원문은 ${ARCHIVE} 로 내립니다. 칸 안에 \`|\` 를 적어야 하면 \`\\|\` 로 적습니다.`,
				lines: [row.line],
			},
		];
	}

	const inactive = DEAD.test(row.status);

	// 어휘 자체가 폐기류 토큰에도 active 에도 안 걸리면 상태를 판정할 수 없다 — 통과시키지 않는다.
	if (!inactive && !ACTIVE.test(row.status)) {
		return [
			{
				kind: "unknown-status",
				msg: `Decision ${num} 의 인덱스 상태 "${row.status.slice(0, QUOTE_MAX)}" 를 판정할 수 없습니다 — \`active\` / \`폐기\` / \`superseded\` 중 하나로 시작해야 합니다(굵게 표시 · 다른 낱말 없이).`,
				lines: [row.line],
			},
		];
	}

	// `부분` 은 쓰지 않는다 — 고쳐 써서 active 로 두거나, 남은 조항이 없으면 폐기로 둔다.
	if (PARTIAL.test(row.status)) {
		return [
			{
				kind: "partial-status",
				msg: `Decision ${num} 의 인덱스 상태가 "부분" 으로 시작합니다 — 일부만 바뀐 Decision 은 지금 참인 것만 남기게 고쳐 쓰고 \`active\` 로 둡니다(남은 조항이 없으면 \`폐기\`) — 원문은 ${ARCHIVE} 로 내립니다.`,
				lines: [row.line],
			},
		];
	}

	return inactive ? judgeInactive(num, row, section) : judgeActive(num, row, section);
}

/**
 * 인덱스 행과 본문 구간을 대조해 위반을 찾는다 (순수 함수).
 *
 * `## 상태 인덱스` 섹션이 없거나 그 표에 행이 없으면 `missing-index` 하나다 — 대조할 인덱스가 없어 Decision 을
 * 하나도 검사할 수 없다.
 * @param {string[]} lines 문서를 줄 단위로 나눈 배열.
 * @returns {Violation[]} 인덱스 행 순서. 한 Decision 이 여러 종류에 걸리면 종류마다 하나씩 낸다.
 */
export function findDecisionBannerViolations(lines) {
	const index = parseStatusIndex(lines);
	if (index === null || index.size === 0) {
		return [
			{
				kind: "missing-index",
				msg: `\`${INDEX_SECTION}\` 섹션이 없거나 그 표에 행이 없습니다 — 이 문서의 Decision 을 하나도 검사할 수 없습니다. 결정 기록은 머리말 아래에 \`${INDEX_SECTION}\` 표를 둡니다. 섹션 제목이나 표 자리를 바꿨으면 되돌립니다.`,
				lines: [DOC_LEVEL_LINE],
			},
		];
	}
	const sections = parseDecisionSections(lines);
	return [...index].flatMap(([num, row]) => judgeDecision(num, row, sections.get(num)));
}

// ── 문서 하나의 결과 ────────────────────────────────────────────────────────

/**
 * 문서 하나를 검사한 결과를 묶는다 (순수 함수).
 * @param {string[]} lines 문서를 줄 단위로 나눈 배열.
 * @returns {DocCheck} `## 상태 인덱스` 섹션이 없거나 표에 행이 없으면 행 수는 0 이고 위반은 `missing-index` 하나다.
 */
export function checkDecisionDoc(lines) {
	const rows = [...(parseStatusIndex(lines)?.values() ?? [])];
	return {
		decisionCount: rows.length,
		inactiveCount: rows.filter((row) => DEAD.test(row.status)).length,
		violations: findDecisionBannerViolations(lines),
	};
}

/**
 * 문서 하나의 결과를 출력 줄로 옮긴다 (순수 함수) — 위반이 없으면 OK 한 줄, 있으면 종류순으로 문구와 그 아래
 * 고칠 자리(`파일:줄`).
 * @param {string} doc 저장소 루트 기준 문서 경로 — 고칠 자리가 이 문서를 가리킨다.
 * @param {DocCheck} check
 * @returns {string[]}
 */
export function formatDocCheck(doc, { decisionCount, inactiveCount, violations }) {
	if (violations.length === 0) {
		return [
			`check-decision-banners: OK (${doc}: Decision ${decisionCount}개 — active ${decisionCount - inactiveCount}개 한 모양 / 비-active ${inactiveCount}개 전부 배너 보유)`,
		];
	}
	return violations
		.toSorted((a, b) => a.kind.localeCompare(b.kind))
		.flatMap((v) => [`[${v.kind}] ${v.msg}`, ...v.lines.map((n) => `    ${doc}:${n}`)]);
}

// ── 실행 ───────────────────────────────────────────────────────────────────

export function run({ root, options }) {
	if (options.docs.length === 0) {
		console.error("check-decision-banners: 검사 대상 문서(docs)가 비어 있습니다 — 공회전이라 통과로 치지 않습니다.");
		return 1;
	}

	const missingDocs = [];
	let violationCount = 0;
	for (const doc of options.docs) {
		const full = join(root, doc);
		if (!existsSync(full)) {
			missingDocs.push(doc);
			continue;
		}
		const check = checkDecisionDoc(readFileSync(full, "utf8").split(/\r?\n/));
		const print = check.violations.length === 0 ? console.log : console.error;
		for (const line of formatDocCheck(doc, check)) print(line);
		violationCount += check.violations.length;
	}

	if (missingDocs.length > 0) {
		console.error(`check-decision-banners: 대상 문서 ${missingDocs.length}건이 존재하지 않습니다`);
		for (const doc of missingDocs) console.error(`  [missing-target] ${doc}`);
		console.error(`  → 문서가 이름이 바뀌었거나 삭제됐습니다. ${CONFIG_FILE} checks.decision-banners.docs 를 이 저장소의 결정 기록에 맞추세요.`);
	}
	if (violationCount > 0) console.error(`check-decision-banners: ${violationCount}건 불일치 발견`);
	return missingDocs.length > 0 || violationCount > 0 ? 1 : 0;
}
