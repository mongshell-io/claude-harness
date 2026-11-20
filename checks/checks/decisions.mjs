/**
 * decisions — 결정 기록(Decision 하나가 파일 하나)이 「지금 참인 것만 적는다」 는 모양을 지키는지 검사한다.
 *
 * ## 배치
 *   docs/architecture-decisions/     결정 기록 폴더 — 설정 `dirs` 의 한 항목
 *     README.md                      그 저장소의 결정 기록 쓰는 법. Decision 이 아니다
 *     6-1.md                         지금 유효한 Decision (active) — 파일 이름은 식별자에서 `#` 를 뗀 것
 *     archive/3.md                   전부 현행이 아니게 된(폐기 · 대체) Decision. 규칙이 아니다
 * 폴더 바로 아래의 `.md`(README.md 제외)가 지금 유효한 결정의 전부다. 상태 인덱스 표는 없다 — 폴더 목록이 인덱스다.
 *
 * 왜: 결정 기록은 통독하지 않는 문서라 실제 진입은 전부 검색이다. 현행 Decision 위에 배너 · 「일부 바뀜」 주석 · 이력
 * 항목을 덧대면, 덧댄 것이 본문보다 우선하는 두 번째 권위가 되어 읽는 쪽이 여러 겹을 순서대로 적용해야 유효한 조항을
 * 알 수 있다. 식별자와 파일 이름이 어긋나거나 같은 번호가 유효한 쪽과 archive 양쪽에 있으면 `Decision #N` 인용이 어느
 * 것을 가리키는지 정해지지 않는다. 어느 것도 lint · typecheck · test · build 에는 신호를 내지 않아 쌓인 뒤에야 발견되므로
 * 스크립트로 막는다.
 *
 * **이 검사는 켜야 돈다.** 결정 기록을 이 배치로 옮긴 저장소만 package.json 에 `check:decisions` 를
 * `mongshell-check decisions` 로 두고 설정 섹션을 적는다.
 *
 * ## Decision 파일의 모양
 * 첫 줄은 `# Decision <식별자>: <제목>` 이고 식별자는 `#?숫자(-숫자)?` 다. 도입 줄(`**도입**: …`, 앞에 `- ` 가 있어도
 * 된다)은 선택이다 — 둔다면 헤더 다음 비어 있지 않은 첫 줄이다(식별자가 이슈 번호인 Decision 은 식별자가 곧 도입 이슈다).
 * 헤더(도입 줄이 있으면 도입 줄) 다음 비어 있지 않은 첫 줄이 본문 블록의 시작이고, 그 줄이 꼴을 정한다.
 *   소제목 꼴   `## 소제목` 으로 시작한다. 최상위 구획은 `## ` 소제목이고 그 아래 내용은 자유다.
 *   목록 꼴     `- **라벨**` 항목으로 시작한다. 최상위 줄(공백 들여쓰기 2칸 미만)은 전부 `- **라벨**` 로 시작하고, 조항에
 *               속한 내용은 그 항목 아래 2칸 이상 들여쓴다.
 * 덧대는 자리와 이름은 얼마든지 바꿀 수 있으므로 금지할 모양을 나열하지 않고 **있어야 할 모양**을 검사한다.
 *
 * ## 위반의 종류
 * 폴더:
 *   missing-target   `dirs` 의 폴더가 없다. 폴더 이름이 바뀌었을 때 검사 범위가 조용히 줄지 않게 막는다.
 *   empty-target     폴더에 Decision 파일이 하나도 없다(active · archive 합쳐 0) — 공회전이라 통과로 치지 않는다.
 *   duplicate-id     같은 이름의 파일이 폴더 바로 아래와 `archive/` 양쪽에 있다 — 그 번호가 유효한지 아닌지가 둘로 갈린다.
 * 파일 머리 (active · archive):
 *   bad-head         첫 줄이 `# Decision <식별자>: <제목>` 이 아니다. 그 파일의 판정은 여기서 멈춘다.
 *   id-mismatch      첫 줄 식별자에서 `#` 를 뗀 것이 파일 이름(확장자 뺀 것)과 다르다.
 * 본문 (active 만 — archive 는 원문 보관처라 본문의 모양을 따르지 않는다):
 *   head-overlay     헤더(도입 줄이 있으면 도입 줄) 다음 비어 있지 않은 첫 줄이 `## ` 소제목도 `- **라벨**` 항목도 아니다.
 *                    배너 · 인용 · 단락을 그 자리에 끼운 것이고, 그 뒤에 아무 내용이 없어도 이것이다. 도입 줄 아래에
 *                    들여쓴 줄도 그 자리에 끼운 줄이다. 끼어든 줄 뒤에서 블록 시작 줄을 찾으면 그 줄로 꼴을 정해 나머지
 *                    판정을 잇고, 찾지 못하면 여기서 멈춘다.
 *   stray-block      (목록 꼴) 최상위 줄이 `- **라벨**` 로 시작하지 않는다. 인용 · 맨 단락 · 소제목 · 표 · `*` 글머리 ·
 *                    굵은 라벨 없는 항목 · 1칸 들여쓴 줄 · 탭으로 들여쓴 줄 · 구분선 · 코드 펜스가 걸린다. 최상위 코드
 *                    펜스는 여는 줄만 내고 닫는 줄까지는 읽지 않는다(펜스 안 예시 줄을 본문으로 판정하지 않는다). 들여쓴
 *                    펜스는 따로 다루지 않는다 — 그 안의 줄도 들여쓰여 있어 최상위 줄로 읽히지 않는다. `- ` 없이 적은
 *                    도입 줄은 헤더 다음 첫 줄 자리에 있을 때만 예외다. `head-overlay` 로 이미 낸 줄은 다시 내지 않는다
 *                    (같은 줄을 두 종류로 내면 고칠 방법이 둘로 갈린다).
 *   extra-title      (소제목 꼴) 코드 펜스 밖에 `# ` 제목이 첫 줄 말고 또 있다 — 한 파일에 Decision 이 둘이거나 구획을
 *                    제목 급으로 적은 것이다.
 *   history-label    최상위 `- **라벨**` 항목(목록 꼴) 또는 코드 펜스 밖 `## ` 소제목(소제목 꼴)이 **이력 이름**이다.
 *                    굵은 표시를 걷고 머리의 번호(`Decision 7` · `결정 3` · `#12` · 날짜) · 괄호 · 구분 기호를 벗긴 뒤
 *                    `후속` · `정정` · `번복` · `적용 기록` · `개정` · `보강` · `재결정` · `갱신` · `부분 수정` ·
 *                    `부분 갱신` · `amend` 로 **시작**하면 잡는다. 이름 중간에 그 낱말이 든 것(`다시 볼 조건` ·
 *                    `넘어간 것 (후속 …)`)은 지금 참인 조항이라 통과한다. 모양이 맞아도 이름이 이력이면 덧댄 것이라
 *                    이것만은 낱말로 본다 — 목록 밖 이름으로 덧댄 것, 소제목 꼴의 `### ` 이하 소제목은 리뷰 몫이다.
 * 설정:
 *   stale-pending    `pending` 의 경로가 없는 파일이거나, 검사 대상 Decision 파일이 아니거나, 그 파일에 위반이 없다.
 *
 * 소제목 꼴의 코드 펜스는 들여쓰기와 무관하게 읽는다(구획 아래 내용이 자유라 목록 안의 펜스도 있다) — 여는 표식과 같은
 * 글자로 그 길이 이상인 줄에서 닫히고, 닫히지 않은 펜스는 파일 끝까지다.
 *
 * ## `pending` — 아직 정리하지 못한 파일
 * 한 파일로 쓰던 결정 기록을 옮긴 직후에는 덧댄 것이 남은 파일이 있다. 그 파일의 저장소 기준 경로를 `pending` 에 적으면
 * 그 파일의 위반(파일 머리 · 본문)은 출력하지도 실패로 치지도 않는다. 폴더 단위 위반(`duplicate-id` 포함)은 가리지 않는다.
 * 목록은 줄기만 한다 — 위반이 없어진 파일이나 없는 파일이 남아 있으면 `stale-pending` 으로 실패하므로, 정리한 파일은 그
 * PR 에서 목록에서 빠진다.
 *
 * ## 대상
 * 설정 `dirs` 의 폴더를 적힌 순서로 전부 검사한다. 폴더 바로 아래의 `.md` 가 active, `archive/` 바로 아래의 `.md` 가
 * archive 다. `README.md` 는 건너뛰고, `.md` 가 아닌 파일 · `archive` 밖의 하위 폴더 · `archive` 안의 하위 폴더 · 심볼릭
 * 링크는 보지 않는다. 폴더 바로 아래에 둔 `.md` 는 이름이 무엇이든 Decision 으로 읽는다(Decision 이 아닌 문서를 두면
 * `bad-head` 다). 결정 기록 폴더가 하나뿐인 저장소는 `dirs` 에 그 하나만 적는다.
 *
 * ## 출력
 * 위반마다 `[kind] 설명` 한 줄과 그 아래 고칠 자리(`경로:줄`, 폴더 · 설정에 걸린 것은 줄 없이 경로만). 위반이 없는 폴더는
 * `check-decisions: <폴더> OK — active N개 · archive M개` 한 줄이고, 그 폴더에 보류 중인 파일이 있으면 ` · 보류 K개` 가
 * 붙는다. 한 폴더에서 위반이 나와도 나머지를 끝까지 본 뒤 전체 건수로 종료 코드를 정한다.
 *
 * 판정부(`findDecisionViolations` — 파일 하나의 줄 배열과 파일 이름만 받는다)와 출력 줄을 만드는 `formatFindings` 는 순수
 * 함수다. 폴더를 읽고 `pending` 을 대조하는 것은 `run` 이다.
 *
 * 규약 권위: 각 저장소 결정 기록 폴더의 `README.md`(결정 기록을 쓰는 방식).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { CONFIG_FILE } from "../lib/config.mjs";

export const name = "decisions";

export const schema = {
	dirs: { type: "string[]", default: ["docs/architecture-decisions", "docs/harness-decisions"] },
	pending: { type: "string[]", default: [] },
};

/** 전부 현행이 아니게 된 Decision 을 두는 하위 폴더. */
const ARCHIVE_DIR = "archive";
/** 폴더의 안내 문서 — Decision 이 아니다. */
const README_FILE = "readme.md";
const DECISION_EXT = ".md";

