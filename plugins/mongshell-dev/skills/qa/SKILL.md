---
name: qa
description: >-
  작업 마무리 직전 검증 단일 진입점 — 변경 도메인을 매칭해 toolchain 검증(bash)과
  reviewer(Agent)들을 병렬 실행하고 공통 분류 등급으로 리포트.
  기본 실행 외 opt-in: --branch(풀 검증) / --build / --security / --gemini / --deepseek.
  실행 매트릭스의 단일 권위는 본문 Step 1 조건표.
  트리거 — "qa", "검증", "코드 리뷰".
---

# /qa

작업 마무리 직전 검증 단일 진입점. 변경 도메인을 매칭해 toolchain 검증(bash)과 reviewer(Agent)들을 병렬 실행하고, 결과를 공통 분류 등급(하네스 README § "공통 분류 등급")으로 통일 분류해 리포트한다. **어떤 검증이 언제 도는지의 단일 권위 = Step 1 조건표** (옵션 정의는 Step 0 — 다른 곳에 매트릭스를 복제하지 않는다). .md 파일의 frontmatter 깨짐은 로딩 시점에 자연 검출된다.

## 언제 호출하는가

- 사용자 명시 호출만: `/qa` (+ Step 0 의 RANGE·옵션 인자)
- 트리거 키워드: "qa", "검증", "코드 리뷰"
- ⚠️ 자동 호출 X. `/qa --branch` 가 PR 머지 전 검증 권위 — PR 생성 전 명시 호출이 권장 위치 (`/release` 는 toolchain 게이트를 갖지 않는다).

## /plan 자동 iteration 과의 책임 경계

`/plan` 의 라운드 안 자동 리뷰 (Step 4b) 와의 역할 분리:

| 측면 | `/plan` 안 라운드 리뷰 | `/qa` 사이클 종합 검증 |
|------|---------------------|---------------------|
| 시점 | 라운드 단위 (자동, Iteration 1..3 루프 — `P0 == 0` 까지) | 작업 마무리 / 사이클 종료 (사용자 명시 호출) |
| RANGE | 해당 라운드의 좁은 diff | 누적 변경 (기본 / `--branch`) |
| 검증 수행 | 검증 명령(bash) + 라우팅 매칭 reviewer (`security-reviewer` 제외) | Step 1 조건표 (RANGE·opt-in 반영) |
| browser 검증 | **미포함** (라운드 루프 전용 아님 — 사이클 게이트 전용) | `--branch` + UI 변경 시만 (Preview MCP 기반, opt-in 없음) |
| 고유 가치 | cross-issue 패턴 / 결합 직후 결함 | 라운드 간 결합 결함 + 외부 LLM 시각 (--gemini/--deepseek 시) + 문서·하네스 정합성 + 실 브라우저 smoke |

`security-reviewer` = `/qa` 단독 호출 대상 (`/plan` 루프 안 자동 호출 X).

`/plan` 사이클 종료 직후 `/qa` 호출 시 `code-reviewer` 가 중복 호출되는 인상이 있을 수 있다. 이는 **사이클 누적 시각**으로 보는 다른 input — 라운드별로는 잡히지 않는 cross-round 결함 검토 의의가 있다. 부담되면 `--skip-code-review` 옵션으로 `code-reviewer` 만 빼고 호출 가능.

단발 작업 후 `/qa` 호출 (plan 흐름 외) 에는 자동 iteration 이 없었으므로 `--skip-code-review` 미사용이 권장.

## 동작

### Step 0: 변경 범위 결정 (인자 파싱)

| 인자 | 의미 | `RANGE` 값 |
|------|------|-----------|
| 없음 (default) | tracked 파일의 uncommitted (staged + unstaged) | `HEAD` |
| `--branch` | 현재 브랜치의 main 대비 (풀 검증 — build / security-reviewer 포함) | `main...HEAD` |

**옵션 modifier** (RANGE 인자와 조합 가능):

- `--skip-code-review` — `code-reviewer` 호출 제외. `/plan` 사이클 종료 직후 호출 시 라운드 안 자동 리뷰와의 중복 회피용 (Step 1 호출 조건 표 참조). 예: `/qa --branch --skip-code-review`. doc-reviewer / harness-reviewer 는 그대로 실행.
- `--build` — 단발 기본에서 build 검증 추가. `--branch` 시에는 기본 포함이라 불필요.
- `--security` — 단발 기본에서 `security-reviewer` 추가. `--branch` 시에는 기본 포함이라 불필요.
- `--gemini` — gemini CLI 리뷰 추가. `--branch` 와 무관하게 항상 `--gemini` 명시 필요.
- `--deepseek` — DeepSeek API 리뷰 추가. `--branch` 와 무관하게 항상 `--deepseek` 명시 필요. `--gemini` 와 독립 — 둘 다 지정 시 둘 다 실행. `DEEPSEEK_API_KEY` 환경변수 필요 (`~/.zshrc` 등 머신 로컬에 `export`; git 미추적). DeepSeek 은 CLI 가 없어 `curl` + `jq` 로 OpenAI 호환 REST API 를 직접 호출한다.

> ⚠️ untracked 파일은 검증 대상 아님 (git diff 가 보지 못함). 신규 파일은 commit 후 호출.

알 수 없는 인자가 들어오면 사용법을 안내하고 stop 한다.

`git status` / `git diff HEAD` 로 uncommitted 변경 존재 여부를 확인한다. 변경이 전혀 없으면 "검증할 변경이 없습니다. 그래도 진행할까요?" 사용자 확인 후 결정한다.

### Step 1: 변경 파일 도메인 매칭

`git diff $RANGE --name-only` 로 변경 파일 목록을 추출하고, 다음 split 을 수행한다.

```bash
# 세션/워크트리 고유 결과 디렉토리 — 동시 /qa 실행 간 파일 오염 방지.
# repo 루트명 기반 결정적(deterministic) 값 — bash 호출이 갈려도 매번 동일하게 재유도 가능.
# 프로젝트 폴더명이 유니크하다는 전제 — 동명 repo 를 동시에 /qa 하는 경우는 범위 외 (1인 운영 단순성 우선).
QA_TMP="/tmp/qa-$(basename "$(git rev-parse --show-toplevel)")"
# 이 init(rm -rf)은 Step 1 에서 1회만 — 이후 Step 재유도 시 정의만 반복, 재실행하면 중간 산출물이 소실된다.
rm -rf "$QA_TMP" && mkdir -p "$QA_TMP"
```

