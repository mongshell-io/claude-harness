---
name: plan
description: >-
  milestone 단위 multi-issue 사이클의 오케스트레이션 진입점.
  의존성 그래프 + 라운드 계획을 인메모리로 산출하고 계획 confirm 1회 후 developer → 변경 도메인의 reviewer(들) 자동 검토 루프 (P0 == 0 까지, 최대 3회 iteration) 로 진행.
  트리거 — "/plan", "사이클 계획", "next version".
---

# /plan

milestone 단위 multi-issue 사이클의 오케스트레이션 진입점. `gh issue view` 로 대상 이슈를 수집하고 의존성 그래프 + 라운드 계획을 인메모리로 산출한다. 계획 confirm 1회를 거친 뒤 라운드별로 `developer` → 변경 도메인의 reviewer(들) 자동 검토 루프 (`P0 == 0` 도달까지, 최대 3회 iteration) 를 진행하고, 사이클 종료 후 `/qa --branch` 종합 검증을 안내한다.

## 언제 호출하는가

- `/plan v0.8.0` 같은 명시 호출 (milestone 인자 권장)
- "사이클 계획 짜줘", "v0.8.0 계획", "이번 milestone", "next version"
- ⚠️ 자동 호출 X. 사용자가 명시적으로 호출해야 한다. milestone 단위 오케스트레이션은 개발 흐름 전체에 영향을 주므로 우발적 실행을 방지한다 (`/release` 와 동일한 이유).
- ⚠️ "roadmap" 키워드는 트리거 아님 — milestone 단위 오케스트레이션과 backlog 조회는 다른 작업이다.

## 동작

### Step 0: 사전 확인

- `gh auth status` 로 인증 상태 확인. 미인증이면 `gh auth login` 안내 후 stop.
- 인자 파싱:
  - `/plan vX.Y.0` → milestone 직접 지정, Step 1 로 진행
  - `/plan` (인자 없음) → `gh api repos/{owner}/{repo}/milestones --jq '.[] | {number, title}'` 로 open 마일스톤을 직접 조회한다 (이슈 경유 역산은 limit 절단·빈 마일스톤 미검출·closed 혼입이 있어 금지). 가장 낮은 번호(가장 가까운 milestone)를 제안하고 **사용자 confirm** 대기. 확인되면 Step 1 진행.
  - milestone 자체가 없으면 `gh issue list --label next` 결과를 후보로 제시하고 "milestone 부여 여부는 사용자 결정입니다" 안내 후 stop. `/plan` 은 milestone 기반으로만 사이클을 운영한다.
- 마일스톤 브랜치 안내: 사이클 시작 시 `cycle/<slug>` 브랜치를 생성/체크아웃하도록 권고. 이미 다른 브랜치에 있어도 강제 X — "현재 브랜치: `<name>`. 사이클 브랜치 컨벤션 `cycle/<slug>` 권장. 그대로 진행할까요?" 형식으로 안내만.

### Step 1: 대상 이슈 수집

```bash
gh issue list --milestone vX.Y.0 --state open --json number,title,body,labels
```

- 이슈가 0개면 "milestone vX.Y.0 에 open 이슈가 없습니다. milestone 확인 후 재호출해 주세요." 안내 후 stop.
- 각 이슈의 body 를 `gh issue view <N>` 으로 보완 수집한다 (목록 API 는 body 를 truncate 할 수 있음).

### Step 2: 의존성 분석 + 라운드 분할

수집한 이슈 본문(작업 항목 / 관련 파일 / 이슈 간 언급)을 분석해 다음을 산출한다.

**의존성 그래프 (텍스트 표현)**

```
#N (제목) ──→ #M (제목)   # N 완료 후 M 가능
#P (제목)                  # 독립
```

**라운드 분할 원칙**

- 의존성 없는 이슈는 같은 라운드에 묶어 병렬 위임 가능
- 의존 이슈는 선행 라운드 완료 후 다음 라운드로 배치
- 설계 결정이 필요한 이슈는 "Step 0: 설계 자문(architect 에이전트) 권고" 를 해당 이슈 라운드 앞에 명시한다 (자동 호출 X — 사용자 결정)

**검증 방법 컬럼** (빈 칸 금지)

각 이슈마다 검증 방법을 `unit` / `manual` / `E2E` 중 하나로 명시한다.

- `E2E` 는 UI layer 변경 이슈에만 표시
- `E2E` 표시 이슈는 사이클 끝 `/qa --branch` 의 browser 검증(Preview MCP)으로 수행

### Step 3: 계획 미리보기 + 사용자 confirm

다음 형식으로 계획서를 출력하고 **사용자 confirm** 을 대기한다.

