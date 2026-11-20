# @mongshell/checks

mongshell-io 앱 저장소가 같이 쓰는 결정적 검사(`check:*`)입니다. 같은 검사가 저장소마다 복사돼 갈라지던 것을 한 곳에 두고(claude-harness#50 할 일 4), 저장소는 **값만** `harness.config.json` 으로 넘깁니다.

## 설치 (git 의존성)

```jsonc
// 앱 package.json
"devDependencies": {
  "@mongshell/checks": "github:mongshell-io/claude-harness#main&path:/checks"
}
```

- pnpm 은 이 지정을 `codeload.github.com` tarball + 커밋 SHA 로 lockfile 에 고정합니다(pnpm 10.33 실측). 설치에 `git` 바이너리도 GitHub 토큰도 필요 없습니다 — 이 저장소가 public 이고, Docker 빌드(`--frozen-lockfile`)도 그대로 받습니다.
- 갱신은 앱 저장소에서 `pnpm remove @mongshell/checks && pnpm add -D "@mongshell/checks@github:mongshell-io/claude-harness#main&path:/checks"` → lockfile 의 이 패키지 SHA 세 줄만 바뀐 PR 을 냅니다. `#main` 을 가리키므로 하네스에 머지했다고 앱에 바로 퍼지지 않습니다 — 앱 PR 의 CI 가 새 판을 먼저 돌립니다.
  - 🔴 `pnpm up @mongshell/checks`(`--depth 0` · `--latest` 포함)는 쓰지 않습니다 — pnpm 10.33 실측에서 범위 지정 의존성 전체를 다시 해석해 lockfile 이 500줄 넘게 바뀌었습니다. 같은 지정을 `pnpm add` 만 다시 하면 lockfile 의 옛 SHA 를 그대로 둡니다.
- 의존성이 없습니다. `react-compiler` 만 앱의 `next`(내장 babel) · `babel-plugin-react-compiler` 를 앱 package.json 기준으로 찾습니다.

## 쓰는 법

```jsonc
// 앱 package.json
"scripts": {
  "check": "mongshell-check all",               // check:* 전수 — 이름은 check (check:* 가 아님, 아래 「중첩 실행」)
  "check:journal": "mongshell-check journal",
  "check:doc-symbols": "mongshell-check doc-symbols"
}
```

```jsonc
// 앱 루트 harness.config.json
{
  "checks": {
    "journal": {},
    "doc-symbols": {
      "docs": ["CLAUDE.md", "docs/development.md"],
      "allow": [{ "symbol": "workflow_run", "why": "GitHub Actions 이벤트 이름" }]
    }
  }
}
```

규칙 (fail-closed):

- 저장소 루트(cwd)에서 돕니다 — `pnpm check:<검사>` 면 pnpm 이 루트에서 돌립니다. cwd 에 package.json 이 없으면 실패합니다. `git` 은 쓰지 않습니다(Docker 빌드에 `.git` 이 없음).
- package.json 에 `check:<검사>` 가 있으면 켜진 것입니다. 켰으면 `checks.<검사>` 섹션이 있어야 합니다(기본값만 쓰면 `{}`). 모르는 키 · 모르는 검사 이름 · 켜지지 않은 검사의 섹션 · `why` 없는 예외 항목은 실패합니다.
- 검사 대상이 0건이면 통과가 아니라 실패입니다(공회전 방지).
- 종료 코드: 0 통과 · 1 위반 또는 설정 오류 · 2 사용법 오류.

`mongshell-check all [--jobs N]` 은 package.json 의 `check:*` 를 **공용 · 저장소 로컬 구분 없이 전부** 4개(기본)씩 병렬로 돌리고, 출력을 스크립트별로 모아 순서대로 찍은 뒤 실패 목록을 보고합니다(GitHub Actions 에서는 `::group::` 으로 접음). 전제: `check:*` 는 전부 자족적입니다(네트워크 · 자격증명 · DB 없이 돈다).

중첩 실행: `all` 은 자식 스크립트 환경에 `MONGSHELL_CHECK_ALL=1` 을 넣고, 시작할 때 이 값이 이미 있으면 exit 1 로 거부합니다 — 어떤 `check:*` 가 (다른 스크립트를 거쳐서라도) `mongshell-check all` 에 닿으면 끝없는 재귀 대신 바로 실패합니다. `check:*` 본문이 `mongshell-check all` 을 바로 부르면 실행 전에 그 이름을 알려 주고 실패합니다. 단일 검사는 인자를 받지 않고(값은 설정 파일), `all` 은 `--jobs N` 만 받습니다 — 그 밖의 인자는 exit 2.

## 검사

| 검사 | 막는 것 | 설정 (기본값) |
|---|---|---|
| `journal` | drizzle journal `when` 이 러닝맥스 이하라 migrate 가 조용히 건너뛰는 것 · `when` 이 미래 시각이라 그 뒤 마이그레이션이 전부 건너뛰어질 것(허용치 5분) · `idx` 가 0 부터 빈틈 · 중복 없이 이어지지 않는 것 · `.sql` ↔ journal tag 불일치(고아 마이그레이션) | `journalPath` (`drizzle/meta/_journal.json`) · `knownNonMonotonic: [{idx, why}]` — 이미 prod 에 적용된 비단조. 더는 비단조가 아니면 낡은 항목이라 실패. 미래 시각 · idx 에는 예외 목록이 없다 |
| `design-tokens` | 토큰 CSS 에 없는 `<prefix>*` 유틸리티 — Tailwind 는 오류 없이 클래스를 만들지 않는다 | `tokensCss` (`src/styles/design-tokens.css`) · `srcDir` (`src`) · `prefix` (`app-`) |
| `react-compiler` | React Compiler 가 조용히 건너뛰는 함수(CompileError) — 빌드는 통과한다 | `srcDir` (`src`) · `skipDirs` (`["src/app/api", "src/test"]`) · `allowed: [{file, reason, why}]` — 쓰이지 않으면 실패 |
| `no-horizontal-scroll` | 가로 스크롤 선언(`overflow-x-auto` 등)과 가로 짝 없는 세로 스크롤 | `srcDir` (`src`) · `hint` (필수 — 넓은 표를 맞추는 법) · `decisionRef` (필수 — 근거 결정). 허용 목록 없음 |
| `doc-symbols` | 권위 문서가 백틱으로 부르는 이름이 소스에 없는 것(드리프트 · 오기재) | `docs` (필수) · `sourceDirs` (`["src", "scripts"]`) · `sourceFiles` (`package.json` · `drizzle.config.ts` · `vitest.config.ts` · `biome.json`) · `haystackExclude` · `allow: [{symbol, why}]`. **`harness.config.json` 은 설정과 무관하게 증거에서 뺀다** — 허용 목록이 자기를 증명하면 무동작이 된다 |
| `ui-barrel` | UI barrel(`index.ts` 또는 `index.tsx`)의 깨진 re-export(`export *` 포함). 상대경로 지정자만 파일을 확인한다(확장자를 적은 것 포함) — 패키지 · 경로 별칭 지정자는 판정하지 않는다(typecheck 몫) | `dir` (`src/components/ui`) |
| `decisions` | Decision 하나가 파일 하나인 결정 기록(`<폴더>/<번호>.md` · 현행이 아닌 것은 `<폴더>/archive/`)이 「지금 참인 것만 적는다」 는 모양에서 벗어난 것 — 첫 줄이 `# Decision <식별자>: <제목>` 이 아닌 파일, 식별자와 파일 이름 불일치, 같은 번호가 폴더 바로 아래와 `archive/` 양쪽에 있는 것, 헤더(도입 줄이 있으면 도입 줄)와 본문 블록 사이에 끼운 줄(배너 · 인용 · 단락), 목록 꼴에서 최상위 `- **라벨**` 항목이 아닌 줄, 소제목 꼴에서 둘째 `# ` 제목, 이력 이름(`갱신` · `후속` · `정정` 등)의 항목 · `## ` 소제목, 없는 폴더 · Decision 이 하나도 없는 폴더. archive 파일은 첫 줄과 파일 이름만 본다. **이 배치를 쓰는 저장소만 켠다** | `dirs` (`["docs/architecture-decisions", "docs/harness-decisions"]`) — 목록의 폴더가 없으면 실패. 결정 기록 폴더가 하나뿐이면 그 하나만 적는다 · `pending` (`[]`) — 아직 정리하지 못한 Decision 파일의 경로. 그 파일의 위반은 실패로 치지 않는다. 위반이 없어진 파일 · 없는 파일이 남아 있으면 실패(목록은 줄기만 한다) |

각 검사의 근거 · 불변식 · 남은 한계는 [checks/](checks/) 의 파일 머리말이 권위입니다. 저장소 고유 규약(감바우 ui README 카탈로그 · `sideEffects` 표식 등)은 그 저장소 로컬 스크립트로 남깁니다.

검사는 전부 **켜야 돕니다** — 이 패키지에 검사가 늘어도, 앱이 lockfile SHA 를 올리는 것만으로는 새 검사가 돌지 않습니다(`all` 은 package.json 의 `check:*` 만 돌립니다). 이미 켠 검사의 판정이 넓어지는 것은 SHA 를 올릴 때 받습니다.

`decisions` 를 켜는 법:

```jsonc
// 앱 package.json
"check:decisions": "mongshell-check decisions"
// 앱 harness.config.json
"decisions": {}                                             // 결정 기록 폴더가 둘 다 있을 때
"decisions": { "dirs": ["docs/architecture-decisions"] }    // 하나뿐일 때
"decisions": { "pending": ["docs/architecture-decisions/7-1.md"] }  // 덧댄 것이 남은 파일 — 정리하는 PR 에서 목록에서 뺀다
```

덧댄 것이 남은 결정 기록은 위반이 여럿 나옵니다. `pending` 에 그 파일들을 적어 검사를 먼저 켜고, 정리하는 PR 마다 목록에서 뺍니다.

## 바꿀 때

- 검사 판정을 바꾸면 쓰는 저장소 전부에 영향이 갑니다 — 각 앱이 위 「갱신」 절차로 받을 때 그 앱 CI 가 새 판을 돌립니다.
- 넓히기 전에 음성 테스트부터 씁니다(`test/`). 테스트: `cd checks && node --test` (CI: [`.github/workflows/checks-test.yml`](../.github/workflows/checks-test.yml), 호스티드 러너).
- 새 설정 키는 `schema` 에 추가합니다 — 스키마에 없는 키는 실패하므로 문서와 코드가 함께 바뀝니다.
