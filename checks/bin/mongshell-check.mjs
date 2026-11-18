#!/usr/bin/env node
/**
 * mongshell-check — mongshell-io 앱 저장소 공용 검사 실행기.
 *
 *   mongshell-check <검사>          검사 하나 (harness.config.json checks.<검사> 의 값으로)
 *   mongshell-check all [--jobs N]  package.json 의 check:* 전부 (공용 · 로컬 구분 없이)
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

function parseJobs(args) {
	const i = args.indexOf("--jobs");
	if (i === -1) return DEFAULT_JOBS;
	const n = Number(args[i + 1]);
	return Number.isInteger(n) && n > 0 ? n : null;
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
		const jobs = parseJobs(rest);
		if (jobs === null) {
			console.error(`--jobs 는 양의 정수여야 합니다\n${USAGE}`);
			return 2;
		}
		return runAll({ root, pkg, jobs });
	}

	const check = CHECKS[command];
	if (!check) {
		console.error(`모르는 검사: ${command}\n${USAGE}`);
		return 2;
	}
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