```markdown
## vX.Y.0 사이클 계획

**Milestone**: vX.Y.0
**대상 이슈**: #N, #M, #P (총 N개)

### 의존성 그래프

#N (제목) ──→ #M (제목)
#P (제목)

### 라운드 계획

#### Round 1 (병렬 위임 가능)
| Issue | 제목 | 검증 방법 | 비고 |
|-------|------|-----------|------|
| #N    | ... | unit      | |
| #P    | ... | manual    | |

#### Round 2 (Round 1 완료 후)
| Issue | 제목 | 검증 방법 | 선행 |
|-------|------|-----------|------|
| #M    | ... | E2E (`/qa --branch` browser 검증) | #N |

### 검증 계획

- 각 라운드 안: developer + 변경 도메인의 reviewer(들) 자동 루프 (`P0 == 0` 까지, 최대 3회 iteration) — 도메인이 여럿이면 reviewer 들이 같은 응답에서 병렬 호출
- 모든 라운드 완료 → `/qa --branch` 실행 (사이클 종합 검증)
- 라운드 3회 소진 후 P0 잔여 → 묻지 않고 Round N+1 추가 (Round N+1 도 3회 소진하면 그때 stop + 보고)
- P1 → 같은 라운드에서 처리 (P0 와 같은 루프, 3회 상한 공유). P2 → qa 의 "P2 라운드 종결 규칙"(조건부 유예 원칙) 준용.

---

이대로 진행할까요? (수정 사항이 있으면 알려주세요)
```

- "응 / ok / 진행" → Step 4
- 수정 요청 → 반영 후 계획서 재출력 + 재확인
- "아니 / 취소" → 스킬 종료

### Step 4: 라운드 안 자동 검토 루프 (Iteration 1..N, 최대 3회)

**사용자 "진행" 신호(Step 3)를 받은 후에만** 라운드 위임을 시작한다. 그 뒤로는 **라운드 사이에 멈추지 않는다** — 라운드 시작·루프 종료·라운드 종료 보고·다음 라운드 착수까지 추가 confirm 없이 자동 진행한다. 라운드 시작 때는 다음 한 줄만 출력하고 바로 위임한다:

```markdown
## Round N 시작 — 위임 대상: #N (제목), #P (제목)
```

멈추는 것은 사용자만 줄 수 있는 입력(제품 결정·자격증명·운영 DB 쓰기·기존 작업 폐기)이 필요할 때뿐이다.

#### Step 4a: Iteration 1 — 구현

`developer` 서브에이전트를 호출한다. 프롬프트에 다음을 포함한다:

- 대상 이슈 번호와 제목
- `gh issue view <N>` 의 작업 항목 및 관련 파일
- "/plan 스킬 Round N Iteration 1 에서 위임됨" 컨텍스트
- 검증 방법 (unit / manual / E2E)
- 작업 브랜치: Step 0 에서 확정된 브랜치명 (기본 컨벤션 `cycle/<slug>`. 단일 worktree 에서 라운드별 commit 누적)

병렬 위임 가능한 이슈는 하나의 메시지에서 여러 `developer` 호출로 동시에 실행한다. 메인 세션은 iteration 1 시작 시점의 HEAD SHA 를 기록해 둔다 (Step 4b 의 RANGE 산출에 사용).

**병렬 위임 시 commit 직렬화**: 병렬 developer 들은 단일 worktree·단일 브랜치를 공유하므로, 위임 프롬프트에 "commit 하지 말고 **미커밋 상태로 보고**" 를 명시한다 (동시 commit·amend 경합 실사고 방어). 모든 developer 종료 후 메인 세션이 REPORT 의 변경 파일 목록 기준으로 이슈별 commit 을 순차 생성한다. **단일 위임 시에는 developer 가 직접 commit** (현행 유지).

#### Step 4b: Iteration k — 검증 + 자동 리뷰

해당 iteration 의 모든 developer 위임이 종료되면, 메인 세션이 다음 4b-1 → 4b-2 순서로 진행한다.

**4b-1: 검증 명령 실행 (2층 검증 모델 — 조건부 skip 가능)**

> 2층 검증 모델 원칙은 `${CLAUDE_PLUGIN_ROOT}/README.md` "검증 명령 실행 책임" 섹션이 권위. Plan 고유 조건부 skip 규칙은 아래에 유지.

**skip 판정 규칙** (단일 문장): 병렬 위임이거나 공유파일(둘 이상의 도메인 에이전트가 참조하는 공통 모듈 — Entity 권위 모듈 / DB schema / 공통 lib·hooks / 전역 상태·UI 공통 util 등)이 변경됐으면 4b-1 **필수 실행**; 단일 developer + 공유파일 미변경이면 4b-1 **skip 가능** (developer REPORT 의 exit-code 신뢰).

4b-1 **필수 실행** 시: 메인 세션이 bash로 검증 명령을 직접 실행한다(`${CLAUDE_PLUGIN_ROOT}/README.md` "검증 명령 실행 책임" 참조). 구체 명령은 프로젝트의 `docs/development.md` 또는 영역별 CLAUDE.md 가 권위.

