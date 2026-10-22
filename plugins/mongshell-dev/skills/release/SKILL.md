---
name: release
description: >-
  origin/main 스냅샷에 tag + GitHub Release + milestone close 를 일괄 실행.
  main 에 코드를 push 하지 않는다. PR squash merge 가 origin/main 을 갱신하는 유일한 경로.
  트리거 — "릴리스", "release", "vX.Y.Z 릴리스".
---

# /release

origin/main 읽기 전용 태깅의 단일 진입점. git tag + GitHub Release + milestone close 를 한 번의 호출로 일괄 실행한다. 이 스킬 밖에서 `git tag` · `gh release create` · milestone close 를 직접 실행하지 않는다.

## 언제 호출하는가

- `/release vX.Y.Z` 같은 명시 호출
- "이번 사이클 마무리하자", "milestone v0.2.0 닫자"
- ⚠️ 자동 호출 X. 우발적 릴리스 방지를 위해 반드시 명시적으로 호출한다.
- ⚠️ PR 머지 후에 호출하는 것이 정상 순서. release 는 origin/main 스냅샷을 태깅하므로, 미머지 변경은 이번 릴리스에 포함되지 않는다.

## 동작

### Step 0: 사전 확인

- **remote 동기화 가드**: `git fetch origin main --tags` 를 실행해 최신 origin/main 과 tag 를 가져온다.
- **working tree dirty 확인 (warn + confirm)**: `git status` 로 미커밋 변경 여부를 확인한다. dirty 이면 `git status` 를 출력하고 다음 안내와 함께 confirm 을 대기한다:

  ```
  working tree 에 미커밋 변경이 있습니다.
  release 는 origin/main 스냅샷을 태깅하므로, 이 워크트리의 미커밋 변경은 릴리스에 포함되지 않습니다.
  그래도 origin/main 시점을 릴리스할까요?
  ```

  사용자가 취소하면 stop. 확인하면 계속 진행한다.

- **미머지 커밋 경고 (warn + confirm)**: `git rev-list --count origin/main..HEAD` 를 실행해 현재 브랜치에 origin/main 에 없는 커밋 수를 확인한다. 1 이상이면 먼저 `git diff origin/main..HEAD --stat` 로 내용 차이를 확인한다 — diff 가 비어 있으면 squash 머지 잔상(내용은 이미 main 에 있고 커밋 SHA 만 다름)이므로 경고 없이 통과한다(false positive 방지). diff 가 있으면 다음 안내와 함께 confirm 을 대기한다:

  ```
  현재 브랜치에 origin/main 에 없는 커밋 N개가 있습니다.
  이 커밋들은 이번 릴리스에 포함되지 않습니다 (PR 머지 후 릴리스하세요).
  그래도 origin/main 시점을 릴리스할까요?
  ```

  사용자가 취소하면 stop. 확인하면 계속 진행한다.

- **버전 결정**:
  - 인자 `vX.Y.Z` 가 있으면 그 버전을 그대로 쓴다 (항상 최우선).
  - 인자가 없으면(기본 경로) tag max + 머지된 PR head 브랜치명 기반 bump 추론으로 다음 버전을 제안하고 confirm 대기:
    - tag max 산출: `git tag --list 'v*' | sort -V | tail -1` → 이 값이 **버전 SSOT**.
    - **tag max 공집합(첫 릴리스)**: bump 추론을 건너뛰고 초기 버전을 사용자에게 질문한다 — 기본 제안 `v0.1.0` (X=0 은 "production-ready 전").
    - 직전 tag 이후 origin/main 에 머지된 PR head 브랜치명으로 bump 추론 (커밋 그래프 기반 — 시각 필터 없음):
      ```bash
      # 직전 tag 이후 first-parent 커밋 제목 수집 (squash merge 컨벤션의 (#N) suffix 또는 merge commit 의 "Merge pull request #N" 형태)
      git log v<prev>..origin/main --first-parent --pretty=%s
      # 위 출력에서 PR 번호 추출 — 패턴 우선순위:
      #   1순위: 제목 끝 squash 컨벤션  \(#[0-9]+\)$  예) "feat: 주문 패널 추가 (#42)"
      #   2순위: merge commit 형태       ^Merge pull request #[0-9]+
      # PR 번호마다 head 브랜치명 확보
      gh pr view <N> --json headRefName --jq '.headRefName'
      ```
    - `^cycle/` 브랜치가 하나라도 있으면 → **MAJOR (Y) bump** 제안. 예: 2.4.0 → 2.5.0
    - 전부 `^(feat|fix|chore|refactor|docs|ci)/issue-` 이면 → **MINOR (Z) bump** 제안. 예: 2.4.0 → 2.4.1
    - PR 번호가 하나도 추출되지 않거나 `gh pr view` 조회 실패 → 추론하지 않고 사용자에게 버전을 질문 (폴백).
    - **PROJECT (X) bump 은 자동 제안하지 않는다** (사용자가 명시할 때만).
  - 제안 형식: `vX.Y.Z 제안 — <이유>. 다른 버전이면 알려주세요.` 사용자가 응답한 버전이 추론보다 우선한다.