/** 파일 첫 줄 — 식별자는 `#` 접두를 보존해 잡고, 콜론 뒤에 제목이 있어야 한다. */
const HEADER = /^# Decision (#?\d+(?:-\d+)?):\s*\S/;
/** 도입 줄 — 헤더 다음 비어 있지 않은 첫 줄 자리에 있을 때만 도입 줄로 읽는다. */
const INTRO_LINE = /^(- )?\*\*도입\*\*:\s*\S/;
/** 소제목 꼴의 최상위 구획. */
const SECTION_HEADING = /^## +\S/;
/** 목록 꼴 최상위 줄의 유일하게 허용되는 모양 — 줄 머리(들여쓰기 없음)에서 굵은 라벨로 시작하는 목록 항목. */
const TOP_ITEM_LABEL = /^- \*\*(.+?)\*\*/;
/** 파일에 하나뿐이어야 하는 제목 급 줄. */
const TITLE_LINE = /^#(?:[ \t]|$)/;
/** 이 글자로 시작하는 줄은 어느 항목 아래에 속한 내용이다 — 탭 · 1칸 들여쓰기는 여기 들지 않는다. */
const NESTED_INDENT = "  ";
/** 코드 펜스를 여닫는 줄 (목록 꼴 — 최상위 펜스를 닫는 줄을 찾는다). */
const FENCE = /^\s*(```|~~~)/;
/** 최상위(들여쓰기 2칸 미만)에서 여는 코드 펜스. */
const TOP_FENCE = /^ ?(```|~~~)/;
/** 코드 펜스 표식 (소제목 꼴 — 들여쓰기와 무관하게 읽고, 표식의 글자와 길이를 잡는다). */
const FENCE_MARKER = /^\s*(`{3,}|~{3,})(.*)$/;

/** 이름 머리에서 벗겨 내는 것 — 번호(`Decision 7` · `결정 3` · `D7` · `#12` · 날짜의 숫자) · 괄호 · 구분 기호. */
const LABEL_PREFIX = /^(?:Decision\s+#?\d+|결정\s*\d+|D\d+|#?\d+|\([^)]*\)|[\s[\]「」(·,:—–/-])+/i;
/** 이력 이름의 접두 낱말 — 지금 참인 규칙이 아니라 바뀐 경위를 적는 항목 · 소제목이다. `amend` 는 `amendment` 도 덮는다. */
const HISTORY_LABEL = /^(?:후속|정정|번복|적용 기록|개정|보강|재결정|갱신|부분 (?:수정|갱신)|amend)/i;

/** 줄 머리의 모양에 붙이는 이름 — 메시지에서 끼어든 줄이 무엇인지 알린다. 위에서부터 처음 맞는 것. */
const LINE_SHAPES = [
	{ pattern: /^\t/, name: "탭으로 들여쓴 줄" },
	{ pattern: /^ {2}/, name: "들여쓴 줄" },
	{ pattern: /^ /, name: "1칸만 들여쓴 줄" },
	{ pattern: /^>/, name: "인용" },
	{ pattern: /^#{1,6}(\s|$)/, name: "소제목" },
	{ pattern: /^\|/, name: "표" },
	{ pattern: /^(```|~~~)/, name: "코드 펜스" },
	{ pattern: /^(-{3,}|\*{3,}|_{3,})\s*$/, name: "구분선" },
	{ pattern: /^([-*+]|\d+[.)])\s/, name: "목록 항목" },
];
const DEFAULT_LINE_SHAPE = "단락";

/** 메시지에 싣는 인용의 최대 글자 수. */
const QUOTE_MAX = 30;

/** 덧댄 것을 걷어 내는 법 — 본문 모양 위반 문구가 함께 쓴다. */
const REWRITE_HINT = "바뀐 내용은 해당 조항을 지금 참인 것만 남게 고쳐 쓰고 이 줄은 지웁니다.";
/** 본문 블록을 시작하는 두 모양 — 문구가 함께 쓴다. */
const BLOCK_START_SHAPES = "`## 소제목`(소제목 꼴) 또는 `- **라벨**` 항목(목록 꼴)";

/**
 * @typedef {"bad-head" | "id-mismatch" | "head-overlay" | "stray-block" | "extra-title" | "history-label"} FileViolationKind
 * @typedef {{ kind: FileViolationKind, msg: string, lines: number[] }} Violation 파일 하나 안의 위반 — `lines` 는 고칠 자리(1부터 센 줄 번호).
 * @typedef {{ text: string, line: number }} ContentLine 파일의 비어 있지 않은 줄.
 * @typedef {{ kind: string, msg: string, at: string[] }} Finding 출력할 위반 하나 — `at` 은 고칠 자리(`경로:줄` 또는 경로).
 */

// ── 줄 읽기 ────────────────────────────────────────────────────────────────

/**
 * @param {string[]} lines
 * @param {number} from 찾기 시작할 배열 위치(0부터).
 * @returns {number} 비어 있지 않은 첫 줄의 배열 위치. 없으면 -1.
 */
function firstContentAt(lines, from) {
	return lines.findIndex((text, at) => at >= from && text.trim() !== "");
}

/**
 * 비어 있지 않은 줄. 최상위 코드 펜스는 여는 줄만 싣고 닫는 줄까지 건너뛴다 — 펜스 안은 본문이 아니다.
 * 들여쓴 펜스는 따로 다루지 않는다: 그 안의 줄도 들여쓰여 있어 어차피 최상위 줄로 읽히지 않는다.
 * @param {string[]} lines
 * @param {number} from 첫 줄의 배열 위치(0부터).
 * @returns {ContentLine[]}
 */
function readContentLines(lines, from) {
	/** @type {ContentLine[]} */
	const content = [];
	let insideTopFence = false;
	for (let j = from; j < lines.length; j++) {
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
 * 코드 펜스 밖의 비어 있지 않은 줄 — 펜스를 여닫는 줄과 그 안의 줄을 뺀다. 펜스는 들여쓰기와 무관하게 읽고, 여는
 * 표식과 같은 글자로 그 길이 이상인 줄에서 닫힌다. 닫히지 않은 펜스는 파일 끝까지다.
 * @param {string[]} lines
 * @param {number} from 첫 줄의 배열 위치(0부터) — 펜스 밖이어야 한다.
 * @returns {ContentLine[]}
 */
function readLinesOutsideFences(lines, from) {
	/** @type {ContentLine[]} */
	const outside = [];
	/** @type {{ char: string, length: number } | null} */
	let open = null;
	for (let j = from; j < lines.length; j++) {
		const text = lines[j];
		const [, marker, rest] = FENCE_MARKER.exec(text) ?? [];
		if (open !== null) {
			if (marker !== undefined && marker[0] === open.char && marker.length >= open.length && rest.trim() === "") open = null;
			continue;
		}
		// 백틱 펜스의 여는 줄에는 백틱이 더 올 수 없다 — "```a``` 는 …" 같은 줄은 인라인 코드로 시작하는 단락이다.
		if (marker !== undefined && !(marker[0] === "`" && rest.includes("`"))) {
			open = { char: marker[0], length: marker.length };
			continue;
		}
		if (text.trim() !== "") outside.push({ text, line: j + 1 });
	}
	return outside;
}

// ── 문구 조각 ──────────────────────────────────────────────────────────────

/**
 * @param {string} text
 * @returns {string} 줄 머리 모양의 이름(인용 · 소제목 · 단락 …).
 */
function shapeOf(text) {
	return LINE_SHAPES.find(({ pattern }) => pattern.test(text))?.name ?? DEFAULT_LINE_SHAPE;
}

/**
 * 메시지에 싣는 줄 묶음의 요약 — 첫 줄의 모양과 앞머리, 나머지는 줄 수만.
 * @param {ContentLine[]} contentLines 하나 이상.
 * @returns {string} 예: `인용 "> **#30 amendment (상태는" 외 2줄`
 */
function summarizeLines(contentLines) {
	const [first, ...rest] = contentLines;
	const more = rest.length > 0 ? ` 외 ${rest.length}줄` : "";
	return `${shapeOf(first.text)} "${first.text.trim().slice(0, QUOTE_MAX)}"${more}`;
}

/**
 * 이름이 이력 이름인가 — 굵은 표시를 걷고 머리의 번호 · 괄호 · 구분 기호를 벗긴 뒤의 첫 낱말로 본다.
 * 굵은 표시를 걷고 보는 까닭: `- **Decision 7** 부분 수정:` 처럼 번호만 굵게 써도 같은 항목이다.
 * @param {string} rest 줄에서 머리 표식(`-` · `##`)을 뗀 나머지.
 * @returns {boolean}
 */
function isHistoryName(rest) {
	return HISTORY_LABEL.test(rest.replaceAll("*", "").replace(LABEL_PREFIX, ""));
}

// ── 파일 하나의 판정 ────────────────────────────────────────────────────────

/**
 * 헤더(와 도입 줄) 다음 첫 줄이 본문 블록의 시작이 아니다.
 * @param {string} id
 * @param {{ introLine: number | null, content: ContentLine[], blockAt: number }} head
 *   `content` 는 헤더(도입 줄이 있으면 도입 줄) 뒤의 줄, `blockAt` 은 그 가운데 첫 블록 시작 줄의 위치(없으면 -1).
 * @returns {Violation}
 */
function headOverlay(id, { introLine, content, blockAt }) {
	const anchor = introLine === null ? "헤더" : "도입 줄";
	if (content.length === 0) {
		return {
			kind: "head-overlay",
			msg: `Decision ${id} 은 ${anchor} 뒤에 내용이 없습니다 — ${anchor} 다음 첫 줄은 본문 블록의 시작입니다. ${BLOCK_START_SHAPES}으로 결정과 이유를 적습니다. 전부 현행이 아니게 된 Decision 이면 파일을 \`${ARCHIVE_DIR}/\` 로 옮깁니다.`,
			lines: [introLine ?? 1],
		};
	}
	if (blockAt === -1) {
		return {
			kind: "head-overlay",
			msg: `Decision ${id} 은 ${anchor} 다음 첫 줄이 본문 블록의 시작이 아니고(${summarizeLines([content[0]])}), 그 뒤에도 블록 시작 줄이 없습니다 — 본문은 ${BLOCK_START_SHAPES}으로 시작합니다. 서술을 그 모양으로 옮겨 적습니다. 전부 현행이 아니게 된 Decision 에 배너만 남긴 것이면 파일을 \`${ARCHIVE_DIR}/\` 로 옮깁니다.`,
			lines: [content[0].line],
		};
	}
	const overlays = content.slice(0, blockAt);
	return {
		kind: "head-overlay",
		msg: `Decision ${id} 은 ${introLine === null ? "헤더와" : "도입 줄과"} 본문 블록 사이에 끼어 있는 줄이 있습니다(${summarizeLines(overlays)}) — ${anchor} 다음 첫 줄은 곧바로 \`## 소제목\` 또는 \`- **라벨**\` 항목입니다. ${REWRITE_HINT} 전부 현행이 아니게 된 Decision 이면 배너를 다는 대신 파일을 \`${ARCHIVE_DIR}/\` 로 옮깁니다.`,
		lines: overlays.map((l) => l.line),
	};
}

/**
 * 목록 꼴의 본문 — 최상위 줄은 전부 `- **라벨**` 항목이고, 그 가운데 이력 항목이 없다.
 * @param {string} id
 * @param {ContentLine[]} body 블록 시작 줄부터 끝까지.
 * @returns {Violation[]}
 */
function judgeListBody(id, body) {
	/** @type {Violation[]} */
	const found = [];
	const topLines = body.filter((l) => !l.text.startsWith(NESTED_INDENT));

	const strayBlocks = topLines.filter((l) => !TOP_ITEM_LABEL.test(l.text));
	if (strayBlocks.length > 0) {
		found.push({
			kind: "stray-block",
			msg: `Decision ${id}(목록 꼴)의 최상위에 \`- **라벨**\` 항목이 아닌 줄이 있습니다(${summarizeLines(strayBlocks)}) — 목록 꼴의 최상위 줄(공백 들여쓰기 2칸 미만)은 전부 \`- **라벨**\` 로 시작합니다. 어느 조항에 속한 내용이면 그 항목 아래로 공백 2칸 이상 들여씁니다. 덧댄 것이면 ${REWRITE_HINT}`,
			lines: strayBlocks.map((l) => l.line),
		});
	}

	const historyItems = topLines.filter((l) => TOP_ITEM_LABEL.test(l.text) && isHistoryName(l.text.slice(1)));
	if (historyItems.length > 0) {
		const [first, ...rest] = historyItems;
		const label = TOP_ITEM_LABEL.exec(first.text)?.[1] ?? "";
		const more = rest.length > 0 ? ` 외 ${rest.length}개` : "";
		found.push({
			kind: "history-label",
			msg: `Decision ${id} 에 이력 항목을 덧붙였습니다("${label.slice(0, QUOTE_MAX)}"${more}) — 덧붙인 항목은 앞 조항을 이기는 두 번째 권위가 됩니다. 현행 규칙은 해당 조항에 녹이고 이 항목은 없앱니다.`,
			lines: historyItems.map((l) => l.line),
		});
	}

	return found;
}

/**
 * 소제목 꼴의 본문 — 코드 펜스 밖에 `# ` 제목이 더 없고, `## ` 소제목 가운데 이력 이름이 없다.
 * @param {string} id
 * @param {string[]} lines
 * @param {number} from 블록 시작 줄의 배열 위치(0부터).
 * @returns {Violation[]}
 */
function judgeHeadingBody(id, lines, from) {
	/** @type {Violation[]} */
	const found = [];
	const outside = readLinesOutsideFences(lines, from);

	const titles = outside.filter((l) => TITLE_LINE.test(l.text));
	if (titles.length > 0) {
		const [first, ...rest] = titles;
		const more = rest.length > 0 ? ` 외 ${rest.length}줄` : "";
		found.push({
			kind: "extra-title",
			msg: `Decision ${id}(소제목 꼴)에 \`# \` 제목이 첫 줄 말고 또 있습니다("${first.text.trim().slice(0, QUOTE_MAX)}"${more}) — \`# \` 제목은 첫 줄 하나뿐입니다. 구획이면 \`## \` 소제목으로 낮추고, 다른 Decision 이면 제 파일로 나눕니다. 코드 · 문서 예시의 줄이면 코드 펜스 안에 둡니다.`,
			lines: titles.map((l) => l.line),
		});
	}

	const historyHeadings = outside.filter((l) => SECTION_HEADING.test(l.text) && isHistoryName(l.text.slice(2)));
	if (historyHeadings.length > 0) {
		const label = historyHeadings[0].text.slice(2).trim();
		const more = historyHeadings.length > 1 ? ` 외 ${historyHeadings.length - 1}개` : "";
		found.push({
			kind: "history-label",
			msg: `Decision ${id} 에 이력 소제목을 덧붙였습니다("${label.slice(0, QUOTE_MAX)}"${more}) — 덧붙인 구획은 앞 조항을 이기는 두 번째 권위가 됩니다. 현행 규칙은 해당 구획에 녹이고 이 소제목과 그 아래 내용은 없앱니다.`,
			lines: historyHeadings.map((l) => l.line),
		});
	}

	return found;
}

/**
 * Decision 파일 하나의 위반을 찾는다 (순수 함수).
 * @param {string[]} lines 파일을 줄 단위로 나눈 배열.
 * @param {string} fileId 파일 이름에서 확장자를 뺀 것 — 첫 줄 식별자에서 `#` 를 뗀 것과 같아야 한다.
 * @param {{ archived?: boolean }} [opts] `archived` 면 파일 머리(`bad-head` · `id-mismatch`)만 본다.
 * @returns {Violation[]} 판정 순서 — 한 파일이 여러 종류에 걸리면 종류마다 하나씩 낸다.
 */
export function findDecisionViolations(lines, fileId, { archived = false } = {}) {
	const first = lines[0] ?? "";
	const id = HEADER.exec(first)?.[1];
	if (id === undefined) {
		const instead = first.trim() === "" ? "첫 줄이 비어 있습니다" : `첫 줄 "${first.trim().slice(0, QUOTE_MAX)}"`;
		return [
			{
				kind: "bad-head",
				msg: `첫 줄이 \`# Decision <식별자>: <제목>\` 이 아닙니다(${instead}) — Decision 파일은 첫 줄이 제목이고 식별자는 \`#?숫자(-숫자)?\` 꼴입니다. 첫 줄을 그 모양으로 고칩니다. Decision 이 아닌 문서면 결정 기록 폴더 밖으로 옮깁니다(폴더의 안내는 README.md 에 적습니다).`,
				lines: [1],
			},
		];
	}

	/** @type {Violation[]} */
	const found = [];
	const bareId = id.replace(/^#/, "");
	if (bareId !== fileId) {
		found.push({
			kind: "id-mismatch",
			msg: `첫 줄의 식별자 "${id}" 가 파일 이름 "${fileId}${DECISION_EXT}" 와 맞지 않습니다 — 파일 이름은 식별자에서 \`#\` 를 뗀 것입니다. 코드 · 문서가 인용하는 식별자가 맞으면 파일 이름을 \`${bareId}${DECISION_EXT}\` 로 바꾸고, 파일 이름이 맞으면 첫 줄의 식별자를 고칩니다.`,
			lines: [1],
		});
	}
	if (archived) return found;

	const afterHeaderAt = firstContentAt(lines, 1);
	const introAt = afterHeaderAt !== -1 && INTRO_LINE.test(lines[afterHeaderAt]) ? afterHeaderAt : -1;
	const content = readContentLines(lines, (introAt === -1 ? 0 : introAt) + 1);
	const blockAt = content.findIndex((l) => SECTION_HEADING.test(l.text) || TOP_ITEM_LABEL.test(l.text));

	if (blockAt !== 0) found.push(headOverlay(id, { introLine: introAt === -1 ? null : introAt + 1, content, blockAt }));
	// 블록 시작 줄이 없으면 어느 꼴인지 정할 수 없다 — 본문 판정은 하지 않는다.
	if (blockAt === -1) return found;

	const blockStart = content[blockAt];
	const body = SECTION_HEADING.test(blockStart.text)
		? judgeHeadingBody(id, lines, blockStart.line - 1)
		: judgeListBody(id, content.slice(blockAt));
	return [...found, ...body];
}

// ── 출력 ───────────────────────────────────────────────────────────────────

/**
 * 파일 하나의 위반을 출력할 위반으로 옮긴다 (순수 함수).
 * @param {string} path 저장소 루트 기준 파일 경로 — 고칠 자리가 이 파일을 가리킨다.
 * @param {Violation[]} violations
 * @returns {Finding[]}
 */
function toFindings(path, violations) {
	return violations.map(({ kind, msg, lines }) => ({ kind, msg, at: lines.map((n) => `${path}:${n}`) }));
}

/**
 * 위반을 출력 줄로 옮긴다 (순수 함수) — 문구 한 줄과 그 아래 고칠 자리.
 * @param {Finding[]} findings
 * @returns {string[]}
 */
export function formatFindings(findings) {
	return findings.flatMap(({ kind, msg, at }) => [`[${kind}] ${msg}`, ...at.map((where) => `    ${where}`)]);
}

// ── 실행 ───────────────────────────────────────────────────────────────────

/**
 * 설정에 적힌 경로를 대조할 수 있는 한 모양으로 — 구분자는 `/`, `./` 접두와 끝의 `/` 는 뗀다.
 * @param {string} path
 * @returns {string}
 */
function normalizePath(path) {
	return posix.normalize(path.trim().replaceAll("\\", "/")).replace(/\/$/, "");
}

/**
 * 폴더 바로 아래의 Decision 파일 이름. 심볼릭 링크와 하위 폴더는 싣지 않는다.
 * @param {string} dir 절대 경로.
 * @returns {string[] | null} 번호 순(`6-1` 이 `39` 앞). 폴더가 없거나 폴더가 아니면 null.
 */
function listDecisionFiles(dir) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return null;
	}
	return entries
		.filter((e) => e.isFile() && e.name.endsWith(DECISION_EXT) && e.name.toLowerCase() !== README_FILE)
		.map((e) => e.name)
		.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
}

/**
 * @param {string} full 절대 경로.
 * @returns {string[]} 파일의 줄 — 머리의 BOM 은 뗀다.
 */
function readLines(full) {
	return readFileSync(full, "utf8")
		.replace(/^﻿/, "")
		.split(/\r?\n/);
}

/**
 * 폴더 하나를 검사한다.
 * @param {string} root
 * @param {string} dir 저장소 루트 기준 폴더 경로(정규화된 것).
 * @param {Set<string>} pending 보류 경로(정규화된 것).
 * @returns {{ findings: Finding[], activeCount: number, archiveCount: number, pendingPaths: string[], judged: Map<string, number> }}
 *   `judged` 는 판정한 파일의 경로 → 위반 수, `pendingPaths` 는 위반이 있어 보류로 가린 파일.
 */
function checkDecisionDir(root, dir, pending) {
	const empty = { activeCount: 0, archiveCount: 0, pendingPaths: [], judged: new Map() };
	const active = listDecisionFiles(join(root, dir));
	if (active === null) {
		return {
			...empty,
			findings: [
				{
					kind: "missing-target",
					msg: `결정 기록 폴더 ${dir} 가 없습니다 — 있는 폴더만 보고 통과하지 않습니다. 폴더 이름이 바뀌었으면 ${CONFIG_FILE} checks.decisions.dirs 를 맞추고, 이 저장소에 그 결정 기록이 없으면 dirs 에 있는 폴더만 적습니다.`,
					at: [dir],
				},
			],
		};
	}
	const archive = listDecisionFiles(join(root, dir, ARCHIVE_DIR)) ?? [];
	if (active.length + archive.length === 0) {
		return {
			...empty,
			findings: [
				{
					kind: "empty-target",
					msg: `결정 기록 폴더 ${dir} 에 Decision 파일이 하나도 없습니다(active · archive 합쳐 0) — 공회전이라 통과로 치지 않습니다. Decision 은 \`${dir}/<번호>${DECISION_EXT}\` 로 둡니다. 폴더가 다른 곳이면 ${CONFIG_FILE} checks.decisions.dirs 를 맞춥니다.`,
					at: [dir],
				},
			],
		};
	}

	/** @type {Finding[]} */
	const findings = [];
	const archived = new Set(archive);
	for (const file of active.filter((f) => archived.has(f))) {
		findings.push({
			kind: "duplicate-id",
			msg: `${file} 이 ${dir} 바로 아래와 ${ARCHIVE_DIR}/ 양쪽에 있습니다 — 폴더 바로 아래에 있는 것이 지금 유효한 결정입니다. 지금 유효하면 ${ARCHIVE_DIR}/ 쪽을, 전부 현행이 아니게 됐으면 폴더 바로 아래 쪽을 지웁니다.`,
			at: [`${dir}/${file}:1`, `${dir}/${ARCHIVE_DIR}/${file}:1`],
		});
	}

	/** @type {string[]} */
	const pendingPaths = [];
	/** @type {Map<string, number>} */
	const judged = new Map();
	const targets = [
		...active.map((file) => ({ file, path: `${dir}/${file}`, isArchived: false })),
		...archive.map((file) => ({ file, path: `${dir}/${ARCHIVE_DIR}/${file}`, isArchived: true })),
	];
	for (const { file, path, isArchived } of targets) {
		const violations = findDecisionViolations(readLines(join(root, path)), file.slice(0, -DECISION_EXT.length), { archived: isArchived });
		judged.set(path, violations.length);
		if (!pending.has(path)) findings.push(...toFindings(path, violations));
		else if (violations.length > 0) pendingPaths.push(path);
	}

	return { findings, activeCount: active.length, archiveCount: archive.length, pendingPaths, judged };
}

/**
 * 낡은 보류 항목 — 없는 파일 · 검사 대상이 아닌 파일 · 위반이 없어진 파일.
 * @param {string} root
 * @param {string[]} pending 보류 경로(정규화된 것, 적힌 순서).
 * @param {Map<string, number>} judged 판정한 파일의 경로 → 위반 수.
 * @returns {Finding[]}
 */
function findStalePending(root, pending, judged) {
	const where = `${CONFIG_FILE} checks.decisions.pending`;
	return [...new Set(pending)].flatMap((path) => {
		const count = judged.get(path);
		if (count !== undefined && count > 0) return [];
		let reason;
		if (count === 0) reason = `${path} 에 위반이 없습니다 — 정리가 끝난 파일입니다`;
		else if (existsSync(join(root, path))) reason = `${path} 는 검사 대상 Decision 파일이 아닙니다(dirs 의 폴더 바로 아래나 그 ${ARCHIVE_DIR}/ 의 ${DECISION_EXT} 파일만 대상입니다)`;
		else reason = `${path} 파일이 없습니다 — 이름이 바뀌었거나 지워졌습니다`;
		return [{ kind: "stale-pending", msg: `${reason}. ${where} 에서 이 경로를 지웁니다(목록은 줄기만 합니다).`, at: [CONFIG_FILE] }];
	});
}

export function run({ root, options }) {
	if (options.dirs.length === 0) {
		console.error("check-decisions: 검사 대상 폴더(dirs)가 비어 있습니다 — 공회전이라 통과로 치지 않습니다.");
		return 1;
	}

	const pending = options.pending.map(normalizePath);
	const pendingSet = new Set(pending);
	/** @type {Map<string, number>} */
	const judged = new Map();
	let findingCount = 0;

	for (const dir of options.dirs.map(normalizePath)) {
		const check = checkDecisionDir(root, dir, pendingSet);
		for (const [path, count] of check.judged) judged.set(path, count);
		if (check.findings.length === 0) {
			const held = check.pendingPaths.length > 0 ? ` · 보류 ${check.pendingPaths.length}개` : "";
			console.log(`check-decisions: ${dir} OK — active ${check.activeCount}개 · archive ${check.archiveCount}개${held}`);
			continue;
		}
		for (const line of formatFindings(check.findings)) console.error(line);
		findingCount += check.findings.length;
	}

	const stale = findStalePending(root, pending, judged);
	for (const line of formatFindings(stale)) console.error(line);
	findingCount += stale.length;

	if (findingCount > 0) console.error(`check-decisions: ${findingCount}건 위반`);
	return findingCount > 0 ? 1 : 0;
}
