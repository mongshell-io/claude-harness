---
role: "mongshell-io 앱 저장소 CI 잡이 하네스 공용 composite action `setup-node-pnpm` 을 부르는 배선 — 표준 잡 모양(checkout → setup-node-pnpm → 검사) · 입력 · node_modules 를 남기는 workspace 정리 스니펫."
kind: operational
non_goals:
  - "Node · corepack · pnpm 준비 로직 자체와 그 이유(사고 기록) — 하네스 `.github/actions/setup-node-pnpm/action.yml` 이 권위"
  - "저장소마다 어떤 검사(lint · typecheck · check:* · test)를 어떤 잡에 둘지 — 각 저장소 verify 워크플로가 권위"
  - "verify 워크플로 이름 · 트리거 · automerge 호출 — `automerge-wiring.md` 가 권위"
  - "self-hosted 러너 설치 · 운영 — mongshell-io/runner-infra `ci-runner/` 가 권위"
---

# CI 준비 배선 (setup-node-pnpm)

Node · pnpm 준비는 하네스 저장소의 composite action [`.github/actions/setup-node-pnpm/action.yml`](https://github.com/mongshell-io/claude-harness/blob/main/.github/actions/setup-node-pnpm/action.yml) 한 곳에 있다. 앱 저장소 잡은 checkout 다음에 **한 줄**로 부르고 바로 검사 스텝으로 간다.

- 하네스 쪽 변경은 `@main` 으로 부르는 저장소 전부에 **머지 즉시** 적용된다. 하네스 PR 은 사람이 읽고 머지한다.
- action 이 하는 일: `actions/setup-node@v7` → corepack(러너 이름별 폴더에 캐시)으로 `packageManager` 의 pnpm 켜기 → 루트 `pnpm install --frozen-lockfile --store-dir "$HOME/.pnpm-store"`.
- 전제: 저장소 `package.json` 에 `packageManager: "pnpm@<버전>"` 이 있다 — pnpm 버전은 워크플로에 적지 않는다.
- 러너: self-hosted `mongshell-runner` 과 ubuntu-latest 양쪽에서 돈다. 호스티드 러너는 pnpm 저장소가 잡마다 비어 매번 받는다(setup-node `cache:` 를 쓰지 않는 대가).

## 입력

| 입력 | 기본값 | 설명 |
|---|---|---|
| `node-version` | `'26'` | setup-node 에 넘긴다. 저장소 `engines.node` 와 맞춘다 |
| `install` | `'true'` | `'false'` 면 Node · pnpm 만 켜고 install 은 호출 쪽에 맡긴다 |
| `corepack-version` | `'0.36.0'` | npm 에서 받을 corepack 버전(`x.y.z`). Dockerfile 과 같은 값 |

## 표준 잡 모양

```yaml
jobs:
  static:
    name: static (lint · typecheck)
    runs-on: [self-hosted, mongshell-runner]   # GitHub 호스티드면 ubuntu-latest
    timeout-minutes: 10
    steps:
      - uses: actions/checkout@v7

      # Node · pnpm(corepack) · pnpm install — 하네스 공용(claude-harness#50).
      - uses: mongshell-io/claude-harness/.github/actions/setup-node-pnpm@main

      # 모든 검사 스텝에 `if: !cancelled()` — 한 번의 수정 라운드로 다 고치게 한다.
      - run: pnpm lint
        if: ${{ !cancelled() }}
      - run: pnpm typecheck
        if: ${{ !cancelled() }}
```

- 하위 패키지(예: `extension/` — 자체 lockfile)는 action 이 설치하지 않는다. action 뒤에 호출 쪽 스텝으로 둔다 — action 이 켠 pnpm · `COREPACK_HOME` 이 이어진다.

  ```yaml
      - run: pnpm install --frozen-lockfile --store-dir "$HOME/.pnpm-store"
        working-directory: extension
  ```

- `actions/setup-node` · corepack 스텝을 잡에 따로 두지 않는다 — 두 번 켜면 뒤의 것이 PATH 를 덮어 어느 쪽이 쓰였는지 흐려진다.

## 러너 설명 주석 (self-hosted 풀)

`runs-on: [self-hosted, mongshell-runner]` 를 쓰는 워크플로는 파일마다 첫 `runs-on` 바로 위(또는 러너를 설명하는 잡 주석 묶음)에 아래 두 줄을 **그대로** 둔다.

```yaml
# 실행 위치: 조직 공용 self-hosted 러너 풀(라벨 `mongshell-runner`). 어느 맥에 몇 개 있는지 · 설치 · 운영은
# mongshell-io/runner-infra 가 기준이다 — 대수나 설치 경로를 여기에 적지 않는다(러너를 바꿀 때마다 낡는다).
```

- 러너 대수(「맥북 N대 · 러너 N개」) · 설치 스크립트 경로 · 러너 그룹 · 머신 이름을 워크플로 주석에 옮겨 적지 않는다 — 권위는 mongshell-io/runner-infra 하나다.
- 저장소 고유의 근거(과금 이력 · 잡 분리 · timeout 이유 · 이슈 참조 · 지난 사고 기록)는 두 줄 아래에 그대로 둔다.

## 선택: node_modules 를 남기는 workspace 정리 (self-hosted)

checkout 기본값(`clean: true`)은 `git clean -ffdx` 로 러너의 `node_modules` 까지 지워 install 이 매번 전부 다시 링크한다(gambau 실측: 잡 약 105초 중 약 28초). 루트 `node_modules` 를 잡 사이에 남기려면 checkout 을 `clean: false` 로 두고 **바로 다음에** 아래 정리 스텝을 둔다. checkout 설정과 짝이라 action 에 넣지 않는다 — 저장소마다 남길 폴더가 다를 수 있다.

```yaml
      # 작업 폴더 정리를 checkout 에 맡기지 않는다 — 러너의 `node_modules` 를 잡 사이에 남기기 위해서다.
      # 추적 파일은 checkout 의 `git checkout --force` 가 검사할 커밋으로 되돌리므로, 남는 미추적 · 무시 파일은 아래 스텝이 지운다.
      - uses: actions/checkout@v7
        with:
          clean: false

      # 루트 `node_modules` 만 남기고 지운다 — `.next` · `tsconfig.tsbuildinfo` 같은 앞 실행 생성물이 판정에 섞이지 않게
      # (`/` 로 루트에 고정 — 다른 깊이의 node_modules 는 지운다). node_modules 안에서도 앞 실행(다른 PR 의 소스)에서 파생된
      # vitest 변환 캐시 · 실행 기록은 지운다. 의존성에서만 파생된 것(pnpm 가상 저장소 · vite deps 묶음)은 남긴다.
      - name: clean workspace (keep node_modules)
        run: |
          git clean -ffdx -e /node_modules
          rm -rf node_modules/.vitest-cache
          rm -f node_modules/.vite/vitest/*/results.json

      - uses: mongshell-io/claude-harness/.github/actions/setup-node-pnpm@main
```

- 같은 러너의 작업 폴더를 그 저장소의 모든 잡이 번갈아 쓰므로, 한 잡에 넣으면 **모든 잡**에 같은 정리를 둔다.
- 남긴 `node_modules` 는 action 의 `pnpm install --frozen-lockfile` 이 lockfile 에 맞춘다. 패키지 안의 파일이 바뀐 것은 고치지 않으므로, 의심되면 그 러너의 `node_modules` 를 지운다.
- 하위 패키지의 `node_modules`(예: `extension/node_modules`)는 `-e /node_modules` 에 걸리지 않아 지워진다 — 남기려면 `-e` 를 더한다.
- 호스티드 러너(ubuntu-latest)는 잡마다 새 VM 이라 이 정리가 필요 없다.
