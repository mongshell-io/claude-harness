---
name: pr
description: >-
  GitHub PR 생성의 단일 진입점 + 브랜치 규약(네이밍·리네임 불변식)의 단일 권위.
  브랜치명(1순위) 또는 커밋 메시지(보조)에서 Closes 이슈 번호 검출, gh pr create 실행, gh pr view 검증.
  트리거 — "pr", "pull request", "PR 만들자".
---

# /pr

GitHub PR 생성의 단일 진입점. 브랜치명(1순위) 또는 커밋 메시지(보조)에서 `Closes #N` 을 자동 검출하고 PR 을 만든다. Summary / Test plan / Risk / How to revert 는 사용자가 자유 작성하고, QA 발견 요약은 `/qa --branch` marker 내용을 그대로 싣는다.

## 언제 호출하는가

- 명시 호출: "/pr", "PR 만들자", "pull request"
- ⚠️ 자동 호출 X — 사용자가 작업 완료 시점에 명시 호출.
- `/qa --branch` 통과 marker 게이트를 Step 0 에서 기계 확인한다. 명시 skip 응답으로 우회 가능 (soft gate).

## 브랜치 규약 (본 스킬이 단일 권위)

- **git 브랜치명 = worktree 통일 키**. 키는 **첫 push 전에** 최종 이름으로 확정하고, **push 후 리네임 금지** (preview 인프라 리소스 고아화 — 스택별 상세: `${CLAUDE_PLUGIN_ROOT}/references/infra-gotchas.md`). 한 worktree = 한 브랜치.
- 단발 이슈: `(feat|fix|chore|refactor)/issue-N-<slug>`. 연관 이슈 동시 처리 시 `-N-M-` 형태 허용.
- 마일스톤 사이클 (`/plan` 단위): `cycle/<slug>` — 버전 숫자를 브랜치명에 박지 않는다 (버전 SSOT = git tag max, `/release` 시점 계산). type-free prefix.
- `<slug>` 는 kebab-case (소문자 + 하이픈).

> 머지 규약(`--squash` 만, `--delete-branch` 금지)은 /pr 미호출 세션의 머지 시점에도 필요해 **루트 CLAUDE.md 상시 코어**가 권위다.

## 동작

### Step 0: 사전 확인

각 조건 실패 시 stop (또는 soft gate) + 안내:

- **QA marker 게이트 (soft gate)**: `test -f "/tmp/qa-pass-$(basename -s .git "$(git remote get-url origin)")-$(git rev-parse HEAD)"` —
  - 파일 존재 → 조용히 통과.
  - 파일 부재 → 다음 안내와 함께 응답 대기:
    ```
    현재 HEAD 에서 `/qa --branch` 통과 기록이 없습니다.
    (qa 통과 후 추가 커밋이 있어도 무효화됩니다.)
    `/qa --branch` 실행을 권장합니다. 그래도 진행하려면 'skip' 으로 답해 주세요.
    ```
    명시 'skip' 응답 시에만 계속 진행. 그 외 응답은 stop.
  - 비고: `/tmp` 는 재부팅 시 휘발되어 파일이 사라진다. 이때 안전한 방향(재검증 권고)으로 폴백된다.
- 현재 브랜치 = `main` → "feature 브랜치에서 호출해 주세요"
- 브랜치명이 `^claude/` (auto-worktree 패턴) → "feature 브랜치명으로 rename 후 재호출 (예: `git branch -m chore/issue-N-<slug>`, 사이클이면 `cycle/<slug>`)". 리네임 → push 순서 강제 = 통일 키(git 브랜치명)를 push 전 확정해 preview 인프라 리소스 고아화 방지 (아래 "브랜치 규약" — 리네임 불변식).
- `git status` 결과 dirty → status 출력 + "commit 먼저"
- `gh auth status` 미인증 → "`gh auth login` 후 재호출"
- `gh pr list --head <branch>` 결과 있음 → 기존 PR URL 안내

push 처리 로직:

```
B=$(git branch --show-current)
U=$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null)
```

