/**
 * ui-barrel — UI barrel(`<dir>/index.ts` 또는 `index.tsx`)의 re-export 가 실제 파일을 가리키는지 검사한다.
 *
 * 왜: barrel 은 모든 화면이 import 하는 길목이라, 지워지거나 이름이 바뀐 파일을 가리키는 줄을 typecheck 결과와 별개로
 * 이름 붙은 오류([broken-reexport])로 바로 보여 준다. typecheck 와 상당 부분 겹친다는 것을 알고 둔다 — 저장소별 대조
 * (감바우의 README 카탈로그 등)가 이 판정 위에 얹힌다.
 *
 * 공통으로 두는 것은 이 판정(깨진 re-export, `export *` · `export * as ns` 포함)뿐이다. 감바우의 README 카탈로그 대조 ·
 * `sideEffects` 표식 검사는 그 저장소 고유 규약이라 감바우 로컬 스크립트로 남긴다.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const name = "ui-barrel";

export const schema = {
	dir: { type: "string", default: "src/components/ui" },
};

const INDEX_FILES = ["index.ts", "index.tsx"];

// export { Foo, Bar } from "./Module" · export type { T } from "./Module" · export * from "./Module" · export * as ns from "./Module"
const RE_EXPORT = /^export\s+(?:type\s+)?(?:\{[^}]+\}|\*(?:\s+as\s+\w+)?)\s+from\s+["']([^"']+)["']/gm;

/** barrel 원문에서 re-export 모듈 경로를 뽑는다 (순수 함수). */
export function parseReExports(source) {
	return [...source.matchAll(RE_EXPORT)].map((m) => m[1]);
}

/** 모듈 경로가 가리킬 수 있는 파일 후보 — .tsx / .ts / 폴더의 index. */
export function moduleCandidates(dir, mod) {
	return [`${mod}.tsx`, `${mod}.ts`, join(mod, "index.tsx"), join(mod, "index.ts")].map((p) => join(dir, p));
}

export function run({ root, options }) {
	const dir = resolve(root, options.dir);
	const present = INDEX_FILES.filter((f) => existsSync(join(dir, f)));
	if (present.length !== 1) {
		console.error(
			present.length === 0
				? `check-ui-barrel: ${options.dir} 에 ${INDEX_FILES.join(" · ")} 가 없습니다 — 설정 dir 을 확인하세요.`
				: `check-ui-barrel: ${options.dir} 에 ${present.join(" 과 ")} 가 함께 있습니다 — barrel 은 하나만 둡니다.`,
		);
		return 1;
	}
	const indexFile = present[0];
	const modules = parseReExports(readFileSync(join(dir, indexFile), "utf8"));

	// re-export 가 하나도 안 잡히면 파서가 형식 변화를 놓친 것이다 — 침묵 통과(fail-open) 대신 막는다.
	if (modules.length === 0) {
		console.error(
			`check-ui-barrel: ${indexFile} 에서 re-export 를 하나도 찾지 못했습니다 — 형식이 바뀌었으면 이 검사를 맞추세요.`,
		);
		return 1;
	}

	let errors = 0;
	for (const mod of modules) {
		if (!moduleCandidates(dir, mod).some((p) => existsSync(p))) {
			console.error(`[broken-reexport] ${indexFile} 의 "${mod}" 모듈 파일을 찾을 수 없습니다.`);
			errors++;
		}
	}

	if (errors === 0) {
		console.log(`check-ui-barrel: OK (re-export ${modules.length}개, drift 없음)`);
		return 0;
	}
	console.error(`check-ui-barrel: ${errors}개 항목 drift 발견`);
	return 1;
}
