---
role: "mongshell-io 앱 저장소의 저장소 설정 정본(dependabot · PR 템플릿 · .claude/settings.json)을 적용 · 대조하는 절차와, extends 로 나누지 않는 biome · tsconfig 의 공통 값 표."
kind: operational
non_goals:
  - "템플릿 파일 본문 — `templates/` 아래 파일 자신이 권위"
  - "automerge 호출 배선 — `references/automerge-wiring.md`"
  - "루트 CLAUDE.md 상시 코어 · 정책 노브 — `references/claude-md-core.md`"
  - "저장소 고유 lint 규칙(경계 import 금지 등 overrides) · 의존성 버전 올림 판단"
---

# 저장소 설정 템플릿

mongshell-io 앱 저장소(sellcaddie · gambau · mongshell-admin · auction2sell · k2sell · m2sell)는 저장소 설정을 같은 정본에서 가져온다. 정본은 이 플러그인의 `templates/` 에 있고, 세션에서는 `${CLAUDE_PLUGIN_ROOT}/templates/` 로 읽는다. 이 경로는 플러그인 채널에서만 있다 — vendored 채널은 `templates/` 를 배포하지 않으므로(`sync-harness.sh`) SSOT 저장소 [mongshell-io/claude-harness `plugins/mongshell-dev/templates/`](https://github.com/mongshell-io/claude-harness/tree/main/plugins/mongshell-dev/templates) 를 체크아웃해 쓴다.

## 정본과 저장소 경로

| 정본 | 저장소 경로 | 저장소마다 달라도 되는 것 |
|---|---|---|
| `templates/dependabot.yml` | `.github/dependabot.yml` | npm `directories`(자기 lockfile 을 가진 패키지 디렉터리 전부) · `ignore` 의 저장소 고유 항목(이유 주석 필수) · 머리 주석의 이슈 번호 |
| `templates/pull_request_template.md` | `.github/pull_request_template.md` | 없음 — 바이트 동일 |
| `templates/claude-settings.json` | `.claude/settings.json` | 없음 — 키 정렬 후 동일. 저장소에만 필요한 권한은 `.claude/settings.local.json`(git 미추적)에 둔다 |

PR 템플릿의 Risk 칸은 「automerge 라벨은 만든 직후, 사람이 머지는 루트 CLAUDE.md 정책 노브가 적은 경로가 바뀐 PR 뿐」을 전제로 쓴다 — 거부 경로 집합은 저장소마다 달라서 템플릿에 적지 않고 CLAUDE.md 를 가리킨다.

## 적용 (새 저장소 · 빠진 파일)

```bash
# 플러그인 채널 전용 경로 — vendored 채널에는 templates/ 가 배포되지 않으므로 SSOT 저장소 체크아웃을 가리킨다
#   (예: H=<claude-harness 체크아웃>/plugins/mongshell-dev/templates)
H="${CLAUDE_PLUGIN_ROOT}/templates"
mkdir -p .github .claude
cp "$H/pull_request_template.md" .github/pull_request_template.md
cp "$H/claude-settings.json" .claude/settings.json
cp "$H/dependabot.yml" .github/dependabot.yml
# 자기 lockfile 을 가진 패키지 디렉터리를 찾아 dependabot npm directories 에 적는다(루트 / 는 이미 있음)
git ls-files '*pnpm-lock.yaml' '*package-lock.json' | xargs -n1 dirname
```

- `.claude/settings.json` 을 새로 두는 저장소에 vendored 하네스 사본(`.claude/agents/` · `.claude/skills/`)이 있으면 같은 PR 에서 지운다 — 플러그인과 사본이 함께 있으면 같은 이름의 스킬 · 에이전트가 둘 뜬다. 지우기 전에 사본에만 있는 저장소 고유 내용을 정본과 diff 해 보고, 남길 것은 프로젝트 `docs/` 로 옮기거나 하네스 정본에 올린다.
- 이 PR 은 `.github/workflows/` 를 건드리지 않으므로 automerge 대상이다.

## 대조 (드리프트 확인)

저장소 루트에서 실행한다. 출력이 비어야 하는 줄과 허용 차이만 남아야 하는 줄을 나눠 본다.

```bash
# 플러그인 채널 전용 경로 — vendored 채널에는 templates/ 가 배포되지 않으므로 SSOT 저장소 체크아웃을 가리킨다
#   (예: H=<claude-harness 체크아웃>/plugins/mongshell-dev/templates)
H="${CLAUDE_PLUGIN_ROOT}/templates"
# 비어야 한다
diff "$H/pull_request_template.md" .github/pull_request_template.md
diff <(jq -S . "$H/claude-settings.json") <(jq -S . .claude/settings.json)
# 허용 차이(directories · 저장소 고유 ignore · 머리 주석)만 남아야 한다
diff "$H/dependabot.yml" .github/dependabot.yml
# biome schema 와 설치된 biome 버전이 같아야 한다
grep -o 'schemas/[0-9.]*' biome.json; node -p "require('@biomejs/biome/package.json').version"
# tsconfig 공통 값 (아래 표)
jq '.compilerOptions | {target, useDefineForClassFields, strict, moduleResolution, jsx}' tsconfig.json
```

## biome · tsconfig — 공통 값 표

두 설정은 `extends` 로 하네스 파일을 물려받지 않는다. 근거:

- `extends` 는 파일 경로나 설치된 npm 패키지만 가리킬 수 있다. 하네스는 npm 패키지가 아니고, 형제 체크아웃 경로(`../claude-harness/…`)는 CI · Railway 이미지 빌드 · 다른 PC 에 없다. git 의존성으로 설치하면 하네스 커밋마다 저장소 6개의 lockfile 이 흔들리고, 빌드가 GitHub 접근에 묶인다.
- 실제로 나눌 수 있는 부분이 작다. tsconfig 는 `compilerOptions` 가 이미 거의 같고 `include` · `exclude` 는 저장소 구조값이다. biome 는 공통 부분이 열 줄 남짓이고, 무게는 저장소 고유 `overrides`(화면 ↔ 서버 경계 import 금지 등)에 있다.

그래서 공통 값은 이 표가 권위이고, 각 저장소는 자기 파일을 이 값에 맞춘다. 저장소 고유 항목은 표에 없는 키로 더한다.

### tsconfig.json `compilerOptions`

| 키 | 값 | 이유 |
|---|---|---|
| `target` | `"ES2024"` | 런타임(Node 22+ · 최신 브라우저)이 지원하는 문법을 그대로 낸다 |
| `useDefineForClassFields` | `false` | `target` 이 ES2022 이상이면 tsc · tsx(esbuild) 기본값이 `true` 로 바뀌는데 Next SWC 는 명시값이 없으면 `false` 로 빌드한다. 필드를 선언하고 생성자에서 채우는 클래스(에러 클래스 등)가 검사 · 테스트 · 빌드에서 같은 의미가 되게 고정한다 |
| `lib` | `["dom", "dom.iterable", "esnext"]` | |
| `allowJs` · `skipLibCheck` · `strict` · `noEmit` · `esModuleInterop` · `resolveJsonModule` · `isolatedModules` · `incremental` | `true` | |
| `module` · `moduleResolution` | `"esnext"` · `"bundler"` | |
| `jsx` | `"react-jsx"` | |
| `plugins` | `[{ "name": "next" }]` | |
| `paths` | `{ "@/*": ["./src/*"] }` | |

`include` · `exclude` 는 저장소 구조값(예: 별도 패키지 `extension` · `workers` · `infra` 제외, `.claude/worktrees` 제외).

### biome.json

| 키 | 값 |
|---|---|
| `$schema` | `https://biomejs.dev/schemas/<버전>/schema.json` — `<버전>` 은 lockfile 에 설치된 `@biomejs/biome` 버전과 같게 |
| `vcs` | `{ "enabled": true, "clientKind": "git", "useIgnoreFile": true }` |
| `files.includes` 공통 제외 | `!**/*.css` · `!**/*.md` · `!drizzle` · `!.claude/worktrees` (+ 저장소 고유) |
| `formatter.lineWidth` | `120` |
| `linter.rules.preset` | `"recommended"` |
| `linter.rules.suspicious.noExplicitAny` | `"error"` |
| `linter.rules.suspicious.noImplicitAnyLet` | `"error"` |
| `linter.rules.style.noNonNullAssertion` | `"off"` |
| `javascript.formatter.expand` | `"never"` |
| `assist.actions.source.organizeImports` | `"on"` |

`expand` · `organizeImports` 처럼 코드 전체를 다시 쓰게 하는 값은 저장소에 처음 맞출 때 `biome check --write` 결과를 별도 커밋으로 둔다(리뷰가 규칙 변경과 재포맷을 나눠 읽게).
