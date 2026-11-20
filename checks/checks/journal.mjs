/**
 * journal — drizzle 마이그레이션 journal 의 `when` 러닝맥스 단조 증가 · `when` 미래 시각 금지 · `idx` 연속 · `.sql` ↔ journal tag 1:1.
 *
 * 배경: drizzle-kit migrate 의 적용 게이트는 hash 가 아니라 timestamp 다(drizzle-orm/pg-core/dialect.cjs):
 *   select id, hash, created_at from __drizzle_migrations order by created_at desc limit 1
 *   → 그 max(created_at) 보다 `when` 이 큰 마이그레이션만 적용.
 * 어떤 엔트리의 `when` 이 그 이전 전체의 최대값보다 작거나 같으면 그 마이그레이션은 "이미 적용됨" 으로 오판돼
 * 조용히 skip 된다 → 컬럼 부재로 prod 500 (감바우 2026-06-29 hidden_until 사고). db:migrate 는 exit 0 이라
 * 배포가 막히지 않는 게 핵심 위험이다.
 *
 * 불변식: entries[i].when > max(entries[0..i-1].when). 직전(i-1) 비교가 아니라 러닝맥스 비교여야 한다 — 중간에
 * 부풀린 when 이 끼면 그 이후 전부가 그 값 위에 있어야 한다.
 *
 * 두 번째 검사 — 고아 마이그레이션 (감바우 #1869 ② 사고): migrate 는 journal 의 entries 만 보므로 `drizzle/<tag>.sql` 이
 * 있어도 journal 에 tag 가 없으면 조용히 건너뛴다(드라이 `db:generate` 뒷정리를 `git checkout _journal.json` 으로 한 경우).
 * 불변식: journal 옆 폴더의 *.sql 파일명 ↔ journal tag 가 1:1 (스냅샷 유무는 보지 않는다).
 *
 * 세 번째 검사 — 미래 시각 `when` (k2sell #150 사고): 손으로 적은 미래 시각이 prod `__drizzle_migrations.created_at` 에
 * 기록되면, 그 뒤 실제 시각으로 생성된 마이그레이션이 전부 그 값 아래라 조용히 skip 된다. 러닝맥스 검사는 이것을 **다음
 * 마이그레이션이 생긴 뒤에야** 그 마이그레이션의 위반으로 잡는다 — 그때는 미래 `when` 이 이미 prod 에 적용돼 journal 만
 * 고쳐서는 풀리지 않는다. 이 검사는 원인이 들어오는 PR 에서, prod 에 닿기 전에 막는다.
 * 불변식: 모든 entry 의 when ≤ 지금 + `CLOCK_SKEW_TOLERANCE_MS`. 예외 목록은 없다 — 걸린 값은 실제 생성 시각으로 고친다.
 * 시계에 기대는 판정이지만 한쪽으로만 움직인다: 지금 통과한 journal 은 시간이 흘러도 이 판정으로 실패하지 않는다.
 * 지금 시각은 `run({ now })` 로 넣을 수 있다(테스트가 시각을 고정한다 — 기본은 `Date.now()`).
 *
 * 네 번째 검사 — `idx` 연속: idx 는 0 부터 빈틈 · 중복 없이 이어진다. 위 판정들이 entries 를 idx 순으로 놓고 보고,
 * `knownNonMonotonic` 이 idx 로 엔트리를 가리키므로, idx 가 겹치거나 건너뛰면 그 순서와 예외 지정을 믿을 수 없다.
 * (손으로 journal 을 편집했거나 머지 충돌을 잘못 푼 흔적이기도 하다.)
 *
 * 설정 `knownNonMonotonic` — 가드 도입 전 이미 prod 에 적용된 비단조 idx. 정정하면 멱등이 아닌 SQL 이 재적용될 위험이 있어
 * 예외로 둔다. 예외 idx 도 러닝맥스 갱신엔 참여하므로 향후 마이그레이션은 러닝맥스 위에 있어야 통과한다
 * = prod __drizzle_migrations 게이트와 같은 기준.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

export const name = "journal";

export const schema = {
	journalPath: { type: "string", default: "drizzle/meta/_journal.json" },
	knownNonMonotonic: { type: "items", fields: { idx: "integer" }, default: [] },
};

/**
 * 미래 시각 판정의 허용치 — `when` 을 찍은 개발 PC 의 시계가 검사를 돌리는 쪽보다 조금 앞선 경우를 넘긴다.
 * 막으려는 것은 며칠 ~ 몇 달 어긋난 수기 입력이라 5분이면 충분하다.
 */
