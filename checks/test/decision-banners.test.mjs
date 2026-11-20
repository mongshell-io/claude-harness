import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	checkDecisionDoc,
	findDecisionBannerViolations,
	formatDocCheck,
	parseDecisionSections,
	parseStatusIndex,
	run,
	schema,
} from "../checks/decision-banners.mjs";
import { ConfigError, enabledCheckNames, resolveOptions, validateConfigShape } from "../lib/config.mjs";
import { CHECKS } from "../lib/registry.mjs";
import { selectCheckScripts } from "../lib/run-all.mjs";
import { captureConsole, makeRepo } from "./helpers.mjs";

/** 인덱스 표의 첫 데이터 행 앞에 오는 줄들. */
const PREAMBLE = ["# Architecture Decisions", "", "## 상태 인덱스", "", "| # | 결정 한 줄 | 상태 |", "|---|-----------|------|"];
/** 첫 인덱스 행의 줄 번호(1부터). */
const FIRST_ROW_LINE = PREAMBLE.length + 1;
/** 따로 정하지 않은 인덱스 행과 본문 헤더가 함께 쓰는 제목. */
const TITLE = "제목";

/** 인덱스 행 — `[번호, 상태, 제목?]` 으로 주면 3칸 행을 만들고, 문자열로 주면 적힌 그대로 놓는다. */
function indexRow(row) {
	if (typeof row === "string") return row;
	const [num, status, title = TITLE] = row;
	return `| ${num} | ${title} | ${status} |`;
}

/** 인덱스 행들과 본문 조각들로 최소 문서를 만든다 — 행은 `FIRST_ROW_LINE` 부터 차례로 놓인다. */
function doc(rows, bodies = []) {
	return [...PREAMBLE, ...rows.map(indexRow), "", "---", "", ...bodies.flatMap((body) => [...body, ""])];
}

/** 현행 Decision 본문 — 헤더, 헤더와 도입 줄 사이에 끼울 줄들, `- **도입**:` 줄, 본문. */
function decision(num, headLines = [], title = TITLE) {
	return [`## Decision ${num}: ${title}`, "", ...headLines.flatMap((line) => [line, ""]), "- **도입**: v1.0.0 (#1)", "- **결정**: 본문."];
}

/** 전부 현행이 아닌 Decision — 헤더와 상태 배너 1줄만 남는다. */
function tombstone(num, banner) {
	return [`## Decision ${num}: ${TITLE}`, "", banner];
}

/** 그 글자로 시작하는 첫 줄의 번호(1부터). */
function lineOf(lines, prefix) {
	const at = lines.findIndex((l) => l.startsWith(prefix));
	if (at === -1) throw new Error(`fixture 에 "${prefix}" 로 시작하는 줄이 없다`);
	return at + 1;
}

/** 그 글자와 똑같은 마지막 줄의 번호(1부터) — 인덱스 아래 구분선처럼 앞에 같은 줄이 있을 때 쓴다. */
function lastLineOf(lines, text) {
	const at = lines.lastIndexOf(text);
	if (at === -1) throw new Error(`fixture 에 "${text}" 줄이 없다`);
	return at + 1;
}

/** 위반의 종류와 고칠 자리만 — 문구는 따로 단언한다. */
function found(lines) {
	return findDecisionBannerViolations(lines).map(({ kind, lines: at }) => ({ kind, lines: at }));
}

function kindsOf(lines) {
	return findDecisionBannerViolations(lines).map((v) => v.kind);
}

/** 문구가 조각을 전부 담고 있다. */
function assertMsgIncludes(msg, parts) {
	for (const part of parts) assert.ok(msg.includes(part), `문구에 "${part}" 가 없다:\n${msg}`);
}

/** 위반 문구가 원문 보관처를 가리키는 말. */
const ARCHIVE_HINT = "그 결정 기록의 archive";

const DEAD_BANNER = "> **폐기 — superseded by #20**: 소비처 소멸. 원문: [archive](decisions-archive.md)";
const SUPERSEDED_BANNER = "> **superseded by D9**: 원문은 archive.";
const PARTIAL_BANNER = "> **부분 — 결정 3 폐기**: 사유.";
const SUMMARY_QUOTE = "> **결정 한 줄 (전체)**: 인덱스 칸에서 내린 요약 — amendment 로 바뀐 것까지 담았다.";
const AMENDMENT_QUOTE = "> **#30 amendment (상태는 active)**: 결정 2 의 기본값이 바뀌었다.";
const DETAIL_QUOTE = "> **현행 상태 (세부)**: active (**#40 결정 6 이 amend** — 강제 값 대신 기본값을 따른다)";
const UNLABELLED_QUOTE = "> historical — 본문의 「N주」 서술은 뒤 결정으로 일 단위가 됐다.";
const FOLLOW_UP_ITEM = "- **후속 (#50, 2026-01-02)** — 결정 6 의 「로컬 원천」 을 거둔다:";
const CORRECTION_ITEM = "- **정정 (2026-01-03)**: 넓은 화면에서 위치가 다른 탭과 달랐다.";

describe("decision-banners — parseStatusIndex", () => {
	it("번호는 # 접두를 보존하고, 제목 · 상태 칸과 칸 수 · 줄 번호를 읽는다", () => {
		const index = parseStatusIndex(
			doc([
				["7", "active"],
				["#12", "폐기 — superseded by #20"],
				["6-1", "superseded → D9", "숫자 변환 규칙"],
			]),
		);

		assert.deepEqual(
			index,
			new Map([
				["7", { title: TITLE, status: "active", cellCount: 3, line: FIRST_ROW_LINE }],
				["#12", { title: TITLE, status: "폐기 — superseded by #20", cellCount: 3, line: FIRST_ROW_LINE + 1 }],
				["6-1", { title: "숫자 변환 규칙", status: "superseded → D9", cellCount: 3, line: FIRST_ROW_LINE + 2 }],
			]),
		);
	});

	it("칸 수는 적힌 그대로 센다 — 넷째 칸 · 빈 넷째 칸 · 모자란 칸", () => {
		const index = parseStatusIndex(doc(["| 7 | 제목 | active | amend #50 |", "| 8 | 제목 | active | |", "| 9 | 제목 |"]));

		assert.deepEqual(
			[...index].map(([num, row]) => [num, row.cellCount, row.status]),
			[
				["7", 4, "active"],
				["8", 4, "active"],
				["9", 2, ""],
			],
		);
	});

	it("`\\|` 는 칸을 가르지 않고 `|` 글자로 읽는다", () => {
		const row = parseStatusIndex(doc([["7", "active", "키는 `a \\| b` 타입"]])).get("7");

		assert.equal(row.title, "키는 `a | b` 타입");
		assert.equal(row.cellCount, 3);
	});

	it("다음 ## 제목에서 끝난다 — 본문의 표는 인덱스가 아니다", () => {
		const lines = [...doc([["7", "active"]]), "## Decision 7: 제목", "", "| 8 | 본문 속 표 | 폐기 |"];

		assert.deepEqual([...parseStatusIndex(lines).keys()], ["7"]);
	});

	it("섹션이 없으면 null 이다", () => {
		assert.equal(parseStatusIndex(["# Architecture Decisions", "", "## Decision 7: 제목"]), null);
	});
});

