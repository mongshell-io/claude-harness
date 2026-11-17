---
role: "하네스의 agent/skill 이 권위 문서에 가정하는 frontmatter 스키마와 본문 구조 contract 의 단일 권위 — 권위 문서 본문 작성 디테일은 다루지 않음."
kind: reference
non_goals:
  - "권위 문서 본문 작성 디테일 (각 권위 문서가 직접 정의)"
  - "이식 절차 전반 (공유 하네스 SSOT 저장소의 README)"
---

# Required Docs — 하네스가 권위 문서에 기대하는 Contract

이 하네스의 agent / skill 이 권위 문서를 read·write 할 때 가정하는 **frontmatter 스키마**(공통) 와 **본문 구조 contract**(문서별) 의 단일 권위.

다른 프로젝트로 이식할 때 이 명세에 맞춰 권위 문서를 작성하면 하네스가 정상 작동한다.

## 사용 방법

- **이식자** — 각 권위 문서를 작성할 때 본 문서의 "하네스가 요구하는 본문 구조" 항목을 만족시킨다.
- **하네스 변경자** — 새 agent/skill 이 권위 문서를 참조하거나 갱신한다면 본 문서에 해당 contract 를 추가한다. 본 문서를 갱신하지 않은 채 본문 의존성을 추가하면 이식성이 깨진다.

## 판정 원칙

본 문서의 항목은 **하네스 본문이 명시적으로 요구하는 것** 만 담는다. "있으면 좋은" 수준은 포함하지 않는다 — 이식 시 과잉 의무가 되기 때문.

---

## Frontmatter 스키마

이 하네스를 도입한 프로젝트의 권위 문서들은 파일 상단에 YAML frontmatter 를 갖는다. frontmatter 는 `/qa` 스킬의 doc-reviewer 검증과 `doc-reviewer` 서브에이전트 직접 호출이 "이 문서에 있어야 할 내용이 맞는가?" 를 기계적으로 검증할 수 있도록 계약을 명시한다. 본 섹션이 그 계약(3 필드 스키마)의 단일 권위(SSOT).

### Schema

```yaml
---
role: "이 문서의 존재 이유 한 문장 — 다루지 않는 것도 명시."
kind: operational          # surface | conceptual | operational | reference (위계 아님, 병렬 카테고리)
non_goals:
  - "다른 권위 문서가 담당하는 내용 (해당 문서명 명시)"
---
```

필드 요약:

| 필드 | 형식 | 설명 |
|------|------|------|
| `role` | 자연어 한 문장 (따옴표 포함) | 이 문서의 존재 이유와 범위 |
| `kind` | 열거형 (위계가 아닌 병렬 카테고리) | 문서 성격 분류 (아래 `### kind` 참고) |
| `non_goals` | 자연어 글머리표 | 이 문서에서 다루면 침범이 되는 항목 |

### role

한 줄 자연어. "이 문서의 존재 이유 + 무엇을 다루지 않는지" 를 함께 담는다.

- 좋은 예: `"API route/service/dto 운영 규약의 단일 권위 — 비즈니스 도메인 로직 자체는 다루지 않음."`
- 안 좋은 예: `"API 관련 내용"` — 범위가 모호하고 금지 항목이 없음

### kind

이건 위계가 아닌 병렬 카테고리다. 순서에 의미 없음.

허용 값: `surface` / `conceptual` / `operational` / `reference`.

#### surface

한 화면에서 즉시 파악되는 현재 상태의 요약.

**허용**
- 메트릭·카운트·버전·상태 한 줄 요약
- 날짜·수치·라벨처럼 자주 갱신되는 값
- 다른 문서로 향하는 짧은 포인터

**금지**
- 의사결정 배경이나 원칙 서술 → `conceptual`
- 절차·규약·파일경로 목록 → `operational`
- 항목별 사양 테이블 → `reference`

**예시** — `docs/architecture.md` 의 외부 의존성 섹션 (장애 영향 범위 현황)

#### conceptual

원칙·의도·왜(why). 구현 디테일 없이 방향을 서술한다.

