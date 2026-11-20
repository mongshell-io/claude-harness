import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findDecisionViolations, formatFindings, run, schema } from "../checks/decisions.mjs";
import { ConfigError, enabledCheckNames, resolveOptions, validateConfigShape } from "../lib/config.mjs";
import { CHECKS } from "../lib/registry.mjs";
import { selectCheckScripts } from "../lib/run-all.mjs";
import { captureConsole, makeRepo } from "./helpers.mjs";

/** 따로 정하지 않은 Decision 의 제목. */
const TITLE = "제목";
/** 따로 정하지 않은 Decision 의 식별자 — 파일 이름은 `#` 를 뗀 `FILE_ID` 다. */
const ID = "#100";
const FILE_ID = "100";

const BARE_INTRO = "**도입**: #6";
const DASH_INTRO = "- **도입**: #527";

/**
 * 소제목 꼴 Decision 파일의 줄 — 헤더, (도입 줄), 헤더와 본문 블록 사이에 끼울 줄들, `## 결정` · `## 이유` 구획, 덧붙일 줄들.
 * `intro` 를 null 로 주면 도입 줄을 두지 않는다.
 */
function headingFile({ id = ID, intro = BARE_INTRO, head = [], tail = [] } = {}) {
	return [
		`# Decision ${id}: ${TITLE}`,
		"",
		...(intro === null ? [] : [intro, ""]),
		...head.flatMap((line) => [line, ""]),
		"## 결정",
		"",
		"1. 본문.",
		"",
		"## 이유",
		"",
		"근거 단락.",
		...tail,
	];
}

/** 목록 꼴 Decision 파일의 줄 — 헤더, (도입 줄), 끼울 줄들, `- **결정**` · `- **이유**` 항목, 덧붙일 줄들. */
function listFile({ id = ID, intro = DASH_INTRO, head = [], tail = [] } = {}) {
	return [`# Decision ${id}: ${TITLE}`, "", ...(intro === null ? [] : [intro]), ...head, "- **결정**:", "  - 본문.", "- **이유**:", "  - 근거.", ...tail];
}

/** 그 글자로 시작하는 첫 줄의 번호(1부터). */
function lineOf(lines, prefix) {
	const at = lines.findIndex((l) => l.startsWith(prefix));
	if (at === -1) throw new Error(`fixture 에 "${prefix}" 로 시작하는 줄이 없다`);
	return at + 1;
}

/** 그 글자와 똑같은 마지막 줄의 번호(1부터). */
function lastLineOf(lines, text) {
	const at = lines.lastIndexOf(text);
	if (at === -1) throw new Error(`fixture 에 "${text}" 줄이 없다`);
	return at + 1;
}

/** 위반의 종류와 고칠 자리만 — 문구는 따로 단언한다. */
function found(lines, fileId = FILE_ID, opts = {}) {
	return findDecisionViolations(lines, fileId, opts).map(({ kind, lines: at }) => ({ kind, lines: at }));
}

/** 문구가 조각을 전부 담고 있다. */
function assertMsgIncludes(msg, parts) {
	for (const part of parts) assert.ok(msg.includes(part), `문구에 "${part}" 가 없다:\n${msg}`);
}

const DEAD_BANNER = "> **폐기 — superseded by #20**: 소비처 소멸.";
const AMENDMENT_QUOTE = "> **#30 amendment (상태는 active)**: 결정 2 의 기본값이 바뀌었다.";
const FOLLOW_UP_ITEM = "- **후속 (#50, 2026-01-02)** — 결정 6 의 「로컬 원천」 을 거둔다:";
const CORRECTION_ITEM = "- **정정 (2026-01-03)**: 넓은 화면에서 위치가 다른 탭과 달랐다.";

describe("decisions — 통과", () => {
	for (const [label, lines] of [
		["소제목 꼴 — 도입 줄", headingFile()],
		["소제목 꼴 — `- ` 를 붙인 도입 줄", headingFile({ intro: DASH_INTRO })],
		["소제목 꼴 — 도입 줄 없음", headingFile({ intro: null })],
		["목록 꼴 — 도입 줄", listFile()],
		["목록 꼴 — `- ` 없이 적은 도입 줄", listFile({ intro: BARE_INTRO })],
		["목록 꼴 — 도입 줄 없음", listFile({ intro: null })],
		["헤더와 본문 사이에 빈 줄이 없어도 된다", [`# Decision ${ID}: ${TITLE}`, "## 결정", "본문."]],
		["소제목이 하나뿐인 소제목 꼴", [`# Decision ${ID}: ${TITLE}`, "", "## 결정", "", "본문."]],
		["항목이 하나뿐인 목록 꼴", [`# Decision ${ID}: ${TITLE}`, "", "- **결정**: 본문."]],
	]) {
		it(label, () => {
			assert.deepEqual(found(lines), []);
		});
	}

	for (const [id, fileId] of [
		["#6-1", "6-1"],
		["6-1", "6-1"],
		["39", "39"],
		["#455", "455"],
	]) {
		it(`식별자 ${id} 의 파일 이름은 ${fileId}.md 다`, () => {
			assert.deepEqual(found(headingFile({ id }), fileId), []);
			assert.deepEqual(found(listFile({ id }), fileId), []);
		});
	}

	it("소제목 꼴의 구획 아래 내용은 자유다 — 인용 · 표 · 단락 · 목록 · `### ` 소제목 · 구분선", () => {
		const tail = ["", "> 인용.", "", "| 값 | 뜻 |", "|---|---|", "", "- **후속 작업**: 구획 안의 목록 항목.", "- 굵은 라벨 없는 항목.", "", "### 세부", "", "---"];

		assert.deepEqual(found(headingFile({ tail })), []);
	});

	it("목록 꼴의 조항에 속한 내용은 2칸 이상 들여쓰면 자유다 — 인용 · 표 · 코드 펜스 · 소제목처럼 보이는 줄", () => {
		const tail = ["- **관련**:", "  > 들여쓴 인용.", "  | 값 | 뜻 |", "  ```md", "  # 예시 제목", "  ## 갱신", "  ```", "    - 더 깊은 항목."];

		assert.deepEqual(found(listFile({ tail })), []);
	});

	it("이름 중간에 이력 낱말이 든 항목 · 소제목은 지금 참인 조항이다", () => {
		assert.deepEqual(found(listFile({ tail: ["- **다시 볼 조건**: 한도를 넘으면.", "- **넘어간 것 (후속 이슈로)**: 캐시."] })), []);
		assert.deepEqual(found(headingFile({ tail: ["", "## 다시 볼 조건", "", "## 넘어간 것 (후속 이슈로)"] })), []);
	});
});

