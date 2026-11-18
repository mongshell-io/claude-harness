/**
 * `mongshell-check all` — package.json 의 `check:*` 스크립트를 전부 돌린다(공용 검사 · 저장소 로컬 검사 구분 없이).
 *
 * 셀캐디 verify.yml 의 「check:* (package.json 전수)」 스텝을 Node 로 옮긴 것이다:
 * - YAML 에 나열하지 않고 package.json 에서 읽는다 — 나열하면 새 스크립트가 배선되지 않은 채 남는다.
 * - 동시에 N 개(기본 4)씩 돈다 — 스크립트마다 pnpm·node·tsx 기동 비용이 대부분이라 하나씩 돌면 느리다.
 *   서로 겹치지 않는 것이 전제다(임시 파일은 mkdtemp, 서버는 포트 0).
 * - 출력은 스크립트별로 모아 두었다가 끝난 뒤 순서대로 찍는다 — 동시 출력이 섞이지 않게. GitHub Actions 에서는 그룹으로 접는다.
 * - 하나가 실패해도 끝까지 돌고 마지막에 실패 목록을 모아 보고한다.
 *
 * 전제: `check:*` 는 전부 자족적이다(네트워크·자격증명·DB 없이 돈다). 외부 호출이 필요한 검사는 이름을 `check:` 로
 * 시작하지 않게 한다.
 */

import { spawn } from "node:child_process";

export const DEFAULT_JOBS = 4;

/** 이 실행기 자신을 부르는 스크립트 — 전수 실행에 넣으면 끝없이 자기를 부른다. */
const SELF_INVOCATION = /(^|[\s;&|])mongshell-check\s+all(\s|$)/;

/**
 * 돌릴 스크립트 이름과 거부 사유를 고른다 (순수 함수).
 * @param {Record<string, string>} scripts
 */
export function selectCheckScripts(scripts) {
	const names = Object.keys(scripts).filter((k) => k.startsWith("check:"));
	const recursive = names.filter((k) => SELF_INVOCATION.test(scripts[k]));
	return { names: names.filter((k) => !recursive.includes(k)), recursive };
}

function runScript(script, root) {
	return new Promise((done) => {
		const chunks = [];
		const child = spawn("pnpm", ["run", script], { cwd: root, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
		child.stdout.on("data", (c) => chunks.push(c));
		child.stderr.on("data", (c) => chunks.push(c));
		child.on("error", (err) => done({ script, ok: false, log: `실행하지 못했습니다: ${err.message}\n` }));
		child.on("close", (code) => done({ script, ok: code === 0, log: Buffer.concat(chunks).toString("utf8") }));
	});
}

/** 작업 목록을 동시 N 개로 돌리고 입력 순서대로 결과를 돌려준다. */
export async function runPool(items, jobs, worker) {
	const results = new Array(items.length);
	let next = 0;
	const lanes = Array.from({ length: Math.min(jobs, items.length) }, async () => {
		while (next < items.length) {
			const i = next++;
			results[i] = await worker(items[i]);
		}
	});
	await Promise.all(lanes);
	return results;
}

export async function runAll({ root, pkg, jobs = DEFAULT_JOBS }) {
	const { names, recursive } = selectCheckScripts(pkg.scripts ?? {});
	if (recursive.length > 0) {
		console.error(
			`mongshell-check all: ${recursive.join(", ")} 가 이 실행기(mongshell-check all)를 부릅니다 — 자기 호출이 되므로 이름을 check:* 가 아닌 것(예: check)으로 바꾸세요.`,
		);
		return 1;
	}
	if (names.length === 0) {
		console.error("mongshell-check all: package.json 에 check:* 스크립트가 하나도 없습니다 — 공회전이라 통과로 치지 않습니다.");
		return 1;
	}

	const inActions = process.env.GITHUB_ACTIONS === "true";
	const results = await runPool(names, jobs, (s) => runScript(s, root));
	for (const { script, log } of results) {
		console.log(inActions ? `::group::${script}` : `── ${script}`);
		process.stdout.write(log);
		if (inActions) console.log("::endgroup::");
	}
	const failed = results.filter((r) => !r.ok).map((r) => r.script);
	if (failed.length > 0) {
		if (inActions) for (const s of failed) console.log(`::error::${s} 실패`);
		console.error(`실패: ${failed.join(" ")} (대상 ${names.length}종)`);
		return 1;
	}
	console.log(`전수 통과 ${names.length}종`);
	return 0;
}