describe("decision-banners — parseDecisionSections", () => {
	it("헤더 제목 · 배너와, 도입 줄을 경계로 나눈 head · body 의 비어 있지 않은 줄을 읽는다", () => {
		const active = [
			"## Decision #100:  도입 줄이 있는 Decision ",
			"",
			DETAIL_QUOTE,
			"",
			"- **도입**: v1.0.0 (#1)",
			"  - 들여쓴 줄.",
			"",
			UNLABELLED_QUOTE,
		];
		const lines = doc([], [active, tombstone("3", DEAD_BANNER)]);
		const detailLine = lineOf(lines, DETAIL_QUOTE);
		const introLine = lineOf(lines, "- **도입**:");
		const deadBannerLine = lineOf(lines, DEAD_BANNER);

		assert.deepEqual(
			parseDecisionSections(lines),
			new Map([
				[
					"#100",
					{
						line: lineOf(lines, "## Decision #100:"),
						title: "도입 줄이 있는 Decision",
						banner: { label: "현행 상태 (세부)", line: detailLine },
						hasIntro: true,
						head: [{ text: DETAIL_QUOTE, line: detailLine }],
						body: [
							{ text: "- **도입**: v1.0.0 (#1)", line: introLine },
							{ text: "  - 들여쓴 줄.", line: introLine + 1 },
							{ text: UNLABELLED_QUOTE, line: lineOf(lines, UNLABELLED_QUOTE) },
						],
					},
				],
				[
					"3",
					{
						line: lineOf(lines, "## Decision 3:"),
						title: TITLE,
						banner: { label: "폐기 — superseded by #20", line: deadBannerLine },
						hasIntro: false,
						head: [],
						body: [{ text: DEAD_BANNER, line: deadBannerLine }],
					},
				],
			]),
		);
	});

	it("Decision 이 아닌 ## 제목은 구간을 끊지 않는다", () => {
		const lines = doc([], [[...decision("#100"), "## 부록", "", FOLLOW_UP_ITEM], decision("#200")]);

		assert.deepEqual(
			parseDecisionSections(lines)
				.get("#100")
				.body.map((l) => l.text),
			["- **도입**: v1.0.0 (#1)", "- **결정**: 본문.", "## 부록", FOLLOW_UP_ITEM],
		);
	});

	it("최상위 코드 펜스는 여는 줄만 싣는다 — 닫는 줄까지는 본문이 아니다", () => {
		const fenced = [...decision("#100"), "```md", "## 옛 모양", CORRECTION_ITEM, "```", FOLLOW_UP_ITEM];

		assert.deepEqual(
			parseDecisionSections(doc([], [fenced]))
				.get("#100")
				.body.map((l) => l.text),
			["- **도입**: v1.0.0 (#1)", "- **결정**: 본문.", "```md", FOLLOW_UP_ITEM],
		);
	});
});

describe("decision-banners — 통과", () => {
	for (const [label, lines] of [
		["active 한 낱말, 헤더 다음이 곧바로 도입 줄", doc([["#100", "active"]], [decision("#100")])],
		["폐기 — 설명 + 폐기 배너", doc([["3", "폐기 — superseded by #20 (소비처 소멸)"]], [tombstone("3", DEAD_BANNER)])],
		["superseded → 설명 + superseded 배너", doc([["5", "superseded → D9 (다른 방식으로 이관)"]], [tombstone("5", SUPERSEDED_BANNER)])],
		[
			"폐기 Decision 의 본문은 배너만 본다 — 그 아래 인용 · 구분선은 판정하지 않는다",
			doc([["3", "폐기"]], [[...tombstone("3", DEAD_BANNER), "", AMENDMENT_QUOTE, "", UNLABELLED_QUOTE, "", "---"]]),
		],
		[
			"active — 항목 아래 들여쓴 인용 · 표 · 소제목 · 이력 라벨은 그 조항의 내용이다",
			doc(
				[["#100", "active"]],
				[
					[
						...decision("#100"),
						"  > **#30 amendment**: 조항 아래 들여쓴 인용.",
						"  | 칸 | 값 |",
						"  |---|---|",
						"  ### 조항 아래 소제목",
						"  - **후속 (#50)**: 결정 6 아래의 하위 항목.",
						"    * **정정**: 더 깊이 들여쓴 항목.",
					],
				],
			),
		],
		[
			"active — 들여쓴 펜스 안의 예시 헤더 · 예시 항목은 본문이 아니다",
			doc(
				[["#100", "active"]],
				[[...decision("#100"), "  ```md", "  ## Decision 7: 펜스 안 예시 헤더", "  - **후속**: 펜스 안 예시 항목.", "  ```", "- **관련**: Decision #50."]],
			),
		],
		[
			"active — 이력 낱말로 시작하지 않는 라벨은 보지 않는다",
			doc(
				[["#100", "active"]],
				[
					[
						...decision("#100"),
						"- **다시 볼 조건**: 실행기가 둘로 늘면.",
						"- **재검토 조건**: 한도가 바뀌면.",
						"- **하지 않는 것**: 후속 이슈로 넘기지 않는다.",
						"- **넘어간 것 (후속 #60)**: 라벨 중간의 「후속」.",
						"- **Decision 7 과의 관계**: 번호를 벗겨도 이력 낱말이 아니다.",
						"- **관련**: #50 후속 논의.",
					],
				],
			),
		],
		[
			"active — 구간 맨 끝의 구분선은 Decision 사이를 가르는 선이다",
			doc(
				[
					["#100", "active"],
					["#200", "active"],
				],
				[[...decision("#100"), "", "---"], decision("#200")],
			),
		],
		[
			"폐기 Decision 본문의 이력 항목은 보지 않는다 — 앞선 active Decision 의 것으로도 읽지 않는다",
			doc(
				[
					["#100", "active"],
					["3", "폐기"],
					["5", "superseded → D9"],
				],
				[decision("#100"), [...tombstone("3", DEAD_BANNER), "", FOLLOW_UP_ITEM], [...tombstone("5", SUPERSEDED_BANNER), "", CORRECTION_ITEM]],
			),
		],
		["active — 제목의 `\\|` 는 헤더의 `|` 와 같은 글자다", doc([["#100", "active", "키는 `a \\| b` 타입"]], [decision("#100", [], "키는 `a | b` 타입")])],
		["active — 헤더 제목 앞뒤 공백은 제목이 아니다", doc([["#100", "active"]], [["## Decision #100:   제목  ", "", "- **도입**: v1.0.0 (#1)"]])],
		["폐기 행의 「결정 한 줄」 은 헤더 제목과 달라도 된다", doc([["3", "폐기", "옛 제목을 줄여 적은 한 줄"]], [tombstone("3", DEAD_BANNER)])],
		["본문 짝이 없는 폐기 행 — 짝 대조는 이 검사의 몫이 아니다", doc([["3", "폐기 — superseded by #20"]])],
		["본문 짝이 없는 active 행 — 짝 대조는 이 검사의 몫이 아니다", doc([["#100", "active"]])],
	]) {
		it(label, () => {
			assert.deepEqual(findDecisionBannerViolations(lines), []);
		});
	}
});