export const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * 러닝맥스 비단조 위반 (순수 함수).
 * @param {Array<{idx: number, tag: string, when: number}>} entries idx 오름차순
 * @param {Set<number>} known
 */
export function findNonMonotonic(entries, known) {
	let runningMax = Number.NEGATIVE_INFINITY;
	let maxHolder = null;
	const violations = [];
	for (const entry of entries) {
		if (entry.when <= runningMax && !known.has(entry.idx)) violations.push({ entry, holder: maxHolder });
		if (entry.when > runningMax) {
			runningMax = entry.when;
			maxHolder = { idx: entry.idx, tag: entry.tag, when: entry.when };
		}
	}
	return violations;
}

/**
 * 지금보다 미래인 `when` (순수 함수). 개발 PC 시계가 CI 보다 조금 앞선 경우는 허용치로 넘긴다.
 * @param {Array<{idx: number, tag: string, when: number}>} entries
 * @param {number} nowMs 지금 시각(epoch ms)
 */
export function findFutureWhen(entries, nowMs) {
	const limit = nowMs + CLOCK_SKEW_TOLERANCE_MS;
	return entries.filter((entry) => entry.when > limit);
}

/**
 * idx 가 0 부터 빈틈 · 중복 없이 이어지지 않는 자리 (순수 함수). 끊긴 자리마다 하나씩만 낸다 — 직전 idx 다음 값과 비교하므로
 * 빈틈 하나가 그 뒤 entry 전부를 위반으로 만들지 않는다.
 * @param {Array<{idx: number, tag: string}>} entries idx 오름차순
 * @returns {Array<{entry: {idx: number, tag: string}, expected: number}>}
 */
export function findIdxGaps(entries) {
	return entries.flatMap((entry, position) => {
		const expected = position === 0 ? 0 : entries[position - 1].idx + 1;
		return entry.idx === expected ? [] : [{ entry, expected }];
	});
}

/** `.sql` 파일 tag ↔ journal tag 불일치 (순수 함수). dir 은 보고용 폴더 이름. */
export function findOrphans(sqlTags, tags, dir = "drizzle") {
	const problems = [];
	const tagSet = new Set(tags);
	for (const tag of sqlTags) {
		if (!tagSet.has(tag)) problems.push(`${dir}/${tag}.sql 이 journal 에 없음 — migrate 가 조용히 건너뜁니다`);
	}
	const sqlSet = new Set(sqlTags);
	for (const tag of tags) {
		if (!sqlSet.has(tag)) problems.push(`journal tag ${tag} 의 ${dir}/${tag}.sql 이 없음`);
	}
	if (tagSet.size !== tags.length) problems.push("journal 에 같은 tag 가 두 번 있음");
	return problems;
}

/** 보고용 시각 표기 — Date 범위를 벗어난 값(자릿수를 잘못 적은 when)은 표기 대신 그 사실을 적는다. */
function isoTime(ms) {
	const date = new Date(ms);
	return Number.isNaN(date.getTime()) ? "날짜로 표기할 수 없는 값" : date.toISOString();
}

/**
 * @param {{ root: string, options: object, now?: number }} input `now` 는 미래 시각 판정의 기준(epoch ms) — 기본은 실행 시각.
 */