describe("decisions — 코드 펜스 안은 본문이 아니다 (소제목 꼴)", () => {
	for (const [label, fenced] of [
		["최상위 펜스", ["```md", "# 예시 제목", "## 갱신", "```"]],
		["물결 펜스", ["~~~", "# 예시 제목", "## 후속", "~~~"]],
		["목록 안에 들여쓴 펜스 — 안의 줄은 줄 머리에 적혀 있다", ["1. 예시:", "", "   ```md", "# 예시 제목", "## 갱신", "   ```"]],
		["백틱 4개 펜스 — 안의 ``` 줄에서 닫히지 않는다", ["````md", "```", "# 예시 제목", "```", "## 정정", "````"]],
		["정보 문자열이 붙은 줄은 펜스를 닫지 않는다", ["```md", "```js", "## 갱신", "```"]],
	]) {
		it(label, () => {
			assert.deepEqual(found(headingFile({ tail: ["", ...fenced, "", "## 관련", "", "Decision #50."] })), []);
		});
	}

	it("펜스가 닫힌 뒤의 줄은 다시 본문이다", () => {
		const lines = headingFile({ tail: ["", "```md", "# 예시 제목", "```", "", "## 갱신", "", "# 덧붙인 제목"] });

		assert.deepEqual(found(lines), [
			{ kind: "extra-title", lines: [lineOf(lines, "# 덧붙인 제목")] },
			{ kind: "history-label", lines: [lastLineOf(lines, "## 갱신")] },
		]);
	});

	it("인라인 코드로 시작하는 단락은 펜스를 열지 않는다", () => {
		const lines = headingFile({ tail: ["", "```a``` 는 예시다.", "", "## 갱신"] });

		assert.deepEqual(found(lines), [{ kind: "history-label", lines: [lineOf(lines, "## 갱신")] }]);
	});

	it("닫히지 않은 펜스는 파일 끝까지다", () => {
		assert.deepEqual(found(headingFile({ tail: ["", "```md", "## 갱신"] })), []);
	});
});

describe("decisions — 첫 줄은 `# Decision <식별자>: <제목>` 이다 (bad-head)", () => {
	for (const [label, first] of [
		["빈 첫 줄", ""],
		["`## ` 제목", `## Decision ${ID}: ${TITLE}`],
		["식별자 없음", `# Decision: ${TITLE}`],
		["콜론과 제목 없음", `# Decision ${ID}`],
		["제목 없음", `# Decision ${ID}:`],
		["숫자가 아닌 식별자", `# Decision abc: ${TITLE}`],
		["세 마디 식별자", `# Decision 6-1-2: ${TITLE}`],
		["다른 낱말", `# 결정 100: ${TITLE}`],
		["Decision 이 아닌 문서", "# 결정 기록 쓰는 법"],
		["앞에 공백", ` # Decision ${ID}: ${TITLE}`],
	]) {
		it(label, () => {
			assert.deepEqual(found([first, "", "## 결정", "", "본문."]), [{ kind: "bad-head", lines: [1] }]);
		});
	}

	it("빈 파일", () => {
		assert.deepEqual(found([]), [{ kind: "bad-head", lines: [1] }]);
		assert.deepEqual(found([""]), [{ kind: "bad-head", lines: [1] }]);
	});

	it("헤더가 둘째 줄에 있어도 첫 줄이 아니면 걸린다", () => {
		assert.deepEqual(found(["", ...headingFile()]), [{ kind: "bad-head", lines: [1] }]);
	});

	it("그 파일의 판정은 여기서 멈춘다 — 본문의 덧댄 것은 내지 않는다", () => {
		assert.deepEqual(found(["# 메모", "", AMENDMENT_QUOTE, "", "## 갱신", "", "# 또 제목"]), [{ kind: "bad-head", lines: [1] }]);
	});

	it("문구가 첫 줄과 고칠 방법을 알린다", () => {
		const [violation] = findDecisionViolations(["## Decision 7: 옛 모양의 헤더"], "7");

		assertMsgIncludes(violation.msg, [
			"첫 줄이 `# Decision <식별자>: <제목>` 이 아닙니다",
			'(첫 줄 "## Decision 7: 옛 모양의 헤더")',
			"식별자는 `#?숫자(-숫자)?` 꼴입니다",
			"Decision 이 아닌 문서면 결정 기록 폴더 밖으로 옮깁니다",
		]);
		assertMsgIncludes(findDecisionViolations([""], "7")[0].msg, ["(첫 줄이 비어 있습니다)"]);
	});
});

describe("decisions — 파일 이름은 식별자에서 `#` 를 뗀 것이다 (id-mismatch)", () => {
	for (const [id, fileId] of [
		["#6-1", "6-2"],
		["#6-1", "#6-1"],
		["39", "039"],
		["39", "39-1"],
		["#455", "decision-455"],
	]) {
		it(`식별자 ${id} · 파일 ${fileId}.md`, () => {
			assert.deepEqual(found(headingFile({ id }), fileId), [{ kind: "id-mismatch", lines: [1] }]);
		});
	}

	it("본문 판정은 이어서 한다", () => {
		const lines = listFile({ tail: [FOLLOW_UP_ITEM] });

		assert.deepEqual(found(lines, "101"), [
			{ kind: "id-mismatch", lines: [1] },
			{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM)] },
		]);
	});

	it("문구가 두 이름과 고칠 방법을 알린다", () => {
		const [violation] = findDecisionViolations(headingFile({ id: "#6-1" }), "6-2");

		assertMsgIncludes(violation.msg, ['식별자 "#6-1" 가 파일 이름 "6-2.md" 와 맞지 않습니다', "파일 이름을 `6-1.md` 로 바꾸고", "첫 줄의 식별자를 고칩니다"]);
	});
});

describe("decisions — archive 파일은 머리만 본다", () => {
	const ARCHIVED = { archived: true };

	it("배너 · 이력 항목 · 덧붙인 제목이 있어도 걸리지 않는다 — 원문 보관처다", () => {
		const lines = [`# Decision ${ID}: ${TITLE}`, "", DEAD_BANNER, "", "서술 단락.", FOLLOW_UP_ITEM, "## 갱신", "# 또 제목"];

		assert.deepEqual(found(lines, FILE_ID, ARCHIVED), []);
		assert.notDeepEqual(found(lines, FILE_ID), []);
	});

	it("헤더뿐인 파일도 통과한다", () => {
		assert.deepEqual(found([`# Decision ${ID}: ${TITLE}`], FILE_ID, ARCHIVED), []);
	});

	it("bad-head 는 본다", () => {
		assert.deepEqual(found([`## Decision ${ID}: ${TITLE}`, "", DEAD_BANNER], FILE_ID, ARCHIVED), [{ kind: "bad-head", lines: [1] }]);
	});

	it("id-mismatch 는 본다", () => {
		assert.deepEqual(found([`# Decision ${ID}: ${TITLE}`, "", DEAD_BANNER], "101", ARCHIVED), [{ kind: "id-mismatch", lines: [1] }]);
	});
});