describe("decision-banners — 인덱스 섹션은 있어야 한다 (missing-index)", () => {
	for (const [label, lines] of [
		["섹션이 없는 문서", ["# Harness Decisions", "", ...decision("23")]],
		[
			"섹션 제목이 바뀐 문서 — 표와 본문이 멀쩡해도 검사할 수 없다",
			doc([["#100", "active"]], [decision("#100")]).map((line) => (line === "## 상태 인덱스" ? "## 상태 색인" : line)),
		],
		[
			"섹션 제목과 표 사이에 다른 제목이 끼어 표가 섹션 밖으로 밀린 문서 — 행이 0개로 읽힌다",
			doc([["#100", "active"]], [decision("#100")]).flatMap((line) => (line === "## 상태 인덱스" ? [line, "", "## 읽는 법"] : [line])),
		],
	]) {
		it(label, () => {
			assert.deepEqual(found(lines), [{ kind: "missing-index", lines: [1] }]);
			assertMsgIncludes(findDecisionBannerViolations(lines)[0].msg, ["`## 상태 인덱스` 섹션이 없거나 그 표에 행이 없습니다"]);
		});
	}
});

describe("decision-banners — 인덱스 행은 3칸 (index-shape)", () => {
	for (const [label, row] of [
		["넷째 칸에 적은 세부", "| #100 | 제목 | active | amend #50 — 경로 은퇴 |"],
		["빈 넷째 칸", "| #100 | 제목 | active | |"],
		["폐기 행의 넷째 칸", "| #100 | 제목 | 폐기 | superseded by #20 |"],
		["상태 칸이 없다", "| #100 | 제목 |"],
		["제목 안의 벗기지 않은 `|`", "| #100 | 키는 `a | b` 타입 | active |"],
	]) {
		it(label, () => {
			assert.deepEqual(found(doc([row], [decision("#100")])), [{ kind: "index-shape", lines: [FIRST_ROW_LINE] }]);
		});
	}

	it("칸 수가 어긋나면 본문은 대조하지 않는다 — 어느 칸이 상태인지 믿을 수 없다", () => {
		const lines = doc(["| #100 | 제목 | active | 메모 |"], [[...decision("#100", [AMENDMENT_QUOTE]), FOLLOW_UP_ITEM]]);

		assert.deepEqual(kindsOf(lines), ["index-shape"]);
	});

	it("문구가 칸 수와 고칠 방법을 알린다 — 덧붙인 칸은 본문에 담고 지운다", () => {
		const [violation] = findDecisionBannerViolations(doc(["| #100 | 제목 | active | 메모 |"]));

		assertMsgIncludes(violation.msg, [
			"Decision #100 의 인덱스 행이 4칸입니다",
			"번호 · 결정 한 줄 · 상태 3칸",
			"본문 해당 조항을 지금 참인 것만 남게 고쳐 써서 담고 칸은 지웁니다",
			`원문은 ${ARCHIVE_HINT} 로 내립니다`,
		]);
	});
});

describe("decision-banners — 인덱스 상태 어휘", () => {
	for (const [label, status] of [
		["모르는 낱말", "deprecated"],
		["꾸밈이 붙어 토큰으로 시작하지 않는 active", "**active**"],
		["굵게 감싼 폐기", "**폐기(#20)** — 통째 제거"],
		["토큰 밖의 낱말 「대체됨」", "대체됨(#20)"],
		["토큰 밖의 낱말 「철회」", "철회 (2026-01-02)"],
		["빈 칸", ""],
	]) {
		it(`unknown-status: ${label}`, () => {
			assert.deepEqual(found(doc([["#100", status]], [decision("#100")])), [{ kind: "unknown-status", lines: [FIRST_ROW_LINE] }]);
		});
	}

	it("unknown-status 면 본문은 대조하지 않는다 — 무엇과 맞출지 정할 수 없다", () => {
		const lines = doc([["#100", "deprecated"]], [decision("#100", [DEAD_BANNER, AMENDMENT_QUOTE])]);

		assert.deepEqual(kindsOf(lines), ["unknown-status"]);
	});

	for (const status of ["부분 — 결정 3 만 #200 이 대체", "부분 폐기(#200)"]) {
		it(`partial-status: 인덱스 상태가 「부분」 으로 시작한다 — ${status}`, () => {
			const lines = doc([["#100", status]], [decision("#100", [PARTIAL_BANNER])]);

			assert.deepEqual(found(lines), [{ kind: "partial-status", lines: [FIRST_ROW_LINE] }]);
		});
	}
});

