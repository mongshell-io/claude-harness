# claude-harness

mongshell-io 저장소들이 같이 쓰는 Claude Code 하네스의 단일 원본(SSOT)입니다. 이 저장소가 다른 저장소에 내보내는 것은 아래 표가 전부이고, 받는 방법마다 **퍼지는 시점이 다릅니다** — 고칠 때 가장 먼저 볼 것입니다.

| 내보내는 것 | 원본 | 받는 방법 | 퍼지는 시점 |
|---|---|---|---|
| 개발 하네스 플러그인 `mongshell-dev` | [plugins/mongshell-dev/](plugins/mongshell-dev/) | `/plugin install mongshell-dev@mongshell` | main 머지 뒤 각 PC 의 다음 플러그인 갱신(autoUpdate) |
| 운영 도구 플러그인 `mongshell-ops` | [plugins/mongshell-ops/](plugins/mongshell-ops/) | `/plugin install mongshell-ops@mongshell` | 위와 같음 |
| 공용 PR 자동 머지 (재사용 워크플로) | [.github/workflows/automerge.yml](.github/workflows/automerge.yml) | 앱 저장소 호출 파일이 `@main` 으로 부름 | **머지 즉시** — 부르는 저장소 전부 |
| 공용 CI 준비 (composite action) | [.github/actions/setup-node-pnpm/](.github/actions/setup-node-pnpm/) | 앱 CI 잡이 `@main` 으로 부름 | **머지 즉시** — 부르는 저장소 전부 |
| 공용 검사 `@mongshell/checks` | [checks/](checks/) | 앱 `devDependencies` 의 git 의존성 | 앱이 lockfile 의 커밋 SHA 를 올릴 때 ([checks/README.md](checks/README.md) 「설치」) |
| 복사해 쓰는 정본 — 루트 `CLAUDE.md` 코어 블록 · 저장소 설정 템플릿 · references 문서가 「그대로 둔다」 고 정한 것(automerge 호출 파일 전문 · 러너 설명 주석 · biome/tsconfig 공통 값) | [references/](plugins/mongshell-dev/references/) · [templates/](plugins/mongshell-dev/templates/) | 앱 저장소에 복사 | 수동 — 저장소마다 반영 PR(워크플로 파일은 그 저장소에서 사람이 머지). 코어 블록은 `/qa` 가 마커(`harness-core`) 낡음을 알림 |

하네스는 **플러그인으로만** 배포합니다. 소비 프로젝트에 스킬·에이전트 사본을 두지 않습니다.

## 설치 (플러그인)

```
/plugin marketplace add mongshell-io/claude-harness
/plugin install mongshell-dev@mongshell
```

- 마켓플레이스 **autoUpdate 를 활성화**하면 SSOT push 가 전 프로젝트에 자동 반영됩니다 (3rd-party 마켓플레이스는 기본 꺼짐). `plugin.json` 에 `version` 을 두지 않으므로 갱신 판정은 커밋 SHA 입니다.
- 프로젝트별 on/off 는 프로젝트 `.claude/settings.json` 의 `enabledPlugins` 로 — 정본은 [templates/claude-settings.json](plugins/mongshell-dev/templates/claude-settings.json).
- public 저장소라 설치에 GitHub 인증이 필요 없습니다.
- `mongshell-ops` 는 개발 절차가 아니라 OpenClaw 등 외부 운영 시스템과 Claude Code 를 잇는 도구입니다. 아래 하네스 규칙(이식 계약·중립성 등)은 적용되지 않습니다. 설치·셋업은 [그 README](plugins/mongshell-ops/README.md).

## 호출 이름

- 개발 하네스: `/mongshell-dev:qa`, `/mongshell-dev:pr`, … (플러그인 스킬은 네임스페이스가 붙습니다 — 단축형 없음)
- 운영 도구: `/mongshell-ops:openclaw`
- **스킬·에이전트 본문의 자기참조는 짧은 표기(`/qa`)** 로 적습니다 — 모델이 세션의 스킬 목록에서 해석합니다.

## 경로 규칙

- **스킬·에이전트 본문**이 자기 플러그인의 동봉 파일(README·references·scripts)을 가리킬 때는 `${CLAUDE_PLUGIN_ROOT}/…` 로 적습니다. Claude Code 가 본문을 로드할 때 실제 경로로 치환합니다.
- `${CLAUDE_PLUGIN_ROOT}` 는 **Bash 도구의 셸에는 없습니다.** 스킬·에이전트 본문이 아닌 파일(references 문서, 스크립트)에 적으면 치환되지 않으므로, 그런 파일의 **명령**에는 쓰지 않고 "이 문서가 있는 폴더 기준" 으로 적습니다(경로를 가리키는 표기로만 쓰는 것은 괜찮습니다).
- 프로젝트 소유 파일(`.claude/browser-scenarios.md`, `docs/**`, 영역별 `CLAUDE.md`)은 프로젝트 경로 그대로 적습니다.

## 파일 분류

| 분류 | 무엇 | 어디에 |
|---|---|---|
| **공유 하네스** | agent·skill 본체, 이식 계약, 레퍼런스, 검증 스크립트 | `plugins/mongshell-dev/` |
| **프로젝트 문서** | 도메인 지식, 결정 기록, 아키텍처 | 프로젝트 `docs/` |
| **프로젝트 주입값** | 프로젝트 고유값 | `.claude/browser-scenarios.md`, `.claude/launch.json`, `.claude/settings*.json` |
| **공유 인프라 스크립트** | 빌드 가드 등 빌드가 부르는 것 | 공용 검사는 `@mongshell/checks`, 저장소 고유 가드는 프로젝트 `scripts/` |