describe("decisions — 헤더(와 도입 줄) 다음 첫 줄은 본문 블록의 시작이다 (head-overlay)", () => {
	for (const [label, overlay] of [
		["폐기 배너", DEAD_BANNER],
		["amendment 인용", AMENDMENT_QUOTE],
		["굵은 라벨 없는 인용", "> historical — 본문의 「N주」 서술은 뒤 결정으로 일 단위가 됐다."],
		["내용 없는 인용 줄", ">"],
		["단락", "이 결정은 #50 으로 일부 바뀌었다."],
		["굵은 라벨 단락", "**현행 상태**: 결정 3 만 유효."],
		["`### ` 소제목", "### 요약"],
		["굵은 라벨 없는 항목", "- 요약: 라벨을 굵게 쓰지 않은 항목."],
		["표", "| 결정 | 바뀐 값 |"],
		["구분선", "---"],
		["코드 펜스", "```md"],
		["1칸 들여쓴 항목", " - **결정**: 한 칸만 들여쓴 항목."],
	]) {
		for (const [shape, file] of [
			["소제목 꼴", headingFile],
			["목록 꼴", listFile],
		]) {
			it(`도입 줄 뒤의 ${label} — ${shape}`, () => {
				const lines = file({ head: [overlay] });

				assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [lineOf(lines, overlay)] }]);
			});

			it(`도입 줄 없이 헤더 바로 뒤의 ${label} — ${shape}`, () => {
				const lines = file({ intro: null, head: [overlay] });

				assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [lineOf(lines, overlay)] }]);
			});
		}
	}

	it("도입 줄 없이 헤더 바로 뒤에 배너만 남은 파일 — 배너 줄을 가리키고 본문 판정은 하지 않는다", () => {
		const lines = [`# Decision ${ID}: ${TITLE}`, "", DEAD_BANNER];

		assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [3] }]);
	});

	it("블록 시작 줄이 없는 서술 본문 — 첫 줄 하나만 가리킨다", () => {
		const lines = [`# Decision ${ID}: ${TITLE}`, "", BARE_INTRO, "", "첫 단락.", "", "둘째 단락.", "# 또 제목"];

		assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [5] }]);
	});

	it("헤더뿐인 파일은 헤더 줄을 가리킨다", () => {
		assert.deepEqual(found([`# Decision ${ID}: ${TITLE}`, ""]), [{ kind: "head-overlay", lines: [1] }]);
	});

	it("헤더와 도입 줄뿐인 파일은 도입 줄을 가리킨다", () => {
		assert.deepEqual(found([`# Decision ${ID}: ${TITLE}`, "", BARE_INTRO, ""]), [{ kind: "head-overlay", lines: [3] }]);
		assert.deepEqual(found([`# Decision ${ID}: ${TITLE}`, "", DASH_INTRO]), [{ kind: "head-overlay", lines: [3] }]);
	});

	it("끼어든 여러 줄은 한 건으로 묶는다 — 문구에는 첫 줄의 모양과 앞머리, 나머지는 줄 수", () => {
		const lines = headingFile({ head: [AMENDMENT_QUOTE, "부연 단락.", "> 또 다른 인용."] });
		const [violation, ...rest] = findDecisionViolations(lines, FILE_ID);

		assert.deepEqual(rest, []);
		assert.deepEqual(violation.lines, [lineOf(lines, AMENDMENT_QUOTE), lineOf(lines, "부연 단락."), lineOf(lines, "> 또 다른 인용.")]);
		assertMsgIncludes(violation.msg, ['(인용 "> **#30 amendment (상태는 active)" 외 2줄)']);
	});

	it("끼어든 최상위 펜스 안의 줄은 싣지 않는다", () => {
		const lines = headingFile({ intro: null, head: ["```md\n## 예시 소제목\n```"].flatMap((block) => block.split("\n")) });

		assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [lineOf(lines, "```md")] }]);
	});

	it("끼어든 줄 뒤에서 블록 시작 줄을 찾으면 나머지 판정을 잇는다 — 소제목 꼴", () => {
		const lines = headingFile({ intro: null, head: [DEAD_BANNER], tail: ["", "## 갱신 (2026-01)", "", "# 덧붙인 제목"] });

		assert.deepEqual(found(lines), [
			{ kind: "head-overlay", lines: [lineOf(lines, DEAD_BANNER)] },
			{ kind: "extra-title", lines: [lineOf(lines, "# 덧붙인 제목")] },
			{ kind: "history-label", lines: [lineOf(lines, "## 갱신")] },
		]);
	});

	it("끼어든 줄 뒤에서 블록 시작 줄을 찾으면 나머지 판정을 잇는다 — 목록 꼴. 끼어든 줄은 stray-block 으로 다시 내지 않는다", () => {
		const lines = listFile({ head: [AMENDMENT_QUOTE], tail: ["맨 단락.", FOLLOW_UP_ITEM] });

		assert.deepEqual(found(lines), [
			{ kind: "head-overlay", lines: [lineOf(lines, AMENDMENT_QUOTE)] },
			{ kind: "stray-block", lines: [lineOf(lines, "맨 단락.")] },
			{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM)] },
		]);
	});

	it("도입 줄 아래에 들여쓴 줄도 끼어든 줄이다", () => {
		const lines = listFile({ head: ["  - 관련 PR #530."] });

		assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [lineOf(lines, "  - 관련 PR #530.")] }]);
		assertMsgIncludes(findDecisionViolations(lines, FILE_ID)[0].msg, ['(들여쓴 줄 "- 관련 PR #530.")']);
	});

	it("값이 없는 `**도입**:` 은 도입 줄이 아니다 — 그 줄 자체가 끼어든 줄이다", () => {
		const lines = headingFile({ intro: "**도입**:" });

		assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [3] }]);
	});

	it("헤더 다음 첫 줄 자리가 아닌 `**도입**:` 은 도입 줄이 아니다 — 배너와 함께 끼어든 줄로 묶인다", () => {
		const lines = headingFile({ intro: null, head: [DEAD_BANNER, BARE_INTRO] });

		assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [lineOf(lines, DEAD_BANNER), lineOf(lines, BARE_INTRO)] }]);
	});

	it("문구가 기준점과 고칠 방법을 알린다 — 도입 줄이 있으면 도입 줄, 없으면 헤더", () => {
		const [withIntro] = findDecisionViolations(headingFile({ head: [AMENDMENT_QUOTE] }), FILE_ID);
		const [withoutIntro] = findDecisionViolations(headingFile({ intro: null, head: [DEAD_BANNER] }), FILE_ID);

		assertMsgIncludes(withIntro.msg, [
			`Decision ${ID} 은 도입 줄과 본문 블록 사이에 끼어 있는 줄이 있습니다`,
			"도입 줄 다음 첫 줄은 곧바로 `## 소제목` 또는 `- **라벨**` 항목입니다",
			"해당 조항을 지금 참인 것만 남게 고쳐 쓰고 이 줄은 지웁니다",
			"파일을 `archive/` 로 옮깁니다",
		]);
		assertMsgIncludes(withoutIntro.msg, [
			`Decision ${ID} 은 헤더와 본문 블록 사이에 끼어 있는 줄이 있습니다`,
			'(인용 "> **폐기 — superseded by #20**: ")',
			"헤더 다음 첫 줄은 곧바로",
		]);
	});

	it("문구가 본문이 없는 경우를 따로 알린다", () => {
		const [empty] = findDecisionViolations([`# Decision ${ID}: ${TITLE}`], FILE_ID);
		const [noBlock] = findDecisionViolations([`# Decision ${ID}: ${TITLE}`, "", DEAD_BANNER], FILE_ID);

		assertMsgIncludes(empty.msg, ["헤더 뒤에 내용이 없습니다", "`## 소제목`(소제목 꼴) 또는 `- **라벨**` 항목(목록 꼴)으로 결정과 이유를 적습니다"]);
		assertMsgIncludes(noBlock.msg, ["헤더 다음 첫 줄이 본문 블록의 시작이 아니고", "그 뒤에도 블록 시작 줄이 없습니다", "파일을 `archive/` 로 옮깁니다"]);
	});
});