```bash
# 구체 명령은 프로젝트의 docs/development.md 또는 영역별 CLAUDE.md 가 권위
# PLAN_TMP: repo 루트명 유도 — 동시 세션·타 repo 충돌 방지 (qa 의 QA_TMP 와 동일 사고 클래스 방어)
PLAN_TMP="/tmp/plan-$(basename "$(git rev-parse --show-toplevel)")"
<typecheck-cmd> > "$PLAN_TMP-round<N>-iter<k>-typecheck.txt" 2>&1 &
<test-cmd>      > "$PLAN_TMP-round<N>-iter<k>-test.txt"      2>&1 &
<lint-cmd>      > "$PLAN_TMP-round<N>-iter<k>-lint.txt"      2>&1 &
wait
```

각 명령 결과(exit code + 실패 시 핵심 에러)를 위 경로의 파일에 저장한다.

4b-1 **skip** 시: developer REPORT 의 exit-code 가 Step 4c 루프 종료 판정의 검증 P0 소스가 된다.

**4b-2: 라우팅 매칭 reviewer 호출**

메인 세션이 변경 파일을 `${CLAUDE_PLUGIN_ROOT}/README.md` Reviewer 라우팅 표로 매칭한 reviewer(들)를 호출한다. 도메인 범위 및 도메인 분기·병렬 호출 방식은 README 라우팅 표가 권위. 단, `/qa` 단독 호출 대상 reviewer 는 본 매칭에서 제외 — 현재 `security-reviewer` (qa 스킬의 "/plan 자동 iteration 과의 책임 경계" 참조).

- **4b-1 실행 시**: bash 와 같은 응답 내 동시 호출(진짜 병렬) — reviewer 는 bash 완료를 기다리지 않고 즉시 실행된다.
- **4b-1 skip 시**: reviewer 단독 호출.

프롬프트에 다음을 포함:

