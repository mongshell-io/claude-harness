---
name: review-comments
description: >-
  PR 리뷰 코멘트 처리의 단일 진입점.
  코멘트 fetch → 통일 분류 (공통 분류 등급) → developer 위임 → commit + push.
  트리거 — "/review-comments", "리뷰 코멘트 처리".
---

# /review-comments

PR 리뷰 코멘트 처리의 단일 진입점. 코멘트 fetch → 분류 → 수정 위임 → commit + push. 1인 self-review 컨텍스트라 외부 리뷰어 전제하지 않는다.

> 빌트인 `/review` (PR 리뷰 작성) 와 구별 — 이 스킬은 **기존 리뷰 코멘트를 처리(수정 반영)** 하는 용도.

## 언제 호출하는가

- 명시 호출: "/review-comments", "/review-comments `<PR-N>`"
- 트리거 키워드: "/review-comments", "리뷰 코멘트 처리"
- ⚠️ 자동 호출 X. /pr / /qa 와 동일 정책.

## 동작

### Step 0: 사전 확인

- `gh auth status` 검증. 미인증 → stop + `gh auth login` 안내.
- `git status` 로 working tree dirty 여부 확인. dirty 면 `git status` 출력 + stop ("commit 먼저" 안내).
- `B=$(git branch --show-current)` 기준으로 unpushed 를 확인한다 — upstream(`@{u}`)이 `origin/$B` 가 아닐 수 있으므로 `@{u}` 를 쓰지 않는다(upstream 불신 원칙은 `/pr` Step 0 과 동일하되, 이 스킬은 PR 존재가 전제라 `origin/$B` 부재를 첫 push 유도가 아닌 stop 으로 처리).
  - `git rev-parse --verify -q origin/"$B"` 실패 → PR 브랜치 전제 깨짐 → stop + 안내.
  - 성공 → `git log origin/"$B".. --oneline` 으로 unpushed commits 확인. 있으면 묻지 않고 그 커밋까지 같이 push 하고 리포트에 적는다.

### Step 1: PR 식별

- 인자 `<PR-N>` 있으면 그대로 사용.
- 없으면 자동 감지:

```bash
gh pr list --head $(git branch --show-current) --json number,url --jq '.[0]'
```

- 둘 다 실패하면 `gh pr list --state open` 결과를 보여주고 사용자에게 번호를 묻는다.

### Step 2: 코멘트 fetch

세 표면을 모두 수집한다 (이슈 코멘트 / 인라인 코멘트 / 리뷰 제출 총평):

```bash
gh pr view <N> --json comments --jq '.comments'
gh api repos/{owner}/{repo}/pulls/<N>/comments
gh api repos/{owner}/{repo}/pulls/<N>/reviews --jq '[.[] | select(.body != null and .body != "")]'
```

- 본인 작성 코멘트도 포함한다 — self-review history 기록용. 분류 대상에 포함. 본인 코멘트도 0개면 "처리할 코멘트가 없습니다" 한 줄 알리고 종료.
- 외부 리뷰어 코멘트 없이 본인 코멘트만 있는 경우도 동일하게 처리한다.

### Step 3: 분류 (확인 없이 진행)

코멘트 본문을 공통 분류 등급(하네스 README — P0/P1/P2 의미 정의) 기준으로 분류한다. 판단이 모호하면 높은 쪽 등급으로 둔다(사용자에게 묻지 않는다).

분류를 P0 / P1 / P2 섹션별로 한 번 출력하고 **기다리지 않고** Step 4 로 간다.

### Step 4: developer 위임 (P0·P1 일괄)

- P0·P1 전체를 한 번에 `developer` 서브에이전트에 위임한다 (PR 당 평균 1~2건이라 건별 분리 무의미).
- 프롬프트에 포함: PR 번호 / 코멘트 본문 / "/review-comments 스킬에서 호출됨".
- P2 는 처리하지 않는다 (리포트에만 기재).
- developer 가 변경 범위에 대한 기본 검증을 수행한다 (typecheck / 테스트 — 구체 명령은 `docs/development.md` 참조). 전체 QA 검증이 필요하면 Step 6 이후 사용자가 `/qa` 를 별도 호출한다.

### Step 5: commit + push

메인 세션이 직접 수행한다 (CLAUDE.md 오케스트레이터 규칙):

```bash
BODY=$(cat <<'EOF'
fix: PR #<N> 리뷰 코멘트 반영
EOF
) && git add <변경 파일> && git commit -m "$BODY"
git push origin HEAD
```

- type prefix 는 변경 성격에 따라 `fix` / `chore` / `feat` 로 결정한다.
- push 는 `origin HEAD` — 현재 브랜치를 동명 remote 브랜치로 push (upstream(`@{u}`) 가정 금지, 변수 캡처 불필요).
- trailer(`Co-Authored-By` / "🤖 Generated with Claude Code") 포함 여부의 권위 = 루트 `CLAUDE.md` (/pr 동일). 명시가 없으면 미포함.

### Step 6: 최종 리포트 (해당 없는 섹션은 생략)

```markdown
## PR <N> 리뷰 코멘트 처리 완료

- PR: <URL>
- 처리 결과:
  - P0: N건 처리
  - P1: M건 처리
  - P2: K건 (리포트 only)
- commit: <SHA> "<message>"
- 검증 (developer 결과):
  - 타입 체크: ✅/❌
  - 테스트: ✅/❌

다음 단계:
- 추가 검증 필요 시 /qa 호출
- 머지 준비되면 사용자가 수동 머지
```

## 예외 처리

| 상황 | 동작 |
|------|------|
| gh auth 미인증 | stop + `gh auth login` 안내 |
| working tree dirty | stop + `git status` 출력 |
| unpushed commits | 묻지 않고 그 커밋까지 같이 push (리포트에 명시) |
| `origin/$B` 부재 | stop + 안내 (PR 브랜치 전제 깨짐) |
| PR 자동 감지 실패 + 인자 없음 | `gh pr list --state open` 결과 + 사용자에게 번호 묻기 |
| PR 코멘트 0개 | "처리할 코멘트 없음" 알리고 종료 |
| 분류 판단 모호 | 높은 쪽 등급으로 분류하고 진행 |
| developer P0 처리 실패 | stop + 출력 전달 |

## 컨벤션

- 본문에 인라인 백틱(`)이 있으면 BODY 변수 경유 필수. /pr / /create-issue 와 동일 패턴으로 명령 치환 재해석을 회피한다.
- 분류 어휘는 하네스 README 의 "공통 분류 등급" 단일 권위 참조.
- 커밋 메시지 톤은 한국어 conventional commits — CLAUDE.md 컨벤션 참조.
- trailer 정책 권위 = 루트 `CLAUDE.md` (명시 없으면 미포함).

## 제약

- 메인 세션이 절차를 오케스트레이션한다. 리뷰 코멘트 처리 효과:
  - 코드 (.ts/.tsx 등) 변경은 `developer` 서브에이전트에 위임
  - 문서/설정 (.md/.json) 편집은 직접 수행 — gh api / 분류 / git commit / push — 코드 수정은 developer 위임
- /qa 와 독립. /review-comments 완료 후 /qa 자동 호출 X. 필요 시 사용자가 별도 호출한다.
- PR 머지는 포함하지 않는다. 사용자 영역.