이후 Step 의 각 bash 호출은 같은 정의로 `QA_TMP` 를 재유도해 사용한다 (셸 상태는 호출 간 비영속).

```bash
# --diff-filter=d : deleted 파일 제외 (reviewer 가 부재 파일 검사 시도 방지)
QA_TMP="/tmp/qa-$(basename "$(git rev-parse --show-toplevel)")"
git diff $RANGE --name-only --diff-filter=d -- '*.md' > "$QA_TMP/md-changed.txt" 2>/dev/null || true
# 하네스 루트 — vendored 소비 프로젝트는 .claude/ (.claude/.harness = sync 가 생성하는 vendored 마커),
# 하네스 SSOT 저장소는 plugins/mongshell-dev/. 플러그인 소비 프로젝트는 둘 다 부재 → harness 도메인 공집합이 정상.
H=$([ -f .claude/.harness ] && echo .claude || echo plugins/mongshell-dev)
grep -v "^$H/" "$QA_TMP/md-changed.txt" > "$QA_TMP/doc-domain.txt" 2>/dev/null || true    # doc-reviewer 도메인
grep "^$H/" "$QA_TMP/md-changed.txt" > "$QA_TMP/harness-domain.txt" 2>/dev/null || true  # harness-reviewer 도메인
```

- **코드 파일 변경 여부**: `git diff $RANGE --name-only | grep -v '\.md$'` 로 `.md` 외 변경 확인. toolchain 외 파일 (이미지/lock/data 등) false positive 는 도메인 외 입력 정책 (`${CLAUDE_PLUGIN_ROOT}/README.md` "Reviewer 라우팅") 으로 흡수.
- **UI 변경 여부**:

```bash
QA_TMP="/tmp/qa-$(basename "$(git rev-parse --show-toplevel)")"
git diff $RANGE --name-only | grep -E '<ui-path-pattern>' > "$QA_TMP/ui-changed.txt" 2>/dev/null || true
# UI 경로 패턴 권위: 컴포넌트 영역 CLAUDE.md — 구체 glob 은 그 문서 참조
```

위 결과로 이번 호출에서 실행할 검증 목록을 확정한다:

| 검증 | 기본(단발) | `--branch` | opt-in |
|------|-----------|-----------|--------|
| typecheck / test / lint | 코드 파일 변경 있음 | 코드 파일 변경 있음 | — |
| build | **제외** | 코드 파일 변경 있음 | `--build` 지정 시 |
| **schema 정합성** | **DB schema 경로 변경 있음** | **DB schema 경로 변경 있음** | — | <!-- ERD 산출물 검사: <db-erd-cmd> 실패 시 P0. 규약 권위: DB 영역 CLAUDE.md -->
| **decisions 인덱스 정합** | **decisions 파일(`architecture-decisions.md` / `harness-decisions.md` / `decisions-archive.md`) 변경 있음** | **동일** | — |
| **decisions 도입 버전 확정** | **결정 문서 존재 시 항상** (변경 여부 무관) | **동일** | — | <!-- Step 2 에서 자동 write. 조건이 "변경 있음" 이 아닌 이유는 아래 항목 참조 -->
| **harness-core 마커 정합** | **루트 `CLAUDE.md` 에 마커 존재 시 항상** (변경 여부 무관) | **동일** | — | <!-- 정본이 바뀌면 내 diff 와 무관하게 낡는다 -->
| code-reviewer | 코드 파일 변경 있음 + `--skip-code-review` 미지정 | 코드 파일 변경 있음 + `--skip-code-review` 미지정 | — |
| security-reviewer | **제외** | 코드 파일 변경 있음 | `--security` 지정 시 |
| gemini | **제외** | **제외** | `--gemini` 지정 시 |
| deepseek | **제외** | **제외** | `--deepseek` 지정 시 |
| **browser** | **제외** | **UI 변경 있을 때만** | 없음 (`--branch` 전용) |
| doc-reviewer | `$QA_TMP/doc-domain.txt` 비어있지 않음 | 동일 | — |
| harness-reviewer | `$QA_TMP/harness-domain.txt` 비어있지 않음 | 동일 | — |

- **DB schema 경로 변경 여부**: 변경 파일 목록에 DB schema 경로(권위: DB 영역 CLAUDE.md — 구체 경로 패턴은 해당 문서 참조)가 포함되면 schema 정합성 검사를 실행 목록에 추가한다. schema 정합성은 (a) 마이그레이션 dirty + (b) ERD 산출물 staleness 두 검사를 함께 수행한다 (구체 명령·경로 권위: 동일 CLAUDE.md).
- **decisions 도입 버전 확정의 조건**: `docs/architecture-decisions.md` 또는 `docs/harness-decisions.md` 존재 여부만 본다 — 이번 diff 가 그 파일을 건드렸는지는 무관하다 (이유는 Step 2). 결정 문서가 하나도 없는 프로젝트에서 스킵해야 하는 이유는 스크립트가 문서 부재를 루트 해석 실패로 판정하기 때문이다.
- **harness-core 마커 정합의 조건**: 루트 `CLAUDE.md` 에 `harness-core` 마커가 있으면 실행한다 — 이번 diff 와 무관하다. 낡음은 내 변경이 아니라 정본(`${CLAUDE_PLUGIN_ROOT}/references/claude-md-core.md`) 갱신으로 발생하기 때문이다. 마커가 없는 프로젝트(코어 블록 미삽입) 와 `CLAUDE_PLUGIN_ROOT` 가 없는 vendored 소비 프로젝트는 스킵된다.

### Step 2: 조건부 사전 확인

Step 1 매칭 결과를 기준으로, 다음 순서로 진행한다.

**gemini CLI 점검 (Step 1 조건표에서 gemini 실행 예정인 경우에만):**

`command -v gemini` 로 CLI 존재 여부를 확인한다. 없으면 사용자에게 안내 + 분기를 묻는다:
- 안내 문구: "gemini CLI 가 감지되지 않습니다. 설치 가이드: https://github.com/google-gemini/gemini-cli (또는 환경별 npm/brew 등)."
- 선택지 (사용자 응답에 따라 분기):
  - **재호출** — /qa 종료. 사용자가 직접 설치 후 /qa 재호출.
  - **스킵 이번 호출** — gemini 제외 나머지 검증으로 계속 진행. 리포트 헤더에 `⏭️ gemini: 사용자 스킵 선택` 명시.