- `U` 가 비어있음 **또는** `${U#origin/}` != `B` (upstream 이 현재 브랜치 자신의 remote ref 가 아님 — 대표적으로 auto-worktree 가 `origin/main` 을 추적하는 경우) → **`git push -u origin "$B"`** (명시 refspec + upstream 재설정). 이 분기에서 plain `git push` 는 절대 쓰지 않는다.
  - auto-worktree 만의 문제가 아니다 — `git checkout -b <branch> origin/main` 처럼 원격 ref 에서 분기해 만든 브랜치도 upstream 이 그 ref(`origin/main`)로 잡힌다.
- `${U#origin/}` == `B` (upstream 이 현재 브랜치 자신) → `git log @{u}.. --oneline` 으로 unpushed commits 출력 + "push 하고 진행할까요?" — y: `git push` / n: stop.

> **왜**: auto-worktree 브랜치(`claude/*` 등)는 생성 시 upstream 이 `origin/main` 으로 잡히는 경우가 있어, plain `git push` 가 main 에 직접 push 되는 위험이 있다. upstream 의 remote-basename 이 현재 브랜치명과 일치할 때만 plain push 가 안전하고, 그 외에는 항상 feature 브랜치 ref 로 명시 push 한다.

### Step 1: Closes 자동 검출

```bash
# 1순위: 브랜치명에서 issue-N 패턴 추출 (base 무관, 워크트리 내부 정보)
git branch --show-current | grep -oE 'issue-[0-9]+' | grep -oE '[0-9]+' | head -1

# 2순위(1순위 비면): @{u}..HEAD — push 후 빈 출력(exit 0) 가능 → 빈지 검사 후 fallback
CLOSES_LOG=$(git log @{u}..HEAD --pretty=format:%B 2>/dev/null)
[ -z "$CLOSES_LOG" ] && CLOSES_LOG=$(git log -5 --pretty=format:%B)
# fallback: 최근 5개 (다른 브랜치 커밋 포함 가능)
printf '%s\n' "$CLOSES_LOG" | grep -iE '^closes' | grep -oE '#[0-9]+' | head -1
```

미발견 시 조용히 `Closes` 라인 없이 진행. 사용자 prompt X.

### Step 1.5: 로컬 실행 안내

PR 생성 전, 사용자가 로컬에서 브랜치를 띄워 변경을 눈으로 확인하도록 **로컬 실행 진입점을 안내**한다. 명령어·포트·환경 셋업은 `docs/development.md` "로컬 실행" 섹션이 권위 — 스킬 본문에 명령어를 복제하지 않고(툴 중립 유지), 해당 섹션 경로를 사용자에게 안내한다. 로컬 검증은 사용자 책임이며 PR 진행을 막는 게이트가 아니다.

### Step 2: title + body 초안 + 사용자 confirm

- **title**: `git log -1 --pretty=%s` 그대로. (multi-commit 도 동일 — 사용자가 confirm 단계에서 수정 가능.)
- **body 초안**:

```bash
# sketch: @{u}..HEAD — push 후 빈 출력(exit 0) 가능 → 빈지 검사 후 fallback
SKETCH=$(git log @{u}..HEAD --pretty=format:"%s%n%b" 2>/dev/null)
[ -z "$SKETCH" ] && SKETCH=$(git log -5 --pretty=format:"%s%n%b")
# fallback: 최근 5개 (다른 브랜치 커밋 포함 가능)
# QA 발견 요약 + 위험 경로: /qa --branch 가 marker 에 남긴 내용 (Step 0 게이트와 같은 경로). 부재 시 빈 문자열.
QA_SUMMARY=$(cat "/tmp/qa-pass-$(basename -s .git "$(git remote get-url origin)")-$(git rev-parse HEAD)" 2>/dev/null)
```