**허용**
- "왜 이렇게 결정했나" 서술
- 트레이드오프·가치 판단
- 추상적 비유·메타포

**금지**
- 함수명·파일경로·CLI 명령어 → `operational`
- 버전·카운트 등 수치 스냅샷 → `surface`
- 항목별 사양 나열 → `reference`

**예시** — `docs/PHILOSOPHY.md`

#### operational

어떻게 작동하나·규약. 실제로 따라야 할 절차와 경로를 담는다.

**허용**
- 함수 시그니처·파일경로·CLI 명령어
- "X 할 때는 Y 를 한다" 형태의 규칙
- 체크리스트·플로우

**금지**
- 긴 의사결정 배경 서술 → `conceptual`
- 단순 상태 스냅샷 → `surface`
- 모든 속성을 열거하는 카탈로그 → `reference`

**예시** — 영역별 `CLAUDE.md`, `docs/development.md`

#### reference

항목별 사양·카탈로그. 찾아보는(look-up) 용도.

**허용**
- 모든 속성·옵션을 열거하는 테이블
- 환경변수 목록·컴포넌트 카탈로그
- 변경 로그·이력 카탈로그 (시간순 항목 나열 — 예: GitHub Releases)
- 깊은 디테일·예외 케이스

**금지**
- "왜 이걸 선택했나" 서술 → `conceptual`
- 절차 서술 → `operational`
- 요약 스냅샷 → `surface`

**예시** — primitive 카탈로그 README, `.env.example`, 본 문서

### non_goals

이 문서에 들어오면 다른 권위 문서를 침범하는 항목을 자연어 글머리표로 나열한다. 다른 문서를 직접 가리킬 수 있고, 시간 지나도 갱신 부담이 적다.

- 좋은 예: `- "릴리스 이력 (GitHub Releases — \`gh release list\`)"` — 어디서 확인하는지 명시
- 안 좋은 예: `- "관련 없는 내용"` — 어디 권위인지 안 보임

---

## `docs/PHILOSOPHY.md`

- **kind**: `conceptual`
- **role**: 프로덕트 철학·설계 원칙
- **frontmatter**: 필수

### 하네스가 요구하는 본문 구조

- `Core Value Proposition` — 프로덕트 가치 정의의 최상위 단락. 새 기능·도메인 검토 시 정합성 판단의 출발점.
- `In Scope` — 프로젝트 범위 정의. architect 의 정합성 1차 검토 기준.
- `Out of Scope` — 의도적 미구현 명시. 신기능 제안 거절 근거.
- `Design Principles` — 설계 원칙. architect 의 의사결정 원칙 + `docs/design.md` §1 의 derive 출발점.
  - (선택) 그 안의 `SOLID` 항목 — 모듈 경계·결합 원칙(SOLID · 점진 진화 등). architect · developer · code-reviewer 가 이 이름으로 가리키며, 항목이 없는 프로젝트에서는 그 기준만 빠진다.

---

## `docs/code-standards.md`

- **kind**: `operational`
- **role**: 리팩토링/코드 작성 기준 (사람 리뷰 + 에이전트 위임 공용)
- **frontmatter**: 필수

### 하네스가 요구하는 본문 구조

- **기준 항목 목록** — 코드 작성/리팩토링 시 우선할 기준 (정직한 이름 / CQS / 국소성 / 단일 추상화 레벨 / 지표 비목적 / 동작 보존 / 리뷰 가능한 diff). developer 의 구현 기준 + code-reviewer 의 유지보수성 점검 기준.

---

## `docs/development.md`

- **kind**: `operational`
- **role**: 테스트·typecheck·로컬 개발 명령어
- **frontmatter**: 선택 — 없으면 doc-reviewer 는 일반 문서로 처리 (검증 대상 아님).

### 하네스가 요구하는 본문 구조