**deepseek 키·도구 점검 (Step 1 조건표에서 deepseek 실행 예정인 경우에만):**

`[ -n "$DEEPSEEK_API_KEY" ] && command -v jq >/dev/null && command -v curl >/dev/null` 단일 표현식으로 키·도구 존재를 한 번에 확인한다 (셋 중 하나라도 없으면 false). 도구는 반드시 각각 `&&` 로 분리 확인한다 — `command -v jq curl` 처럼 한 호출에 여러 도구를 넘기면 exit code 가 마지막 인자 기준이라 `jq` 부재를 놓친다. false 면 (키 / jq / curl 중 무엇이 없는지 개별 판정해) 사용자에게 안내 + 분기를 묻는다:
- 안내 문구 (키 부재 시): "`DEEPSEEK_API_KEY` 환경변수가 감지되지 않습니다. `~/.zshrc` 등 머신 로컬 프로필에 `export DEEPSEEK_API_KEY=...` 추가 후 재호출하거나, 이번 호출은 스킵하세요. (키는 git 에 커밋하지 않습니다.)" / (jq·curl 부재 시): "deepseek 호출에 필요한 `jq`/`curl` 이 없습니다 (`brew install jq curl`)."
- 선택지 (사용자 응답에 따라 분기):
  - **재호출** — /qa 종료. 사용자가 키 설정/도구 설치 후 /qa 재호출.
  - **스킵 이번 호출** — deepseek 제외 나머지 검증으로 계속 진행. 리포트 헤더에 `⏭️ deepseek: 사용자 스킵 선택` 명시.

**node_modules 점검:**

node_modules 가 필요한 검증(typecheck / test / lint / build / code-reviewer) 이 하나라도 호출 예정이면 `test -d node_modules` 를 확인한다.
- 부재 시 자동으로 프로젝트의 의존성 설치 명령을 실행한다:

```bash
QA_TMP="/tmp/qa-$(basename "$(git rev-parse --show-toplevel)")"
<install-cmd> > "$QA_TMP/install.txt" 2>&1
```

완료 후 "node_modules 미설치 감지 → 의존성 설치 자동 실행 (Xs)" 한 줄 안내.
- 설치 실패 시 (exit code ≠ 0) "환경 셋업 실패 — 직접 의존성 설치 후 재호출 바랍니다. 결과 디렉토리(`$QA_TMP`)의 `install.txt` 확인." 안내 후 스킬 종료 (stop).

**decisions 도입 버전 확정 (Step 1 조건표에서 실행 예정인 경우에만 — 의도된 자동화 예외):**

Decision 의 `**도입**: <버전> (#N)` 은 **생성물**이다. 값이 확정되는 순간은 태깅 시점인데 `/release` 는 파일을 편집하지 않으므로(버전 SSOT = git tag max), 확정된 값은 릴리스 **다음에 오는 아무 PR** 이 이 자리에서 함께 실어 나른다. 전용 chore PR 을 만들지 않는다.

```bash
QA_TMP="/tmp/qa-$(basename "$(git rev-parse --show-toplevel)")"
node "${CLAUDE_PLUGIN_ROOT}/scripts/check-decision-versions.mjs" --write > "$QA_TMP/decision-versions.txt" 2>&1
```

- 스크립트는 `(#N)` → first-parent 커밋 → `git tag --contains` 최초 태그로 결정론적으로 값을 파생해 in-place 로 채운다. 릴리스 안 된 건(PENDING)은 값이 아직 없으므로 건드리지 않고, 자동 판정 불가(UNRESOLVED)는 쓰지 않고 목록만 남긴다.
- **exit 1 = 채운 게 있음** (실패 아님). 리포트 요약에 `🔧 Decision 도입 버전: N건 자동 확정 — 이번 커밋에 포함하세요` 와 `파일:line → 버전` 목록을 출력한다. **P0 로 분류하지 않는다** — 채우는 것 자체가 곧 fix 라 사람이 판단할 여지가 없다. 커밋 강제는 `/pr` Step 0 의 dirty 게이트가 담당하고, 놓쳐도 다음 `/qa` 가 다시 채운다.
- exit 0 이면 P0/P1 항목을 만들지 않는다 — Step 5 요약 표의 상태 줄만 남는다.
- UNRESOLVED 목록이 있으면 P1 로 리포트한다 (수동 확인 필요 — 도입 라인에 `(#N)` 이 없거나 gh 역조회 실패).

### Step 3: 병렬 실행 (bash 명령 + Agent 호출)

> **라우팅 권위**: 변경 파일 → reviewer 분기는 `${CLAUDE_PLUGIN_ROOT}/README.md` 의 "Reviewer 라우팅" 표를 따른다. 이 SKILL 은 caller — 라우팅 표를 자체 정의하지 않는다.

메인 세션이 절차를 오케스트레이션한다 (진입점 디스패처). 코드/문서 편집은 본 스킬 범위 외 — 자세한 제약은 `## 제약` 섹션 참조.

**Step 3a: bash 명령 동시 (typecheck + test + lint + 조건부 schema 정합성 + 조건부 decisions 인덱스 정합 + 조건부 harness-core 마커 정합 + 조건부 build + gemini(--gemini opt-in 전용) + deepseek(--deepseek opt-in 전용))**

Step 0 의 표에서 결정한 `RANGE` 값과 Step 1 의 확정 검증 목록을 사용한다. 실행 예정인 것만 백그라운드로 실행한다. Split 결과 파일(`$QA_TMP/md-changed.txt` 등)은 Step 1 에서 이미 생성되어 있다.

