# claude-harness

mongshell-io 저장소들이 같이 쓰는 Claude Code 하네스의 단일 원본. 무엇을 어디로 내보내는지는 [README.md](README.md) 첫 표, 하네스 본문의 공통 정의(리뷰어 라우팅 · 등급 · 본문 작성 가이드)는 [plugins/mongshell-dev/README.md](plugins/mongshell-dev/README.md) 가 권위다.

**이 저장소는 Claude 가 관리한다** (사용자 위임, 2026-11-20). 구조 판단 · 정리 · 수정을 Claude 가 근거를 확인해 결정하고, 실행한 뒤 무엇을 왜 했는지 보고한다. 사용자에게 묻는 것은 아래 「머지 규약」 의 사람이 머지 경로와, 소비 저장소의 정책 자체를 바꾸는 결정뿐이다.

## 고치기 전에 — 어디까지 퍼지는가

고치려는 파일이 README 첫 표의 어느 줄인지 먼저 본다. 줄마다 퍼지는 시점과 되돌리는 비용이 다르다.

- `.github/workflows/automerge.yml` · `.github/actions/setup-node-pnpm/` — 머지 즉시 `@main` 으로 부르는 저장소 전부에서 돈다. 잘못되면 그 저장소들의 CI · 자동 머지가 함께 멈춘다.
- `plugins/**` — 머지 뒤 각 PC 의 다음 플러그인 갱신 때 모든 프로젝트 세션에 들어간다. 스킬 · 에이전트 본문은 설명서가 아니라 모델이 그대로 따르는 지시문이다 — 한 문장이 여러 저장소의 작업 방식을 바꾼다.
- `checks/**` — 앱이 lockfile 의 SHA 를 올릴 때까지 퍼지지 않는다. 그 앱의 CI 가 새 판을 먼저 돌린다.
- `plugins/mongshell-dev/references/claude-md-core.md` 의 블록 · `plugins/mongshell-dev/templates/**` · references 문서가 「그대로 둔다」 고 정한 것(automerge 호출 파일 전문 등) — 저장소마다 복사본이 있다. 고치면 복사본이 전부 낡는다. 코어 블록은 마커(`harness-core: YYYY-MM`)를 올리고, 나머지는 받는 저장소마다 반영 PR 을 낸다(워크플로 파일은 그 저장소에서 사람이 머지). 그만한 값이 없는 변경(주석 다듬기 등)은 하지 않는다.

누가 무엇을 어떤 상태로 받고 있는지는 문서에 적어 두지 않는다(저장소가 늘 때마다 낡는다). 필요할 때 본다:

```bash
./tools/consumers.sh    # 읽기 전용 · 약 40초 — 조직 저장소별 플러그인 · 코어 마커 · 워크플로 참조 · checks SHA · 템플릿 대조
```

## 검증

```bash
node tools/lint.mjs            # 매 변경 — manifest · frontmatter · 링크 · 플러그인 경로 참조 (PR 의 CI 도 돈다)
cd checks && node --test       # checks/ 를 건드렸을 때 (PR 의 CI 도 돈다)
```

- 스킬 · 에이전트 본문을 고쳤으면 `harness-reviewer` 로 검토한다(`/qa` 가 하네스 도메인 변경을 그쪽으로 보낸다). 이 저장소도 `.claude/settings.json` 으로 `mongshell-dev` 를 켜 두었다. 세션에 뜨는 것은 **설치본(main)** 이므로, 리뷰어 · `/qa` 자신을 고친 변경은 머지 뒤에야 그 눈으로 볼 수 있다.
- 스크립트(`plugins/*/scripts/`, `tools/`)를 고쳤으면 실제 입력으로 돌려 본다 — 소비 저장소의 `origin/main` 사본이 가장 좋은 입력이다.
- 소비 저장소에 닿는 변경이면 머지 뒤 `./tools/consumers.sh` 로 낡은 곳을 확인한다.

## 머지 규약

- 브랜치 이름은 pr 스킬의 규약(`(feat|fix|chore|refactor|docs|ci)/issue-N-<slug>`), 커밋 메시지는 한국어 conventional commits, `Co-Authored-By` 포함.
- PR 머지는 squash 만 — `gh pr merge <N> --squash`. `--delete-branch` 는 쓰지 않는다(worktree 의 `main` 점유와 충돌 — 원격 브랜치는 저장소 설정 `delete_branch_on_merge` 가 지운다).
- 이 저장소에는 자동 머지가 없다 — public 저장소라 외부 PR 이 조직의 self-hosted 러너에서 돌 길을 만들지 않는다(`automerge.yml` 머리말).
- **사람이 머지** = `.github/workflows/`·`.github/actions/`가 바뀐 PR — 사용자가 읽고 머지한다. 본문 Risk / How to revert 에 부르는 저장소에 미치는 영향과 되돌리는 법을 적는다.
- 그 밖의 PR 은 Claude 가 위 검증을 마친 뒤 직접 squash 머지한다.

## 본문을 쓸 때

- 개발 하네스의 스킬 · 에이전트 본문은 프로젝트 중립이다 — 무엇이 들어가면 안 되는지는 플러그인 README 「본문 작성 가이드」 가 권위.
- `${CLAUDE_PLUGIN_ROOT}` 는 스킬 · 에이전트 본문에서만 치환된다 — 그 밖의 파일의 명령에는 쓰지 않는다([README.md](README.md) 「경로 규칙」).
- 같은 내용을 두 곳에 적지 않는다. 다른 문서가 권위인 것은 그 문서를 가리킨다.
- 문서는 지금 참인 것만 적는다. 바뀐 이력은 커밋과 PR 이 갖고 있다.

## 소비 저장소를 고칠 때

- 하네스 변경에 따른 md · 설정(`.github/dependabot.yml` · `.claude/settings.json` · 루트 `CLAUDE.md` 코어 블록 등) 반영은 위임 범위다. 그 저장소의 코드 · 기능 · 정책 결정은 범위 밖이다 — 이슈로 남긴다.
- 형제 폴더의 로컬 체크아웃(`../<저장소>`)은 다른 세션이 쓰는 중일 수 있다. 작업 트리와 브랜치를 건드리지 않는다 — 읽기는 `git -C ../<저장소> show origin/main:<경로>`(먼저 `git fetch`), 쓰기는 GitHub API 로 브랜치 · 커밋 · PR 을 만든다.
- 머지는 그 저장소 루트 `CLAUDE.md` 의 규약을 따른다(자동 머지 라벨 · 사람이 머지 경로).