## 루트 CLAUDE.md 상시 코어

정본 = [plugins/mongshell-dev/references/claude-md-core.md](plugins/mongshell-dev/references/claude-md-core.md). 플러그인은 상시 로드되는 컨텍스트를 주입할 수 없어서, 하네스가 전제하는 상시 규칙은 각 소비 프로젝트 루트 `CLAUDE.md` 에 그 블록을 복사해 둡니다 (동등 조항이 이미 있으면 중복 추가하지 않음). 복사본의 낡음은 `harness-core` 마커 비교로 판정합니다.

## 이식 가이드

새 프로젝트에 하네스를 도입할 때.

1. **플러그인 설치** (위).
2. **루트 CLAUDE.md 상시 코어** 삽입 (위 정본).
3. **권위 문서 계약** — 하네스가 프로젝트 `docs/` 에 요구하는 파일·구조는 [plugins/mongshell-dev/references/required-docs.md](plugins/mongshell-dev/references/required-docs.md) 가 단일 권위. 문서가 아직 없으면 해당 단계는 skip 됩니다 (권위 문서 부재 시 공통 계약).
4. **빌드 명령 확정** — skill 의 `<typecheck-cmd>` 등 placeholder 는 런타임에 프로젝트 `docs/development.md` 에서 해석됩니다. 그 문서에 실제 명령을 적으세요.
   - `docs/code-standards.md` 를 작성했다면 루트 `CLAUDE.md` 에 `@docs/code-standards.md` 한 줄을 추가하세요 — developer/code-reviewer 가 "자동 로드" 를 전제합니다 (미포함 시 권위 문서 부재 계약으로 skip).
5. **영역별 `CLAUDE.md`** — 디렉토리 운영 규약을 프로젝트 구조에 맞게 작성.
6. **browser 검증 시나리오** (UI 프로젝트) — `.claude/browser-scenarios.md` 에 라우트·로그인 절차·점검 목록 작성 (qa 스킬이 참조).
7. **라벨 3축** — 정의 권위는 create-issue 스킬. 생성 명령:

```bash
gh label create type:feat    --color 0075ca
gh label create type:fix     --color d73a4a
gh label create type:chore   --color e4e669
gh label create type:refactor --color cfd3d7
gh label create next    --color 0e8a16
gh label create blocked --color b60205
gh label create area:meta --color f9d0c4 --description "비-코드 작업 (하네스 + docs/ 문서)"
```

8. **`gh` CLI 인증** — GitHub Issues 를 backlog SSOT 로 전제합니다: `gh auth login`.
9. **저장소 설정 · CI 배선** (mongshell-io 앱 저장소) — 아래 문서가 각각의 권위입니다. 플러그인 스킬이 자동으로 읽지 않으므로 필요할 때 직접 엽니다.
   - 저장소 설정 정본(dependabot · PR 템플릿 · `.claude/settings.json`)과 biome · tsconfig 공통 값 — [repo-templates.md](plugins/mongshell-dev/references/repo-templates.md)
   - PR 자동 머지 호출 파일 — [automerge-wiring.md](plugins/mongshell-dev/references/automerge-wiring.md)
   - CI 잡의 Node · pnpm 준비 — [ci-setup-wiring.md](plugins/mongshell-dev/references/ci-setup-wiring.md)
   - 공용 검사 — [checks/README.md](checks/README.md)
   - 브라우저 익스텐션이 있는 저장소 — [extension-structure.md](plugins/mongshell-dev/references/extension-structure.md)
   - 인프라 함정 모음 — [infra-gotchas.md](plugins/mongshell-dev/references/infra-gotchas.md)

> 검증 스크립트 배선은 필요 없습니다 — qa/release 스킬이 `${CLAUDE_PLUGIN_ROOT}/scripts/…` 로 직접 호출합니다. package.json alias 를 만들지 마세요 — 플러그인 캐시 경로는 버전마다 바뀝니다.

## 구조

```
claude-harness/
├── .claude-plugin/marketplace.json   # 마켓플레이스 정의 (name: mongshell)
├── .github/workflows/automerge.yml   # 앱 저장소 공용 PR 자동 머지 (workflow_call 전용 — 이 저장소 트리거 없음)
├── .github/workflows/checks-test.yml # checks/ 테스트 (이 저장소의 유일한 CI)
├── .github/actions/setup-node-pnpm/  # 앱 저장소 공용 CI 준비 composite action
├── plugins/mongshell-dev/            # 개발 하네스
│   ├── README.md                     #   흐름도·라우팅·공통 정의·본문 작성 가이드 (cross-cutting 정의의 권위)
│   ├── agents/                       #   architect·developer·*-reviewer
│   ├── skills/                       #   절차 스킬(create-issue·plan·qa·pr·review-comments·release) + 규율 스킬
│   ├── references/                   #   필요할 때 읽는 문서 — 각 파일 머리말이 자기 설명
│   ├── templates/                    #   앱 저장소 설정 정본
│   └── scripts/                      #   스킬이 부르는 결정적 검사
├── plugins/mongshell-ops/            # 운영 도구 (OpenClaw Slack 브리지)
└── checks/                           # @mongshell/checks — 앱 저장소 공용 check:*
```
