#!/usr/bin/env node
/**
 * 결정 문서의 **상태 인덱스/목차 표**와 **Decision 헤더**가 1:1 대응하는지 검증한다.
 *
 * 배경: 기존 `/qa` 인라인 체크는 "인덱스 행 수 == 헤더 수" **개수**만 비교했다. 개수 비교는
 *   한쪽 누락을 반대쪽 오타가 상쇄하면(예: 헤더 하나 추가 + 무관한 인덱스 행 하나 오타) 총합이
 *   그대로라 조용히 통과한다. 여기서는 **번호 집합**을 대조해 다음을 검출한다:
 *     - MISSING   : 헤더에 있으나 인덱스/목차에 없음
 *     - DANGLING  : 인덱스/목차에 있으나 헤더에 없음
 *     - DUP_HEADER: 같은 식별자의 Decision 헤더가 둘 이상
 *     - DUP_INDEX : 같은 식별자의 인덱스/목차 행이 둘 이상
 *
 * 식별자는 레거시 순번(`6-1`, `76`)과 신규 이슈번호(`#992`, `#992-1`)를 모두 포함하며, `#` 접두는
 *   의미가 있으므로(레거시 vs 신규 구분) 접두 포함 그대로 대조한다
 *   — 헤더 `## Decision #992` 는 인덱스 `| #992 |` 와만 매칭되고 `| 992 |` 와는 불일치로 잡힌다.
 *
 * supersede 포인터(`→ D47`)의 유효성은 **비목표**다 — 상태 셀이 자유서술이라 파싱이 fuzzy,
 *   false-positive 위험. 결정론 판정만 스크립트로 한다(하네스 스크립트 우선 원칙).
 *
 * 하나라도 불일치면 exit 1.
 *
 * 사용: `node "${CLAUDE_PLUGIN_ROOT}/scripts/check-decisions-index.mjs"` (qa/release 스킬이 프로젝트 루트 cwd 에서 호출). `/qa` 가 decisions
 *   파일 변경 시 호출. repo 루트는 실행 cwd 가 속한 git 트리의 루트다 (아래 ROOT 주석 — sibling
 *   check-decision-versions.mjs 와 같은 방식).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// repo 루트 = 실행 cwd 가 속한 git 트리의 루트. 호출 계약: qa/release 스킬이
// 프로젝트 루트 cwd 에서 실행한다. 스크립트 위치 기준을 쓰지 않는 이유 — 플러그인
// 배포 시 스크립트는 플러그인 캐시(비-git 디렉토리)에 놓이기 때문. worktree 에서는
// 그 worktree 루트가 나온다 (자기 트리 검증).
const ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

// 파일별로 "인덱스 표를 여는 섹션 헤더"가 다르다: live 로그는 `## 상태 인덱스`(active/superseded 권위),
// archive 는 `## 목차`(네비게이션 TOC — 상태 권위 아님).
// 넷 다 선택 대상이다 — 있는 파일만 검사한다 (하나도 없으면 아래에서 루트 해석 실패로 본다).
// harness-decisions-archive 는 harness-decisions 의 원문을 따로 보관하는 프로젝트에만 있다
// (두 live 파일의 순번이 겹쳐 decisions-archive 한 파일에 섞을 수 없을 때).
const FILES = [
	{ path: "docs/architecture-decisions.md", section: "상태 인덱스" },
	{ path: "docs/harness-decisions.md", section: "상태 인덱스" },
	{ path: "docs/decisions-archive.md", section: "목차" },
	{ path: "docs/harness-decisions-archive.md", section: "목차" },
];

const HEADER_RE = /^## Decision (#?\d+(?:-\d+)?):/; // `## Decision 76:` / `## Decision #992:` / `## Decision 6-1:`
const ROW_RE = /^\| (#?\d+(?:-\d+)?) \|/; // 표 데이터 행 `| 76 | ... |` / `| #992 | ... |`

/** 파일 텍스트에서 헤더 식별자 목록(등장 순, 중복 포함)을 뽑는다. */
function headerIds(text) {
	const ids = [];
	for (const line of text.split("\n")) {
		const m = line.match(HEADER_RE);
		if (m) ids.push(m[1]);
	}
	return ids;
}

/**
 * `## <section>` 섹션 안의 표 데이터 행에서 식별자 목록(등장 순, 중복 포함)을 뽑는다.
 * 섹션은 `## <section>` 부터 다음 `---` 또는 다음 `## ` 헤더 직전까지. 섹션이 아예 없으면 null.
 */
function indexIds(text, section) {
	const lines = text.split("\n");
	const start = lines.findIndex((l) => l.trim() === `## ${section}`);
	if (start === -1) return null;
	const ids = [];
	for (let i = start + 1; i < lines.length; i++) {
		const line = lines[i];
		if (/^---\s*$/.test(line) || /^## /.test(line)) break;
		const m = line.match(ROW_RE);
		if (m) ids.push(m[1]);
	}
	return ids;
}

/** 중복 식별자(2회 이상 등장)를 순서 보존해 반환. */
function duplicates(ids) {
	const seen = new Map();
	for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
	return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

if (!FILES.some((f) => existsSync(join(ROOT, f.path)))) {
	console.error(`[error] 결정 문서를 찾을 수 없습니다 (ROOT=${ROOT}). repo 루트 해석 실패.`);
	process.exit(1);
}

let bad = false;

for (const { path, section } of FILES) {
	const abs = join(ROOT, path);
	if (!existsSync(abs)) continue;
	const text = readFileSync(abs, "utf8");

	const headers = headerIds(text);
	const index = indexIds(text, section);

	if (index === null) {
		bad = true;
		console.log(`${path}: NO_SECTION — \`## ${section}\` 섹션을 찾을 수 없음`);
		continue;
	}

	const headerSet = new Set(headers);
	const indexSet = new Set(index);
	const missing = headers.filter((id) => !indexSet.has(id)); // 헤더에만
	const dangling = index.filter((id) => !headerSet.has(id)); // 인덱스에만
	const dupHeader = duplicates(headers);
	const dupIndex = duplicates(index);

	if (missing.length || dangling.length || dupHeader.length || dupIndex.length) {
		bad = true;
		console.log(`${path}: MISMATCH (헤더 ${headerSet.size} / ${section} ${indexSet.size})`);
		if (missing.length) console.log(`  MISSING (헤더에 있으나 ${section}에 없음): ${[...new Set(missing)].join(", ")}`);
		if (dangling.length)
			console.log(`  DANGLING (${section}에 있으나 헤더에 없음): ${[...new Set(dangling)].join(", ")}`);
		if (dupHeader.length) console.log(`  DUP_HEADER (헤더 중복): ${dupHeader.join(", ")}`);
		if (dupIndex.length) console.log(`  DUP_INDEX (${section} 중복): ${dupIndex.join(", ")}`);
	} else {
		console.log(`${path}: OK (${headerSet.size}개 헤더 ↔ ${section} 정합)`);
	}
}

process.exit(bad ? 1 : 0);
