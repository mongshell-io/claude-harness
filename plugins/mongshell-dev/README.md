---
role: "Claude Code 하네스 흐름도 + 에이전트 cross-cutting 공유 정의(라우팅 / 공통 분류 등급 / 검증 책임 / 본문 작성 가이드)의 단일 권위"
kind: operational
non_goals:
  - "운영 정책 — 각 소유 스킬(브랜치·머지=pr, 라벨=create-issue) 과 소비 프로젝트 루트 CLAUDE.md 상시 코어가 분담"
  - "개별 skill·agent 의 상세 동작 (각 SKILL.md / agent frontmatter 가 권위)"
  - "권위 문서 목록 / frontmatter 스키마 (required-docs.md)"
---

# Claude Code Harness 흐름도

이 문서는 두 가지 역할을 합니다: **(1) 하네스 흐름도** 와 **(2) 여러 reviewer·skill 이 공유하는 cross-cutting 정의의 단일 권위** (Reviewer 라우팅 / 공통 분류 등급 / 검증 명령 실행 책임 / 본문 작성 가이드). 개별 skill·agent 의 상세 동작은 각 SKILL.md / agent frontmatter 가 권위입니다.

이 하네스는 **플러그인(mongshell-dev)** 으로 배포되는 것이 기본이고, 예외적으로 일부 프로젝트에는 파일 복사(vendored)로 배포됩니다. vendored 배포본은 생성물이므로 직접 수정하지 않습니다 — SSOT 저장소에서 고친 뒤 재배포합니다. 배포 채널·이유는 SSOT 저장소 README 가 권위입니다.

---

## Skill Pipeline (SDLC 흐름도)

```mermaid
flowchart LR
    USER([사용자 의도])

    subgraph CYCLE["마일스톤 사이클"]
        PL["/plan"]
    end

    subgraph BACKLOG["백로그"]
        CI["/create-issue"]
    end

    subgraph VERIFY["검증"]
        QA["/qa"]
    end

    subgraph MERGE["머지"]
        PR["/pr"]
        RV["/review-comments"]
    end

    subgraph RELEASE_GRP["릴리스"]
        RL["/release"]
    end

    subgraph AGENTS["에이전트"]
        ARCH_AGENT["architect"]
        DEV_AGENT["developer"]
        CR_AGENT["code-reviewer"]
        SR_AGENT["security-reviewer"]
        DR_AGENT["doc-reviewer"]
        HR_AGENT["harness-reviewer"]
        EX_AGENT["Explore"]
    end

    USER --> PL
    USER --> CI
    PL -.->|라운드별 위임| DEV_AGENT
    PL -.->|라운드별 자동 리뷰 / 코드 도메인| CR_AGENT
    PL -.->|라운드별 자동 리뷰 / doc 도메인| DR_AGENT
    PL -.->|라운드별 자동 리뷰 / harness 도메인| HR_AGENT
    PL -.->|사이클 종료 후 안내| QA
    CI -.->|코드베이스 조사 위임| EX_AGENT
    ARCH_AGENT -.->|권고 후 구현 위임| DEV_AGENT
    DEV_AGENT --> QA
    QA -.->|코드 도메인| CR_AGENT
    QA -.->|코드 도메인 — /qa 단독 호출 전용| SR_AGENT
    QA -.->|doc 도메인| DR_AGENT
    QA -.->|harness 도메인| HR_AGENT
    QA --> PR
    PR --> RV
    RV -.->|PR 리뷰 코멘트 수정 위임| DEV_AGENT
    RV --> RL
```

> 도메인별 라우팅 권위는 아래 "Reviewer 라우팅" 표 — caller (`/qa` 등) 가 변경 파일을 입력 도메인으로 분기.
>
> 규율 스킬(`verification-before-completion` · `systematic-debugging`)은 흐름의 한 단계가 아니라 상황 트리거라 흐름도에 없다 — 아래 "호출 방식".

---

## Reviewer 라우팅

**Reviewer 라우팅의 단일 권위**. 다른 SKILL/agent 본문은 본 표만 참조합니다.

변경 파일을 입력 도메인으로 분기 — caller(`/qa`, developer self-round, `/review-comments` 등) 가 동등하게 참조하는 단일 권위.