describe("decisions — 목록 꼴의 최상위 줄은 전부 `- **라벨**` 이다 (stray-block)", () => {
	for (const [label, stray] of [
		["amendment 인용", AMENDMENT_QUOTE],
		["내용 없는 인용 줄", ">"],
		["굵은 라벨 단락", "**보강 (#20, 재발 방지)**: 한 번 더 거른다."],
		["맨 단락", "이 결정은 #50 으로 일부 바뀌었다."],
		["`### ` 소제목", "### 후속"],
		["`## ` 소제목", "## 부록"],
		["`# ` 제목 — extra-title 이 아니라 이것이다", "# 또 제목"],
		["표", "| 결정 | 바뀐 값 |"],
		["`*` 글머리", "* **후속**: 별표 글머리로 적은 항목."],
		["`+` 글머리", "+ **후속**: 더하기 글머리로 적은 항목."],
		["번호 목록", "1. **후속**: 번호 목록으로 적은 항목."],
		["굵은 라벨 없는 항목", "- 후속: 라벨을 굵게 쓰지 않은 항목."],
		["1칸 들여쓴 항목", " - **후속**: 한 칸만 들여쓴 항목."],
		["탭으로 들여쓴 항목", "\t- **정정**: 탭으로 들여쓴 항목."],
		["최상위 코드 펜스", "```md"],
		["구분선", "---"],
		["헤더 다음 첫 줄 자리가 아닌 `- ` 없는 도입 줄", BARE_INTRO],
	]) {
		for (const [introLabel, intro] of [
			["도입 줄", DASH_INTRO],
			["도입 줄 없음", null],
		]) {
			it(`${label} — ${introLabel}`, () => {
				const lines = listFile({ intro, tail: [stray, "- **관련**: Decision #50."] });

				assert.deepEqual(found(lines), [{ kind: "stray-block", lines: [lastLineOf(lines, stray)] }]);
			});
		}
	}

	it("파일 맨 끝의 구분선도 예외가 아니다", () => {
		const lines = listFile({ tail: ["", "---"] });

		assert.deepEqual(found(lines), [{ kind: "stray-block", lines: [lines.length] }]);
	});

	it("`- ` 없이 적은 도입 줄은 헤더 다음 첫 줄 자리에서만 예외다", () => {
		assert.deepEqual(found(listFile({ intro: BARE_INTRO })), []);
	});

	it("한 파일의 여러 줄은 한 건으로 묶는다 — 사이에 낀 항목과 들여쓴 줄은 싣지 않는다", () => {
		const lines = listFile({ tail: ["", AMENDMENT_QUOTE, "- **관련**: Decision #50.", "  > 들여쓴 인용.", "### 후속"] });

		assert.deepEqual(found(lines), [{ kind: "stray-block", lines: [lineOf(lines, AMENDMENT_QUOTE), lineOf(lines, "### 후속")] }]);
		assertMsgIncludes(findDecisionViolations(lines, FILE_ID)[0].msg, ['(인용 "> **#30 amendment (상태는 active)" 외 1줄)']);
	});

	for (const [label, stray, summary] of [
		["1칸 들여쓰기", " - **후속**: 한 칸.", '(1칸만 들여쓴 줄 "- **후속**: 한 칸.")'],
		["탭 들여쓰기", "\t- **정정**: 탭.", '(탭으로 들여쓴 줄 "- **정정**: 탭.")'],
		["표", "| 결정 | 값 |", '(표 "| 결정 | 값 |")'],
		["코드 펜스", "```md", '(코드 펜스 "```md")'],
		["구분선", "---", '(구분선 "---")'],
		["단락", "맨 단락.", '(단락 "맨 단락.")'],
	]) {
		it(`문구가 줄의 모양을 알린다 — ${label}`, () => {
			const [violation] = findDecisionViolations(listFile({ tail: [stray] }), FILE_ID);

			assertMsgIncludes(violation.msg, [summary]);
		});
	}

	it("최상위 펜스는 여는 줄만 낸다 — 펜스 안의 줄은 싣지 않고, 닫힌 뒤의 이력 항목은 잡는다", () => {
		const lines = listFile({ tail: ["```md", "## 옛 모양", "# 예시 제목", CORRECTION_ITEM, "```", FOLLOW_UP_ITEM] });

		assert.deepEqual(found(lines), [
			{ kind: "stray-block", lines: [lineOf(lines, "```md")] },
			{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM)] },
		]);
	});

	it("들여쓴 펜스 안이라도 줄 머리에 적은 줄은 최상위 줄이다", () => {
		const lines = listFile({ tail: ["  ```md", "## 옛 모양", "  ```", FOLLOW_UP_ITEM] });

		assert.deepEqual(found(lines), [
			{ kind: "stray-block", lines: [lineOf(lines, "## 옛 모양")] },
			{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM)] },
		]);
	});

	it("문구가 고칠 방법을 알린다 — 조항의 내용이면 들여쓰고, 덧댄 것이면 조항을 고쳐 쓰고 지운다", () => {
		const [violation] = findDecisionViolations(listFile({ tail: [AMENDMENT_QUOTE] }), FILE_ID);

		assertMsgIncludes(violation.msg, [
			`Decision ${ID}(목록 꼴)의 최상위에 \`- **라벨**\` 항목이 아닌 줄이 있습니다`,
			"최상위 줄(공백 들여쓰기 2칸 미만)은 전부 `- **라벨**` 로 시작합니다",
			"그 항목 아래로 공백 2칸 이상 들여씁니다",
			"해당 조항을 지금 참인 것만 남게 고쳐 쓰고 이 줄은 지웁니다",
		]);
	});
});

