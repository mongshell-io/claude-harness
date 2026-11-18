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
- 갱신은 앱 저장소에서 `pnpm up @mongshell/checks` → lockfile 의 SHA 가 바뀐 PR 을 냅니다. `#main` 을 가리키므로 하네스에 머지했다고 앱에 바로 퍼지지 않습니다 — 앱 PR 의 CI 가 새 판을 먼저 돌립니다.
- 의존성이 없습니다. `react-compiler` 만 앱의 `next`(내장 babel) · `babel-plugin-react-compiler` 를 앱 package.json 기준으로 찾습니다.

## 쓰는 법

```jsonc
// 앱 package.json
"scripts": {
  "check": "mongshell-check all",               // check:* 전수 (이름이 check:all 이면 자기 호출이라 거부한다)
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

## 검사

| 검사 | 막는 것 | 설정 (기본값) |
|---|---|---|
| `journal` | drizzle journal `when` 이 러닝맥스 이하라 migrate 가 조용히 건너뛰는 것 · `.sql` ↔ journal tag 불일치(고아 마이그레이션) | `journalPath` (`drizzle/meta/_journal.json`) · `knownNonMonotonic: [{idx, why}]` — 이미 prod 에 적용된 비단조. 더는 비단조가 아니면 낡은 항목이라 실패 |
| `design-tokens` | 토큰 CSS 에 없는 `<prefix>*` 유틸리티 — Tailwind 는 오류 없이 클래스를 만들지 않는다 | `tokensCss` (`src/styles/design-tokens.css`) · `srcDir` (`src`) · `prefix` (`app-`) |
| `react-compiler` | React Compiler 가 조용히 건너뛰는 함수(CompileError) — 빌드는 통과한다 | `srcDir` (`src`) · `skipDirs` (`["src/app/api", "src/test"]`) · `allowed: [{file, reason, why}]` — 쓰이지 않으면 실패 |
| `no-horizontal-scroll` | 가로 스크롤 선언(`overflow-x-auto` 등)과 가로 짝 없는 세로 스크롤 | `srcDir` (`src`) · `hint` (필수 — 넓은 표를 맞추는 법) · `decisionRef` (필수 — 근거 결정). 허용 목록 없음 |
| `doc-symbols` | 권위 문서가 백틱으로 부르는 이름이 소스에 없는 것(드리프트 · 오기재) | `docs` (필수) · `sourceDirs` (`["src", "scripts"]`) · `sourceFiles` (`package.json` · `drizzle.config.ts` · `vitest.config.ts` · `biome.json`) · `haystackExclude` · `allow: [{symbol, why}]`. **`harness.config.json` 은 설정과 무관하게 증거에서 뺀다** — 허용 목록이 자기를 증명하면 무동작이 된다 |
| `ui-barrel` | UI barrel(`index.ts` 또는 `index.tsx`)의 깨진 re-export(`export *` 포함) | `dir` (`src/components/ui`) |

각 검사의 근거 · 불변식 · 남은 한계는 [checks/](checks/) 의 파일 머리말이 권위입니다. 저장소 고유 규약(감바우 ui README 카탈로그 · `sideEffects` 표식, 결정 배너 등)은 그 저장소 로컬 스크립트로 남깁니다.

## 바꿀 때

- 검사 판정을 바꾸면 쓰는 저장소 전부에 영향이 갑니다 — 각 앱이 `pnpm up @mongshell/checks` 로 받을 때 그 앱 CI 가 새 판을 돌립니다.
- 넓히기 전에 음성 테스트부터 씁니다(`test/`). 테스트: `cd checks && node --test` (CI: [`.github/workflows/checks-test.yml`](../.github/workflows/checks-test.yml), 호스티드 러너).
- 새 설정 키는 `schema` 에 추가합니다 — 스키마에 없는 키는 실패하므로 문서와 코드가 함께 바뀝니다.