| 입력 도메인 | Reviewer | 상태 |
|---|---|---|
| 프로젝트 toolchain 입력 코드 | `code-reviewer` | 활성 |
| 프로젝트 toolchain 입력 코드 | `security-reviewer` | 활성 * |
| 사용자/외부 독자 향 문서 (`**/*.md` 중 하네스 루트 밖 — 예: `docs/**/*.md`, 루트 + 영역별 `CLAUDE.md`, 기타 `README.md`, SSOT 저장소 자체의 루트 `README.md`) | `doc-reviewer` | 활성 |
| 하네스 파일 (하네스 루트 아래 `**/*.md` — agents / skills / README / required-docs) | `harness-reviewer` | 활성 |

> \* `security-reviewer` 의 `/plan` 루프 제외 등 호출시점 정책은 qa 스킬의 "/plan 자동 iteration 과의 책임 경계" 표 참조.

> **하네스 루트 정의** (이 표와 reviewer·`/qa` 의 도메인 판정이 공통으로 쓰는 권위):
> - **vendored 소비 프로젝트** — `.claude/` 하나 (`.claude/.harness` 마커로 판정).
> - **하네스 SSOT 저장소** (`plugins/mongshell-dev/.claude-plugin/plugin.json` 이 있는 저장소) — `.claude-plugin/plugin.json` 을 가진 `plugins/<이름>/` 전부. 개발 하네스(이 플러그인)뿐 아니라 같은 저장소의 다른 플러그인(운영 도구 등)도 harness-reviewer 로 간다 — 새 플러그인도 `plugin.json` 만 있으면 따로 등록하지 않아도 이 도메인에 든다.
> - **플러그인 소비 프로젝트** — 없음 (harness 도메인 공집합). 자기 `plugins/<이름>/` 이나 `plugin.json` 을 가진 프로젝트라도 SSOT 저장소가 아니면 마찬가지다.
>
> 공통 정의(이 README 의 라우팅·공통 분류 등급·작성 가이드, `references/required-docs.md`)의 위치는 **개발 하네스 루트**(vendored `.claude/`, SSOT `plugins/mongshell-dev/`) 하나다. 판정 명령은 harness-reviewer `## 입력 도메인` 과 `/qa` Step 1 이 같은 블록을 쓴다.

> **코드 도메인 정의**: "프로젝트 toolchain 입력 코드" 의 구체 확장자는 영역별 `CLAUDE.md` 또는 `docs/development.md` 의 lint/typecheck/test 명령 대상이 권위. toolchain 외 파일 (이미지/lock/data 등) 의 처리는 아래 "도메인 외 입력 정책" 참조.

**입력 도메인**은 분할 (한 파일은 정확히 한 도메인). 각 도메인에 reviewer 는 1+ 개 라우팅 가능.

**도메인 외 입력 정책**: caller 가 어떤 이유로든 도메인 외 파일을 reviewer 입력에 포함한 경우, 해당 reviewer 는 그 파일에 대해 "분류 외 — 본 에이전트 영역 아님" 으로 보고만 하고 검증을 수행하지 않습니다.

**매칭 절차** (caller 공통):
1. `git diff --name-only` (또는 caller 가 명시한 범위) 로 변경 파일 수집.
2. 각 파일을 위 표의 glob 과 매칭.
3. 매칭된 reviewer(들)를 Agent 도구로 호출. 다중 도메인 매칭 시 reviewer 들을 같은 응답 내 병렬 호출.

---

## 검증 명령 실행 책임

- `<typecheck-cmd>` / `<test-cmd>` / `<lint-cmd>` / `<build-cmd>` 등 toolchain 검증 명령의 **실행**은 caller(오케스트레이션 레이어: `/qa`, `/plan` 등)가 bash로 수행.
- reviewer 에이전트(code-reviewer, security-reviewer 등)는 검증 명령을 직접 실행하지 않고 코드 리뷰만 수행. 실행 결과(P0)는 caller가 종합.
- 구체 명령의 권위 = `docs/development.md` 또는 영역별 `CLAUDE.md`.