describe("decision-banners — 상태 배너", () => {
	for (const [label, banner] of [
		["폐기 배너", DEAD_BANNER],
		["superseded 배너", SUPERSEDED_BANNER],
		["「부분」 배너", PARTIAL_BANNER],
	]) {
		it(`stray-banner: active 본문에 ${label}`, () => {
			const lines = doc([["#100", "active"]], [decision("#100", [banner])]);

			assert.deepEqual(found(lines), [{ kind: "stray-banner", lines: [lineOf(lines, "## Decision #100:"), FIRST_ROW_LINE] }]);
		});
	}

	it("stray-banner: 배너만 남은 본문인데 인덱스가 active — 도입 줄이 없다고 다시 내지 않는다", () => {
		const lines = doc([["#100", "active"]], [tombstone("#100", DEAD_BANNER)]);

		assert.deepEqual(found(lines), [{ kind: "stray-banner", lines: [lineOf(lines, "## Decision #100:"), FIRST_ROW_LINE] }]);
	});

	for (const [label, body] of [
		["배너가 없다", decision("3")],
		["배너가 도입 줄 뒤에 있다", [...decision("3"), "", DEAD_BANNER]],
		["인용이 아닌 표식으로 적은 배너", ["## Decision 3: 제목", "", "⚠️ **폐기 — #20**: 사유."]],
		["토큰 밖으로 시작하는 주석뿐이다", decision("3", ["> **historical (#20)**: 소멸한 서술."])],
		["배너가 헤더 직후가 아니다 — 빈 줄 셋 뒤", ["## Decision 3: 제목", "", "", "", DEAD_BANNER]],
	]) {
		it(`missing-banner: ${label}`, () => {
			const lines = doc([["3", "폐기 — superseded by #20"]], [body]);

			assert.deepEqual(found(lines), [{ kind: "missing-banner", lines: [lineOf(lines, "## Decision 3:"), FIRST_ROW_LINE] }]);
		});
	}

	it("partial-banner: 폐기 Decision 의 배너가 「부분」 으로 시작한다", () => {
		const lines = doc([["3", "superseded → D9"]], [tombstone("3", PARTIAL_BANNER)]);

		assert.deepEqual(found(lines), [{ kind: "partial-banner", lines: [lineOf(lines, "## Decision 3:"), FIRST_ROW_LINE] }]);
	});

	it("stray-banner 로 낸 배너 줄은 head-overlay 로 다시 내지 않는다 — 그 아래 줄만 낸다", () => {
		const lines = doc([["#100", "active"]], [decision("#100", [DEAD_BANNER, AMENDMENT_QUOTE])]);

		assert.deepEqual(found(lines), [
			{ kind: "stray-banner", lines: [lineOf(lines, "## Decision #100:"), FIRST_ROW_LINE] },
			{ kind: "head-overlay", lines: [lineOf(lines, AMENDMENT_QUOTE)] },
		]);
	});

	it("폐기류 라벨이라도 헤더 직후(배너 자리)가 아니면 끼어든 줄이다", () => {
		const lines = doc([["#100", "active"]], [decision("#100", [AMENDMENT_QUOTE, DEAD_BANNER])]);

		assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [lineOf(lines, AMENDMENT_QUOTE), lineOf(lines, DEAD_BANNER)] }]);
	});
});

describe("decision-banners — active 는 한 낱말 (annotated-status)", () => {
	for (const [label, status] of [
		["괄호 안 amend", "active (amend #50 — 옛 경로 은퇴)"],
		["굵은 amend", "active (**#50 amend** — 사본을 받지 않는다)"],
		["줄표 뒤 설명", "active — 경로 전수 파악을 종결"],
		["초기 Decision 의 부분 표기", "active (일부 → D9)"],
		["띄어쓰기 없는 괄호", "active(#50)"],
	]) {
		it(label, () => {
			assert.deepEqual(found(doc([["#100", status]], [decision("#100")])), [{ kind: "annotated-status", lines: [FIRST_ROW_LINE] }]);
		});
	}

	it("인덱스 행만의 문제라 본문 짝이 없어도 낸다", () => {
		assert.deepEqual(kindsOf(doc([["#100", "active (amend #50)"]])), ["annotated-status"]);
	});

	it("문구가 고칠 방법을 알린다 — 본문을 고쳐 쓰고 상태 칸은 active, 원문은 archive", () => {
		const [violation] = findDecisionBannerViolations(doc([["#100", "active (amend #50)"]], [decision("#100")]));

		assertMsgIncludes(violation.msg, [
			'"active (amend #50)"',
			"본문을 지금 참인 것만 남게 고쳐 써서",
			"상태 칸은 `active` 로",
			`원문은 ${ARCHIVE_HINT} 로 내립니다`,
		]);
	});
});

describe("decision-banners — active 행의 「결정 한 줄」 은 헤더 제목이다 (index-title)", () => {
	for (const [label, indexTitle, headerTitle] of [
		["제목 대신 요약을 적었다", "옛 라이브러리 → 새 라이브러리", "데이터 페칭은 새 라이브러리로 한다"],
		["제목 뒤에 세부를 덧붙였다", "저장 방식은 하나 (amend #50 — 경로 은퇴)", "저장 방식은 하나"],
		["헤더만 고치고 인덱스는 그대로다", "저장 방식은 하나", "저장 방식은 하나 — 모듈은 도메인별"],
	]) {
		it(label, () => {
			const lines = doc([["#100", "active", indexTitle]], [decision("#100", [], headerTitle)]);

			assert.deepEqual(found(lines), [{ kind: "index-title", lines: [FIRST_ROW_LINE, lineOf(lines, "## Decision #100:")] }]);
		});
	}

	it("상태 칸과 제목이 둘 다 어긋나면 annotated-status 다음에 낸다", () => {
		const lines = doc([["#100", "active (amend #50)", "요약"]], [decision("#100")]);

		assert.deepEqual(kindsOf(lines), ["annotated-status", "index-title"]);
	});

	it("문구가 갈라지는 자리와 고칠 방법을 알린다 — 긴 제목은 달라지는 곳부터 싣는다", () => {
		const shared = "밖에서 받은 파일은 원본을 따로 두고 쓰는 값만 남긴다";
		const [violation] = findDecisionBannerViolations(
			doc([["#100", "active", `${shared} (요약)`]], [decision("#100", [], `${shared} — 칸 규칙`)]),
		);

		assertMsgIncludes(violation.msg, [
			`${shared.length + 2}번째 글자부터`,
			'인덱스 "(요약)"',
			'헤더 "— 칸 규칙"',
			"active 행에는 헤더 제목을 그대로 적습니다",
			"두 제목을 지금 참인 쪽으로 같게 맞춥니다",
		]);
	});
});

