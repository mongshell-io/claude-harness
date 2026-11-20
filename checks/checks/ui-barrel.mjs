/**
 * ui-barrel — UI barrel(`<dir>/index.ts` 또는 `index.tsx`)의 re-export 가 실제 파일을 가리키는지 검사한다.
 *
 * 왜: barrel 은 모든 화면이 import 하는 길목이라, 지워지거나 이름이 바뀐 파일을 가리키는 줄을 typecheck 결과와 별개로
 * 이름 붙은 오류([broken-reexport])로 바로 보여 준다. typecheck 와 상당 부분 겹친다는 것을 알고 둔다 — 저장소별 대조
 * (감바우의 README 카탈로그 등)가 이 판정 위에 얹힌다.
 *
 * 공통으로 두는 것은 이 판정(깨진 re-export, `export *` · `export * as ns` 포함)뿐이다. 감바우의 README 카탈로그 대조 ·
 * `sideEffects` 표식 검사는 그 저장소 고유 규약이라 감바우 로컬 스크립트로 남긴다.
 *
 * 판정 대상은 **상대경로 지정자**(`./` · `../` 로 시작)뿐이다 — 파일이 있는지를 이 검사가 폴더만 보고 답할 수 있는 것.
 *   상대경로      확장자 없는 지정자는 `.tsx` · `.ts` · `.d.ts` · `.jsx` · `.js` 와 폴더의 index 를 찾는다. 확장자를 적은
 *                 지정자(`./button.tsx`)는 그 파일을 그대로 찾고, `.js` 계열로 적은 것(`./button.js`)은 같은 이름의
 *                 TypeScript 파일도 찾는다(TS 가 `.js` 지정자를 `.ts` · `.tsx` 원본으로 푼다).
 *   패키지 · 별칭  `@radix-ui/react-dialog` · `@/lib/utils` 같은 지정자는 깨짐 판정에서 뺀다. 패키지는 node_modules 해석을,
 *                 별칭은 tsconfig `paths`(주석 · `extends` 포함)를 읽어야 답할 수 있는데, 이 검사는 둘 다 읽지 않는다 —
 *                 어설프게 풀면 멀쩡한 줄을 깨진 것으로 보고한다. 그 지정자가 깨졌는지는 typecheck 가 잡는다.
 * 상대경로 re-export 가 하나도 없으면 확인한 것이 없으므로 실패한다(공회전).
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

export const name = "ui-barrel";

export const schema = {
	dir: { type: "string", default: "src/components/ui" },
};

const INDEX_FILES = ["index.ts", "index.tsx"];

// export { Foo, Bar } from "./Module" · export type { T } from "./Module" · export * from "./Module" · export * as ns from "./Module"
const RE_EXPORT = /^export\s+(?:type\s+)?(?:\{[^}]+\}|\*(?:\s+as\s+\w+)?)\s+from\s+["']([^"']+)["']/gm;

/** 상대경로 지정자 — `.` · `..` 또는 `./` · `../` 로 시작한다. 그 밖(패키지 이름 · 경로 별칭)은 파일로 확인하지 않는다. */
const RELATIVE_SPECIFIER = /^\.\.?(?:\/|$)/;

/** 확장자 없는 지정자가 가리킬 수 있는 파일의 확장자. */
const MODULE_EXTENSIONS = [".tsx", ".ts", ".d.ts", ".jsx", ".js"];

/** `.js` 계열로 적은 지정자가 실제로 가리킬 수 있는 TypeScript 원본의 확장자. */
const TS_SOURCES_OF = {
	".js": [".ts", ".tsx", ".d.ts"],
	".jsx": [".tsx"],
	".mjs": [".mts", ".d.mts"],
	".cjs": [".cts", ".d.cts"],
};

/** barrel 원문에서 re-export 모듈 경로를 뽑는다 (순수 함수). */
export function parseReExports(source) {
	return [...source.matchAll(RE_EXPORT)].map((m) => m[1]);
}

/** 파일로 확인할 수 있는 지정자인가 (순수 함수). */
export function isRelativeSpecifier(mod) {
	return RELATIVE_SPECIFIER.test(mod);
}

/**
 * 상대경로 지정자가 가리킬 수 있는 파일 후보 (순수 함수) — 적힌 그대로의 파일, `.js` 계열이면 같은 이름의 TypeScript 원본,
 * 확장자를 붙인 파일, 폴더의 index.
 */
export function moduleCandidates(dir, mod) {
	const written = /\.(?:[cm]?js|jsx)$/.exec(mod)?.[0];
	const tsSources = written ? TS_SOURCES_OF[written].map((ext) => mod.slice(0, -written.length) + ext) : [];
	return [
		mod,
		...tsSources,
		...MODULE_EXTENSIONS.map((ext) => `${mod}${ext}`),
		...MODULE_EXTENSIONS.map((ext) => join(mod, `index${ext}`)),
	].map((p) => join(dir, p));
}

/** 폴더가 아니라 파일로 있는가 — `./table` 은 폴더 자체가 아니라 그 안의 index 가 있어야 한다. */
function isFile(path) {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
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

	const relativeModules = modules.filter(isRelativeSpecifier);
	const skipped = modules.length - relativeModules.length;
	// 파일로 확인할 수 있는 것이 0건이면 이 검사는 아무것도 보지 않은 것이다 — 통과로 치지 않는다.
	if (relativeModules.length === 0) {
		console.error(
			`check-ui-barrel: ${indexFile} 의 re-export ${modules.length}개가 전부 패키지 · 별칭 지정자라 확인할 파일이 없습니다 — 공회전이라 통과로 치지 않습니다.`,
		);
		return 1;
	}

	let errors = 0;
	for (const mod of relativeModules) {
		if (!moduleCandidates(dir, mod).some(isFile)) {
			console.error(`[broken-reexport] ${indexFile} 의 "${mod}" 모듈 파일을 찾을 수 없습니다.`);
			errors++;
		}
	}

	if (errors === 0) {
		const note = skipped > 0 ? ` — 상대경로 ${relativeModules.length}개 확인, 패키지 · 별칭 ${skipped}개는 판정 제외` : "";
		console.log(`check-ui-barrel: OK (re-export ${modules.length}개${note}, drift 없음)`);
		return 0;
	}
	console.error(`check-ui-barrel: ${errors}개 항목 drift 발견`);
	return 1;
}