**2층 검증 모델**: developer self-gate(깨진 상태로 넘기지 않기 위한 완료 조건) ↔ caller 결합 판정(병렬 위임·공유파일 변경 시의 P0 권위 결정)은 역할이 다르며 독립적으로 운영된다. `/plan` Step 4b-1의 조건부 skip 규칙 상세는 `plan/SKILL.md` 가 권위.

---

## 공통 분류 등급

모든 reviewer 와 `/qa` 스킬은 findings 를 다음 등급(P0 / P1 / P2)으로 분류합니다 — 단일 권위. 코드 reviewer(`code-reviewer`)와 `/qa` 는 등급 밖 **귀속 표시** 하나(`Pre-existing`)를 함께 씁니다(다른 reviewer 는 해당 없음 — 재검증 카운트에서는 0).

- **`P0`** — 머지 차단. 정확성 / 보안 / 빌드·테스트·lint 실패 / 명세 권위 위반 등.
- **`P1`** — 권장 개선. 차단은 아니지만 머지 전 가능하면 해결.
- **`P2`** — 사소한 제안. 톤·표현·미세한 보완.
- **`Pre-existing`** — 등급이 아니라 **귀속 표시**. 이번 변경이 만들지 않은(변경 전부터 있던) 결함.
  P0/P1/P2 합산과 머지 게이트에 들어가지 않고 이슈화 후보로만 보고한다. 보안 결함은 예외 —
  처리 기준은 `security-reviewer` 본문(§제약).

각 reviewer 의 위반 키 → 등급 매핑은 reviewer 본문 참조.

---

## Decision 참조 검증 (adr-content-mismatch 공통 절차)

`doc-reviewer` 와 `harness-reviewer` 가 공유하는 `adr-content-mismatch` 검증 알고리즘. 각 reviewer 는 아래 절차를 따르되, **read 대상 파일과 검출 도메인만 자기 영역을 채운다**.

1. 정규식 `Decision (#?\d+(?:-\d+)?)` 으로 변경 .md 본문에서 Decision 참조 검출 — 레거시 순번(`Decision 76`)과 신규 이슈 식별자(`Decision #992`)를 모두 잡고, 캡처 그룹은 `#` 를 포함한다.
2. 참조가 1개 이상 발견된 경우에만 `<read-target>` 을 read (조건부 — 참조 없으면 read 불필요).
3. 각 참조마다:
   - **존재성**: `<read-target>` 에 `## Decision <참조 식별자>` 헤더 존재하는가 (`#` 접두 포함해 그대로 대조 — 신규는 `## Decision #992`). 없으면 **P0** (`존재하지 않는 Decision`).
   - **맥락 정합성**: 참조한 본문 단락이 해당 Decision 본문의 결정·이유·결과·트레이드오프 중 하나와 의미적으로 연결되는가. 무관하면 **P1** (`맥락 부적합 — 의도된 Decision 추정 또는 인용 제거 권장`).
   - **부분 연결** (Decision 본문의 부수 문장과 일치하지만 핵심과 거리감): false positive 회피 차원에서 `adr-content-mismatch` 로 잡지 않음.
4. 다중 참조 (`Decision 2 / Decision 8` 처럼) 시 각 Decision 독립 판정. 하나라도 맥락 불일치면 어느 N 이 문제인지 명시.
5. **검출 범위**: 각 reviewer 의 입력 도메인 안에서만 검출 (도메인 외는 분류 외로 처리).

**reviewer 별 변수**:

| reviewer | read-target | 검출 도메인 |
|---|---|---|
| `doc-reviewer` | `docs/architecture-decisions.md` | `**/*.md` 중 하네스 루트 밖 |
| `harness-reviewer` | `docs/harness-decisions.md` + `docs/architecture-decisions.md` (양쪽) | 하네스 루트 아래 `**/*.md` |

---

## 예외 조항 누적 검증 (exception-clause-accumulation 공통 기준)

`doc-reviewer` 와 `harness-reviewer` 가 공유하는 키. 각 reviewer 는 아래 기준을 따르되 **무엇이 흐려지는지만 자기 도메인으로 채웁니다**.

