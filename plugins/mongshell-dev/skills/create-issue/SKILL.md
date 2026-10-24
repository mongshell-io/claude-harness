---
name: create-issue
description: >-
  사용자의 의도("이거 하고 싶어")를 GitHub issue 로 변환해
  프로젝트의 backlog 권위(GitHub Issues)에 등록하는 단일 진입점.
  조사 정책: docs/issue-conventions.md 존재 시 그 문서를 따르고,
  부재 시 Explore agent 코드베이스 조사가 기본.
  트리거 — "이슈 만들어/등록해줘", "backlog 등록", "create-issue".
---

# /create-issue

사용자의 요청을 받아 코드베이스를 조사하고 GitHub issue 를 생성하는 단일 진입점.

## 언제 호출하는가

- "이거 기능 추가하고 싶어", "이 버그 등록해", "TODO 이슈로 남겨줘" 등 backlog 에 등록할 의도를 표현할 때
- `gh issue list` 대신 자연어로 이슈를 만들고 싶을 때
- ⚠️ 자동 호출 X — 사용자가 backlog 등록 의도를 명시 표현할 때만 호출.

## 동작

### Step 1: 중복 체크

```bash
gh issue list --search "<keyword>" --json number,title,labels,state --limit 20
```

유사 이슈가 있으면 사용자에게 알리고 진행 여부를 확인한다 — **같은 일을 하는 이슈가 이미 열려 있을 때만** 묻는다. 겹치는 부분만 있으면 본문 "관련" 에 링크를 걸고 그대로 진행한다.

> "기존 #N '...' 과 비슷합니다. 그래도 새로 만들까요?"

응답 대기. "아니 / 취소" 이면 스킬 종료.

### Step 2: 코드베이스 조사 (조사 정책은 프로젝트 권위)

**조사 정책 권위 = `docs/issue-conventions.md` (존재 시).** 그 문서가 조사 시점·범위를 달리 정하면(예: "이슈 생성 시 깊은 조사 생략, 착수 시 조사") 그 정책을 따르고 이 Step 의 기본 절차를 대체한다. 부재 시 아래가 기본.

Agent 도구로 `subagent_type=Explore` 를 호출한다. 조사 범위:

- 현재 구현 상태 (구현됨 / 미구현 / 부분 구현)
- 관련 파일 경로
- 영향 도메인 / layer
- 기존 구현과의 잠재적 충돌

### Step 3: 이슈 내용 결정 (확인 없이 진행)

조사 결과로 라벨을 결정한다 (type 축 4종 중 택일):

- `type:feat` — 새 기능
- `type:fix` — 버그 수정
- `type:chore` — 코드 정리 / 인프라 / 문서
- `type:refactor` — 동작 보존 구조 변경 (리팩토링)

**`next` 와 milestone 은 상호배타다** — `next` = "아직 어느 사이클/테마에도 안 넣은 backlog 후보", milestone = "특정 사이클/테마에 하기로 확정". 둘을 동시에 달지 않는다.
- 사용자가 이슈를 **곧장 milestone(테마/사이클)에 넣겠다고 명시**했거나 아래 미리보기에서 milestone 을 지정한 경우 → milestone 만 부여하고 `next` 는 **붙이지 않는다**.
- milestone 지정이 없으면(기본) → `next` 를 자동 부여한다 (새 이슈 = backlog 후보). 사용자가 명시하면 `next` 도 제외 가능(보류 상태 — milestone·next 둘 다 없이 생성).

다음 형식으로 이슈 내용을 정한다. **미리보기를 보여주고 기다리지 않는다** — 바로 Step 4 로 가서 만들고, 고칠 점은 사용자가 만든 뒤에 말한다(`gh issue edit` 로 반영):