describe("decision-banners — 헤더 뒤 첫 줄은 도입 줄이다 (head-overlay)", () => {
	for (const [label, wedged] of [
		["번호 amendment 인용", AMENDMENT_QUOTE],
		["현행 상태 (세부) 인용", DETAIL_QUOTE],
		["결정 한 줄 (전체) 요약 인용", SUMMARY_QUOTE],
		["날짜 amendment 인용", "> **2026-01-02 amendment (상태는 active)**: 한 갈래가 소멸했다."],
		["historical 주석", "> **historical (#20)**: 본문 중 일부 서술은 소멸했다."],
		["정정 주석", "> **[명명 정정 — #20]** 아래 본문의 식별자는 도입 시점 스냅샷이다."],
		["처음 보는 이름의 인용", "> **참고 (#60)**: 결정 1 의 기본값이 바뀌었다."],
		["인용이 아닌 표식으로 적은 갱신 배너", "⚠️ **갱신 — #60**: 2항이 바뀌었다."],
		["굵은 라벨 없는 인용", UNLABELLED_QUOTE],
		["띄어쓰기를 빼 라벨로 읽히지 않는 인용", ">**참고 (#60)**: 결정 1 의 기본값이 바뀌었다."],
		["내용 없는 인용 줄", ">"],
		["현행 상태를 적은 목록 항목", "- **현행 상태 (세부)**: active (#40 결정 6 이 amend)"],
		["도입보다 앞선 본문 항목", "- **결정**: 도입 줄 위에 올린 조항."],
		["굵은 라벨 단락", "**보강 (#20, 재발 방지)**: 한 번 더 거른다."],
		["맨 단락", "이 결정은 #50 으로 일부 바뀌었다."],
		["소제목", "### 현행 상태"],
		["들여쓴 줄", "  - **후속**: 헤더 아래 들여쓴 항목."],
	]) {
		it(label, () => {
			const lines = doc([["#100", "active"]], [decision("#100", [wedged])]);

			assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [lineOf(lines, wedged)] }]);
		});
	}

	it("상태 배너 바로 아래에 빈 줄 없이 이어 붙인 줄도 잡는다 — 배너의 일부로 치지 않는다", () => {
		const body = ["## Decision #100: 제목", "", DEAD_BANNER, UNLABELLED_QUOTE, "", "- **도입**: v1.0.0 (#1)"];
		const lines = doc([["#100", "active"]], [body]);

		assert.deepEqual(found(lines), [
			{ kind: "stray-banner", lines: [lineOf(lines, "## Decision #100:"), FIRST_ROW_LINE] },
			{ kind: "head-overlay", lines: [lineOf(lines, UNLABELLED_QUOTE)] },
		]);
	});

	it("끼어든 여러 줄은 한 건으로 묶는다 — 문구에는 첫 줄의 모양과 앞머리, 나머지는 줄 수", () => {
		const lines = doc([["#100", "active"]], [decision("#100", [SUMMARY_QUOTE, AMENDMENT_QUOTE, DETAIL_QUOTE])]);

		assert.deepEqual(found(lines), [
			{ kind: "head-overlay", lines: [lineOf(lines, SUMMARY_QUOTE), lineOf(lines, AMENDMENT_QUOTE), lineOf(lines, DETAIL_QUOTE)] },
		]);
		assertMsgIncludes(findDecisionBannerViolations(lines)[0].msg, ['(인용 "> **결정 한 줄 (전체)**: 인덱스 칸에서', '" 외 2줄)']);
	});

	for (const [label, wedged, summary] of [
		["목록 항목", "- **현행 상태 (세부)**: active", '(목록 항목 "- **현행 상태 (세부)**: active")'],
		["단락", "**보강 (#20)**: 한 번 더 거른다.", '(단락 "**보강 (#20)**: 한 번 더 거른다.")'],
		["소제목", "### 현행 상태", '(소제목 "### 현행 상태")'],
	]) {
		it(`문구가 끼어든 줄의 모양을 알린다 — ${label}`, () => {
			const [violation] = findDecisionBannerViolations(doc([["#100", "active"]], [decision("#100", [wedged])]));

			assertMsgIncludes(violation.msg, [summary]);
		});
	}

	it("도입 줄이 없으면 헤더 줄을 가리킨다 — 다음 Decision 의 줄을 제 것으로 읽지 않는다", () => {
		const withoutIntro = ["## Decision #100: 제목", "", "- **결정**: 본문."];
		const lines = doc(
			[
				["#100", "active"],
				["3", "폐기"],
			],
			[withoutIntro, [...tombstone("3", DEAD_BANNER), "", AMENDMENT_QUOTE]],
		);

		assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [lineOf(lines, "## Decision #100:")] }]);
		assertMsgIncludes(findDecisionBannerViolations(lines)[0].msg, [
			"`- **도입**:` 줄이 없습니다",
			'(헤더 다음 줄은 목록 항목 "- **결정**: 본문.")',
			"헤더 바로 아래에 도입 줄을 둡니다",
		]);
	});

	it("대시 없이 단락으로 적은 `**도입**:` 은 도입 줄이 아니다 — 도입 줄이 없는 것이고, 그 단락은 최상위에 끼어든 줄이다", () => {
		const dashless = "**도입**: v1.2.3 (#70)";
		const lines = doc([["#70", "active"]], [["## Decision #70: 제목", "", dashless, "", "- **결정**: 본문."]]);

		assert.deepEqual(found(lines), [
			{ kind: "head-overlay", lines: [lineOf(lines, "## Decision #70:")] },
			{ kind: "stray-block", lines: [lineOf(lines, dashless)] },
		]);
		assertMsgIncludes(findDecisionBannerViolations(lines)[0].msg, [`(헤더 다음 줄은 단락 "${dashless}")`]);
	});

	it("헤더뿐인 active Decision 도 도입 줄이 없는 것이다", () => {
		const lines = doc([["#100", "active"]], [["## Decision #100: 제목"]]);

		assert.deepEqual(found(lines), [{ kind: "head-overlay", lines: [lineOf(lines, "## Decision #100:")] }]);
	});

	it("상태 칸과 머리가 둘 다 어긋나면 종류마다 하나씩, 인덱스 행 순서로 낸다", () => {
		const lines = doc(
			[
				["#100", "active (amend #30)"],
				["#200", "active"],
			],
			[decision("#100", [AMENDMENT_QUOTE]), decision("#200", [DETAIL_QUOTE])],
		);

		assert.deepEqual(found(lines), [
			{ kind: "annotated-status", lines: [FIRST_ROW_LINE] },
			{ kind: "head-overlay", lines: [lineOf(lines, AMENDMENT_QUOTE)] },
			{ kind: "head-overlay", lines: [lineOf(lines, DETAIL_QUOTE)] },
		]);
	});

	it("문구가 고칠 방법을 알린다 — 해당 조항을 고쳐 쓰고 줄은 지우고 인덱스는 active, 고쳐 쓰기 전 본문은 archive", () => {
		const [violation] = findDecisionBannerViolations(doc([["#100", "active"]], [decision("#100", [DETAIL_QUOTE])]));

		assertMsgIncludes(violation.msg, [
			"헤더와 `- **도입**:` 줄 사이에 끼어 있는 줄이 있습니다",
			"헤더 뒤 첫 줄이 곧바로 `- **도입**:` 입니다",
			"해당 조항을 지금 참인 것만 남게 고쳐 쓰고 이 줄은 지웁니다",
			`고쳐 쓰기 전 본문은 ${ARCHIVE_HINT} 로 내립니다`,
			"인덱스는 `active` 로",
		]);
	});
});