"단,", "다만,", "예외 —", "원칙적으로 X 인데 Y" 류 단서 조항이 쌓여 원래 정책의 경계를 흐리는 경우를 잡습니다. 이런 표현이 단서가 되지만 **판정은 의미로** 합니다 — 단순 부가 설명("단, 자세한 내용은 X 참조")은 대상이 아니고, 정책을 되돌리거나 우회하는 단서일 때만 해당합니다.

| reviewer | 흐려지는 경계 |
|---|---|
| `doc-reviewer` | 권위 문서 간 SSOT / R&R 분리 / 입력 도메인 분리 |
| `harness-reviewer` | skill·agent 의 입력 도메인 분리와 책임 경계 (예: "도메인 외에도 X 수행") |

---

## 권위 문서 부재 시 동작 (공통 계약)

skill / agent 가 참조하는 프로젝트 권위 문서(`docs/**`, 영역별 `CLAUDE.md`, `browser-scenarios.md` 등)가 대상 프로젝트에 존재하지 않으면, 그 문서에 의존하는 단계만 **skip 하고 리포트에 "권위 문서 부재 — skip: <경로>" 로 명시**한다. 실패로 처리하지 않는다 — 하네스는 docs 계약이 아직 갖춰지지 않은 프로젝트에서도 나머지 기능이 안전하게 동작해야 한다. 문서를 갖추는 절차는 SSOT 저장소 README 의 이식 가이드가 권위.

---

## 호출 방식

- **절차 스킬** (`/create-issue` · `/plan` · `/qa` · `/pr` · `/review-comments` · `/release`) — 명시 호출 전용. 개발 흐름에 영향을 주므로 우발적 실행을 막는다.
- **규율 스킬** (`verification-before-completion` · `systematic-debugging`) — 상황이 트리거라 명시 호출 없이 적용한다. 각 SKILL.md 의 description 이 적용 조건을 말하고, 메인 세션과 developer 가 그 상황(완료 주장 직전 · 버그를 만났을 때)에서 스스로 따른다. 판단 기준과 순서를 더할 뿐 새 실행 흐름(위임 · commit · 외부 발신)을 열지 않으므로 우발적 실행의 위험이 없다 — 위임 여부는 여전히 루트 `CLAUDE.md` 오케스트레이터 규칙이 정한다.