- **RANGE**: "Round N Iteration k 의 developer 가 만든 commit 들의 누적 diff (= 직전 iteration 대비 변경분)" — 좁은 범위로 고정 (브랜치 전체 X). 산출: `git diff <iteration k 시작 SHA>..HEAD`. 프롬프트에 "이전 iteration 대비 변경분" 임을 명시해 병렬 developer 다중 이슈 시 리뷰 노이즈를 줄인다.
- 호출 출처: "/plan 스킬 Round N Iteration k 자동 리뷰"
- reviewer 는 bash 검증 결과와 무관하게 코드 리뷰만 수행한다.
- **출력 강제**:
  - findings 항목마다 **연관 이슈(#N) 명시** — 다음 iteration developer 위임 시 이슈별 매핑에 활용
  - 각 finding 은 `파일:line` + 1문장 설명으로 제한, 전체 50줄 이하
  - 묶음 전체 diff 를 보고 cross-issue 패턴 위반 / 중복 / 결합 직후 문제도 함께 검출

#### Step 4c: 루프 종료 판정

검증 P0 소스 + 4b-2 reviewer P0 를 합산해 판정한다. 검증 P0 소스는 4b-1 실행 여부에 따라 결정된다: 4b-1 실행 시 → 4b-1 결과; 4b-1 skip 시 → developer REPORT 의 exit-code.

- **P0 == 0** → 루프 정상 종료, Step 5 로 이동 (P1 / P2 는 잔여 findings 로 보고만)
- **P0 > 0 AND iteration < 3** → 다음 iteration 진행 (Step 4d)
- **P0 > 0 AND iteration == 3** → 루프 강제 종료, Step 5 로 이동. 잔여 P0 를 라운드 보고에 명시.

#### Step 4d: Iteration k+1 — P0 피드백 반영 재위임

`developer` 서브에이전트를 재호출한다. 프롬프트에 다음을 포함:

- 직전 iteration reviewer findings 중 **P0 항목만**, 이슈별 매핑 그대로 (P1 / P2 는 전달 X — 루프 목표는 P0 해결)
- 이슈별로 매핑된 항목만 해당 이슈 담당 developer 에게 전달 — 무관한 피드백 섞임 방지
- "/plan 스킬 Round N Iteration k+1 (P0 피드백 반영) 위임됨" 컨텍스트

피드백이 여러 이슈에 분산되면 다시 병렬 위임. 메인 세션은 iteration k+1 시작 시점의 HEAD SHA 를 기록하고, **Step 4b 로 복귀**하여 자동 리뷰 → Step 4c 판정 → (필요 시) 다시 Step 4d 의 사이클을 돌린다.

### Step 5: 라운드 종료 보고 + 가변 라운드

라운드 완료 후 다음을 안내한다.

```markdown
## Round N 완료

### Iteration 별 결과
- Iteration 1
  - developer: #N, #P (병렬 위임)
  - 자동 리뷰 reviewer: P0 K개 / P1 L개 / P2 M개 · Pre-existing J개
- Iteration 2 (있으면)
  - developer: <P0 피드백 대상 이슈>
  - 자동 리뷰 reviewer: P0 K'개 / P1 L'개 / P2 M'개 · Pre-existing J'개
- Iteration 3 (있으면)
  - ...

### 루프 종료 사유
- ✅ `P0 == 0` 도달 (정상 종료) / ⚠️ 3회 소진 후 P0 잔여 (강제 종료)

### 잔여 findings
- [ ] [이슈 #N] [P0/P1 항목] (`file:line`)

다음 단계:
1. 잔여 P0 가 있으면 (루프 3회 소진 시) 자동으로 Round N+1 을 추가했습니다.
2. Pre-existing(이 라운드가 만들지 않은 결함) 은 `/create-issue` 를 묻지 않고 호출해 등록했습니다. P2 는 qa 의 "P2 라운드 종결 규칙"(조건부 유예)을 따릅니다.
3. 모든 라운드 완료 후 `/qa --branch` 로 사이클 종합 검증(build 포함)을 진행합니다 — `/qa` 의 책임 경계는 [qa/SKILL.md](../qa/SKILL.md) 의 "/plan 자동 iteration 과의 책임 경계" 섹션 참조.
```

**가변 라운드 처리**:

- 잔여 P0·P1 (3회 소진 후) → 묻지 않고 Round N+1 추가. 동일한 자동 검토 루프 반복. Round N+1 도 3회 소진하면 stop + 보고(아키텍처 의심 신호).
- P1 → 같은 루프에서 P0 와 함께 처리 (3회 상한 공유). P2 → qa "P2 라운드 종결 규칙" 준용.
- 남은 라운드가 있으면 Step 4 로 복귀.

### Step N: 최종 리포트 (사이클 완료 → /release 안내)

모든 라운드와 `/qa` 게이트를 통과하면 다음을 출력한다.

```markdown
## 사이클 완료: vX.Y.0

완료 이슈: #N, #M, #P
라운드 수: N 라운드

다음 단계:
1. PR 생성: `/pr` 호출
2. 코드 리뷰 코멘트 처리: `/review-comments`
3. 릴리스: `/release vX.Y.Z`
```

---

## 기존 스킬과의 경계

스킬 경계·라우팅의 권위는 하네스 README 의 Skill Pipeline 흐름도 + 각 SKILL.md frontmatter — 여기에 표를 복제하지 않는다.

---

## 제약 / non_goals

- **confirm 은 계획(Step 3) 1회뿐** — 그 뒤 라운드 시작·종료·다음 라운드 착수는 자동 진행한다. 멈추는 건 사용자만 줄 수 있는 입력이 필요할 때뿐.
- **라운드당 최대 3회 iteration** — developer + 자동 리뷰가 한 iteration. 종료 조건은 `P0 == 0` (정상) 또는 3회 소진 (강제). 자동 루프는 **P0·P1 해결을 시도**하고, P2 는 qa 규칙대로 처리한다. 3회 후에도 남으면 자동으로 Round N+1 을 추가한다.
- **`docs/` 파일 편집 X** — `/plan` 범위 외.
- **새 GitHub Issue 생성 X** — `/create-issue` 권위. Pre-existing 은 `/create-issue` 를 묻지 않고 호출해 등록한다 (P2 처리는 qa "P2 라운드 종결 규칙" 준용).
- **설계 결정 X** — architect 에이전트에 위임. `/plan` 은 architect 호출을 "권고"만 한다.
- **코드 직접 편집 X** — `developer` 서브에이전트 위임만. 메인 세션 = 오케스트레이터 원칙 (CLAUDE.md).
- **PR 생성 / 코멘트 처리 X** — `/pr` / `/review-comments` 권위.
- **릴리스 X** — `/release` 권위.
- **출력물 파일 저장 X** — 계획서는 세션 인메모리 only. 임시 파일 / `docs/` 편집 / GitHub Issue 코멘트 게시 모두 기본 X. 컨텍스트 압축 위험 시 사용자가 명시 요청하면 GitHub Issue 코멘트 게시 예외 허용.

---

## 참조

- 메인 세션 = 오케스트레이터 원칙: [CLAUDE.md](../../../CLAUDE.md)
- 스킬 경계 전체: 위 표 + 각 SKILL.md
- 이슈 조회: `gh issue list --milestone vX.Y.0 --state open`
- 라벨 정책: create-issue 스킬 (라벨 3축 단일 권위)
- 검증 분류 기준: [qa/SKILL.md](../qa/SKILL.md)
- 릴리스 흐름: [release/SKILL.md](../release/SKILL.md)