```bash
# RANGE: Step 0 결정값 (HEAD / main...HEAD)
# 구체 명령은 프로젝트의 docs/development.md 또는 영역별 CLAUDE.md 가 권위
QA_TMP="/tmp/qa-$(basename "$(git rev-parse --show-toplevel)")"
<typecheck-cmd> > "$QA_TMP/typecheck.txt" 2>&1 &
<test-cmd> > "$QA_TMP/test.txt" 2>&1 &
<lint-cmd> > "$QA_TMP/lint.txt" 2>&1 &
# schema 정합성: DB schema 경로 변경 시에만 실행 — 2종 검사를 한 파일에 모은다.
#   (a) 마이그레이션 dirty: <db-generate-cmd> 후 <migration-dir>/ dirty
#   (b) ERD staleness: <db-erd-cmd> 후 <erd-output-paths> dirty (둘 다 dirty 비어있어야 Passed)
# ( <db-generate-cmd> && git status --porcelain <migration-dir>/ ; \
#   <db-erd-cmd> && git status --porcelain <erd-output-paths> ) > "$QA_TMP/schema.txt" 2>&1 &
# (구체 명령·경로 권위: DB 영역 CLAUDE.md — db-generate-cmd / migration-dir / db-erd-cmd / ERD 산출물)
# decisions 인덱스 정합: decisions 파일(architecture-decisions / harness-decisions / decisions-archive) 변경 시에만 실행
# 결정적(deterministic) 판정은 모델 추론이 아니라 스크립트로 처리한다 (스크립트 우선 원칙).
# 헤더 식별자 집합 vs 상태 인덱스/목차 집합을 대조해 MISSING(헤더에만)/DANGLING(인덱스에만)/중복/NO_SECTION 을 검출한다 —
# 개수만 비교하던 이전 방식이 놓치던 "한쪽 누락 + 반대쪽 오타" 상쇄 케이스까지 잡는다. 불일치 시 exit 1.
# node "${CLAUDE_PLUGIN_ROOT}/scripts/check-decisions-index.mjs" > "$QA_TMP/decisions-index.txt" 2>&1 &
# harness-core 마커 정합: 루트 CLAUDE.md 에 마커가 있을 때만 실행
# 정본과 복사본의 마커 문자열을 대조한다. 자동 반영은 하지 않는다 — 정책 노브 항목은
# 프로젝트별 확정값이라 블록 통째 치환이 성립하지 않고, 병합은 사람/세션 판단이 필요하다.
# CORE="${CLAUDE_PLUGIN_ROOT}/references/claude-md-core.md"
# SSOT=$(grep -o 'harness-core: [0-9-]*' "$CORE" | head -1)
# MINE=$(grep -o 'harness-core: [0-9-]*' CLAUDE.md | head -1)
# [ "$SSOT" = "$MINE" ] || echo "STALE: 루트 CLAUDE.md = ${MINE:-없음} / 정본 = $SSOT" > "$QA_TMP/harness-core.txt" &
# build: --branch 또는 --build opt-in 시에만 실행
# <build-cmd> > "$QA_TMP/build.txt" 2>&1 &
# gemini: --gemini opt-in 시에만 실행 (--branch 자동 포함 아님)
# --approval-mode plan: 비대화형 환경에서 tool 호출 자동 실행 차단 → 출력 노이즈 제거
# gtimeout -k 30 600: gemini CLI 는 quota 소진(429) 시 에러 없이 무한 hang 하는 사례가 있어
#   (oauth-personal — google-gemini/gemini-cli#22648) 결정적 한도가 없으면 wait 가 영원히 안 풀린다.
#   초과 시 kill(exit 124/137) → 빈 gemini-result.txt → 기존 "응답 실패" 분류가 작동.
#   hang 시 100% CPU 스핀으로 기본 SIGTERM 을 무시하는 사례가 있어 `-k 30` 추가 —
#   600초 SIGTERM 후 30초 내 미종료 시 SIGKILL 강제 종료. (없으면 SIGTERM 무시 시 무한 대기.)
#   gtimeout = brew coreutils (macOS 에 GNU timeout 기본 미탑재). 부재 시 즉시 exit 127 — hang 아님.
# git diff $RANGE | gtimeout -k 30 600 gemini --approval-mode plan -p "$(cat <<'EOF'
# 다음 diff 를 리뷰해줘.
# 내부 reviewer(code-reviewer / security-reviewer) 가 다루지 않는 관점 중심으로 critical / suggestion / nice 로 분류해줘:
# - 대안 설계 관점 (더 단순한 구현이 가능한가)
# - 가독성·명명 (팀원이 오해할 여지가 있는가)
# - 누락된 엣지 케이스 (입력 조합이나 순서 의존 문제)
# 형식: critical → suggestion → nice 순서. 파일:line 명시. 한국어 평이체.
# EOF
# )" > "$QA_TMP/gemini.txt" 2>&1 &
# deepseek: --deepseek opt-in 시에만 실행 (--branch 자동 포함 아님)
# DeepSeek 은 OpenAI 호환 REST API — CLI 없이 curl + jq 직접 호출. CLI 설치/quota-hang 의존성 없음.
# curl --max-time 600: 응답 지연/네트워크 hang 방어 (gemini 의 gtimeout 대응물). 초과 시 빈 결과 → "응답 실패" 분류.
# jq -Rs: stdin(diff)을 raw 문자열로 슬러프해 JSON 으로 안전 인코딩 (특수문자 escape). 응답은 .choices[0].message.content 추출.
# 모델: deepseek-v4-pro (추론·코드 강함, DeepSeek V4 — 2026-04-24 출시). 빠른 검토는 deepseek-v4-flash.
#   구 deepseek-chat/deepseek-reasoner 별칭은 2026-07-24 15:59 UTC 비활성 예정이라 v4 정식 모델명을 쓴다.
#   (최신 모델명·유효성은 공식 문서 https://api-docs.deepseek.com/quick_start/pricing 에서 확인.)
# // empty: API 오류 응답(.error)·null 시 빈 문자열 → 빈 deepseek-result.txt → "응답 실패" 분류 작동.
# curl stderr 는 result 오염 방지를 위해 별도 로그로 분리 (gemini 와 달리 노이즈 필터 불필요 — jq 가 content 만 추출).
# git diff $RANGE | jq -Rs --arg sys '다음 diff 를 리뷰해줘. 내부 reviewer(code-reviewer / security-reviewer)가 다루지 않는 관점 중심으로 critical / suggestion / nice 로 분류해줘: 대안 설계(더 단순한 구현 가능 여부) / 가독성·명명(오해 여지) / 누락된 엣지 케이스(입력 조합·순서 의존). 형식: critical → suggestion → nice 순서, 파일:line 명시, 한국어 평이체.' \
#   '{model:"deepseek-v4-pro",messages:[{role:"system",content:$sys},{role:"user",content:.}],stream:false}' \
# | curl -sS --max-time 600 https://api.deepseek.com/chat/completions \
#     -H "Authorization: Bearer $DEEPSEEK_API_KEY" -H "Content-Type: application/json" -d @- 2>>"$QA_TMP/deepseek-err.txt" \
# | jq -r '.choices[0].message.content // empty' > "$QA_TMP/deepseek-result.txt" 2>>"$QA_TMP/deepseek-err.txt" &
wait

# gemini CLI 가 stdout 으로 출력하는 알려진 안내 라인만 제외 (LLM 응답 형식 변화에 강건)
# - "Warning:" — 256-color 미감지 등 환경 경고
# - "Ripgrep is not available" / "Falling back" — 도구 fallback 안내
# gemini 실행 시에만 적용:
# grep -v -E '^(Warning:|Ripgrep is not available|Falling back)' "$QA_TMP/gemini.txt" > "$QA_TMP/gemini-result.txt"
# fallback: 추출 결과가 비어있으면 메인 세션이 "gemini 응답 실패"로 분류 (리포트 헤더에 명시)
# deepseek 은 별도 후처리 불필요 — jq 가 이미 content 만 deepseek-result.txt 로 추출.
#   비어있으면 메인 세션이 "deepseek 응답 실패"로 분류 (deepseek-err.txt 에 curl/HTTP 오류 단서).
```