- `git tag --list vX.Y.Z` 로 tag 존재 여부 확인. 이미 있으면 즉시 stop.

### Step 1: 마일스톤 식별 + 이슈 게이트

**마일스톤 식별자 확정 (버전과 별개)**:

마일스톤 제목은 버전 문자열과 다를 수 있다(테마형 제목 등 — 프로젝트 컨벤션에 따름). 릴리스 시작 시 마일스톤 식별자를 확정한다.

- **호출 시 마일스톤 식별자가 전달된 경우** (오케스트레이터가 `/release vX.Y.Z --milestone <번호 또는 제목>` 형태 또는 동등한 방식으로 전달): 그 값을 사용한다.
- **식별자가 없을 때 폴백**: `gh api repos/{owner}/{repo}/milestones --jq '.[] | {number, title}'` 로 open 마일스톤을 직접 조회한다 (이슈 경유 역산은 limit 절단·빈 마일스톤 미검출·closed 혼입이 있어 금지).
  - 1개이면 자동 선택.
  - 복수이면 목록을 출력하고 사용자 confirm 대기.
  - 없으면 "마일스톤 없음 — milestone close 와 이슈 수집을 건너뜁니다." 안내 후 진행.

이 식별자를 이후 모든 마일스톤 관련 명령(Step 1 이슈 목록 조회, Step 2 Changes 수집, Step 4 milestone close)에서 공통으로 사용한다.

```bash
gh issue list --milestone <식별자> --state open --json number,title
```

판정 기준:

- milestone open issue 존재 → 사용자에게 confirm 게이트 + 액션 옵션 (아래 참조)

milestone open issue 가 존재할 때 다음 미리보기를 출력하고 응답을 대기한다:

```
마일스톤 "<식별자>" 에 open 이슈 N건 남아 있습니다:
  - #A "..."
  - #B "..."

진행 방식을 선택하세요:
  1) 마일스톤에서 제거 후 release 진행 — 각 이슈에 `gh issue edit <N> --remove-milestone` 일괄 실행
  2) release 중단 — 이슈 처리(close 또는 마일스톤 변경) 후 /release 재호출
  3) 그대로 진행 — open 이슈가 마일스톤에 남은 채로 release. milestone close 후에도 이슈는 open 상태 유지됨 (carry-over 책임은 사용자)
```

선택 1 → 각 이슈에 `gh issue edit <N> --remove-milestone` 실행 후 다음 단계 계속.
선택 2 → stop.
선택 3 → 경고만 출력하고 다음 단계 계속.

게이트를 통과하면 다음 Step 1b 로 진행한다.

### Step 1b: 마이그레이션 게이트

> 게이트 A (db:generate dirty 검사) 는 /qa schema 정합성 검사로 이관됐다 — 검증은 /qa 단일 권위.

#### 게이트 B — destructive 변경 경고 (warn + confirm)

이번 릴리스에 새로 추가된 마이그레이션 파일에 대해 실행한다.

```bash
# 직전 릴리스 태그 이후 origin/main 에 추가된 <migration-dir>/*.sql 파일 목록 확인
# 직전 태그 산출: git tag --list 'v*' | sort -V | tail -1
# (이번 태그는 아직 미생성이므로 tail -1 = 직전 릴리스 태그 = Step 0 tag max 와 동일)
# 첫 릴리스(직전 태그 부재) 시: 대상 = origin/main 전체의 마이그레이션 파일 (전부 신규) — destructive grep 만 수행하고 "첫 릴리스" 임을 안내
git diff --name-only --diff-filter=A v<prev>..origin/main -- '<migration-dir>/*.sql'
# 매치된 파일에서 destructive 구문 탐색
grep -iE 'DROP COLUMN|RENAME COLUMN|DROP TABLE|RENAME TO' <위 파일들>
```

매치 결과가 있으면 해당 라인을 발췌 출력하고 confirm 을 대기한다:

```
[경고] destructive 마이그레이션 구문 발견:
  <파일명>: <매치 라인>
  ...

expand/contract 규율 — 이 변경이 contract 단계가 맞습니까?
구버전 코드 reader 가 더 이상 없습니까?
(배포 모델이 forward-only + build-time migrate 라면 컬럼 drop/rename 은 2배포 분리가 필요하다 — 배포 모델 권위: `docs/architecture.md`)

정당한 contract 배포이면 "예" 로 계속할 수 있습니다.
```

해당 .sql 파일이 어느 PR 에서 머지됐는지 `git log --follow` 등으로 확인이 어렵거나(직접 커밋 등 squash PR 외 경로) 출처 PR 을 특정할 수 없는 경우, 그 사실을 함께 안내한다.

사용자가 확인하면 진행. 매치 결과가 없으면 통과.

게이트 B 를 통과하면 Step 2 로 진행한다.

### Step 2: Release notes 조립

GitHub Release 에 사용할 notes 문자열을 메모리상에서 조립한다.

- Changes 는 `gh issue list --milestone <식별자> --state closed --json title,labels` 로 자동 수집하고 `type` 라벨(`type:feat` / `type:fix` / `type:chore` / `type:refactor`)로 그룹핑한다 (라벨 3축 정의 권위: create-issue 스킬).
- 마일스톤이 없으면 Changes 절을 생략하고 요약 줄만 포함한다.
- **도입 버전 드리프트 검사 (read-only — 스크립트)**: Decision 의 `**도입**` 라인은 **생성물**이고, 채우는 주체는 `/qa` 의 write 게이트다 (`--write` — 릴리스 다음에 오는 아무 PR 이 실어 나른다). `/release` 는 그 게이트가 돌았는지만 읽기 전용으로 확인한다.
  ```bash
  node "${CLAUDE_PLUGIN_ROOT}/scripts/check-decision-versions.mjs"
  ```
  - **STALE** (릴리스로 값이 확정됐는데 문서 미반영) 이 있으면 exit 1 + `파일:line → 버전` 목록. 정상 흐름이면 나오지 않는다 — 나왔다면 **직전 릴리스 이후 `/qa` 를 한 번도 안 거친 PR 만 머지됐다**는 신호다. warn 후 목록을 제시하고, 다음 `/qa` 가 자동 확정한다고 안내한다.
  - **PENDING** (이번 릴리스에 나가는 Decision — 값이 아직 존재하지 않음) 은 정상 상태다. 정보성 출력만 하고 exit 에 영향을 주지 않는다. 이번 태깅 후 다음 PR 의 `/qa` 가 확정한다.
  - 이 검사는 **게이트락이 아니다** (경고만 — 목록 제시 후 confirm 없이 진행 가능). 미머지 Decision 의 placeholder 는 정상(검출 안 됨).
  - `/release` 는 파일을 수정하지 않는다는 불변식은 그대로다. **후속 doc PR 을 안내하지 않는다** — 전용 chore PR 은 이 설계에서 사라졌다.

조립 형식:

```markdown
**Project|Major|Minor**. <한 줄 사이클 요약>

### Changes

- feat: ...
- fix: ...
- chore: ...
```

### Step 3: 사용자 confirm (notes 미리보기) + SHA 핀

notes 미리보기를 출력하고 사용자 confirm 을 대기한다. 수정 요청이 있으면 반영 후 다시 보여주고 재확인한다.

계획 제시 시점의 origin/main SHA 를 **고정(pin)** 한다 — 이후 태깅은 origin/main ref 가 아니라 이 SHA 에 실행된다. 확인 시점과 태깅 시점 사이에 다른 세션의 머지로 origin/main 이 움직여도, 사용자가 승인하지 않은 내용이 조용히 릴리스에 들어가지 않는다.

```bash
PINNED=$(git rev-parse origin/main)
```

실행 계획도 함께 출력한다 — 표기하는 SHA 는 `$PINNED` 다:

```
origin/main 스냅샷 (<PINNED short SHA>) 에 다음을 일괄 실행합니다:
1. git tag -a vX.Y.Z -m "vX.Y.Z" <PINNED short SHA>
2. git push origin vX.Y.Z  ← PONR
3. gh release create vX.Y.Z --notes "$NOTES"
4. milestone close

main 에 코드를 push 하지 않습니다.
```

### Step 4: tag + Release + milestone close

**SHA 핀 가드 (태깅 직전)**: origin/main 이 계획 제시 후 움직였는지 재확인한다.

