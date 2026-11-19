---
role: "mongshell-io 앱 저장소의 브라우저 익스텐션 구조 표준 — 폴더(`extension/`) · 스택(WXT 0.21.x) · 빌드 결과물 폴더(`extension/dist`) · 아이콘 · 스크립트 이름 · Chrome 로드 안내."
kind: operational
non_goals:
  - "익스텐션 기능 · 매니페스트 권한(permissions · host_permissions) · content script 범위 — 각 저장소가 권위"
  - "Chrome 웹 스토어 배포 · 심사 절차"
  - "dependabot directories 등 저장소 설정 정본 — `references/repo-templates.md` 가 권위"
  - "CI 잡 모양 — `references/ci-setup-wiring.md` 가 권위"
---

# 브라우저 익스텐션 구조 표준

브라우저 익스텐션이 있는 mongshell-io 앱 저장소(sellcaddie · k2sell · quick2sell · auction2sell 등)는 모두 이 구조를 따른다. 저장소마다 빌드 도구 · 폴더 · 아이콘 상태가 달라 관리자가 매번 다르게 손보던 시간을 없애려는 것이다(스택을 일정하게). 표준 확정 2026-11-19.

## 위치

- 저장소 루트의 **`extension/` 하나**. 익스텐션이 둘 이상 폴더로 흩어지지 않는다.
- 자체 `package.json` 과 pnpm lockfile(`extension/pnpm-lock.yaml`)을 가진 하위 패키지다. 그래서 dependabot npm `directories` 에 `/extension` 이 들어간다(`references/repo-templates.md`).

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

## 아이콘 (필수)

- `extension/public/icon/16.png` · `32.png` · `48.png` · `128.png` 네 장.
- WXT 0.21 의 public 기본 위치는 익스텐션 폴더 바로 아래 `public/` 이다(`srcDir` 안이 아니다). 이 이름 · 위치면 WXT 가 매니페스트 `icons` 에 자동으로 등록하므로 매니페스트에 따로 적지 않는다.
- 투명 배경. 앱 아이콘에서 만든다.
- 앱 아이콘이 없으면 단색 둥근 사각형에 흰 글자 하나(quick2sell 의 「Q」가 사례).
- 16px 에서 알아볼 수 있는지 눈으로 확인한다 — 툴바에 보이는 크기다.

## 스크립트 이름

`extension/package.json` 의 scripts 에는 이 여섯 이름이 반드시 있다: `dev` · `build` · `zip` · `typecheck` · `test` · `test:run`. 같은 일을 다른 이름으로 두지 않는다. 그 밖의 스크립트(예: `postinstall` 의 `wxt prepare`)는 더해도 된다.

## Chrome 로드

- `chrome://extensions` → 개발자 모드 → 「압축해제된 확장 프로그램 로드」 → `extension/dist` 를 고른다.
- 로드 폴더가 바뀐 설치본(예: 예전 `.output/chrome-mv3`)은 새로고침으로 바뀌지 않는다. **제거한 뒤 다시 로드**한다.
- 이 안내를 `extension/README.md` **첫 절**에 둔다.
- 고정 익스텐션 ID 가 필요하면(OAuth 리디렉션 · 서버 허용 목록 등) 매니페스트 `key` 로 고정한다.

## 대조

저장소 루트에서 실행한다. 빠진 항목이 있으면 표준과 다른 것이다.

```bash
ls extension/package.json extension/pnpm-lock.yaml extension/wxt.config.ts extension/src >/dev/null
grep -E '"wxt": *"[~^]?0\.21\.' extension/package.json
# 따옴표는 " · ' 어느 쪽이든 된다
for p in "srcDir: *[\"']src[\"']" "outDir: *[\"']dist[\"']" "outDirTemplate: *[\"']\.\./dist\{\{modeSuffix\}\}[\"']" 'dist-dev'; do
  grep -qE "$p" extension/wxt.config.ts || echo "빠짐: $p"
done
ls extension/public/icon/{16,32,48,128}.png
jq -r '.scripts | keys[]' extension/package.json | grep -xE 'dev|build|zip|typecheck|test|test:run' | wc -l   # 6
for f in extension/dist/manifest.json extension/dist-dev/manifest.json extension/.wxt/tsconfig.json; do
  git check-ignore -q "$f" || echo "git 제외 안 됨: $f"
done
```