**Step 3b: Agent 호출 (Step 3a bash 와 병렬 실행 — 진짜 병렬)**

```
# 실행 순서 의사코드
# Step 3a: bash 명령 백그라운드 실행 (&)
# Step 3b: Agent 호출 — Step 3a 와 같은 응답에서 동시 호출 (진짜 병렬)
# Step 3c: browser 검증 — 메인 세션이 순차 진행 (preview_* 도구 호출)
# wait  ← Step 3a/3b 완료 대기 후 Step 4 종합
```

Step 1 의 split 결과와 Step 1 확정 검증 목록으로 도메인별 호출 결정:
- `$QA_TMP/doc-domain.txt` 비어있지 않으면 → doc-reviewer 호출.
- `$QA_TMP/harness-domain.txt` 비어있지 않으면 → harness-reviewer 호출.
- 코드 파일이 변경됐으면 + `--skip-code-review` 미지정 → code-reviewer 호출.
- 코드 파일이 변경됐으면 + (`--branch` 또는 `--security` opt-in) → security-reviewer 호출.
- 매칭된 reviewer 들은 **Step 3a bash 와 같은 응답 내에서 동시 호출** — reviewer 는 bash 완료를 기다리지 않고 즉시 실행되어 진짜 병렬이 된다. bash 검증 결과는 Step 4 종합 단계에서만 합산한다.

**code-reviewer Agent 호출:**

Agent 도구로 `subagent_type=code-reviewer` 를 호출한다. 프롬프트에 다음을 포함:
- 변경 범위 명시: `"git diff $RANGE 결과를 리뷰. 변경 범위: $RANGE"` 형태
- 호출 출처: "`/qa` 스킬에서 호출됨"

reviewer 는 bash 검증 결과와 무관하게 코드 리뷰만 수행한다. bash 결과(typecheck/test/lint/build)는 Step 4 결과 종합에서 합산한다. 도메인 컨텍스트(영역별 CLAUDE.md / Architecture Decisions 등)는 code-reviewer 가 자동 로드한다. 출력의 공통 분류 등급 레이블을 그대로 활용한다.

**security-reviewer Agent 호출 (코드 파일 변경 시):**

Agent 도구로 `subagent_type=security-reviewer` 를 호출한다. 프롬프트에 다음을 포함:
- 변경 범위 명시: `"git diff $RANGE 결과를 보안 리뷰. 변경 범위: $RANGE"` 형태
- 호출 출처: "`/qa` 스킬에서 호출됨"

reviewer 는 bash 검증 결과와 무관하게 보안 리뷰만 수행한다. bash 결과는 Step 4 종합에서 합산한다. OWASP 점검 컨텍스트(`docs/architecture.md` Auth 섹션 등)는 security-reviewer 가 조건부 read 한다. 출력의 공통 분류 등급 레이블을 그대로 활용한다. code-reviewer 와 병렬 호출한다.

**doc-reviewer Agent 호출 (doc-reviewer 도메인 — 하네스 루트(`$H`) 밖 `.md` — 매칭 시):**

Agent 도구로 `subagent_type=doc-reviewer` 를 호출한다. 프롬프트에 다음을 포함:
- `"변경 범위: $RANGE. 호출 출처: /qa 스킬에서 doc-reviewer 도메인 매칭 시 자동 호출."`
- 변경 .md 파일 목록: `$QA_TMP/doc-domain.txt` 내용을 그대로 포함 (하네스 루트 밖 .md 만)

도메인 컨텍스트는 doc-reviewer 가 자체 구성한다 (적재 방식은 doc-reviewer 권위). 출력의 공통 분류 등급 레이블을 그대로 활용한다.

**harness-reviewer Agent 호출 (harness-reviewer 도메인 — 하네스 루트(`$H`) 아래 `.md` — 매칭 시):**

Agent 도구로 `subagent_type=harness-reviewer` 를 호출한다. 프롬프트에 다음을 포함:
- `"변경 범위: $RANGE. 호출 출처: /qa 스킬에서 harness-reviewer 도메인 매칭 시 자동 호출."`
- 변경 .md 파일 목록: `$QA_TMP/harness-domain.txt` 내용을 그대로 포함 (하네스 루트 아래 .md 만)

하네스 컨텍스트는 harness-reviewer 가 자체 구성한다 (적재 방식은 harness-reviewer 권위). 출력의 공통 분류 등급 레이블을 그대로 활용한다.

**Step 3c: browser 검증 (`--branch` + UI 변경 조건일 때만)**

Step 1 의 UI 변경 판정에서 UI 변경이 확인됐고 `--branch` 인 경우에만 실행한다.

메인 세션이 `preview_*` 도구를 순차 호출한다. 구체 진입 절차·라우트·점검 항목은 `.claude/browser-scenarios.md` 참조로 위임 (본문에 프로젝트 종속값 미기재).

순서 요약:
1. `preview_start` 로 앱 기동.
2. `browser-scenarios.md` 의 **고정 진입 절차**대로 로그인 완료.
3. Tier 1 화면 목록을 순서대로 점검 (경로 이동 → 화면 렌더 확인 → console/network 확인).
4. Tier 2 화면 중 이번 diff 가 해당 소스 경로를 건드린 것만 추가 점검.
5. 모바일 스모크 점검 (`browser-scenarios.md` 의 "모바일 스모크" 섹션 — Tier 1 점검에 이어 수행).

**각 화면 점검 결과 형식 (Step 4 로 넘길 때):**
- 화면당 ✅/❌ 1줄 (예: `✅ /products — 렌더 정상`, `❌ /settings — console error 발생`)
- console error 발생 시 메시지 1건만 인용 (전체 스택 트레이스 X)