```markdown
## Summary
<위 커밋 메시지들의 제목·본문에서 "무엇을/왜" sketch — 사용자 자유 편집>
(정확한 변경 내역은 생성된 PR 페이지 Files changed 탭에서 확인)

## Test plan
- [ ] <변경 영역 기반 빈 체크리스트>

## Risk
<Low / Medium / High> — <한 줄 이유. $QA_SUMMARY 의 "위험 경로" 가 "없음" 이 아니면 High 로 제안하고 그 경로를 적는다.
High 면 적용 순서까지 (예: 머지 → prod 마이그레이션 → 화면 확인). High 조건만 루트 CLAUDE.md 작업 규약 코어 "위험 등급" 이 정의한다 —
Low/Medium 은 사용자 판단(기본 제안 Low)>

## How to revert
<squash 커밋 revert 로 끝나는가, 아니면 마이그레이션·데이터 되돌림이 따로 필요한가 — 한두 줄>

## QA 발견 요약
<$QA_SUMMARY 그대로 — 발견 N건 (P0 0 · P1 b · P2 c) · Pre-existing d + 미해결 P1 사유 + Pre-existing>

Closes #N
```

Risk / How to revert 는 PR 템플릿(`.github/pull_request_template.md`)이 있으면 그 제목을 그대로 쓴다. 자동 리뷰어는 PR 생성 후에는 돌지 않으므로, 이 두 절과 QA 발견 요약이 "어느 층이 무엇을 봤고 무엇을 남겼는가" 를 PR 에 남기는 유일한 기록이다.

QA marker 부재 상태에서 사용자가 'skip' 으로 진행한 경우, "QA 발견 요약" 절 본문 대신 다음 라인을 자동 포함한다:

```
> ⚠️ QA marker 없음 — 사용자 skip 으로 진행 (qa 미통과 상태에서 PR 생성)
```

같은 경우 "Risk" 절의 등급 자리에는 다음 라인을 넣는다 — `/pr` 은 변경 파일을 계산하지 않으므로(아래 로컬 base 비교 금지) 위험 경로를 산출할 주체가 없고, 판정은 사용자 몫이다:

```
> ⚠️ QA marker 없음 — 위험 경로 미산출. 변경 파일(마이그레이션·요청 경로·CI 워크플로) 기준으로 직접 판정
```

미리보기 출력 후 사용자가 자유 편집한 최종 본문을 받아 다음 단계로 진행한다.

### Step 3: gh pr create

본문에 인라인 백틱이 있을 때 명령 치환 재해석 회피 위해 BODY 변수 경유:

```bash
BODY=$(cat <<'EOF'
<사용자 최종 본문>
EOF
) && gh pr create \
  --base main \
  --title "<title>" \
  --body "$BODY"
```

생성 실패 시 stderr 사용자 전달 + stop.

### Step 4: 검증 + 리포트

```bash
gh pr view --json url,number,title,state --jq '{url, number, title, state}'
```

```markdown
## PR 생성 완료

- **URL**: <PR URL>
- **번호**: #N
- **제목**: <title>
- **Closes**: #M (검출 시) / 없음
```

## 컨벤션

- 본문에 인라인 백틱이 있으면 BODY 변수 경유 필수 (외부 double-quote 의 명령 치환 재해석 회피).
- title 은 last commit (`git log -1 --pretty=%s`) 을 따른다. 한국어 conventional commits 톤은 CLAUDE.md 컨벤션 참조.
- Closes 검출은 브랜치명 `issue-N` 패턴이 1순위(워크트리 내부 정보, base 무관), 커밋 메시지 `Closes #N` grep 은 보조. 단일 이슈 가정.
- trailer(`Co-Authored-By` / "🤖 Generated with Claude Code") 포함 여부의 권위 = 루트 `CLAUDE.md`. 명시가 없으면 미포함.

## 제약

- 메인 세션이 절차를 오케스트레이션한다. 코드 / 문서 편집 X — git/gh 명령만 (브랜치 push / PR 생성 / view).
- PR body 의 Summary / Test plan / Risk / How to revert 본문은 사용자가 자유 작성. 자동 생성은 sketch 제안만 — Risk 등급 제안과 QA 발견 요약은 `/qa --branch` 가 남긴 marker 내용에서만 가져오고, `/pr` 이 diff 를 따로 계산하지 않는다 (아래 로컬 base 비교 금지).
- **로컬 base 비교 금지**: PR 의 변경분 계산·충돌 표시는 GitHub(origin/main merge-base 기준) 책임. `/pr` 은 로컬 base diff(`main..HEAD` 등)를 계산하지 않는다 — 로컬 main ref 는 워크트리와 독립적으로 움직여 신뢰 불가하며, 로컬 비교는 격리를 침범한다.