describe("decisions — `# ` 제목은 첫 줄 하나뿐이다 (extra-title, 소제목 꼴)", () => {
	for (const [label, title] of [
		["덧붙인 제목", "# 부록"],
		["또 다른 Decision 헤더", "# Decision #101: 한 파일에 든 둘째 결정"],
		["글자 없는 제목", "#"],
	]) {
		it(label, () => {
			const lines = headingFile({ tail: ["", title, "", "## 관련"] });

			assert.deepEqual(found(lines), [{ kind: "extra-title", lines: [lastLineOf(lines, title)] }]);
		});
	}

	it("여러 줄은 한 건으로 묶는다", () => {
		const lines = headingFile({ tail: ["", "# 부록 A", "", "# 부록 B"] });
		const [violation, ...rest] = findDecisionViolations(lines, FILE_ID);

		assert.deepEqual(rest, []);
		assert.deepEqual(violation.lines, [lineOf(lines, "# 부록 A"), lineOf(lines, "# 부록 B")]);
		assertMsgIncludes(violation.msg, ['("# 부록 A" 외 1줄)']);
	});

	it("들여쓴 `# ` 줄 · `#` 뒤에 공백이 없는 줄은 제목이 아니다", () => {
		assert.deepEqual(found(headingFile({ tail: ["", "- 항목:", "  # 들여쓴 줄", "#455 로 넘긴다."] })), []);
	});

	it("문구가 고칠 방법을 알린다", () => {
		const [violation] = findDecisionViolations(headingFile({ tail: ["", "# 부록"] }), FILE_ID);

		assertMsgIncludes(violation.msg, [
			`Decision ${ID}(소제목 꼴)에 \`# \` 제목이 첫 줄 말고 또 있습니다`,
			"구획이면 `## ` 소제목으로 낮추고",
			"다른 Decision 이면 제 파일로 나눕니다",
			"코드 펜스 안에 둡니다",
		]);
	});
});

describe("decisions — 이력 이름의 항목 · 소제목을 두지 않는다 (history-label)", () => {
	for (const [label, item] of [
		["후속 + 이슈 · 날짜", FOLLOW_UP_ITEM],
		["후속 한 낱말", "- **후속**: 규칙 lint 도입은 별도 결정으로."],
		["후속 뒤에 낱말", "- **후속 교정**: 화면은 자체 바깥 틀을 그리지 않는다."],
		["정정", CORRECTION_ITEM],
		["번복", "- **번복 (#60)**: 결정 2 를 되돌린다."],
		["적용 기록", "- **적용 기록**: 문서 → 큰 표 3곳."],
		["개정", "- **개정**: 결정 3 의 기본값을 바꾼다."],
		["보강", "- **보강 (#20)**: 한 번 더 거른다."],
		["재결정 사유", "- **재결정 사유**: 옛 방식으로는 범위를 좁힐 수 없었다."],
		["갱신", "- **갱신 (2026-01-04)**: 결정 2 의 한도를 올렸다."],
		["부분 수정", "- **부분 수정**: 저장소를 바꾼다."],
		["부분 갱신", "- **결정 3 부분 갱신(#20)**: 생산자가 사라져 타입이 하나가 됐다."],
		["amend", "- **amend (2026-01)**: 결정 4 를 좁힌다."],
		["amendment — 대소문자 무시", "- **Amendment**: 결정 4 를 좁힌다."],
		["괄호가 바로 붙은 amendment", "- **amendment(#20) — 읽기 경로.** 본문."],
		["이슈 번호가 앞선 후속", "- **#50 후속**: 로컬 원천을 거둔다."],
		["날짜가 앞선 정정", "- **2026-01-03 정정**: 위치를 맞췄다."],
		["괄호가 앞선 보강", "- **(#20) 보강**: 한 번 더 거른다."],
		["대괄호 안의 날짜가 앞선 정정", "- **[2026-01] 정정**: 단계의 순서를 바로잡았다."],
		["Decision 번호가 앞선 부분 수정", "- **Decision 7 부분 수정**: 저장소를 바꾼다."],
		["번호만 굵게 쓴 부분 수정", "- **Decision 7** 부분 수정: 저장소를 바꾼다."],
		["재개정", "- **재개정 (#30)**: 결정 2 를 다시 좁힌다."],
		["반전", "- **#30 반전**: 결정 2 를 뒤집는다."],
		["부분 대체", "- **Decision 7 부분 대체**: 저장소를 바꾼다."],
		["부분 폐기", "- **부분 폐기(#30)**: 결정 2 는 없다."],
		["조항 번호가 앞선 개정", "- **Decision 7 §3 개정**: 기본값을 바꾼다."],
		["이름 안 괄호의 개정", "- **결과 (개정)**: 저장소가 둘이다."],
		["이름 안 괄호의 개정 + 번호", "- **검증(개정 2)**: 다시 쟀다."],
	]) {
		it(`목록 꼴 — ${label}`, () => {
			const lines = listFile({ tail: [item] });

			assert.deepEqual(found(lines), [{ kind: "history-label", lines: [lineOf(lines, item)] }]);
		});
	}

	for (const [label, heading] of [
		["갱신", "## 갱신"],
		["갱신 + 날짜", "## 갱신 (2026-01-04)"],
		["개정 이력", "## 개정 이력"],
		["후속 + 이슈", "## 후속 (#50)"],
		["정정", "## 정정"],
		["번복", "## 번복"],
		["보강", "## 보강"],
		["재결정", "## 재결정 사유"],
		["적용 기록", "## 적용 기록"],
		["부분 수정", "## 부분 수정"],
		["Amendment — 대소문자 무시", "## Amendment 1"],
		["이슈 번호가 앞선 후속", "## #50 후속"],
		["날짜가 앞선 정정", "## 2026-01-03 정정"],
		["Decision 번호가 앞선 부분 수정", "## Decision 7 부분 수정"],
		["굵게 쓴 이름", "## **보강**"],
		["재개정", "## 재개정 (#30 QA)"],
		["반전", "## #30 반전"],
		["부분 대체", "## Decision 7 부분 대체"],
		["다른 Decision 절의 재개정", '## Decision 7 "Decision 3 개정" 절 재개정'],
		["이름 안 괄호의 개정", "## 결과 (개정)"],
		["이름 안 괄호의 재개정", "## 도입 (재개정, QA)"],
		["이름 안 괄호의 개정 — 붙여 쓴 것", "## 결과(개정 2)"],
	]) {
		it(`소제목 꼴 — ${label}`, () => {
			const lines = headingFile({ tail: ["", heading, "", "덧붙인 내용."] });

			assert.deepEqual(found(lines), [{ kind: "history-label", lines: [lineOf(lines, heading)] }]);
		});
	}

	it("블록 시작 줄이 이력 이름이어도 잡는다", () => {
		assert.deepEqual(found([`# Decision ${ID}: ${TITLE}`, "", "## 갱신", "", "본문."]), [{ kind: "history-label", lines: [3] }]);
		assert.deepEqual(found([`# Decision ${ID}: ${TITLE}`, "", "- **후속**: 본문."]), [{ kind: "history-label", lines: [3] }]);
	});

	it("한 파일의 여러 항목은 한 건으로 묶는다 — 사이에 낀 다른 항목은 싣지 않는다", () => {
		const lines = listFile({ tail: [FOLLOW_UP_ITEM, "- **관련**: Decision #50.", CORRECTION_ITEM] });

		assert.deepEqual(found(lines), [{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM), lineOf(lines, CORRECTION_ITEM)] }]);
		assertMsgIncludes(findDecisionViolations(lines, FILE_ID)[0].msg, ['"후속 (#50, 2026-01-02)" 외 1개']);
	});

	it("한 파일의 여러 소제목은 한 건으로 묶는다", () => {
		const lines = headingFile({ tail: ["", "## 갱신 (2026-01-04)", "", "## 관련", "", "## 정정"] });

		assert.deepEqual(found(lines), [{ kind: "history-label", lines: [lineOf(lines, "## 갱신"), lineOf(lines, "## 정정")] }]);
		assertMsgIncludes(findDecisionViolations(lines, FILE_ID)[0].msg, ['"갱신 (2026-01-04)" 외 1개']);
	});

	for (const [label, line] of [
		["폐기 조건", "- **폐기 조건**: 서버가 밖으로 옮겨 가면 다시 따진다."],
		["폐기된 대안", "- **폐기된 대안**: 큐를 따로 두는 것."],
		["대체 관계", "- **대체 관계**: Decision 3 을 대신한다."],
		["넘어간 것 (후속 …)", "- **넘어간 것 (후속 이슈)**: 결정 4 는 없다."],
		["내용 안의 괄호는 보지 않는다", "- **결정**: 기본값은 30초다 (개정 전 값은 적지 않는다)."],
	]) {
		it(`목록 꼴 — 지금 참인 이름은 통과한다: ${label}`, () => {
			assert.deepEqual(found(listFile({ tail: [line] })), []);
		});
	}

	for (const heading of ["## 폐기 조건", "## 폐기된 대안", "## 대체 관계", "## 넘어간 것 (후속 이슈)"]) {
		it(`소제목 꼴 — 지금 참인 이름은 통과한다: ${heading}`, () => {
			assert.deepEqual(found(headingFile({ tail: ["", heading, "", "내용."] })), []);
		});
	}

	it("소제목 꼴은 `## ` 소제목만 본다 — 구획 안의 `### ` 소제목과 목록 항목의 이름은 보지 않는다", () => {
		assert.deepEqual(found(headingFile({ tail: ["", "### 갱신", "", "- **후속**: 구획 안의 항목."] })), []);
	});

	it("목록 꼴은 최상위 항목만 본다 — 들여쓴 항목의 이름은 보지 않는다", () => {
		assert.deepEqual(found(listFile({ tail: ["  - **후속**: 조항 안의 항목."] })), []);
	});

	it("문구가 고칠 방법을 알린다", () => {
		const [item] = findDecisionViolations(listFile({ tail: [FOLLOW_UP_ITEM] }), FILE_ID);
		const [heading] = findDecisionViolations(headingFile({ tail: ["", "## 갱신"] }), FILE_ID);

		assertMsgIncludes(item.msg, [`Decision ${ID} 에 이력 항목을 덧붙였습니다`, "두 번째 권위가 됩니다", "현행 규칙은 해당 조항에 녹이고 이 항목은 없앱니다"]);
		assertMsgIncludes(heading.msg, [`Decision ${ID} 에 이력 소제목을 덧붙였습니다("갱신")`, "두 번째 권위가 됩니다", "이 소제목과 그 아래 내용은 없앱니다"]);
	});
});