**`preview_start` 실패 시 (포트 점유 등):**
- `preview_list` 로 실행 중인 인스턴스 목록을 확인하고, 기존 serverId 가 있으면 재사용한다.
- 기존 인스턴스도 없거나 재사용 불가 시 → "browser 검증 skip — preview_start 실패 (포트 점유 또는 기동 오류)" 를 리포트 헤더에 명시하고 Step 4 로 진행한다.
  (구체 fallback 절차는 `browser-scenarios.md` "고정 진입 절차" fallback 항목 참조)

### Step 4: 결과 종합 (통일 분류)

> **gemini input**: `$QA_TMP/gemini-result.txt` 를 사용한다 (`$QA_TMP/gemini.txt` 전체가 아님). `$QA_TMP/gemini-result.txt` 가 비어있으면 gemini 항목을 "gemini 응답 실패"로 분류하고 리포트 헤더에 `❌ gemini: 응답 실패 (파싱 결과 없음)` 명시.
> **deepseek input**: `$QA_TMP/deepseek-result.txt` 를 사용한다. 비어있으면 deepseek 항목을 "deepseek 응답 실패"로 분류하고 리포트 헤더에 `❌ deepseek: 응답 실패 (응답 없음 — deepseek-err.txt 참조)` 명시.

| 출처 | P0 | P1 | P2 |
|------|----------|------------|--------------|
| typecheck | 실패 시 항상 | — | — |
| test | 실패 시 항상 | — | — |
| lint | 실패 시 항상 | — | — |
| build | 실패 시 항상 | — | — |
| schema 정합성 | `<migration-dir>/` 또는 ERD 산출물 dirty 시 항상 | — | — |
| decisions 인덱스 정합 | `check-decisions-index.mjs` exit 1 (MISSING/DANGLING/중복/NO_SECTION) 시 항상 | — | — |
| decisions 도입 버전 확정 | **없음** (exit 1 = 자동 확정 완료 — 실패 아님) | UNRESOLVED 목록 있음 | — |
| harness-core 마커 정합 | — | `$QA_TMP/harness-core.txt` 가 비어있지 않음 (정본 블록 재복사 필요 — 정책 노브 항목은 프로젝트 값 유지) | — |
| code-reviewer | P0 그대로 | P1 그대로 | P2 그대로 |
| security-reviewer | P0 그대로 | P1 그대로 | P2 그대로 |
| gemini | critical (→ P0, 외부 LLM 의견 표시) | suggestion (→ P1) | nice (→ P2) |
| deepseek | critical (→ P0, 외부 LLM 의견 표시) | suggestion (→ P1) | nice (→ P2) |
| browser | console error 또는 보호 라우트 미렌더 → P0 | 비핵심 network failed → P1 | screenshot 시각 이상(주관) → P2 |
| doc-reviewer | P0 그대로 | P1 그대로 | P2 그대로 |
| harness-reviewer | P0 그대로 | P1 그대로 | P2 그대로 |

toolchain 검증(typecheck/test/lint/build/schema/decisions 인덱스) 실패는 stop 하지 않는다 — P0 분류 후 리포트에 포함한다.

`code-reviewer` 의 `### Pre-existing` 절은 등급 합산에 넣지 않고 리포트의 `### Pre-existing` 절로 그대로 옮긴다 (README "공통 분류 등급" — 귀속 표시, 머지 게이트 비포함).

### Step 5: 통합 리포트 출력

```markdown
## QA 리포트 — YYYY-MM-DD

**검증 범위**: <인자> (<git diff 대상>)

> 도구별 실행/스킵 상태는 아래 "검증 결과 요약" 표가 단일 표기 지점.

---

### P0 (머지 차단)
- [ ] [typecheck] `src/foo/bar.ts:12` — TS2345: ...
- [ ] [test] `src/foo/bar.test.ts` — 실패 테스트 케이스명
- [ ] [code-reviewer] `src/foo/baz.ts:34` — 표준 에러 클래스 미사용
- [ ] [gemini] `src/foo/qux.ts:56` — 대안 설계 미사용으로 복잡도 과다 (외부 LLM 의견)
- [ ] [deepseek] `src/foo/qux.ts:60` — 입력 순서 의존으로 경합 가능 (외부 LLM 의견)
- [ ] [doc-reviewer] `docs/PHILOSOPHY.md:42` — [cross-authority-overlap] `docs/architecture.md` 의 role 에 더 적합한 단락
- [ ] [harness-reviewer] `.claude/skills/qa/SKILL.md:78` — [skill-rnr-overlap] /pr 와 /release 가 같은 작업 양쪽에서 정의
- [ ] [security-reviewer] `src/app/api/order/route.ts:45` — [A03: 인젝션] 사용자 입력이 SQL 쿼리에 직접 삽입됨 (parameterized query 필요)
<!-- finding 그룹화 정책: 같은 파일:line + 같은 위반 유형이면 출처 병기. 예:
- [ ] [security-reviewer][gemini] `src/foo/bar.ts:23` — [A01: 접근 제어 누락] 인증 게이트 없는 관리자 엔드포인트 (외부 LLM 의견 포함)
-->

### P1 (권장)
- [ ] [code-reviewer] `src/foo/bar.ts:78` — co-located 테스트 누락

### P2
- [ ] [gemini] `src/foo/bar.ts:90` — 변수명 명확도 개선 (외부 LLM 의견)
- [ ] [deepseek] `src/foo/baz.ts:14` — 조기 반환으로 중첩 감소 가능 (외부 LLM 의견)

### Pre-existing (이 변경이 만들지 않음 — 머지 게이트 비포함)
- [ ] [code-reviewer] `src/foo/old.ts:5` — 변경 전부터 있던 결함 (이슈화 후보)

---

### 검증 결과 요약
- 의존성 설치: ✅ 자동 실행 완료 (Xs) / — 미실행 (node_modules 존재) / — 미실행 (필요 검증 없음 — doc/harness 만)
- 타입 체크: ✅ Passed / ❌ Failed
- 테스트: ✅ Passed / ❌ Failed
- lint: ✅ Passed / ❌ Failed
- 빌드: ✅ Passed / ❌ Failed (`--branch` 또는 `--build` 시) / ⏭️ 단발 기본 — 스킵
- schema 정합성 (마이그레이션 + ERD 산출물): ✅ Passed / ❌ Failed / ⏭️ DB schema 경로 변경 없음 — 스킵
- decisions 인덱스 정합: ✅ Passed / ❌ Failed (exit 1 — MISSING/DANGLING/중복/NO_SECTION) / ⏭️ decisions 파일 변경 없음 — 스킵
- Decision 도입 버전: ✅ 확정할 것 없음 / 🔧 N건 자동 확정 — 이번 커밋에 포함하세요 (`파일:line → vX.Y.Z` 목록) / ⏭️ 결정 문서 없음 — 스킵
- browser 검증: ✅ 완료 (`--branch` + UI 변경) / ⏭️ 단발 기본 — 스킵 / ⏭️ UI 변경 없음 — 스킵 / ⏭️ preview_start 실패 — 스킵
- `code-reviewer`: ✅ 완료 / ⏭️ `--skip-code-review` 사용자 명시 스킵
- `security-reviewer`: ✅ 완료 / ⏭️ 단발 기본 — 스킵 / ⏭️ 코드 변경 없음 — 스킵
- `gemini`: ✅ 완료 / ⏭️ 단발/풀 공통 — 스킵 (`--gemini` 명시 시에만) / ⏭️ 사용자 스킵 선택 / ❌ 응답 실패
- `deepseek`: ✅ 완료 / ⏭️ 단발/풀 공통 — 스킵 (`--deepseek` 명시 시에만) / ⏭️ 사용자 스킵 선택 / ❌ 응답 실패
- `doc-reviewer`: ✅ 완료 / ⏭️ doc 도메인 변경 없음 — 스킵
- `harness-reviewer`: ✅ 완료 / ⏭️ 하네스 도메인 변경 없음 — 스킵
```