- **테스트 명령**.
- **typecheck 명령**.
- **lint 명령**.
- **DB 마이그레이션 명령** (architect 가 안전성 검토 시 참조).
- **로컬 실행** (앱 기동 진입점 — /pr 이 로컬 확인 안내 시 참조).
- **테스트 co-located 컨벤션** (`*.ts` 옆 `*.test.ts` 등 — code-reviewer 가 누락 점검).

### 영역별 `CLAUDE.md` 와의 관계

영역별 명령이 다른 경우 영역별 `CLAUDE.md` 가 우선 권위.

---

## `docs/design.md`

- **kind**: `conceptual`
- **role**: UI/UX 의 "왜"
- **frontmatter**: 필수
- **적용 범위**: UI 가 있는 프로젝트만. CLI / 백엔드 전용 프로젝트는 본 문서 자체를 생략해도 무방.

### 하네스가 요구하는 본문 구조

- **사용 맥락 전제** (예: 책상 우선·모바일 보조 등 — UI 결정 시 developer 가 자기 SSOT 로 참조).
- **`새 primitive 추가 신호`** 항목 — UI 결정 시 "기존 primitive 조합 우선" 판정의 권위.
- **`§X` 로 참조 가능한 섹션화** — 부분 참조 / 갱신 추적 용도.

---

## `docs/architecture.md`

- **kind**: `reference`
- **role**: Tech Stack·데이터 흐름·인증·인프라 사양
- **frontmatter**: 필수 (`role` / `kind: reference` / `non_goals`)
- **적용 범위**: 백엔드 또는 풀스택 프로젝트. 정적 사이트만 가진 프로젝트는 본 문서를 단순화해도 무방.

### 하네스가 요구하는 본문 구조

- **Tech Stack** — 프로젝트의 주요 기술 스택 (framework / DB / Queue / Sandbox / Runtime 등).
- **Data Flow** — 요청 흐름. 단순 read/CUD + 비동기 큐·샌드박스 흐름이 있다면 함께 표현.
- **Auth** — 인증 방식 (단일 게이트 / OAuth / 멀티유저 등) + 인증 경계.
- **Infrastructure** — 호스팅·외부 SaaS·DB 연결 사양.

### 변경 권위

- 시스템 사양 변경 시 수동 갱신. `/release` 등 자동 갱신 대상 아님.

---

## `docs/architecture-decisions.md`

frontmatter 없음 — doc-reviewer 일반 문서 skip / `adr-content-mismatch` 대조 read 대상.

결정 기록을 쓰는 방식 — Decision 을 스냅샷으로 쌓는가, 지금 참인 것만 남기고 고쳐 쓰기 전 원문을 archive 로 내리는가 — 의 권위는 **그 프로젝트 결정 문서의 머리말**이다. 하네스는 어느 쪽도 전제하지 않고 아래 구조만 요구한다.

### 하네스가 요구하는 본문 구조

- **`## Decision N: <제목>` 헤더 형식** — 콜론 + 제목 필수 (`${CLAUDE_PLUGIN_ROOT}/scripts/check-decisions-index.mjs` 의 헤더 정규식 `^## Decision (#?\d+(?:-\d+)?):` 이 콜론을 앵커로 요구). `N` 은 레거시 순번(정수, 예: `76`) 또는 신규 이슈 식별자(`#` 접두, 예: `#992`; 한 이슈 다결정 시 `#992-1`) — 식별자 정규식 `#?\d+(-\d+)?`. doc-reviewer / harness-reviewer 의 `adr-content-mismatch` 검증 정규식이 이 식별자 형식을 가정.
- **Decision 헤더 직후 `**도입**: vX.Y.Z (#이슈)` 라인** — 결정의 도입 시점 표기이자 `${CLAUDE_PLUGIN_ROOT}/scripts/check-decision-versions.mjs` 가 버전 판정에 읽는 기계 앵커(`(#이슈)`). GitHub Release 의 별도 인덱스 의존을 만들지 않는다.
  - **버전 값은 손으로 쓰지 않는다 — 생성물이다.** Decision 을 작성하는 시점(기능 PR)엔 도입 버전을 알 수 없으므로 placeholder 로 적고, 릴리스 후 `/qa` 의 write 게이트(`check-decision-versions.mjs --write`)가 `(#이슈)` → first-parent 커밋 → 최초 포함 태그로 파생해 채운다. SSOT 는 여전히 git tag — 문서는 그 파생 표시일 뿐이다.
  - **placeholder 표준 표기 = `미정`** → `- **도입**: 미정 (#992)`. 레거시 표기(`v3.x.x` / `(예정)` / `확정`)도 판정에는 지장이 없고, write 게이트가 값 세그먼트를 통째로 교체할 때 함께 표준형으로 정규화된다. `v3.x.x` 류는 major 를 손으로 추측하는 표기라 새로 쓰지 않는다.
  - `(#이슈)` 는 **반드시** 남긴다 — 없으면 스크립트가 UNRESOLVED 로 표면화하고 자동 확정이 불가능하다.
