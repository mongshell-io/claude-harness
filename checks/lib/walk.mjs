import { lstatSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** 걷지 않는 폴더 — 의존성 · 빌드 산출물 · 숨김 폴더(.claude/worktrees 같은 다른 체크아웃 포함). */
const SKIPPED_DIR = (entry) => entry === "node_modules" || entry.startsWith(".");

/**
 * dir 아래 파일 경로를 모은다. 심볼릭 링크는 따라가지 않는다 — 링크를 추종하면 저장소 밖을 읽고,
 * 깨진 링크에서는 스택트레이스로 죽어 검사 위반과 구분되지 않는다. dir 이 없으면 빈 배열.
 * @param {string} dir
 * @param {(name: string) => boolean} accept 파일 이름 필터
 */
export function walkFiles(dir, accept) {
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
		if (stat.isDirectory()) {
			if (!SKIPPED_DIR(entry)) found.push(...walkFiles(full, accept));
		} else if (accept(entry)) {
			found.push(full);
		}
	}
	return found;
}
