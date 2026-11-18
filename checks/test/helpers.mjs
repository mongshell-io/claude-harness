import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** 파일 트리 { "상대경로": "내용" } 로 임시 저장소를 만든다. 테스트가 끝나면 지운다. */
export function makeRepo(t, files) {
	const root = mkdtempSync(join(tmpdir(), "mongshell-checks-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	for (const [rel, content] of Object.entries({ "package.json": "{}", ...files })) {
		const full = join(root, rel);
		mkdirSync(dirname(full), { recursive: true });
		writeFileSync(full, typeof content === "string" ? content : JSON.stringify(content));
	}
	return root;
}

/** console 출력을 모으고 화면에는 찍지 않는다. */
export function captureConsole(t) {
	const out = [];
	t.mock.method(console, "log", (...a) => out.push(a.join(" ")));
	t.mock.method(console, "error", (...a) => out.push(a.join(" ")));
	return out;
}