**QA 통과 marker 기록 (`--branch` + P0 == 0 시에만)**:

리포트 출력 후, `--branch` 로 실행되어 **P0 == 0** 으로 종료된 경우에만 다음을 실행한다.

```bash
# marker 는 의도적으로 $QA_TMP 밖 고정 경로 — /pr Step 0 이 세션 무관하게 읽는 계약(존재 = 통과). 경로 변경 금지.
# 내용은 발견 요약 — /pr Step 2 가 PR 본문 "QA 발견 요약" 절에 그대로 붙인다. 리포트에서 개수·미해결 P1·Pre-existing 만 옮긴다.
MARKER="/tmp/qa-pass-$(basename -s .git "$(git remote get-url origin)")-$(git rev-parse HEAD)"
# 위험 경로: 루트 CLAUDE.md 작업 규약 코어 "위험 등급" 항목(마이그레이션·요청 경로·CI 워크플로)에 닿는 변경 파일.
# /pr 은 로컬 base 비교를 하지 않으므로(그 스킬의 제약) RANGE 를 이미 가진 여기서 계산해 marker 에 남긴다.
# 아래 패턴은 Drizzle + Next.js 프로젝트의 예 — <migration-dir> 권위는 DB 영역 CLAUDE.md.
RISKY=$(git diff --name-only $RANGE | grep -E '^(\.github/|drizzle/|src/proxy\.ts$|src/middleware\.ts$)' | tr '\n' ' ')
cat > "$MARKER" <<'EOF'
발견 N건 (P0 0 · P1 b · P2 c · Pre-existing d) — /qa --branch YYYY-MM-DD
- 미해결 P1: file:line — 한 줄 사유 (없으면 "없음")
- Pre-existing: file:line — 한 줄 (없으면 "없음")
- 위험 경로: <$RISKY 값 — 비어 있으면 "없음">
EOF
```

(위 heredoc 은 템플릿 — 실제 값으로 채워 기록한다. 발견 0건이면 첫 줄은 "발견 0건 — 고칠 것 없음". 위험 경로가 있으면 /pr 이 Risk 를 High 로 제안한다.)

한 줄 안내(사용자 출력): "QA 통과 marker 기록 — /pr Step 0 게이트에서 확인됨"

- 기본(uncommitted) 호출은 부분 검증이라 PR 범위를 보증하지 못하므로 marker 를 기록하지 않는다.

**직전 QA SHA 기록 (모든 /qa 호출 — 통과 여부 무관):**

리포트 출력 완료 시점에 다음을 실행한다 (재검증 모드의 트리거 판정에 사용):

```bash
QA_TMP="/tmp/qa-$(basename "$(git rev-parse --show-toplevel)")"
git rev-parse HEAD > "$QA_TMP/last-qa-sha"
```

- `$QA_TMP` 디렉토리는 Step 1 에서 이미 초기화되어 있으므로 별도 mkdir 불필요.
- 기록 실패 시 (디렉토리 부재 등) 무시하고 진행 (best-effort — 부재 시 재검증 모드 대신 일반 /qa 폴백으로 안전하게 처리됨).
- `/plan` 라운드 루프(좁은 RANGE) 도 marker 를 기록하지 않는다. 사이클 종료 후 `/qa --branch` 가 marker 기록의 정당한 지점이다.
- P0 가 1건 이상이면 marker 를 기록하지 않는다 (찍히지 않은 HEAD = 미통과 신호).

### Step 6: 후속 (사용자 선택)

- "고쳐줘" — P0 부터 `developer` 서브에이전트에 위임한다.
- "외부 LLM 의견 무시" — 사용자 확인 후 Gemini/DeepSeek findings 를 제외하고 종료한다.
- "릴리스" — `/release vX.Y.Z` 별도 호출을 안내한다. `/qa --branch` 통과가 /pr 의 marker 게이트 입력이 된다. **PR 생성 전** `/qa --branch` 실행이 권장되는 위치 — /pr Step 0 marker 게이트에서 확인됨.

## P2 라운드 종결 규칙

**P2 는 재검증 재진입 트리거가 아니다.** findings 수정의 in-round 마감 대상은 P0/P1 까지.

P2 의 기본 처리는 조건부 유예 원칙에 따른다:
- 트리거가 코드-로컬(해당 함수·파일 범위)이면 해당 위치 주석으로 기록.
- 외부 의존성·시간 기반 조건이면 이슈로 등록.

사용자가 명시 요청하면 P2 도 in-round 처리 가능 (기본값만 보류).

## 재검증 (findings 수정 후 재호출)

이 섹션은 **동일 브랜치·동일 사이클 흐름**에서 직전 /qa 라운드의 findings 를 수정한 직후 재호출하는 경우에만 적용된다.

### 트리거 판정

