#!/usr/bin/env node
/**
 * mongshell-check — mongshell-io 앱 저장소 공용 검사 실행기.
 *
 *   mongshell-check <검사>          검사 하나 (harness.config.json checks.<검사> 의 값으로)
 *   mongshell-check all [--jobs N]  package.json 의 check:* 전부 (공용 · 로컬 구분 없이)
 * 그 밖의 인자는 사용법 오류다 — 잘못 붙인 옵션이 조용히 무시되지 않게.
 *
 * 앱 저장소 루트(cwd)에서 돈다 — package.json 스크립트로 부르면 pnpm 이 루트에서 돌린다.
 * 종료 코드: 0 통과 · 1 위반 또는 설정 오류 · 2 사용법 오류.
 */

import {
	ConfigError,
	enabledCheckNames,
	readHarnessConfig,
	readPackageJson,
	resolveOptions,
	resolveRoot,
	validateConfigShape,
} from "../lib/config.mjs";
import { CHECKS } from "../lib/registry.mjs";
import { DEFAULT_JOBS, runAll } from "../lib/run-all.mjs";

const USAGE = `사용: mongshell-check <${Object.keys(CHECKS).join("|")}> | all [--jobs N]`;

/** `all` 의 인자 — 비었거나 `--jobs N` 하나만 받는다. 그 밖이면 null. */
function parseAllArgs(args) {
	if (args.length === 0) return DEFAULT_JOBS;
	if (args.length !== 2 || args[0] !== "--jobs" || !/^[1-9]\d*$/.test(args[1])) return null;
	return Number(args[1]);
}

async function main(argv) {
	const [command, ...rest] = argv;
	if (!command || command === "--help" || command === "-h") {
		console.log(USAGE);
		return command ? 0 : 2;
	}

	const root = resolveRoot();
	const pkg = readPackageJson(root);

	if (command === "all") {
		const jobs = parseAllArgs(rest);
		if (jobs === null) {
			console.error(`all 은 --jobs N(양의 정수) 외의 인자를 받지 않습니다: ${rest.join(" ")}\n${USAGE}`);
			return 2;
		}
		return runAll({ root, pkg, jobs });
	}

	if (!Object.hasOwn(CHECKS, command)) {
		console.error(`모르는 검사: ${command}\n${USAGE}`);
		return 2;
	}
	if (rest.length > 0) {
		console.error(`${command} 는 인자를 받지 않습니다(값은 harness.config.json 에서 읽는다): ${rest.join(" ")}\n${USAGE}`);
		return 2;
	}
	const check = CHECKS[command];
	const config = readHarnessConfig(root);
	const shapeProblems = validateConfigShape(config, enabledCheckNames(pkg), Object.keys(CHECKS));
	if (shapeProblems.length > 0) throw new ConfigError(shapeProblems.join("\n"));
	const options = resolveOptions(command, check.schema, config?.checks?.[command]);
	return check.run({ root, options });
}

try {
	process.exitCode = await main(process.argv.slice(2));
} catch (err) {
	if (!(err instanceof ConfigError)) throw err;
	console.error(`mongshell-check: 설정 오류\n${err.message}`);
	process.exitCode = 1;
}