describe("decisions — formatFindings", () => {
	it("위반마다 문구 한 줄과 그 아래 고칠 자리를 낸다", () => {
		const out = formatFindings([
			{ kind: "stray-block", msg: "문구 1", at: ["docs/d/7.md:5", "docs/d/7.md:9"] },
			{ kind: "missing-target", msg: "문구 2", at: ["docs/e"] },
		]);

		assert.deepEqual(out, ["[stray-block] 문구 1", "    docs/d/7.md:5", "    docs/d/7.md:9", "[missing-target] 문구 2", "    docs/e"]);
	});

	it("위반이 없으면 빈 배열이다", () => {
		assert.deepEqual(formatFindings([]), []);
	});
});

describe("decisions — run", () => {
	const ARCH = "docs/architecture-decisions";
	const HARNESS = "docs/harness-decisions";
	const text = (lines) => lines.join("\n");
	const HEADING = (id) => text(headingFile({ id }));
	const LIST = (id) => text(listFile({ id }));
	const TOMBSTONE = (id) => text([`# Decision ${id}: ${TITLE}`, "", DEAD_BANNER, "", "옛 본문."]);
	/** 덧댄 것이 남은 목록 꼴 — 도입 줄 뒤의 인용(head-overlay)과 이력 항목(history-label). */
	const DIRTY = (id) => text(listFile({ id, head: [AMENDMENT_QUOTE], tail: [FOLLOW_UP_ITEM] }));

	function runIn(t, files, section = {}) {
		const root = makeRepo(t, files);
		const out = captureConsole(t);
		const code = run({ root, options: resolveOptions("decisions", schema, section) });
		return { code, out: out.join("\n") };
	}

	it("기본 대상은 두 결정 기록 폴더다 — 둘 다 정합이면 폴더마다 OK 한 줄", (t) => {
		const { code, out } = runIn(t, {
			[`${ARCH}/6-1.md`]: HEADING("#6-1"),
			[`${ARCH}/39.md`]: LIST("39"),
			[`${ARCH}/archive/3.md`]: TOMBSTONE("3"),
			[`${HARNESS}/1.md`]: HEADING("1"),
		});

		assert.equal(code, 0);
		assert.equal(out, [`check-decisions: ${ARCH} OK — active 2개 · archive 1개`, `check-decisions: ${HARNESS} OK — active 1개 · archive 0개`].join("\n"));
	});

	it("기본 dirs 중 하나만 있는 저장소는 실패한다 (missing-target) — 있는 것만 보고 통과하지 않는다", (t) => {
		const { code, out } = runIn(t, { [`${ARCH}/39.md`]: LIST("39") });

		assert.equal(code, 1);
		assert.match(out, /\[missing-target\] 결정 기록 폴더 docs\/harness-decisions 가 없습니다/);
		assert.match(out, /harness\.config\.json checks\.decisions\.dirs/);
		assert.match(out, /\n {4}docs\/harness-decisions\n/);
		assert.match(out, /check-decisions: docs\/architecture-decisions OK — active 1개 · archive 0개/);
		assert.match(out, /check-decisions: 1건 위반$/);
	});

	it("결정 기록 폴더가 하나뿐인 저장소는 dirs 에 그 하나만 적는다", (t) => {
		assert.equal(runIn(t, { [`${ARCH}/39.md`]: LIST("39") }, { dirs: [ARCH] }).code, 0);
	});

	it("dirs 설정을 따른다 — 다른 경로의 폴더, `./` 접두와 끝의 `/` 는 무시한다", (t) => {
		const { code, out } = runIn(t, { "notes/decisions/7.md": DIRTY("7"), [`${ARCH}/39.md`]: LIST("39") }, { dirs: ["./notes/decisions/"] });

		assert.equal(code, 1);
		assert.match(out, /\n {4}notes\/decisions\/7\.md:4\n/);
		assert.doesNotMatch(out, /architecture-decisions/);
	});

	it("dirs 의 경로가 폴더가 아니라 파일이면 없는 폴더다 (missing-target)", (t) => {
		const { code, out } = runIn(t, { "docs/architecture-decisions.md": "폴더로 옮겼다." }, { dirs: ["docs/architecture-decisions.md"] });

		assert.equal(code, 1);
		assert.match(out, /\[missing-target\]/);
	});

	it("Decision 파일이 하나도 없는 폴더는 실패한다 (empty-target) — README.md · 다른 확장자 · 하위 폴더는 Decision 이 아니다", (t) => {
		const { code, out } = runIn(
			t,
			{ [`${ARCH}/README.md`]: "# 쓰는 법", [`${ARCH}/notes.txt`]: "메모", [`${ARCH}/drafts/9.md`]: HEADING("9") },
			{ dirs: [ARCH] },
		);

		assert.equal(code, 1);
		assert.match(out, /\[empty-target\] 결정 기록 폴더 docs\/architecture-decisions 에 Decision 파일이 하나도 없습니다/);
		assert.match(out, /\n {4}docs\/architecture-decisions\n/);
	});

	it("archive 에만 파일이 있어도 빈 폴더가 아니다", (t) => {
		const { code, out } = runIn(t, { [`${ARCH}/archive/3.md`]: TOMBSTONE("3") }, { dirs: [ARCH] });

		assert.equal(code, 0);
		assert.match(out, /OK — active 0개 · archive 1개/);
	});

	it("README.md 는 건너뛴다 — 폴더 바로 아래와 archive 양쪽에서", (t) => {
		const { code, out } = runIn(
			t,
			{
				[`${ARCH}/README.md`]: "# 결정 기록 쓰는 법\n\n> 안내.\n\n# 또 제목",
				[`${ARCH}/archive/README.md`]: "현행이 아닌 Decision 을 둔다.",
				[`${ARCH}/39.md`]: LIST("39"),
			},
			{ dirs: [ARCH] },
		);

		assert.equal(code, 0);
		assert.match(out, /OK — active 1개 · archive 0개/);
	});

	it("`.md` 가 아닌 파일 · archive 밖의 하위 폴더 · archive 안의 하위 폴더는 보지 않는다", (t) => {
		const { code, out } = runIn(
			t,
			{
				[`${ARCH}/39.md`]: LIST("39"),
				[`${ARCH}/diagram.svg`]: "<svg/>",
				[`${ARCH}/39.md.bak`]: "백업",
				[`${ARCH}/drafts/40.md`]: "# 초안",
				[`${ARCH}/archive/old/2.md`]: "# 옛 메모",
			},
			{ dirs: [ARCH] },
		);

		assert.equal(code, 0);
		assert.match(out, /OK — active 1개 · archive 0개/);
	});

	it("폴더 바로 아래에 둔 `.md` 는 이름이 무엇이든 Decision 으로 읽는다 — Decision 이 아닌 문서는 bad-head", (t) => {
		const { code, out } = runIn(t, { [`${ARCH}/39.md`]: LIST("39"), [`${ARCH}/guide.md`]: "# 안내" }, { dirs: [ARCH] });

		assert.equal(code, 1);
		assert.match(out, /\[bad-head\] 첫 줄이 `# Decision <식별자>: <제목>` 이 아닙니다/);
		assert.match(out, /\n {4}docs\/architecture-decisions\/guide\.md:1\n/);
	});

	it("같은 이름의 파일이 폴더 바로 아래와 archive 양쪽에 있으면 실패한다 (duplicate-id)", (t) => {
		const { code, out } = runIn(t, { [`${ARCH}/3.md`]: LIST("3"), [`${ARCH}/archive/3.md`]: TOMBSTONE("3"), [`${ARCH}/39.md`]: LIST("39") }, { dirs: [ARCH] });

		assert.equal(code, 1);
		assert.match(out, /\[duplicate-id\] 3\.md 이 docs\/architecture-decisions 바로 아래와 archive\/ 양쪽에 있습니다/);
		assert.match(out, /\n {4}docs\/architecture-decisions\/3\.md:1\n {4}docs\/architecture-decisions\/archive\/3\.md:1\n/);
		assert.match(out, /check-decisions: 1건 위반$/);
	});

	it("위반마다 `[kind] 설명` 한 줄과 고칠 자리 `경로:줄` 을 내고, 다른 폴더를 끝까지 본 뒤 전체 건수로 실패한다", (t) => {
		const { code, out } = runIn(t, { [`${ARCH}/7.md`]: DIRTY("7"), [`${ARCH}/39.md`]: LIST("39"), [`${HARNESS}/1.md`]: HEADING("1") });

		assert.equal(code, 1);
		assert.match(out, /\[head-overlay\] Decision 7 은 도입 줄과 본문 블록 사이에[^\n]*\n {4}docs\/architecture-decisions\/7\.md:4\n/);
		assert.match(out, /\[history-label\] Decision 7 에 이력 항목을[^\n]*\n {4}docs\/architecture-decisions\/7\.md:9\n/);
		assert.doesNotMatch(out, /architecture-decisions OK/);
		assert.match(out, /check-decisions: docs\/harness-decisions OK — active 1개 · archive 0개/);
		assert.match(out, /check-decisions: 2건 위반$/);
	});

	it("파일은 번호 순으로 본다 — 6-1 이 39 앞, active 다음에 archive", (t) => {
		const bad = "# 메모";
		const { out } = runIn(t, { [`${ARCH}/39.md`]: bad, [`${ARCH}/6-1.md`]: bad, [`${ARCH}/100.md`]: bad, [`${ARCH}/archive/3.md`]: bad }, { dirs: [ARCH] });

		assert.deepEqual(
			out.split("\n").filter((line) => line.startsWith("    ")),
			["6-1.md", "39.md", "100.md", "archive/3.md"].map((file) => `    ${ARCH}/${file}:1`),
		);
	});

	it("archive 파일은 머리만 본다 — 본문의 배너 · 이력 항목은 통과, 식별자가 어긋나면 실패", (t) => {
		assert.equal(runIn(t, { [`${ARCH}/archive/7.md`]: DIRTY("7"), [`${ARCH}/archive/3.md`]: TOMBSTONE("3") }, { dirs: [ARCH] }).code, 0);

		const { code, out } = runIn(t, { [`${ARCH}/archive/3.md`]: TOMBSTONE("4") }, { dirs: [ARCH] });

		assert.equal(code, 1);
		assert.match(out, /\[id-mismatch\][^\n]*\n {4}docs\/architecture-decisions\/archive\/3\.md:1\n/);
	});

	it("CRLF 줄바꿈 · BOM 이 붙은 파일도 같은 판정이다", (t) => {
		const files = { [`${ARCH}/39.md`]: `﻿${LIST("39").replaceAll("\n", "\r\n")}`, [`${ARCH}/6-1.md`]: HEADING("#6-1").replaceAll("\n", "\r\n") };

		assert.equal(runIn(t, files, { dirs: [ARCH] }).code, 0);
	});

	it("dirs 가 비면 실패한다 (공회전)", (t) => {
		assert.equal(runIn(t, { [`${ARCH}/39.md`]: LIST("39") }, { dirs: [] }).code, 1);
	});

	describe("pending — 아직 정리하지 못한 파일", () => {
		it("보류 파일의 위반은 내지도 실패로 치지도 않는다 — OK 줄에 보류 수를 덧붙인다", (t) => {
			const { code, out } = runIn(
				t,
				{ [`${ARCH}/7.md`]: DIRTY("7"), [`${ARCH}/8.md`]: DIRTY("8"), [`${ARCH}/39.md`]: LIST("39") },
				{ dirs: [ARCH], pending: [`${ARCH}/7.md`, `${ARCH}/8.md`] },
			);

			assert.equal(code, 0);
			assert.equal(out, `check-decisions: ${ARCH} OK — active 3개 · archive 0개 · 보류 2개`);
		});

		it("보류하지 않은 파일의 위반은 그대로 실패다", (t) => {
			const { code, out } = runIn(t, { [`${ARCH}/7.md`]: DIRTY("7"), [`${ARCH}/8.md`]: DIRTY("8") }, { dirs: [ARCH], pending: [`${ARCH}/7.md`] });

			assert.equal(code, 1);
			assert.match(out, /architecture-decisions\/8\.md:4/);
			assert.doesNotMatch(out, /architecture-decisions\/7\.md/);
			assert.match(out, /check-decisions: 2건 위반$/);
		});

		it("archive 파일의 머리 위반도 보류할 수 있다", (t) => {
			const { code, out } = runIn(t, { [`${ARCH}/archive/3.md`]: "옛 메모" }, { dirs: [ARCH], pending: [`${ARCH}/archive/3.md`] });

			assert.equal(code, 0);
			assert.match(out, /OK — active 0개 · archive 1개 · 보류 1개/);
		});

		it("`./` 접두로 적은 경로도 같은 파일이다", (t) => {
			assert.equal(runIn(t, { [`${ARCH}/7.md`]: DIRTY("7") }, { dirs: [ARCH], pending: [`./${ARCH}/7.md`] }).code, 0);
		});

		it("stale-pending: 위반이 없어진 파일이 목록에 남아 있으면 실패한다", (t) => {
			const { code, out } = runIn(t, { [`${ARCH}/7.md`]: LIST("7") }, { dirs: [ARCH], pending: [`${ARCH}/7.md`] });

			assert.equal(code, 1);
			assert.match(out, /check-decisions: docs\/architecture-decisions OK — active 1개 · archive 0개\n/);
			assert.match(out, /\[stale-pending\] docs\/architecture-decisions\/7\.md 에 위반이 없습니다/);
			assert.match(out, /harness\.config\.json checks\.decisions\.pending 에서 이 경로를 지웁니다/);
			assert.match(out, /\n {4}harness\.config\.json\n/);
			assert.match(out, /check-decisions: 1건 위반$/);
		});

		it("stale-pending: 없는 파일이 목록에 남아 있으면 실패한다", (t) => {
			const { code, out } = runIn(t, { [`${ARCH}/39.md`]: LIST("39") }, { dirs: [ARCH], pending: [`${ARCH}/7.md`] });

			assert.equal(code, 1);
			assert.match(out, /\[stale-pending\] docs\/architecture-decisions\/7\.md 파일이 없습니다/);
		});

		it("stale-pending: 검사 대상 Decision 파일이 아닌 경로도 낡은 항목이다", (t) => {
			const { code, out } = runIn(
				t,
				{ [`${ARCH}/39.md`]: LIST("39"), [`${ARCH}/README.md`]: "# 쓰는 법", "docs/notes.md": "메모" },
				{ dirs: [ARCH], pending: [`${ARCH}/README.md`, "docs/notes.md"] },
			);

			assert.equal(code, 1);
			assert.match(out, /\[stale-pending\] docs\/architecture-decisions\/README\.md 는 검사 대상 Decision 파일이 아닙니다/);
			assert.match(out, /\[stale-pending\] docs\/notes\.md 는 검사 대상 Decision 파일이 아닙니다/);
			assert.match(out, /check-decisions: 2건 위반$/);
		});

		it("같은 경로를 두 번 적어도 한 건이다", (t) => {
			const { out } = runIn(t, { [`${ARCH}/7.md`]: LIST("7") }, { dirs: [ARCH], pending: [`${ARCH}/7.md`, `./${ARCH}/7.md`] });

			assert.match(out, /check-decisions: 1건 위반$/);
		});

		it("폴더 단위 위반(duplicate-id)은 가리지 않는다", (t) => {
			const { code, out } = runIn(t, { [`${ARCH}/3.md`]: DIRTY("3"), [`${ARCH}/archive/3.md`]: TOMBSTONE("3") }, { dirs: [ARCH], pending: [`${ARCH}/3.md`] });

			assert.equal(code, 1);
			assert.match(out, /\[duplicate-id\]/);
			assert.doesNotMatch(out, /\[head-overlay\]/);
			assert.match(out, /check-decisions: 1건 위반$/);
		});
	});

	describe("설정", () => {
		it("기본값 — 두 폴더, 빈 보류 목록", () => {
			assert.deepEqual(resolveOptions("decisions", schema, {}), { dirs: [ARCH, HARNESS], pending: [] });
		});

		it("모르는 설정 키는 실패한다", () => {
			assert.throws(() => resolveOptions("decisions", schema, { docs: [ARCH] }), ConfigError);
		});

		it("pending 은 문자열의 배열이다", () => {
			assert.throws(() => resolveOptions("decisions", schema, { pending: `${ARCH}/7.md` }), ConfigError);
			assert.throws(() => resolveOptions("decisions", schema, { pending: [{ file: `${ARCH}/7.md`, why: "정리 전" }] }), ConfigError);
		});
	});
});