다음 두 조건이 모두 충족될 때 "재검증 모드" 로 진입한다:
1. 직전 /qa 라운드가 이번 세션에서 실행됐다 (결과가 메모리에 있음).
2. 수정 커밋이 직전 /qa 라운드 이후에만 추가됐다 (신규 기능 추가 없음).

세션 재시작 등으로 직전 라운드 findings/SHA 를 신뢰 가능하게 확보할 수 없으면 (조건 1 미충족) 항상 일반 /qa 로 폴백한다. `$QA_TMP/last-qa-sha` 부재 시도 동일하게 일반 /qa 로 폴백한다 (Step 5 SHA 기록 연동 — 아래 참조).

조건을 충족하지 않으면 일반 /qa 절차(Step 0~6)를 그대로 실행한다.

### 생략 조건 (reviewer 재호출 자체를 생략)

수정이 **표현·한 줄 수준의 기계적 텍스트 변경**(변수명 오타 수정, 주석 문구 교정, 공백 정리 등 검증 대상 의미 변화 없음)이면:
- reviewer 재호출을 생략한다.
- developer 완료 보고 + 오케스트레이터 spot-check(해당 라인 직접 확인)로 갈음한다.
- toolchain(typecheck/test/lint) 은 코드 변경이면 정상 실행한다.

### 범위 축소 절차

생략 조건에 해당하지 않으면 다음을 실행한다.

**1. 수정 diff 도메인 산출**

```bash
# 수정 커밋의 변경 파일만 추출 (직전 /qa 라운드 이후 커밋들)
QA_TMP="/tmp/qa-$(basename "$(git rev-parse --show-toplevel)")"
# last-qa-sha: Step 5 에서 기록한 직전 /qa HEAD SHA
# 파일 부재 = 직전 라운드 식별 불가 → 이 경로에 도달하기 전 트리거 판정에서 일반 /qa 로 폴백되어야 함
LAST_QA_SHA=$(cat "$QA_TMP/last-qa-sha" 2>/dev/null)
git diff "${LAST_QA_SHA}..HEAD" --name-only --diff-filter=d > "$QA_TMP/reverify-changed.txt" 2>/dev/null || true
```

**2. 도메인 매칭**

수정 diff 파일 목록을 Step 1 과 동일한 split(`$H` 유도 포함)으로 재분류해 하네스 README "Reviewer 라우팅" 표로 매칭한다 — 닿은 도메인의 reviewer 만 재실행하고, 닿지 않은 도메인의 직전 라운드 결과는 그대로 승계한다. `security-reviewer` 는 실질 delta(새 로직·새 파일·의미 변경) + (`--branch`/`--security`) 조건 충족 시에만 재실행.

**3. reviewer 프롬프트 제한**

재검증 reviewer 호출 시 프롬프트에 다음을 명시한다:

```
재검증 호출입니다. 전체 재검증 금지.
확인 사항:
1. 직전 findings 의 반영 정확성 확인 — 아래 목록의 각 항목이 수정됐는지 확인.
2. 신규 위반만 보고 — 직전 findings 에 없던 새로운 문제만 보고.

직전 findings:
<직전_라운드_findings_목록>

출력 제약:
- 각 finding 은 파일:line + 1문장으로 표현. 설명 이상의 서술 금지.
- 통과 항목(수정 확인됨) 서술 금지.
- 리포트는 findings 목록과 요약 카운트(P0/P1/P2 건수)만 포함.
```

**4. 풀 검증 항목 승계 원칙**

security-reviewer / build 등 `--branch` 전용 항목과 외부 LLM 리뷰(`--gemini`/`--deepseek` opt-in 시)는 재검증 라운드에서 기본 재실행하지 않는다. 실질 delta(새 로직·새 파일·의미 변경)가 있을 때만 재실행한다.

**외부 LLM 재실행 시 기각 목록 전달**: gemini/deepseek 를 재실행하는 경우, 직전 라운드까지 사용자가 기각 확정한 findings 의 요약 목록을 프롬프트에 포함한다:

```
이미 검토 후 기각 확정된 항목 — 재보고 금지:
<기각_확정_findings_요약_목록>
```

### marker 합성 판정

재검증 모드의 marker 기록 조건: "풀 라운드 1회 + 후속 재검증(들)" 의 합성 결과로 P0==0 이면 최종 HEAD 에 기록한다. 리포트 헤더에 "합성 판정 (풀 라운드 + 재검증 N회)" 임을 명시한다.

### 재검증 리포트 헤더

```markdown
## QA 재검증 리포트 — YYYY-MM-DD
**모드**: 재검증 (직전 풀 라운드 SHA: <sha>)
**판정**: 합성 (풀 라운드 + 재검증 N회)
**승계 도메인**: <직전 결과 그대로 승계된 도메인 목록>
**재실행 도메인**: <이번에 재실행된 reviewer 목록>
```

## 예외 처리

각 상황의 처리는 해당 Step 본문이 단일 권위다 (여기에 재서술하지 않는다). Step 본문에 없는 것 하나만 규정한다:

- **reviewer(Agent) 호출 실패** — warn + 나머지 결과만 종합해 리포트를 출력한다 (어느 reviewer 든 동일).

## 제약

- 검증만 수행한다. 코드 자동 수정 X. 수정은 사용자 결정 후 `developer` 서브에이전트에 위임한다.
- 의도된 자동화 예외(node_modules 자동 설치, schema 정합성 자동 실행, decisions 도입 버전 자동 확정)는 Step 2 참조. 셋 다 **결정론적 생성물의 재생성**이지 판단이 필요한 수정이 아니다.
- 메인 세션이 절차를 오케스트레이션한다. QA 검증 효과:
  - 코드 변경 (프로젝트 toolchain 입력) 은 `developer` 서브에이전트에 위임
  - 문서 / 하네스 편집은 X — Agent 호출 + bash 검증만 수행 (예외: 위 도입 버전 자동 확정 — 모델이 아니라 스크립트가 결정론적으로 쓴다)
- 검증 명령(typecheck/test/lint/build)은 `/qa` 가 직접 bash로 실행한다(`${CLAUDE_PLUGIN_ROOT}/README.md` "검증 명령 실행 책임" 참조). reviewer 에이전트는 순수 코드 리뷰만 수행한다.
- `/release` 는 toolchain 게이트를 갖지 않는다. `/qa` 가 PR 머지 전 검증 권위이며, `/release` 는 PR 게이트 통과 상태를 신뢰하고 origin/main 을 태깅한다.
