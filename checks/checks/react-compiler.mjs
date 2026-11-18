/**
 * react-compiler — React Compiler 가 컴파일하지 못하고 건너뛰는 함수(CompileError)가 0개인지 검사한다.
 *
 * 왜: next.config.ts 의 reactCompiler 는 규칙 위반·미지원 문법을 만난 함수를 조용히 건너뛴다(빌드는 통과).
 * 그 함수는 자동 메모이제이션을 받지 못하는데 아무도 모른다(감바우 Decision #1506 · 셀캐디 Decision #298-1).
 *
 * 범위: srcDir 의 화면 코드 — skipDirs(기본 `src/app/api` · `src/test`) · 테스트 파일 · .d.ts 제외. 컴파일러는
 * 컴포넌트·훅으로 보이는 함수만 다루므로 서버 전용 lib 를 함께 넘겨도 결과에 영향이 없다.
 *
 * babel 은 앱의 next 가 내장한 것(next/dist/compiled/babel/core)을, 플러그인은 앱의 babel-plugin-react-compiler 를
 * 앱 package.json 기준으로 해석한다 — 이 패키지가 의존성을 갖지 않고, 앱이 실제로 빌드에 쓰는 판으로 검사하려고.
 * 컴파일러 옵션은 next 와 같은 기본값(reactCompiler: true)에 logger 만 더한다.
 *
 * 의도적 예외는 설정 `allowed` 에 { file, reason(컴파일러 사유 문구 일부), why } 로 적는다.
 * 쓰이지 않는 예외가 남아 있어도 실패한다(낡은 예외 방지).
 */

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { walkFiles } from "../lib/walk.mjs";

export const name = "react-compiler";

export const schema = {
	srcDir: { type: "string", default: "src" },
	skipDirs: { type: "string[]", default: ["src/app/api", "src/test"] },
	allowed: { type: "items", fields: { file: "string", reason: "string" }, default: [] },
};

const SOURCE_FILE = /\.(tsx?|jsx?)$/;
const SKIPPED_FILE = /\.(test|spec)\.[tj]sx?$|\.d\.ts$/;

/** 저장소 기준 경로 목록에서 검사 대상을 고른다 (순수 함수, 경로 구분자는 `/`). */
export function selectTargets(relFiles, skipDirs) {
	const prefixes = skipDirs.map((d) => `${d.replace(/\/+$/, "")}/`);
	return relFiles.filter(
		(f) => SOURCE_FILE.test(f) && !SKIPPED_FILE.test(f.split("/").pop()) && !prefixes.some((p) => f.startsWith(p)),
	);
}

/** 컴파일러 진단 객체에서 사유·분류·위치를 꺼낸다(CompilerDiagnostic 과 CompilerErrorDetail 의 모양이 다르다). */
function describe(detail) {
	const options = detail.options ?? detail;
	const loc = options.loc ?? options.details?.find((d) => d.loc)?.loc ?? null;
	return { reason: options.reason ?? String(detail), category: options.category ?? "", line: loc?.start?.line ?? "?" };
}

/** 파일 하나를 컴파일러에 통과시키고 CompileError 목록을 돌려준다. 구문 오류 등 컴파일 자체가 깨지면 그것도 오류로 센다. */
function compileErrorsOf(babel, compilerPlugin, file) {
	const errors = [];
	const logger = {
		logEvent(_filename, event) {
			if (event.kind === "CompileError") errors.push(describe(event.detail));
			// PipelineError 는 detail 없이 사유 문자열(data)과 위치(fnLoc)만 싣는다(babel-plugin-react-compiler 1.0 PipelineErrorEvent).
			else if (event.kind === "PipelineError")
				errors.push({ reason: event.data, category: "Pipeline", line: event.fnLoc?.start?.line ?? "?" });
		},
	};
	try {
		babel.transformSync(readFileSync(file, "utf8"), {
			filename: file,
			babelrc: false,
			configFile: false,
			sourceType: "module",
			parserOpts: { plugins: ["typescript", "jsx"] },
			plugins: [[compilerPlugin, { panicThreshold: "none", logger }]],
			code: false,
		});
	} catch (err) {
		errors.push({ reason: `babel 변환 실패: ${err.message}`, category: "Crash", line: "?" });
	}
	return errors;
}

export function run({ root, options }) {
	const appRequire = createRequire(join(root, "package.json"));
	let babel;
	let compilerPlugin;
	try {
		babel = appRequire("next/dist/compiled/babel/core");
		compilerPlugin = appRequire.resolve("babel-plugin-react-compiler");
	} catch (err) {
		console.error(`React Compiler 검사: 앱 의존성(next · babel-plugin-react-compiler)을 찾지 못했습니다 — ${err.message}`);
		return 1;
	}

	const started = Date.now();
	const relFiles = walkFiles(resolve(root, options.srcDir), (f) => SOURCE_FILE.test(f)).map((f) =>
		relative(root, f).split(sep).join("/"),
	);
	const files = selectTargets(relFiles, options.skipDirs);
	if (files.length === 0) {
		console.error(`React Compiler 검사: ${options.srcDir} 에서 검사할 파일을 하나도 찾지 못했습니다 — 공회전이라 통과로 치지 않습니다.`);
		return 1;
	}

	const usedAllowances = new Set();
	const failures = [];
	for (const rel of files) {
		for (const error of compileErrorsOf(babel, compilerPlugin, join(root, rel))) {
			const allowance = options.allowed.find((a) => a.file === rel && error.reason.includes(a.reason));
			if (allowance) usedAllowances.add(allowance);
			else failures.push(`  ${rel}:${error.line}  [${error.category}] ${error.reason}`);
		}
	}

	const staleAllowances = options.allowed.filter((a) => !usedAllowances.has(a));
	const elapsed = ((Date.now() - started) / 1000).toFixed(1);

	if (failures.length > 0) {
		console.error(
			`React Compiler 가 건너뛴 함수 ${failures.length}건 — 원인을 고치거나, 불가피하면 harness.config.json checks.react-compiler.allowed 에 이유와 함께 적으세요:`,
		);
		console.error(failures.join("\n"));
	}
	if (staleAllowances.length > 0) {
		console.error("더는 발생하지 않는 allowed 항목 — harness.config.json 에서 지우세요:");
		for (const a of staleAllowances) console.error(`  ${a.file}  ${a.reason}`);
	}
	if (failures.length > 0 || staleAllowances.length > 0) return 1;
	console.log(
		`React Compiler: ${files.length}개 파일, 건너뛴 함수 0건 (예외 ${options.allowed.length}건, ${elapsed}s)`,
	);
	return 0;
}
