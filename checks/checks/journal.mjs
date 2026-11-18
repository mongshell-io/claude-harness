/**
 * journal — drizzle 마이그레이션 journal 의 `when` 러닝맥스 단조 증가 + `.sql` ↔ journal tag 1:1.
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
 * 불변식: journal 옆 폴더의 *.sql 파일명 ↔ journal tag 가 1:1 (스냅샷 유무 · idx 연속은 보지 않는다).
 *
 * 설정 `knownNonMonotonic` — 가드 도입 전 이미 prod 에 적용된 비단조 idx. 정정하면 멱등이 아닌 SQL 이 재적용될 위험이 있어
 * 예외로 둔다. 예외 idx 도 러닝맥스 갱신엔 참여하므로 향후 마이그레이션은 러닝맥스 위에 있어야 통과한다
 * = prod __drizzle_migrations 게이트와 같은 기준.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const name = "journal";

export const schema = {
	journalPath: { type: "string", default: "drizzle/meta/_journal.json" },
	knownNonMonotonic: { type: "items", fields: { idx: "integer" }, default: [] },
};

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

/** `.sql` 파일 tag ↔ journal tag 불일치 (순수 함수). */
export function findOrphans(sqlTags, tags) {
	const problems = [];
	const tagSet = new Set(tags);
	for (const tag of sqlTags) {
		if (!tagSet.has(tag)) problems.push(`${tag}.sql 이 journal 에 없음 — migrate 가 조용히 건너뜁니다`);
	}
	const sqlSet = new Set(sqlTags);
	for (const tag of tags) {
		if (!sqlSet.has(tag)) problems.push(`journal tag ${tag} 의 ${tag}.sql 이 없음`);
	}
	if (tagSet.size !== tags.length) problems.push("journal 에 같은 tag 가 두 번 있음");
	return problems;
}

export function run({ root, options }) {
	const journalPath = resolve(root, options.journalPath);
	let journal;
	try {
		journal = JSON.parse(readFileSync(journalPath, "utf8"));
	} catch (err) {
		console.error(`[check-journal-monotonic] journal 파일을 읽거나 파싱할 수 없습니다: ${journalPath}`);
		console.error(`  ${err.message}`);
		return 1;
	}

	const entries = [...(journal.entries ?? [])].sort((a, b) => a.idx - b.idx);
	// 정상 journal 은 최소 baseline 1개를 가진다 — 비면 침묵 통과(fail-open) 대신 실패한다.
	if (entries.length === 0) {
		console.error(`[check-journal-monotonic] entries 가 비어있습니다 — journal 파일이 비정상입니다: ${journalPath}`);
		return 1;
	}

	const known = new Set(options.knownNonMonotonic.map((k) => k.idx));
	const violations = findNonMonotonic(entries, known);

	const drizzleDir = resolve(dirname(journalPath), "..");
	const sqlTags = readdirSync(drizzleDir)
		.filter((f) => f.endsWith(".sql"))
		.map((f) => f.slice(0, -".sql".length));
	const tags = entries.map((e) => e.tag);
	const orphanProblems = findOrphans(sqlTags, tags);

	// 쓰이지 않는 예외는 낡은 설정이다 — 그 idx 가 지금 단조라면 예외가 필요 없다.
	const actuallyNonMonotonic = new Set(findNonMonotonic(entries, new Set()).map((v) => v.entry.idx));
	const stale = options.knownNonMonotonic.filter((k) => !actuallyNonMonotonic.has(k.idx));

	if (violations.length === 0 && orphanProblems.length === 0 && stale.length === 0) {
		console.log(
			`check-journal-monotonic: OK (${entries.length} entries, when 러닝맥스 단조 증가, sql 파일 ${sqlTags.length}개 ↔ journal ${tags.length}개 정합)`,
		);
		return 0;
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
