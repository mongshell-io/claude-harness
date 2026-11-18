/**
 * 앱 저장소 루트와 harness.config.json 을 읽고 검사 섹션을 검증한다.
 *
 * 규칙 (fail-closed — 설정이 어긋나면 검사를 돌리지 않고 실패한다):
 * - ROOT 는 `process.cwd()` 다. `git rev-parse` 를 쓰지 않는다 — Docker 빌드 컨텍스트에는 .git 이 없다.
 *   pnpm 은 스크립트를 패키지 루트에서 돌리므로 `pnpm check:<name>` 이면 cwd 가 곧 루트다.
 *   cwd 에 package.json 이 없으면 엉뚱한 곳을 검사하는 것이라 실패한다.
 * - package.json 에 `check:<name>` 스크립트가 있으면 그 검사는 켜진 것이다. 켜진 검사는 harness.config.json 의
 *   `checks.<name>` 섹션이 있어야 한다(값이 전부 기본값이어도 `{}` 로 적는다 — 켰다는 것을 설정에 남긴다).
 * - 섹션에 모르는 키가 있거나 타입이 틀리면 실패한다 — 오타 난 키가 조용히 기본값으로 돌아가는 것을 막는다.
 * - 켜지지 않은 검사의 섹션이 남아 있으면 실패한다(낡은 설정).
 * - 예외 · 허용 목록의 항목은 전부 `why`(비어 있지 않은 문자열)를 가진다.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const CONFIG_FILE = "harness.config.json";

export class ConfigError extends Error {}

/** cwd 를 저장소 루트로 확정한다. */
export function resolveRoot(cwd = process.cwd()) {
	if (!existsSync(join(cwd, "package.json"))) {
		throw new ConfigError(
			`현재 폴더(${cwd})에 package.json 이 없습니다 — 앱 저장소 루트에서 실행하세요(pnpm check:<name>).`,
		);
	}
	return cwd;
}

export function readPackageJson(root) {
	return JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
}

/** package.json 의 `check:*` 스크립트 이름(접두 제외) 목록. */
export function enabledCheckNames(pkg) {
	return Object.keys(pkg.scripts ?? {})
		.filter((k) => k.startsWith("check:"))
		.map((k) => k.slice("check:".length));
}

export function readHarnessConfig(root) {
	const path = join(root, CONFIG_FILE);
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8"));
	} catch (err) {
		throw new ConfigError(`${CONFIG_FILE} 을 파싱할 수 없습니다: ${err.message}`);
	}
}

const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;

/**
 * 값 하나를 스키마 항목에 맞춰 검증한다.
 * 스키마 항목: { type: "string" | "string[]" | "items", fields?: { 이름: "string" | "integer" } }
 * `items` 는 객체 배열이고 각 객체는 fields 의 키 + `why` 를 정확히 가진다.
 */
function validateValue(where, spec, value) {
	if (spec.type === "string") {
		if (!isNonEmptyString(value)) return [`${where} 는 비어 있지 않은 문자열이어야 합니다`];
		return [];
	}
	if (spec.type === "string[]") {
		if (!Array.isArray(value) || !value.every(isNonEmptyString)) {
			return [`${where} 는 비어 있지 않은 문자열의 배열이어야 합니다`];
		}
		return [];
	}
	if (spec.type === "items") {
		if (!Array.isArray(value)) return [`${where} 는 배열이어야 합니다`];
		const problems = [];
		const fields = { ...spec.fields, why: "string" };
		value.forEach((item, i) => {
			const at = `${where}[${i}]`;
			if (item === null || typeof item !== "object" || Array.isArray(item)) {
				problems.push(`${at} 는 객체여야 합니다`);
				return;
			}
			for (const key of Object.keys(item)) {
				if (!(key in fields)) problems.push(`${at} 에 모르는 키 "${key}" (허용: ${Object.keys(fields).join(", ")})`);
			}
			for (const [key, type] of Object.entries(fields)) {
				const v = item[key];
				if (type === "integer" ? !Number.isInteger(v) : !isNonEmptyString(v)) {
					problems.push(`${at}.${key} 가 없거나 형식이 틀렸습니다(${type === "integer" ? "정수" : "비어 있지 않은 문자열"})`);
				}
			}
		});
		return problems;
	}
	throw new Error(`알 수 없는 스키마 타입: ${spec.type}`);
}

/**
 * 한 검사의 섹션을 검증하고 기본값을 채운 옵션을 돌려준다.
 * @param {string} name
 * @param {Record<string, {type: string, fields?: object, default?: unknown, required?: boolean}>} schema
 * @param {unknown} section
 */
export function resolveOptions(name, schema, section) {
	const where = `${CONFIG_FILE} checks.${name}`;
	if (section === undefined) {
		throw new ConfigError(
			`${where} 섹션이 없습니다 — package.json 에 check:${name} 가 있으면 섹션이 있어야 합니다(기본값만 쓰면 {}).`,
		);
	}
	if (section === null || typeof section !== "object" || Array.isArray(section)) {
		throw new ConfigError(`${where} 는 객체여야 합니다`);
	}
	const problems = [];
	for (const key of Object.keys(section)) {
		if (!(key in schema)) problems.push(`${where} 에 모르는 키 "${key}" (허용: ${Object.keys(schema).join(", ") || "없음"})`);
	}
	const options = {};
	for (const [key, spec] of Object.entries(schema)) {
		if (key in section) {
			problems.push(...validateValue(`${where}.${key}`, spec, section[key]));
			options[key] = section[key];
		} else if (spec.required) {
			problems.push(`${where}.${key} 가 필요합니다`);
		} else {
			options[key] = structuredClone(spec.default);
		}
	}
	if (problems.length > 0) throw new ConfigError(problems.join("\n"));
	return options;
}

/**
 * 설정 파일 전체의 모양을 검증한다 — 모르는 최상위 키 · 모르는 검사 이름 · 켜지지 않은 검사의 섹션.
 * @param {object | null} config
 * @param {string[]} enabled package.json 의 check:* 이름
 * @param {string[]} known 이 패키지가 아는 검사 이름
 */
export function validateConfigShape(config, enabled, known) {
	if (config === null) return [];
	const problems = [];
	if (typeof config !== "object" || Array.isArray(config)) return [`${CONFIG_FILE} 의 최상위는 객체여야 합니다`];
	for (const key of Object.keys(config)) {
		if (key !== "checks") problems.push(`${CONFIG_FILE} 에 모르는 최상위 키 "${key}" (허용: checks)`);
	}
	const checks = config.checks ?? {};
	if (typeof checks !== "object" || Array.isArray(checks)) return [...problems, `${CONFIG_FILE} checks 는 객체여야 합니다`];
	for (const name of Object.keys(checks)) {
		if (!known.includes(name)) {
			problems.push(`${CONFIG_FILE} checks.${name} — 모르는 검사 이름입니다 (알려진 검사: ${known.join(", ")})`);
		} else if (!enabled.includes(name)) {
			problems.push(`${CONFIG_FILE} checks.${name} — package.json 에 check:${name} 가 없어 쓰이지 않는 설정입니다(지우세요)`);
		}
	}
	return problems;
}