```bash
git fetch origin main --tags
CURRENT=$(git rev-parse origin/main)
if [ "$PINNED" != "$CURRENT" ]; then
  echo "origin/main 이 계획 제시 후 움직였습니다: $PINNED → $CURRENT"
  git log --oneline "$PINNED..$CURRENT"   # 새로 들어온 커밋 목록
fi
```

달라졌으면 **stop** — 새 커밋 목록을 제시하고 사용자 선택을 대기한다. soft-skip 우회 없음: "조용히 포함"이 이 가드가 막는 사고 그 자체다.

- **(a) 새 내용 포함해 재확인**: Step 1b 로 되돌아가 새 커밋 범위를 포함해 게이트 B(destructive 마이그레이션)를 재실행하고, Step 2 릴리스 노트 재조립 → Step 3 재confirm 순서로 재수행한다 (핀도 새 SHA 로 갱신). Step 2 로 바로 건너뛰지 않는다 — 새로 들어온 커밋에 destructive 마이그레이션이 있으면 게이트 B 없이 릴리스될 수 있다.
- **(b) 중단**: stop.

일치하면 순서대로 실행한다. 태깅 대상은 origin/main ref 가 아니라 **핀된 SHA** 다 — fetch 결과에 휘둘리지 않는다.

```bash
git tag -a vX.Y.Z -m "vX.Y.Z" "$PINNED"
git push origin vX.Y.Z
```

**`git push origin vX.Y.Z` 성공 = point-of-no-return (PONR).** tag push 거부(서버 중복 tag 거부) 시 — fetch → tag max 재계산 → 해당 버전이 이미 존재하면 **"다른 세션이 이미 릴리스함" stop** (재시도 루프 없음 — 경쟁 표면이 tag push 하나로 수렴).

  stop 후 복구 안내:
  1. `git fetch origin main --tags` 로 최신 origin 상태와 tag 를 동기화한다.
  2. `gh release view <기존태그>` 로 다른 세션이 생성한 릴리스 내용(Changes·milestone)을 확인한다.
  3. 내 마일스톤이 그 릴리스에 포함되지 않았으면 — 마일스톤을 다음 버전으로 이월하거나(`gh api -X PATCH repos/{owner}/{repo}/milestones/{N} -f title="<다음버전>"`) `/release` 를 다시 호출한다.

PONR(tag push 성공) 이후 단계(GitHub Release / milestone close)는 **멱등 best-effort** 로 진행한다: 각 단계 실패 시 STOP 하지 않고 나머지를 계속 시도한다. 실패한 명령들은 Step 5 최종 리포트에 모아 "수동 재실행하세요" 로 출력한다.

```bash
gh release create vX.Y.Z --title "vX.Y.Z" --notes "$NOTES"
```

`gh release create` 실패 사유가 "already exists" 이면 정상으로 간주하고 계속한다.

milestone close 는 Step 1 에서 확정한 마일스톤 식별자가 있을 때만 실행한다.

```bash
gh api -X PATCH repos/{owner}/{repo}/milestones/{N} -f state=closed
```

### Step 5: 최종 리포트

```markdown
## 릴리스 완료: vX.Y.Z

- **Tag**: vX.Y.Z
- **GitHub Release**: <URL>
- **Closed issues**: #N <제목>, ...
- **Milestone**: "<식별자>" closed (또는 "마일스톤 없음 — 건너뜀")
- **best-effort 실패 목록** (수동 재실행 필요, 없으면 생략): ...
```

> **사용자 후속 작업** (자동 실행 X):
>
> - 워크트리 동기화: release 는 더 이상 워크트리를 origin/main 과 맞춰주지 않습니다. **호출 워크트리 포함** 모든 워크트리를 수동으로 동기화하세요.
>   - working directory 가 **clean** 이면 `git fetch && git reset --hard origin/main`
>   - **dirty** (작업 중인 변경 있음) 면 `git fetch && git merge --ff-only origin/main`
> - 다음 milestone 생성:
>   - **MAJOR (Y) bump**: `gh api -X POST repos/{owner}/{repo}/milestones -f title="v(X.Y+1).0"`
>   - **PROJECT (X) bump**: `gh api -X POST repos/{owner}/{repo}/milestones -f title="v(X+1).0.0"`
>   - **MINOR (Z) bump**: 현재 milestone 이 진행 중이므로 신규 생성 불필요

---

## 버전 정의 (Romantic Versioning)

