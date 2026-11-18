import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** 걷지 않는 폴더 — 의존성. */
const DEPENDENCY_DIR = "node_modules";

/**
 * dir 아래 파일 경로를 모은다. 심볼릭 링크는 따라가지 않는다 — 링크를 추종하면 저장소 밖을 읽고,
 * 깨진 링크에서는 스택트레이스로 죽어 검사 위반과 구분되지 않는다. dir 이 없으면 빈 배열.
 * 숨김 항목(`.` 으로 시작)은 기본으로 걷는다 — `src/app/.well-known/` 같은 실제 라우트가 있다. 저장소 루트처럼
 * `.claude/worktrees`(다른 체크아웃) · `.next` 가 있는 곳을 걸을 때는 `skipHidden` 을 켠다.
 * @param {string} dir
 * @param {(name: string) => boolean} accept 파일 이름 필터
 * @param {{ skipHidden?: boolean }} [opts]
 */
export function walkFiles(dir, accept, opts = {}) {
	const found = [];
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return found;
	}
	for (const entry of entries.sort()) {
		const full = join(dir, entry);
		let stat;
		try {
			stat = lstatSync(full);
		} catch {
			continue;
		}
		if (stat.isSymbolicLink()) continue;
		if (opts.skipHidden && entry.startsWith(".")) continue;
		if (stat.isDirectory()) {
			if (entry !== DEPENDENCY_DIR) found.push(...walkFiles(full, accept, opts));
		} else if (accept(entry)) {
			found.push(full);
		}
	}
	return found;
}
