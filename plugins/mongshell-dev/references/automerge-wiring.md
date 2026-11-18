---
role: "mongshell-io 앱 저장소가 하네스 공용 automerge 재사용 워크플로를 부르는 배선 — 호출 파일 전문 · verify 워크플로 쪽 요구 · 루트 CLAUDE.md 정책 노브 문장."
kind: operational
non_goals:
  - "자동 머지 로직 자체(PR 판정 · 거부 경로 가드 · squash · 브랜치 삭제 · 이슈 닫기) — 하네스 `.github/workflows/automerge.yml` 이 권위"
  - "저장소마다 무엇을 사람이 머지할지(거부 경로 집합) — 각 저장소 루트 CLAUDE.md 정책 노브가 권위"
  - "머지 규약(squash 만 · `--delete-branch` 금지) — 루트 CLAUDE.md 상시 코어 (`claude-md-core.md`)"
---

# automerge 배선

자동 머지 로직은 하네스 저장소의 재사용 워크플로 [`.github/workflows/automerge.yml`](https://github.com/mongshell-io/claude-harness/blob/main/.github/workflows/automerge.yml)(`on: workflow_call`) 한 곳에 있다. 각 앱 저장소는 **호출 파일 하나**만 두고, 저장소마다 다른 값(거부 경로 · 러너 · 라벨)만 입력으로 넘긴다.

- 하네스 쪽 파일 변경은 `@main` 으로 부르는 저장소 전부에 **머지 즉시** 적용된다. 하네스 PR 은 사람이 읽고 머지한다.
- 호출 파일은 `workflow_run` 트리거라 GitHub 이 **기본 브랜치의 호출 파일**로 실행한다 — 앱 PR 은 자기를 검사하는 가드를 바꿀 수 없다. 호출 파일 자신을 바꾸는 PR 은 거부 집합에 넣어 사람이 머지한다.

## 호출 파일 — `.github/workflows/automerge.yml`

`workflows:` 의 값은 그 저장소 verify 워크플로의 **`name:`** 이다(파일명이 아니다). `deny_paths` 는 그 저장소 CLAUDE.md 정책 노브와 같은 집합을 정규식으로 적는다.

```yaml
# PR 자동 머지 — 로직은 하네스 공용 재사용 워크플로(mongshell-io/claude-harness .github/workflows/automerge.yml).
# 거부 집합의 권위는 루트 CLAUDE.md 정책 노브 — 아래 deny_paths 는 그 집행이다. 이 파일 자신도 거부 집합에 둔다.
name: automerge

on:
  workflow_run:
    workflows: [verify]
    types: [completed]

permissions: {}

jobs:
  automerge:
    # 재사용 쪽에도 같은 조건이 있다. 여기 두면 라벨 없는 실패 실행에서 러너를 잡지 않는다.
    if: ${{ github.event.workflow_run.event == 'pull_request' && github.event.workflow_run.conclusion == 'success' }}
    uses: mongshell-io/claude-harness/.github/workflows/automerge.yml@main
    permissions:
      contents: write
      pull-requests: write
      issues: write
    with:
      deny_paths: '^(drizzle/|src/lib/db/schema/|drizzle\.config\.ts$|\.github/workflows/)'
      # runner: '["ubuntu-latest"]'   # 기본 ["self-hosted","openclaw-mac"]. GitHub 호스트 러너를 쓰는 저장소만 적는다.
      # label: automerge              # 기본값과 다를 때만
```

- **concurrency 를 호출 파일에 두지 않는다** — 재사용 쪽 잡이 PR 단위 concurrency 를 갖는다. 같은 이름의 그룹을 워크플로 단위로 또 두면 교착으로 취소된다.
- **`permissions` 는 호출 잡에 준다** — 재사용 쪽 잡은 그 범위 안에서만 쓴다. 덜 주면 재사용 잡이 시작 단계에서 실패한다(머지되지 않음 · fail-closed).
- **`secrets:` 는 넘기지 않는다** — 재사용 쪽은 호출 저장소의 `github.token` 만 쓴다.
- 거부 집합이 DB 마이그레이션 경로를 갖지 않는 저장소(예: drizzle 이 없는 저장소)도 워크플로 디렉토리(`\.github/workflows/`)는 반드시 넣는다 — 검사 정의(verify)와 호출 파일 자신을 PR 이 자동 머지로 바꾸지 못하게 한다. `deny_paths` 가 비거나 정규식이 잘못되면 재사용 쪽이 전부 거부한다.

## verify 워크플로 쪽 요구

- **`name:`** — 호출 파일 `workflows:` 와 같은 값. 이름을 바꾸는 PR 은 트리거가 끊겨 자동 머지가 멈춘다(fail-closed) — 호출 파일을 같은 PR 에서 함께 고치면 거부 집합에 걸려 사람이 머지한다.
- **트리거에 `labeled` 포함** — PR 을 연 뒤 라벨을 붙여도 verify 가 다시 돌고, 그 완료가 호출 파일을 깨운다.

  ```yaml
  on:
    pull_request:
      types: [opened, synchronize, reopened, labeled]
  ```

- **verify 안에 automerge 잡을 남기지 않는다** — 옮긴 뒤 옛 `automerge` 잡(`needs: [static, test]`)은 지운다. 두 경로가 같은 PR 을 동시에 머지하려 하면 한쪽이 405 로 실패한다(재사용 쪽은 같은 커밋이 머지됐으면 통과로 보지만 옛 잡은 그렇지 않다).
- **선택: 라벨 이벤트의 concurrency 분리** — verify 의 `concurrency.group` 에 라벨 이벤트를 따로 두면 라벨 붙이기가 진행 중인 코드 검사 실행을 취소하지 않는다(a2s 방식).

  ```yaml
  concurrency:
    group: verify-${{ github.ref }}-${{ github.event.action == 'labeled' && format('label-{0}', github.event.label.name) || 'code' }}
    cancel-in-progress: true
  ```

## 루트 CLAUDE.md 정책 노브 문장

상시 코어 블록의 「정책 노브」 줄에서 `automerge` 항목을 아래처럼 적는다 — 경로 집합은 그 저장소의 `deny_paths` 와 같게 유지한다.

```markdown
`automerge` 라벨 — 붙이면 verify 성공 뒤 자동 squash 머지. **사람이 머지** = `drizzle/`·`src/lib/db/schema/`·`drizzle.config.ts`(DB 마이그레이션)·`.github/workflows/`(검사 정의와 이 호출 파일 — 검사가 스스로 약해지는 PR 을 막는다)가 바뀐 PR — 하네스 공용 automerge 의 risk guard 가 라벨이 있어도 거부한다. 이 집합의 권위는 이 줄이고 호출 파일 `deny_paths` 는 이를 따른다.
```

스택 메모 등에 자동 머지 수단을 설명하는 줄이 있으면 「verify.yml `automerge` 잡」 대신 「`.github/workflows/automerge.yml`(하네스 공용 재사용 워크플로 호출, `workflow_run`)」 으로 바꾼다.