이 하네스의 프로젝트들은 외부 API 소비자가 없는 1인 운영 단일 앱이라 [표준 semver](https://semver.org) 의 "호환성" 정의가 적용 대상이 없다. 대신 [Romantic Versioning](https://github.com/romversioning/romver) 을 채택해 자리수에 다음 의미를 부여한다.

- **MINOR (Z)** — 잔변경 / 핫픽스. 에이전트 가정 변경 없음.
- **MAJOR (Y)** — `/plan` 한 사이클(milestone) = Y bump. 의미있는 사이클 단위 묶음 — 새 도메인 · 기능 · Decision · 외부 의존성 추가.
- **PROJECT (X)** — 제품 캐릭터가 바뀌는 큰 이정표. 1인 단계에선 거의 안 올림. `0` 은 "production-ready 전" 의미.

자동 판정(Step 0 의 머지된 PR head 브랜치명 기반 추론)은 **제안만** 한다. 사용자가 인자 또는 응답으로 지정한 버전이 항상 우선한다.

---

## 릴리스 안전성 정의 (1인 컨텍스트)

- origin/main = PR 게이트(/qa + 사용자 리뷰) 통과 상태 신뢰
- milestone open issue 0, 또는 사용자가 carry-over / 제거 결정 완료 (Step 1 confirm 게이트 통과)
- destructive 마이그레이션 존재 시 사용자 확인 완료 (Step 1b 게이트 B 통과)
- 태그 대상 = Step 3 에서 사용자가 확인한 핀 SHA — 그 사이 origin/main 이 움직였으면 Step 4 SHA 핀 가드가 stop
- tag 중복 없음

---

## 예외 처리

| 상황 | 동작 |
|------|------|
| working tree dirty | warn + "릴리스에 포함 안 됨" 안내 + confirm 대기 (취소 시 stop) |
| 현재 브랜치에 origin/main 에 없는 커밋 존재 | `git diff origin/main..HEAD --stat` 이 비면 squash 잔상으로 통과. diff 있으면 warn + "PR 머지 후 릴리스 권장" 안내 + confirm 대기 (취소 시 stop) |
| origin/main 이 계획 제시 후 이동 (Step 4 SHA 핀 가드) | stop + 새 커밋 목록 제시 — (a) Step 1b 복귀(게이트 B 재실행)·Step 2 노트 재조립·Step 3 재confirm 또는 (b) 중단. soft-skip 우회 없음 |
| milestone open issue 존재 | confirm 게이트 (1: 마일스톤 제거 후 진행 / 2: 중단 / 3: 그대로 진행) |
| `gh auth` 미인증 | `gh auth login` 안내 |
| tag 이미 존재 | stop |
| `push origin vX.Y.Z` 거부 (중복 tag) | fetch → tag max 재계산 → 해당 버전 이미 존재 시 "다른 세션이 이미 릴리스함" stop |
| `gh release create` "already exists" | 정상으로 간주하고 계속 진행 |
| destructive 마이그레이션 구문 발견 (Step 1b-B) | warn + confirm 대기. 사용자 확인 시 계속, 취소 시 stop |
| STALE 도입 버전 발견 (Step 2, `check-decision-versions.mjs` exit 1) | warn + 목록 제시, confirm 없이 진행 — `/qa` write 게이트 미실행 신호. 다음 `/qa` 가 자동 확정 (게이트락 아님) |
| PENDING 도입 버전 (Step 2) | 정상 — 정보성 출력만. 이번 태깅 후 다음 PR 의 `/qa` 가 확정 |

---

## 제약

- 메인 세션이 절차를 오케스트레이션한다.
- git tag · GitHub Release · milestone 은 **본 스킬이 단일 동기화 경로** — 직접 `git tag` / `gh release create` / milestone close 금지.
- **릴리스 효과: origin/main 태깅 + gh release/milestone close. main 에 push 하지 않는다** — PR squash merge 가 origin/main 을 갱신하는 유일한 경로다.
- 코드 편집은 이 스킬 범위 외. **파일 편집 없음** — 릴리스가 커밋을 만들지 않는다 (버전 SSOT = git tag max — 파일에 버전을 쓰면 SSOT 가 갈라진다). `package.json version` 은 `0.0.0` 동결, 문서(.md) 편집도 없다.
- `docs/architecture-decisions.md` / `docs/harness-decisions.md` 는 이 스킬의 수정 대상이 아니다. Decision 도입 버전은 `/qa` 의 write 게이트가 채우는 **생성물**이다 — `/release` 는 태깅만 하고, 확정된 값은 다음 PR 이 실어 나른다. 전용 chore PR 을 만들지 않는다.