- 각 Decision 본문에 **결정·이유·결과** 세 요소 (최소 계약) — `adr-content-mismatch` 검증 시 인용 맥락과 이 셋 중 어느 하나의 직접 연결 여부를 대조 확인.
  - 모양은 정하지 않는다 — 서술 단락이든, 도입 줄 다음에 라벨 항목(`결정` · `이유` 등)을 나열하는 모양이든 세 요소가 읽히면 만족한다. 「결과」 는 그 결정으로 지금 무엇이 참인가이고, 따로 라벨이 없어도 결정 조항에서 읽히면 된다.
- **`## 상태 인덱스` 표** — 모든 Decision 헤더와 1:1 대응(각 식별자가 한 행). `${CLAUDE_PLUGIN_ROOT}/scripts/check-decisions-index.mjs` 가 헤더 집합 ↔ 인덱스 집합을 대조해 MISSING(헤더에만)/DANGLING(인덱스에만)/중복을 검출한다 (개수 비교 아님 — `/qa` 가 decisions 파일 변경 시 실행).

---

## 다루지 않는 것

- **영역별 `CLAUDE.md`** — 프로젝트 디렉토리 구조에 따라 가변. 작성 가이드는 [README.md](./README.md) 의 "영역별 `CLAUDE.md` 작성" 섹션.
- **`docs/harness-decisions.md`** — 프로젝트 로컬 결정 기록 (`docs/architecture-decisions.md` 와 동급). 하네스와 함께 배포되지 않는다 — 프로젝트마다 자기 것을 쓰고, 없어도 된다. frontmatter 없으므로 doc-reviewer 는 일반 문서로 skip. `adr-content-mismatch` 대조 참조용으로만 read 된다 — harness-reviewer, 그리고 인용이 이 파일을 이름과 함께 밝힌 경우의 doc-reviewer (둘 다 본문 정합 검증 주체 아님).

---

## `docs/decisions-archive.md`

frontmatter 없음 — doc-reviewer 일반 문서로 skip.

### 하네스가 요구하는 본문 구조

- `architecture-decisions.md` 에서 내린 Decision 원문을 무수정 보존 — 무엇을 내리는지(번복·대체된 Decision 만인가, 고쳐 쓰기 전 본문도인가)는 live 파일 머리말이 권위. `## Decision N: <제목>` 헤더 형식(콜론 + 제목 필수, 레거시 순번 또는 `#이슈` 식별자 — live 파일과 동일 계약) 유지.
- **`## 목차` 표** — 보관된 Decision 의 네비게이션 인덱스(TOC). 상태·supersede 권위가 아니라(그건 live 파일 `상태 인덱스`) 네비게이션용. `${CLAUDE_PLUGIN_ROOT}/scripts/check-decisions-index.mjs` 가 목차 ↔ 헤더 집합 대조로 검증.

### 참조하는 agent/skill

자동 로드 주체 없음 — 어떤 에이전트도 이 파일을 필수 read 하지 않음. `adr-content-mismatch` 검증 시 조건부 대조 참조용으로만 read.

| 위치 | 동작 |
|------|------|
| `harness-reviewer` agent | `adr-content-mismatch` 대조 참조 시 조건부 read |