describe("decision-banners — active 본문의 최상위 줄은 전부 `- **라벨**` 이다 (stray-block)", () => {
	for (const [label, stray] of [
		["도입 줄 아래의 amendment 인용", AMENDMENT_QUOTE],
		["굵은 라벨 없는 인용", UNLABELLED_QUOTE],
		["내용 없는 인용 줄", ">"],
		["굵은 라벨 단락", "**보강 (#20, 재발 방지)**: 한 번 더 거른다."],
		["맨 단락", "이 결정은 #50 으로 일부 바뀌었다."],
		["소제목", "### 후속"],
		["Decision 이 아닌 ## 제목", "## 부록"],
		["표", "| 결정 | 바뀐 값 |"],
		["`*` 글머리", "* **후속**: 별표 글머리로 적은 항목."],
		["`+` 글머리", "+ **후속**: 더하기 글머리로 적은 항목."],
		["번호 목록", "1. **후속**: 번호 목록으로 적은 항목."],
		["굵은 라벨 없는 항목", "- 후속: 라벨을 굵게 쓰지 않은 항목."],
		["1칸 들여쓴 항목", " - **후속**: 한 칸만 들여쓴 항목."],
		["탭으로 들여쓴 항목", "\t- **정정**: 탭으로 들여쓴 항목."],
		["최상위 코드 펜스", "```md"],
		["구간 가운데의 구분선", "---"],
	]) {
		it(label, () => {
			const lines = doc([["#100", "active"]], [[...decision("#100"), stray, "- **관련**: Decision #50."]]);

			assert.deepEqual(found(lines), [{ kind: "stray-block", lines: [lastLineOf(lines, stray)] }]);
		});
	}

	it("한 Decision 의 여러 줄은 한 건으로 묶는다 — 사이에 낀 항목과 들여쓴 줄은 싣지 않는다", () => {
		const body = [...decision("#100"), "", AMENDMENT_QUOTE, "- **관련**: Decision #50.", "  > 들여쓴 인용.", "### 후속"];
		const lines = doc([["#100", "active"]], [body]);

		assert.deepEqual(found(lines), [{ kind: "stray-block", lines: [lineOf(lines, AMENDMENT_QUOTE), lineOf(lines, "### 후속")] }]);
		assertMsgIncludes(findDecisionBannerViolations(lines)[0].msg, ['(인용 "> **#30 amendment (상태는', '" 외 1줄)']);
	});

	for (const [label, stray, summary] of [
		["1칸 들여쓰기", " - **후속**: 한 칸.", '(1칸만 들여쓴 줄 "- **후속**: 한 칸.")'],
		["탭 들여쓰기", "\t- **정정**: 탭.", '(탭으로 들여쓴 줄 "- **정정**: 탭.")'],
		["표", "| 결정 | 값 |", '(표 "| 결정 | 값 |")'],
		["코드 펜스", "```md", '(코드 펜스 "```md")'],
	]) {
		it(`문구가 줄의 모양을 알린다 — ${label}`, () => {
			const [violation] = findDecisionBannerViolations(doc([["#100", "active"]], [[...decision("#100"), stray]]));

			assertMsgIncludes(violation.msg, [summary]);
		});
	}

	it("Decision 이 아닌 ## 제목 아래에 덧붙인 이력 항목도 그 Decision 의 것이다", () => {
		const lines = doc([["#100", "active"]], [[...decision("#100"), "", "## 부록", "", FOLLOW_UP_ITEM]]);

		assert.deepEqual(found(lines), [
			{ kind: "stray-block", lines: [lineOf(lines, "## 부록")] },
			{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM)] },
		]);
	});

	it("최상위 펜스 안의 줄은 싣지 않는다 — 펜스 안 ## 제목 뒤에 덧붙인 이력 항목은 잡는다", () => {
		const fenced = [...decision("#100"), "```md", "## 옛 모양", CORRECTION_ITEM, "```", FOLLOW_UP_ITEM];
		const lines = doc([["#100", "active"]], [fenced]);

		assert.deepEqual(found(lines), [
			{ kind: "stray-block", lines: [lineOf(lines, "```md")] },
			{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM)] },
		]);
	});

	it("들여쓴 펜스 안이라도 줄 머리에 적은 ## 제목은 최상위 줄이다 — 그 뒤의 이력 항목도 잡는다", () => {
		const fenced = [...decision("#100"), "  ```md", "## 옛 모양", "  ```", FOLLOW_UP_ITEM];
		const lines = doc([["#100", "active"]], [fenced]);

		assert.deepEqual(found(lines), [
			{ kind: "stray-block", lines: [lineOf(lines, "## 옛 모양")] },
			{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM)] },
		]);
	});

	it("닫히지 않은 펜스가 뒤따르는 Decision 을 삼키지 않는다", () => {
		const lines = doc(
			[
				["#100", "active"],
				["#200", "active"],
			],
			[
				[...decision("#100"), "```md", "닫는 줄이 없는 펜스."],
				[...decision("#200"), FOLLOW_UP_ITEM],
			],
		);

		assert.deepEqual(found(lines), [
			{ kind: "stray-block", lines: [lineOf(lines, "```md")] },
			{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM)] },
		]);
	});

	it("문구가 고칠 방법을 알린다 — 조항의 내용이면 들여쓰고, 덧댄 것이면 조항을 고쳐 쓰고 지운다", () => {
		const [violation] = findDecisionBannerViolations(doc([["#100", "active"]], [[...decision("#100"), AMENDMENT_QUOTE]]));

		assertMsgIncludes(violation.msg, [
			"Decision #100",
			"본문 최상위에 `- **라벨**` 항목이 아닌 줄이 있습니다",
			"최상위 줄(공백 들여쓰기 2칸 미만)은 전부 `- **라벨**` 로 시작합니다",
			"그 항목 아래로 공백 2칸 이상 들여씁니다",
			"해당 조항을 지금 참인 것만 남게 고쳐 쓰고 이 줄은 지웁니다",
			`고쳐 쓰기 전 본문은 ${ARCHIVE_HINT} 로 내립니다`,
		]);
	});
});

