# claude-harness

Mongshell 의 개인용 Claude Code 플러그인 저장소. 개발 하네스(mongshell-dev)의 단일 원본은 [plugins/mongshell-dev/](plugins/mongshell-dev/) 이고, 배포 채널은 둘입니다.

| 채널 | 대상 | 받는 방법 | 갱신 |
|---|---|---|---|
| **플러그인** (기본) | 내 프로젝트 전부 | `/plugin install mongshell-dev@mongshell` | autoUpdate — SSOT push 가 곧 반영 |
| **vendored** (예외) | 협업자에게 설치·네임스페이스를 노출하지 않을 저장소 | `./sync-harness.sh sync <프로젝트>` 로 `.claude/` 에 커밋 | 수동 재sync |

> 같은 마켓플레이스에 **운영 도구 플러그인 [mongshell-ops](plugins/mongshell-ops/)** 도 있습니다 — 개발 절차가 아니라 OpenClaw 등 외부 운영 시스템과 Claude Code 를 잇는 도구입니다. 플러그인 채널로만 배포하고(vendored 대상 아님), 아래 하네스 규칙(이식 계약·중립성 등)은 적용되지 않습니다. 설치·셋업은 그 README.

## 설치 (플러그인)

```
/plugin marketplace add mongshellio/claude-harness
/plugin install mongshell-dev@mongshell
```

- 마켓플레이스 **autoUpdate 를 활성화**하면 SSOT push 가 전 프로젝트에 자동 반영됩니다 (3rd-party 마켓플레이스는 기본 꺼짐).
- 프로젝트별 on/off 는 프로젝트 `.claude/settings.json` 의 `enabledPlugins` 로.
- public 저장소라 설치에 GitHub 인증이 필요 없습니다.

## 호출 이름

- 플러그인 프로젝트: `/mongshell-dev:qa`, `/mongshell-dev:pr`, … (네임스페이스 강제 — 단축형 없음)
- 운영 도구: `/mongshell-ops:openclaw`
- vendored 프로젝트: `/qa`, `/pr`, … (프로젝트-로컬 스킬이라 네임스페이스 없음)
- **본문 자기참조는 중립 표기(`/qa`)를 유지**합니다 — 두 컨텍스트에서 같은 원본이 동작해야 하므로 네임스페이스를 본문에 박지 않습니다. 모델이 세션의 스킬 목록에서 해석합니다.

## 경로 정본 규칙

하네스가 자기 동봉 파일(README·references·scripts)을 가리킬 때는 **`${CLAUDE_PLUGIN_ROOT}` 가 정본**입니다. 플러그인 런타임이 이를 플러그인 루트로 해석하고, vendored 렌더 시 `sync-harness.sh` 가 `.claude` 로 치환합니다. 프로젝트 소유 파일(`.claude/browser-scenarios.md`, `docs/**`, 영역별 `CLAUDE.md`)은 프로젝트 경로 그대로 적습니다.

## 파일 분류

| 분류 | 무엇 | 어디에 |
|---|---|---|
| **공유 하네스** | agent·skill 본체, 이식 계약, 레퍼런스, 검증 스크립트 | `plugins/mongshell-dev/` (플러그인 또는 vendored 사본) |
| **프로젝트 문서** | 도메인 지식, 결정 기록, 아키텍처 | 프로젝트 `docs/` |
| **프로젝트 주입값** | 프로젝트 고유값 | `.claude/browser-scenarios.md`, `.claude/launch.json`, `.claude/settings*.json` |
| **공유 인프라 스크립트** | 빌드 가드 등 빌드가 부르는 것 | 본체는 프로젝트 `scripts/` 소유 (예: check-journal-monotonic — vercel·pre-push 배선이 봄) |

## 루트 CLAUDE.md 상시 코어

정본 = [plugins/mongshell-dev/references/claude-md-core.md](plugins/mongshell-dev/references/claude-md-core.md) — 플러그인 동봉이라 소비 프로젝트 세션이 `${CLAUDE_PLUGIN_ROOT}/references/claude-md-core.md` 로 read 할 수 있고, `harness-core` 마커 비교로 복사본의 낡음을 판정할 수 있습니다. 각 소비 프로젝트 루트 `CLAUDE.md` 에 그 블록을 삽입합니다 (동등 조항이 이미 있으면 중복 추가하지 않음).

## 이식 가이드

새 프로젝트에 하네스를 도입할 때.

1. **플러그인 설치** (위) — 또는 vendored: `./sync-harness.sh sync <프로젝트>`.
2. **루트 CLAUDE.md 상시 코어** 삽입 (위 템플릿).
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

> 검증 스크립트 배선은 필요 없습니다 — qa/release 스킬이 `${CLAUDE_PLUGIN_ROOT}/scripts/…` 로 직접 호출합니다 (vendored 는 `.claude/scripts/…` 로 치환됨). package.json alias 를 만들지 마세요 — 플러그인 캐시 경로는 버전마다 바뀝니다.

## vendored 예외 채널

```bash
./sync-harness.sh sync  <프로젝트>   # 배포 (배너 삽입 + ${CLAUDE_PLUGIN_ROOT} → .claude 치환)
./sync-harness.sh check <프로젝트>   # 드리프트 검사 (exit 1 = 차이 있음)
```

- 배너는 중립 문구 — 저장소·플러그인 이름을 노출하지 않습니다.
- 프로젝트 소유 4파일(browser-scenarios.md / launch.json / settings*.json)은 건드리지 않습니다.
- vendored 프로젝트에서 배포본을 직접 고치면 다음 sync 에 덮입니다 — 수정은 이 저장소에서.

## 구조

```
claude-harness/
├── .claude-plugin/marketplace.json   # 마켓플레이스 정의 (name: mongshell)
├── plugins/mongshell-dev/            # 하네스 단일 원본
│   ├── .claude-plugin/plugin.json
│   ├── README.md                     #   흐름도·라우팅·공통 정의·본문 작성 가이드
│   ├── agents/                       #   architect·developer·*-reviewer (6)
│   ├── skills/                       #   create-issue·plan·pr·qa·release·review-comments
│   ├── references/                   #   required-docs(이식 계약)·infra-gotchas(인프라 함정)
│   └── scripts/                      #   decisions 인덱스·버전 검증
├── plugins/mongshell-ops/            # 운영 도구 (플러그인 채널 전용)
│   ├── .claude-plugin/plugin.json
│   ├── README.md                     #   새 PC 셋업·OpenClaw 쪽 전제·문제 해결
│   ├── skills/openclaw/              #   OpenClaw 에게 Slack 으로 요청·답 대기
│   └── scripts/openclaw-slack        #   Slack Web API 호출 (ask·wait·read·recent)
├── sync-harness.sh                   # vendored 예외 채널
└── README.md
```