```markdown
## 이슈 생성 계획

**제목**: <평이한 한국어 제목>
**라벨**: type:feat, next  ← milestone 미지정 시 / milestone 지정 시: type:feat (next 없음)
**Milestone**: (없음 — next 후보로 등록)  ← milestone 지정 시 해당 제목 표시
**관련 파일**: src/foo/bar.ts, src/foo/baz.ts

---
**Body**:

## 설명
<배경 / 의도 / 무엇을 / 왜>

## 작업
- [ ] ...
- [ ] ...

## 관련 파일
- src/foo/bar.ts
- src/foo/baz.ts

```

> **왜 묻지 않는가**: 이슈는 만든 뒤 고치거나 닫기 쉽다. 미리보기 대기가 이슈 하나당 한 번의 왕복을 더해, 묻는 비용이 틀릴 비용보다 크다.

### Step 4: `gh issue create` 실행

HEREDOC 으로 body 를 전달해 줄바꿈을 보존한다:

milestone 유무에 따라 분기한다:

**milestone 미지정 (기본 — next 부여):**

```bash
BODY=$(cat <<'EOF'
## 설명
...

## 작업
- [ ] ...

## 관련 파일
- ...
EOF
) && gh issue create \
  --title "<제목>" \
  --body "$BODY" \
  --label "type:feat,next"
```

**milestone 지정 시 (next 없음):**

```bash
BODY=$(cat <<'EOF'
## 설명
...

## 작업
- [ ] ...

## 관련 파일
- ...
EOF
) && gh issue create \
  --title "<제목>" \
  --body "$BODY" \
  --label "type:feat" \
  --milestone "<milestone-title>"
```

- 본문에 인라인 백틱(`)이 있으면 변수 경유 필수. 외부 double-quote 가 백틱을 명령 치환으로 재해석할 위험을 회피한다.
- 라벨은 쉼표 구분, 공백 없음
- 이슈 번호와 URL 보존

### Step 5: 최종 리포트

```markdown
## 이슈 생성 완료

**Issue**: https://github.com/<owner>/<repo>/issues/<N>
**제목**: <제목>
**라벨**: <실제 부여된 라벨 (예: type:feat, next 또는 type:feat)>
**Milestone**: <지정한 경우 milestone 제목, 미지정이면 이 줄 생략>

**다음 단계**:
- 사이클에 포함시킬 때: `gh issue edit <N> --remove-label next --milestone v0.2.0`
- 외부 의존으로 차단 상태일 때: `gh issue edit <N> --add-label blocked`
- 작업 시작 시: 브랜치 `feat/issue-<N>-<짧은-설명>`, PR 본문에 `Closes #<N>` 포함
```

## 예외 처리

- **중복 이슈 발견**: 같은 일이면 링크 제시 + 진행 여부 확인, 일부만 겹치면 링크만 걸고 진행
- **`gh auth` 미인증**: `gh auth login` 안내
- **Explore agent 가 관련 코드 없음 응답**: "관련 구현이 아직 없는 새 영역" 이라고 본문에 적고 그대로 만든다(묻지 않는다). 관련 파일 섹션은 비워둠.

## 컨벤션

- **라벨 3축 정의** (본 스킬이 단일 권위):
  - **type 축** (변경 종류): `type:feat` / `type:fix` / `type:chore` / `type:refactor`
  - **상태 축**: `next` / `blocked`
  - **area 축**: `area:meta` = 비-코드 작업 (하네스 + `docs/` 문서). **미부착 = 제품 코드** (기본). 혼합 작업은 **핵심 산출물 기준** 판단.
  - `/create-issue` 흐름에서 직접 다루는 건 `type:*` 와 `next` 이며, 그 외 라벨이 필요해 보이면 사용자에게 확인한다.
- 이슈 제목에 `[P2]`, `[v0.2.0]` 같은 prefix 를 붙이지 않는다. 평이한 제목.
- backlog SSOT 는 GitHub Issues — 인라인 목록을 별도 문서로 관리하지 않는다.

## 참조

- 라벨 목록: `gh label list`
- 이슈 목록 (backlog 권위 = GitHub Issues): `gh issue list --label next`