describe("decision-banners — active 본문에 이력 항목을 덧붙이지 않는다 (history-label)", () => {
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
	]) {
		it(label, () => {
			const lines = doc([["#100", "active"]], [[...decision("#100"), item]]);

			assert.deepEqual(found(lines), [{ kind: "history-label", lines: [lineOf(lines, item)] }]);
		});
	}

	it("한 Decision 의 여러 항목은 한 건으로 묶는다 — 사이에 낀 다른 항목은 싣지 않는다", () => {
		const lines = doc([["#100", "active"]], [[...decision("#100"), FOLLOW_UP_ITEM, "- **관련**: Decision #50.", CORRECTION_ITEM]]);

		assert.deepEqual(found(lines), [{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM), lineOf(lines, CORRECTION_ITEM)] }]);
		assertMsgIncludes(findDecisionBannerViolations(lines)[0].msg, ['"후속 (#50, 2026-01-02)" 외 1개']);
	});

	it("도입 줄이 없는 Decision 의 항목도 잡는다", () => {
		const lines = doc([["#100", "active"]], [["## Decision #100: 제목", "", "- **결정**: 본문.", CORRECTION_ITEM]]);

		assert.deepEqual(found(lines), [
			{ kind: "head-overlay", lines: [lineOf(lines, "## Decision #100:")] },
			{ kind: "history-label", lines: [lineOf(lines, CORRECTION_ITEM)] },
		]);
	});

	it("Decision 마다 제 항목만 낸다 — 인덱스 행 순서로", () => {
		const lines = doc(
			[
				["#100", "active"],
				["#200", "active"],
			],
			[
				[...decision("#100"), FOLLOW_UP_ITEM],
				[...decision("#200"), CORRECTION_ITEM],
			],
		);

		assert.deepEqual(found(lines), [
			{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM)] },
			{ kind: "history-label", lines: [lineOf(lines, CORRECTION_ITEM)] },
		]);
	});

	it("머리 · 최상위 줄 · 이력 항목이 모두 어긋나면 head-overlay · stray-block · history-label 순서로 낸다", () => {
		const lines = doc([["#100", "active"]], [[...decision("#100", [AMENDMENT_QUOTE]), UNLABELLED_QUOTE, FOLLOW_UP_ITEM]]);

		assert.deepEqual(found(lines), [
			{ kind: "head-overlay", lines: [lineOf(lines, AMENDMENT_QUOTE)] },
			{ kind: "stray-block", lines: [lineOf(lines, UNLABELLED_QUOTE)] },
			{ kind: "history-label", lines: [lineOf(lines, FOLLOW_UP_ITEM)] },
		]);
	});

	it("문구가 고칠 방법을 알린다 — 현행 규칙은 해당 조항에 녹이고 항목은 없애고, 고쳐 쓰기 전 본문은 archive", () => {
		const [violation] = findDecisionBannerViolations(doc([["#100", "active"]], [[...decision("#100"), FOLLOW_UP_ITEM]]));

		assertMsgIncludes(violation.msg, [
			"Decision #100",
			'("후속 (#50, 2026-01-02)")',
			"앞 조항을 이기는 두 번째 권위",
			"현행 규칙은 해당 조항에 녹이고 이 항목은 없앱니다",
			`고쳐 쓰기 전 본문은 ${ARCHIVE_HINT} 로 내립니다`,
		]);
	});
});

