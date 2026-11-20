---
role: "mongshell-io 앱 저장소의 브라우저 익스텐션 구조 표준 — 폴더(`extension/` · 둘 이상이면 `extension-<용도>/`) · 스택(WXT 0.21.x) · 빌드 결과물 폴더(`extension/dist`) · 아이콘 · 스크립트 이름 · Chrome 로드 안내."
kind: operational
non_goals:
  - "익스텐션 기능 · 매니페스트 권한(permissions · host_permissions) · content script 범위 — 각 저장소가 권위"
  - "Chrome 웹 스토어 배포 · 심사 절차"
  - "dependabot directories 등 저장소 설정 정본 — `references/repo-templates.md` 가 권위"
  - "CI 잡 모양 — `references/ci-setup-wiring.md` 가 권위"
---

# 브라우저 익스텐션 구조 표준

브라우저 익스텐션이 있는 mongshell-io 앱 저장소(sellcaddie · k2sell · auction2sell 등)는 모두 이 구조를 따른다. 저장소마다 빌드 도구 · 폴더 · 아이콘 상태가 달라 관리자가 매번 다르게 손보던 시간을 없애려는 것이다(스택을 일정하게). 표준 확정 2026-11-19.

## 위치

- 저장소 루트의 **`extension/`**. 익스텐션 하나는 한 폴더에만 있다 — 여러 폴더로 흩어지지 않는다.
- 자체 `package.json` 과 pnpm lockfile(`extension/pnpm-lock.yaml`)을 가진 하위 패키지다. 그래서 dependabot npm `directories` 에 `/extension` 이 들어간다(`references/repo-templates.md`).

### 익스텐션이 둘 이상인 저장소

예: auction2sell 의 내부용 `extension/` 과 배포용 `extension-public/`.

- 폴더 이름: 기본은 `extension/`, 추가분은 **`extension-<용도>/`**(예: `extension-public/`).
- **폴더마다 이 문서 전체를 따른다** — 자체 `package.json` · lockfile · WXT · `dist`/`dist-dev` · `public/icon/` 네 장 · 같은 스크립트 이름 · `README.md` 첫 절의 Chrome 로드 안내. 아래 절의 `extension/` 은 각 폴더 이름으로 바꿔 읽는다.
- dependabot npm `directories` 에 폴더마다 한 줄씩(`/extension` · `/extension-public` …) 넣는다.
- **앱 코드(컴포넌트 · 엔진)를 공유해야 하면 복사하지 않는다.** 저장소 루트 `src/` 를 alias 로 가져온다. 별도 번들러(esbuild 등)로 따로 묶지 않는다.
  - 앱 코드는 서로를 앱의 alias(보통 `@/…`)로 부른다. 그 import 가 그대로 풀리려면 익스텐션에서도 `@` 가 루트 `src/` 여야 하는데, WXT 는 `@` 를 자기 `srcDir` 로 잡고 설정에 적은 alias 보다 그 기본값을 우선한다. 그래서 설정이 정해진 뒤(`config:resolved` 훅)에 바꾼다 — vite resolve 와 `.wxt/tsconfig.json` 의 paths 가 함께 따른다.
  - 그러면 익스텐션 자신의 파일은 `@/` 로 부를 수 없다. 상대 경로로만 import 한다.
  - 앱 코드가 쓰는 react 등은 익스텐션 패키지의 것 하나로 묶는다(`resolve.dedupe`) — 두 벌이면 훅이 깨진다.
  ```ts
  import { fileURLToPath } from "node:url";
  const appSrc = fileURLToPath(new URL("../src", import.meta.url));
  export default defineConfig({
    // ...위 표준 항목
    vite: () => ({ resolve: { dedupe: ["react", "react-dom"] } }),
    hooks: {
      "config:resolved": (wxt) => {
        wxt.config.alias["@"] = appSrc;
      },
    },
  });
  ```
- 앱 화면을 함께 쓰는 익스텐션은 **앱과 같은 Tailwind 설정 · 같은 버전**을 쓴다(설정은 루트 것을 가져오거나 루트 설정을 확장). 버전이 갈리면 같은 컴포넌트가 다르게 그려진다.

## 스택

- **WXT 0.21.x** + TypeScript + vitest.
- 소스는 `extension/src`(`wxt.config.ts` 의 `srcDir: "src"`), 설정은 `extension/wxt.config.ts`.

## 빌드 결과물 폴더

WXT 기본값인 숨김 폴더 `.output` 은 쓰지 않는다 — Finder · 파일 선택 창에서 안 보여 Chrome 에 로드할 폴더를 찾기 어렵다. `wxt.config.ts` 에 `srcDir` 과 함께 아래 세 항목(`outDir` · `outDirTemplate` · `watchOptions`)을 둔다:

```ts
export default defineConfig({
  srcDir: "src",
  outDir: "dist",
  outDirTemplate: "../dist{{modeSuffix}}",
  // 개발 빌드 결과물이 다시 watch 를 깨우지 않게 한다
  watchOptions: { ignored: ["**/dist-dev/**"] },
  // ...
});
```

| 명령 | 결과 |
|---|---|
| `pnpm build` (운영) | `extension/dist/` — `manifest.json` 이 폴더 바로 안 |
| `pnpm build --mode development` (개발) | `extension/dist-dev/` |
| `pnpm zip` | `extension/dist/<name>-<버전>-chrome.zip` |

`extension/dist/` 와 `extension/dist-dev/` 는 git 에서 뺀다(WXT 가 만드는 `extension/.wxt/` 도 함께).

### 스토어용 묶음이 운영 빌드와 달라야 할 때

웹 스토어에 올리는 묶음에서 개발 서버 주소 · 권한을 빼야 하는 익스텐션은 **환경 변수**로 가른다(예: `zip` 스크립트가 `<접두>_STORE=1 wxt zip`). 사용자 정의 `--mode` 는 쓰지 않는다 — vite 가 압축 · `NODE_ENV` 를 운영과 다르게 다뤄 묶음 내용이 달라진다.

- 그 변수가 켜졌을 때만 `outDirTemplate` 을 `"../dist-store"` 로 바꾼다. zip 은 그대로 `extension/dist/<name>-<버전>-chrome.zip` 에 생긴다.
- 뺄 것은 `build:manifestGenerated` 훅에서 매니페스트를 고쳐 뺀다.
- `extension/dist-store/` 도 git 에서 뺀다.

## 아이콘 (필수)

- `extension/public/icon/16.png` · `32.png` · `48.png` · `128.png` 네 장.
- WXT 0.21 의 public 기본 위치는 익스텐션 폴더 바로 아래 `public/` 이다(`srcDir` 안이 아니다). 이 이름 · 위치면 WXT 가 매니페스트 `icons` 에 자동으로 등록하므로 매니페스트에 따로 적지 않는다.
- 투명 배경. 앱 아이콘에서 만든다.
- 앱 아이콘이 없으면 단색 둥근 사각형에 흰 글자 하나.
- 16px 에서 알아볼 수 있는지 눈으로 확인한다 — 툴바에 보이는 크기다.

## 스크립트 이름

`extension/package.json` 의 scripts 에는 이 여섯 이름이 반드시 있다: `dev` · `build` · `zip` · `typecheck` · `test` · `test:run`. 같은 일을 다른 이름으로 두지 않는다. 그 밖의 스크립트(예: `postinstall` 의 `wxt prepare`)는 더해도 된다.

## Chrome 로드

- `chrome://extensions` → 개발자 모드 → 「압축해제된 확장 프로그램 로드」 → `extension/dist` 를 고른다.
- 로드 폴더가 바뀐 설치본(예: 예전 `.output/chrome-mv3`)은 새로고침으로 바뀌지 않는다. **제거한 뒤 다시 로드**한다.
- 이 안내를 `extension/README.md` **첫 절**에 둔다.
- 고정 익스텐션 ID 가 필요하면(OAuth 리디렉션 · 서버 허용 목록 등) 매니페스트 `key` 로 고정한다.

## 대조

저장소 루트에서 실행한다. 익스텐션 폴더(`extension/` · `extension-*/`)마다 돈다. 빠진 항목이 있으면 표준과 다른 것이다.

```bash
for d in extension extension-*; do
  [ -d "$d" ] || continue
  echo "== $d"
  ls "$d"/package.json "$d"/pnpm-lock.yaml "$d"/wxt.config.ts "$d"/src >/dev/null
  grep -qE '"wxt": *"[~^]?0\.21\.' "$d"/package.json || echo "WXT 0.21.x 아님"
  # 따옴표는 " · ' 어느 쪽이든 된다
  for p in "srcDir: *[\"']src[\"']" "outDir: *[\"']dist[\"']" "outDirTemplate:.*[\"']\.\./dist\{\{modeSuffix\}\}[\"']" 'dist-dev'; do
    grep -qE "$p" "$d"/wxt.config.ts || echo "빠짐: $p"
  done
  ls "$d"/public/icon/{16,32,48,128}.png >/dev/null
  n=$(jq -r '.scripts | keys[]' "$d"/package.json | grep -cxE 'dev|build|zip|typecheck|test|test:run')
  [ "$n" = 6 ] || echo "스크립트 이름 $n/6"
  for f in "$d"/dist/manifest.json "$d"/dist-dev/manifest.json "$d"/.wxt/tsconfig.json; do
    git check-ignore -q "$f" || echo "git 제외 안 됨: $f"
  done
  # 스토어용 묶음을 따로 만드는 폴더만
  grep -q 'dist-store' "$d"/wxt.config.ts && { git check-ignore -q "$d"/dist-store/manifest.json || echo "git 제외 안 됨: $d/dist-store/manifest.json"; }
done
```
