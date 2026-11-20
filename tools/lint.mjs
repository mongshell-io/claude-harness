#!/usr/bin/env node
/**
 * 하네스 저장소의 결정적 정합 검사 — 모델 리뷰(harness-reviewer)가 아니라 스크립트로 잡을 수 있는 것만.
 *
 *   node tools/lint.mjs        (저장소 어디서든 — 이 파일 위치로 루트를 잡는다)
 *
 * 검사:
 *   manifest      marketplace.json 의 플러그인마다 폴더와 plugin.json 이 있고 이름이 같다
 *   frontmatter   skills/<이름>/SKILL.md 는 name(=폴더명) · description, agents/<이름>.md 는 name(=파일명) · description
 *   link          md 의 상대 링크가 가리키는 파일 · 앵커가 있다 (코드 펜스 안과 `…` 가 든 예시 링크는 건너뛴다)
 *   plugin-path   스킬 · 에이전트 본문의 `${CLAUDE_PLUGIN_ROOT}/<경로>` 가 그 플러그인에 실재한다
 *   plugin-root   스킬 · 에이전트 본문이 아닌 md 의 코드 펜스 안에 `${CLAUDE_PLUGIN_ROOT}` 가 없다
 *                 — 그 변수는 스킬 · 에이전트 본문에서만 치환되고 셸 환경변수가 아니라, 다른 문서의 명령에서는 빈 값이 된다
 *
 * exit 0 = 위반 없음 · exit 1 = 위반 있음(목록 출력).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];
const fail = (check, where, msg) => problems.push(`[${check}] ${where} — ${msg}`);
const read = (p) => readFileSync(join(ROOT, p), "utf8");
const tracked = (glob) =>
	execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", glob], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
		.split("\n")
		.filter((f) => f && existsSync(join(ROOT, f)));

/** frontmatter 의 최상위 `key:` 값(여러 줄 접힘 포함)을 문자열로. 없으면 null. */
function frontmatter(text) {
	if (!text.startsWith("---\n")) return null;
	const end = text.indexOf("\n---", 4);
	if (end < 0) return null;
	const out = {};
	let key = null;
	for (const line of text.slice(4, end).split("\n")) {
		const m = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
		if (m) {
			key = m[1];
			out[key] = m[2].replace(/^[>|][+-]?$/, "").trim();
		} else if (key && /^\s+\S/.test(line)) {
			out[key] = `${out[key]} ${line.trim()}`.trim();
		}
	}
	return out;
}

// ── manifest ────────────────────────────────────────────────────────────────
const market = JSON.parse(read(".claude-plugin/marketplace.json"));
const pluginRoot = (market.metadata?.pluginRoot ?? ".").replace(/^\.\//, "");
const plugins = [];
for (const p of market.plugins ?? []) {
	const dir = p.source.replace(/^\.\//, "");
	const manifest = join(dir, ".claude-plugin/plugin.json");
	if (!existsSync(join(ROOT, manifest))) {
		fail("manifest", ".claude-plugin/marketplace.json", `플러그인 ${p.name} 의 ${manifest} 가 없다`);
		continue;
	}
	const name = JSON.parse(read(manifest)).name;
	if (name !== p.name) fail("manifest", manifest, `name "${name}" 이 marketplace 의 "${p.name}" 과 다르다`);
	plugins.push(dir);
}
for (const d of existsSync(join(ROOT, pluginRoot)) ? readdirSync(join(ROOT, pluginRoot)) : []) {
	const dir = join(pluginRoot, d);
	if (statSync(join(ROOT, dir)).isDirectory() && !plugins.includes(dir))
		fail("manifest", dir, "marketplace.json 에 등록되지 않은 플러그인 폴더");
}

// ── frontmatter · plugin-path ───────────────────────────────────────────────
const bodies = new Set(); // 스킬 · 에이전트 본문 (CLAUDE_PLUGIN_ROOT 가 치환되는 파일)
for (const dir of plugins) {
	const skills = tracked(`${dir}/skills/*/SKILL.md`).map((f) => [f, basename(dirname(f))]);
	const agents = tracked(`${dir}/agents/*.md`).map((f) => [f, basename(f, ".md")]);
	for (const [file, expected] of [...skills, ...agents]) {
		bodies.add(file);
		const text = read(file);
		const fm = frontmatter(text);
		if (!fm) fail("frontmatter", file, "frontmatter 가 없다");
		else {
			if (fm.name !== expected) fail("frontmatter", file, `name "${fm.name ?? ""}" 이 "${expected}" 가 아니다`);
			if (!fm.description) fail("frontmatter", file, "description 이 비었다");
		}
		for (const m of text.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9_./-]*[A-Za-z0-9_/-])/g)) {
			if (!existsSync(join(ROOT, dir, m[1])))
				fail("plugin-path", file, `\${CLAUDE_PLUGIN_ROOT}/${m[1]} 가 ${dir} 에 없다`);
		}
	}
}

// ── link · plugin-root ──────────────────────────────────────────────────────
const slug = (h) =>
	h
		.trim()
		.toLowerCase()
		.replace(/[`*_~]/g, "")
		.replace(/[^\p{L}\p{N}\s-]/gu, "")
		.replace(/\s/g, "-");
const anchorCache = new Map();
function anchors(abs) {
	if (!anchorCache.has(abs)) {
		const set = new Set();
		let fence = false;
		for (const line of readFileSync(abs, "utf8").split("\n")) {
			if (/^\s*```/.test(line)) fence = !fence;
			else if (!fence && /^#{1,6}\s/.test(line)) set.add(slug(line.replace(/^#+\s/, "")));
		}
		anchorCache.set(abs, set);
	}
	return anchorCache.get(abs);
}

for (const file of tracked("*.md")) {
	const abs = join(ROOT, file);
	let fence = false;
	read(file)
		.split("\n")
		.forEach((line, i) => {
			const where = `${file}:${i + 1}`;
			if (/^\s*```/.test(line)) {
				fence = !fence;
				return;
			}
			if (fence) {
				if (!bodies.has(file) && line.includes("${CLAUDE_PLUGIN_ROOT}"))
					fail("plugin-root", where, "스킬 · 에이전트 본문이 아닌 문서의 명령에 ${CLAUDE_PLUGIN_ROOT} — 치환되지 않아 빈 값이 된다");
				return;
			}
			for (const m of line.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
				const href = m[1];
				if (/^(https?:|mailto:)/.test(href) || /…|\.\.\.$/.test(href)) continue;
				const [path, anchor] = href.split("#");
				const target = path ? resolve(dirname(abs), path) : abs;
				if (!existsSync(target)) fail("link", where, `${href} — 파일이 없다`);
				else if (anchor && target.endsWith(".md") && !anchors(target).has(decodeURIComponent(anchor).toLowerCase()))
					fail("link", where, `${href} — ${relative(ROOT, target)} 에 그 제목이 없다`);
			}
		});
}

if (problems.length) {
	for (const p of problems) console.log(p);
	console.log(`\n위반 ${problems.length}건`);
	process.exit(1);
}
console.log(`OK — 플러그인 ${plugins.length}개 · 스킬/에이전트 본문 ${bodies.size}개 · md ${tracked("*.md").length}개`);