규율 스킬은 [obra/superpowers](https://github.com/obra/superpowers) (MIT) 에서 옮겨 왔다 — 라이선스 고지는 [LICENSE.superpowers](./LICENSE.superpowers).

## 본문 작성 가이드 — 진입 금지 도메인 키워드

이 하네스 본문에 들어가면 안 되는 도메인 키워드. 새 agent/skill 작성 또는 기존 파일 수정 시 참조.

**적용 범위**: 임의의 소비 프로젝트로 배포되는 개발 하네스(이 플러그인과 그 vendored 사본) 한정. 같은 SSOT 저장소의 다른 플러그인은 특정 운영 환경을 잇는 것이 목적이라 채널·봇 ID 같은 개인 운영 값을 담을 수 있다.

- **영역별 경로** — 예: `docs/`, `src/lib/`, `src/components/`, `src/app/api/` 등 프로젝트 종속 경로. 대신 "영역별 `CLAUDE.md`" / "프로젝트 디렉토리" 등으로 일반화.
- **빌드/검증 명령어** — 프로젝트 스택 종속 명령 (`pnpm test:run`, `pnpm typecheck`, `pnpm lint`, `pnpm db:push`, `pnpm build` 등). 대신 "테스트 명령", "typecheck 명령", "lint 명령" 등 역할 표현 + "구체 명령은 `docs/development.md` 또는 영역별 `CLAUDE.md` 권위" 위임.
- **외부 의존 스택** — 사용 중인 ORM / 큐 / 인증 / 빌드 도구 이름 (예: Next.js, Drizzle, shadcn, Vitest, Biome). 대신 역할 표현 ("DB 마이그레이션 명령", "테스트 러너", "린터").
- **도메인 / 비즈니스 용어** — 프로젝트 이름, 핵심 도메인명, 표준 에러 클래스명 등. 대신 "이 프로젝트" / "프로젝트의 표준 에러 패턴" 등.
- **정책 수치** — 라벨 목록, 구체 버전 패턴 등 프로젝트마다 달라지는 값.
- **하네스 카운트 표현** — "N종" / "N가지" 같이 하네스 안의 검증 단계 / 서브에이전트 / 도구 등을 정량 카운트하는 표현. 하네스 변경마다 본문 동기화 부담이 누적되고, 의미가 다른 카운트끼리 숫자 충돌이 발생함. 대신 항목 나열 / 역할 표현 ("다중 검증" / "bash 명령 + Agent 호출" 등). 외부 표준·스펙이 정한 고정 항목 수는 예외. 과거 Decision 스냅샷(`docs/harness-decisions.md` / `docs/architecture-decisions.md` 본문) 은 본 규칙의 적용 대상이 아니다.

- **프로젝트 고유 이슈·Decision 번호의 권위 인용** — 다른 프로젝트에서 존재하지 않는 참조가 된다. 형식 예시와 상위 저장소(도구 자체) 이슈 인용은 예외.
- **required-docs 계약 밖의 docs/ 의존성** — 새 문서 의존을 추가하려면 `references/required-docs.md` 에 contract 를 함께 추가한다.

**판정 휴리스틱**: 임의의 다른 프로젝트에 그대로 들어가도 의미가 동일한가? → No 면 금지.

---

## 본문 작성 가이드 — 낭비 패턴

하네스 본문에서 **실익 없이 호출 비용만 늘리는** 패턴. `harness-reviewer` 의 `perf-anti-pattern` 키가 검출하는 대상의 단일 권위입니다 — reviewer 본문은 이 목록을 복제하지 않고 참조합니다.

- **자동 로드 문서 명시 read** — 루트 / 영역별 `CLAUDE.md` 처럼 자동 로드되는 문서를 "필수 read" 로 적지 않습니다. agent 호출 시점에 이미 컨텍스트에 있습니다.
- **agent 호출 정당성 부족** — 단순 grep / 파일 매칭은 메인 세션이나 bash 로 처리합니다. 하위 agent 호출은 판단이 필요한 분석에 한정합니다.

**판정 휴리스틱**: 이 지시를 지워도 결과가 같은가? → Yes 면 낭비.

> **목록이 짧은 이유**: 예전에는 "권위 문서는 최소한만 read", "출력 형식을 조여 토큰 절감", "작은 작업엔 작은 모델" 같은 항목이 함께 있었습니다. 컨텍스트가 좁고 모델이 비싸던 시절의 최적화인데, 지금은 **덜 읽어서 놓치는 비용** 과 **형식에 갇혀 판단을 못 적는 비용** 이 더 큽니다. 절약이 목적이 되면 검증 품질이 먼저 깎입니다.
>
> 절차를 CLI 로 정형화하는 것 자체는 여전히 옳지만, 그건 비용이 아니라 **결정성** 의 문제입니다 — 결정적 판정(개수 비교·존재 확인·형식 검사)은 모델 추론이 아니라 스크립트로 처리한다 (스크립트 우선 원칙, 소비 프로젝트 상시 코어에 포함).

---

## 하네스 철학

이 하네스는 **1인 운영 (solo operation) 을 기본 전제**로 합니다 — 단순성 우선(1인이 유지관리할 수 있는 복잡도 안에서 결정), 팀 협업 본질 패턴은 디스카운트, 운영 부담 최소화. skill/agent 설계·수정 시 항상 이 축으로 판단합니다.

**SSOT 원칙**: 다른 권위 문서의 정보는 링크/쿼리로 참조만 — 본문에 복제하지 않습니다. 각 skill 은 SKILL.md, agent 는 frontmatter 가 자기 파일의 단일 권위이며 별도 목록·카탈로그 파일을 만들지 않습니다.

## 권위 문서 frontmatter 표준

권위 문서 (하네스 `**/*.md`, `docs/**/*.md` 중 frontmatter 있는 것) 의 frontmatter 스키마 (`role` / `kind` / `non_goals`) 는 [references/required-docs.md](./references/required-docs.md#frontmatter-스키마) 가 SSOT.