export function run({ root, options, now = Date.now() }) {
	const journalPath = resolve(root, options.journalPath);
	let journal;
	try {
		journal = JSON.parse(readFileSync(journalPath, "utf8"));
	} catch (err) {
		console.error(`[check-journal-monotonic] journal 파일을 읽거나 파싱할 수 없습니다: ${journalPath}`);
		console.error(`  ${err.message}`);
		return 1;
	}

	const rawEntries = journal.entries ?? [];
	// idx · when 이 정수가 아니면 정렬 · 비교가 NaN 으로 조용히 통과한다(`undefined <= x` 는 false) — 형식부터 막는다.
	const malformed = rawEntries.filter((e) => !Number.isInteger(e?.idx) || !Number.isInteger(e?.when) || typeof e?.tag !== "string");
	if (malformed.length > 0) {
		console.error(`[check-journal-monotonic] idx · when(정수) · tag(문자열) 형식이 틀린 entry ${malformed.length}건: ${journalPath}`);
		for (const e of malformed) console.error(`  ${JSON.stringify(e)}`);
		return 1;
	}
	const entries = [...rawEntries].sort((a, b) => a.idx - b.idx);
	// 정상 journal 은 최소 baseline 1개를 가진다 — 비면 침묵 통과(fail-open) 대신 실패한다.
	if (entries.length === 0) {
		console.error(`[check-journal-monotonic] entries 가 비어있습니다 — journal 파일이 비정상입니다: ${journalPath}`);
		return 1;
	}

	const known = new Set(options.knownNonMonotonic.map((k) => k.idx));
	const violations = findNonMonotonic(entries, known);
	const future = findFutureWhen(entries, now);
	const idxGaps = findIdxGaps(entries);

	const drizzleDir = resolve(dirname(journalPath), "..");
	const sqlTags = readdirSync(drizzleDir)
		.filter((f) => f.endsWith(".sql"))
		.map((f) => f.slice(0, -".sql".length));
	const tags = entries.map((e) => e.tag);
	const orphanProblems = findOrphans(sqlTags, tags, relative(root, drizzleDir).split(sep).join("/"));

	// 쓰이지 않는 예외는 낡은 설정이다 — 그 idx 가 지금 단조라면 예외가 필요 없다.
	const actuallyNonMonotonic = new Set(findNonMonotonic(entries, new Set()).map((v) => v.entry.idx));
	const stale = options.knownNonMonotonic.filter((k) => !actuallyNonMonotonic.has(k.idx));

	if (violations.length + future.length + idxGaps.length + orphanProblems.length + stale.length === 0) {
		console.log(
			`check-journal-monotonic: OK (${entries.length} entries, idx 0 부터 연속, when 러닝맥스 단조 증가 · 미래 시각 없음, sql 파일 ${sqlTags.length}개 ↔ journal ${tags.length}개 정합)`,
		);
		return 0;
	}

	if (idxGaps.length > 0) {
		console.error("check-journal-monotonic: journal idx 가 0 부터 빈틈 · 중복 없이 이어지지 않음 — idx 순서와 knownNonMonotonic 지정을 믿을 수 없습니다");
		for (const { entry, expected } of idxGaps) {
			console.error(`  [위반] idx ${entry.idx} (${entry.tag}) — 이 자리에 올 idx 는 ${expected} 입니다`);
		}
		console.error("  → journal 을 손으로 고쳤거나 머지 충돌을 잘못 푼 흔적입니다. entries 의 idx 를 0 부터 차례로 맞추세요.");
	}
	if (future.length > 0) {
		console.error("check-journal-monotonic: journal when 이 미래 시각 — prod 에 적용되면 그 뒤 마이그레이션이 전부 조용히 skip 됩니다");
		for (const entry of future) {
			console.error(
				`  [위반] idx ${entry.idx} (${entry.tag}) when=${entry.when} (${isoTime(entry.when)}) > ` +
					`지금 ${now} (${isoTime(now)}) + 허용치 ${CLOCK_SKEW_TOLERANCE_MS}ms`,
			);
		}
		console.error(
			"  → when 은 그 마이그레이션을 실제로 생성한 시각(epoch ms)이어야 합니다. 손으로 적은 값이면 실제 시각으로 고치세요 — " +
				"이미 prod 에 적용됐다면 __drizzle_migrations.created_at 도 같은 값으로 맞춰야 합니다.",
		);
	}

	if (violations.length > 0) {
		console.error("check-journal-monotonic: journal when 비단조 — drizzle migrate 가 조용히 skip 할 위험");
		for (const { entry, holder } of violations) {
			console.error(
				`  [위반] idx ${entry.idx} (${entry.tag}) when=${entry.when} ≤ ` +
					`이전 최대 idx ${holder.idx} (${holder.tag}) when=${holder.when}`,
			);
		}
		console.error(
			"  → 새 마이그레이션의 when 은 이전 전체 최대값보다 커야 합니다 " +
				"(drizzle 게이트가 max(created_at) 기준이라 작거나 같으면 silent-skip).",
		);
	}
	if (orphanProblems.length > 0) {
		console.error("check-journal-monotonic: 마이그레이션 파일 ↔ journal 불일치 — drizzle migrate 는 journal 만 봅니다");
		for (const problem of orphanProblems) console.error(`  [위반] ${problem}`);
		console.error(
			"  → 드라이 db:generate 뒷정리는 산출물(.sql·snapshot) 삭제 + journal 마지막 항목만 제거로 — " +
				"`git checkout _journal.json` 은 미커밋 실제 항목까지 되돌립니다.",
		);
	}
	if (stale.length > 0) {
		console.error("check-journal-monotonic: 더는 비단조가 아닌 knownNonMonotonic 항목 — harness.config.json 에서 지우세요:");
		for (const k of stale) console.error(`  idx ${k.idx}`);
	}
	return 1;
}