describe("decision-banners — checkDecisionDoc · formatDocCheck", () => {
	const DOC = "docs/harness-decisions.md";

	it("인덱스 섹션이 없는 문서는 건너뛰지 않는다 — 행 수 0 과 missing-index 위반을 돌려준다", () => {
		const check = checkDecisionDoc(["# Harness Decisions", "", ...decision("23")]);

		assert.equal(check.decisionCount, 0);
		assert.equal(check.inactiveCount, 0);
		assert.deepEqual(
			check.violations.map((v) => v.kind),
			["missing-index"],
		);
	});

	it("인덱스 행 수 · 폐기류 행 수와 위반을 함께 돌려준다 — 순번과 이슈 번호가 섞인 문서도 같은 규칙이다", () => {
		const lines = doc(
			[
				["23", "active"],
				["#70", "active"],
				["10", "superseded → #70"],
			],
			[decision("#70", [AMENDMENT_QUOTE]), decision("23"), tombstone("10", "> **superseded by #70**: 원문은 archive.")],
		);
		const check = checkDecisionDoc(lines);

		assert.equal(check.decisionCount, 3);
		assert.equal(check.inactiveCount, 1);
		assert.deepEqual(
			check.violations.map(({ kind, lines: at }) => ({ kind, lines: at })),
			[{ kind: "head-overlay", lines: [lineOf(lines, AMENDMENT_QUOTE)] }],
		);
	});

	it("위반이 없으면 어느 문서인지 드러나는 OK 한 줄이다", () => {
		const lines = doc(
			[
				["#100", "active"],
				["3", "폐기"],
			],
			[decision("#100"), tombstone("3", DEAD_BANNER)],
		);

		assert.deepEqual(formatDocCheck(DOC, checkDecisionDoc(lines)), [
			`check-decision-banners: OK (${DOC}: Decision 2개 — active 1개 한 모양 / 비-active 1개 전부 배너 보유)`,
		]);
	});

	it("위반은 종류순으로, 문구 아래에 고칠 자리를 그 문서의 `파일:줄` 로 낸다", () => {
		const lines = doc(
			[
				["3", "폐기"],
				["#100", "active (amend #50)"],
			],
			[decision("3"), decision("#100")],
		);
		const out = formatDocCheck(DOC, checkDecisionDoc(lines));

		assert.equal(out.length, 5);
		assert.match(out[0], /^\[annotated-status\] Decision #100 /);
		assert.equal(out[1], `    ${DOC}:${FIRST_ROW_LINE + 1}`);
		assert.match(out[2], /^\[missing-banner\] Decision 3 /);
		assert.equal(out[3], `    ${DOC}:${lineOf(lines, "## Decision 3:")}`);
		assert.equal(out[4], `    ${DOC}:${FIRST_ROW_LINE}`);
	});
});

describe("decision-banners — run", () => {
	const CLEAN = doc([["#100", "active"]], [decision("#100")]).join("\n");
	const DIRTY = doc([["#100", "active (amend #50)"]], [decision("#100", [AMENDMENT_QUOTE])]).join("\n");
	const ARCH = "docs/architecture-decisions.md";
	const HARNESS = "docs/harness-decisions.md";

	function runIn(t, files, section = {}) {
		const root = makeRepo(t, files);
		const out = captureConsole(t);
		const code = run({ root, options: resolveOptions("decision-banners", schema, section) });
		return { code, out: out.join("\n") };
	}

	it("기본 대상은 두 결정 기록이다 — 둘 다 정합이면 문서마다 OK 한 줄", (t) => {
		const { code, out } = runIn(t, { [ARCH]: CLEAN, [HARNESS]: CLEAN });

		assert.equal(code, 0);
		assert.match(out, /OK \(docs\/architecture-decisions\.md: Decision 1개/);
		assert.match(out, /OK \(docs\/harness-decisions\.md: Decision 1개/);
	});

	it("한 문서에서 위반이 나와도 나머지를 끝까지 보고, 전체 건수로 실패한다", (t) => {
		const { code, out } = runIn(t, { [ARCH]: DIRTY, [HARNESS]: CLEAN });

		assert.equal(code, 1);
		assert.match(out, /\[annotated-status\] Decision #100 /);
		assert.match(out, /\[head-overlay\] Decision #100 /);
		assert.match(out, /docs\/architecture-decisions\.md:7\n/);
		assert.match(out, /OK \(docs\/harness-decisions\.md/);
		assert.match(out, /2건 불일치 발견/);
	});

	it("목록의 문서가 없으면 실패한다 — 있는 것만 보고 통과하지 않는다 (이름이 바뀌면 범위가 말없이 줄지 않게)", (t) => {
		const { code, out } = runIn(t, { [ARCH]: CLEAN });

		assert.equal(code, 1);
		assert.match(out, /\[missing-target\] docs\/harness-decisions\.md/);
		assert.match(out, /OK \(docs\/architecture-decisions\.md/);
	});

	it("결정 기록이 하나뿐인 저장소는 docs 에 그 하나만 적는다", (t) => {
		assert.equal(runIn(t, { [ARCH]: CLEAN }, { docs: [ARCH] }).code, 0);
	});

	it("docs 설정을 따른다 — 다른 경로의 결정 기록", (t) => {
		const { code, out } = runIn(t, { "notes/decisions.md": DIRTY, [ARCH]: CLEAN }, { docs: ["notes/decisions.md"] });

		assert.equal(code, 1);
		assert.match(out, /notes\/decisions\.md:7\n/);
		assert.doesNotMatch(out, /architecture-decisions/);
	});

	it("인덱스 섹션이 없는 문서는 실패한다 (missing-index)", (t) => {
		const { code, out } = runIn(t, { [ARCH]: ["# Decisions", "", ...decision("1")].join("\n") }, { docs: [ARCH] });

		assert.equal(code, 1);
		assert.match(out, /\[missing-index\]/);
	});

	it("docs 가 비면 실패한다 (공회전)", (t) => {
		assert.equal(runIn(t, { [ARCH]: CLEAN }, { docs: [] }).code, 1);
	});

	it("CRLF 줄바꿈 문서도 같은 판정이다", (t) => {
		assert.equal(runIn(t, { [ARCH]: CLEAN.replaceAll("\n", "\r\n") }, { docs: [ARCH] }).code, 0);
	});

	it("모르는 설정 키는 실패한다", () => {
		assert.throws(() => resolveOptions("decision-banners", schema, { doc: [ARCH] }), ConfigError);
	});
});

describe("decision-banners — 켜야 돈다 (새 판을 받는 것만으로는 아무 저장소에서도 돌지 않는다)", () => {
	const KNOWN = Object.keys(CHECKS);

	it("검사로 등록돼 있다", () => {
		assert.ok(KNOWN.includes("decision-banners"));
	});

	it("`all` 은 package.json 의 check:* 만 돌린다 — 스크립트가 없는 저장소에서는 이 검사가 불리지 않는다", () => {
		const scripts = { check: "mongshell-check all", "check:journal": "mongshell-check journal", "check:ui-barrel": "mongshell-check ui-barrel" };

		assert.deepEqual(selectCheckScripts(scripts).names, ["check:journal", "check:ui-barrel"]);
	});

	it("같은 이름의 저장소 로컬 스크립트를 둔 저장소는 새 판을 받아도 설정 검증에 걸리지 않고, `all` 은 그 로컬 스크립트를 그대로 돌린다", () => {
		const pkg = {
			scripts: { "check:journal": "mongshell-check journal", "check:decision-banners": "node scripts/check-decision-banners.mjs" },
		};
		const config = { checks: { journal: {} } };

		assert.deepEqual(validateConfigShape(config, enabledCheckNames(pkg), KNOWN), []);
		assert.deepEqual(selectCheckScripts(pkg.scripts).names, ["check:journal", "check:decision-banners"]);
	});

	it("켜지 않은 저장소가 섹션만 적어 두면 낡은 설정으로 실패한다", () => {
		const problems = validateConfigShape({ checks: { "decision-banners": {} } }, ["journal"], KNOWN);

		assert.equal(problems.length, 1);
		assert.match(problems[0], /check:decision-banners 가 없어 쓰이지 않는 설정/);
	});
});