describe("decisions — 켜야 돈다 (새 판을 받는 것만으로는 아무 저장소에서도 돌지 않는다)", () => {
	const KNOWN = Object.keys(CHECKS);

	it("검사로 등록돼 있다", () => {
		assert.ok(KNOWN.includes("decisions"));
		assert.equal(CHECKS.decisions.run, run);
	});

	it("`all` 은 package.json 의 check:* 만 돌린다 — 스크립트가 없는 저장소에서는 이 검사가 불리지 않는다", () => {
		const scripts = { check: "mongshell-check all", "check:journal": "mongshell-check journal", "check:ui-barrel": "mongshell-check ui-barrel" };

		assert.deepEqual(selectCheckScripts(scripts).names, ["check:journal", "check:ui-barrel"]);
	});

	it("켜지 않은 저장소는 새 판을 받아도 설정 검증에 걸리지 않는다", () => {
		const pkg = { scripts: { "check:journal": "mongshell-check journal", "check:ui-barrel": "mongshell-check ui-barrel" } };
		const config = { checks: { journal: {}, "ui-barrel": {} } };

		assert.deepEqual(validateConfigShape(config, enabledCheckNames(pkg), KNOWN), []);
	});

	it("켜지 않은 저장소가 섹션만 적어 두면 낡은 설정으로 실패한다", () => {
		const problems = validateConfigShape({ checks: { decisions: {} } }, ["journal"], KNOWN);

		assert.equal(problems.length, 1);
		assert.match(problems[0], /check:decisions 가 없어 쓰이지 않는 설정/);
	});
});
