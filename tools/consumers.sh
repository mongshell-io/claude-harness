#!/usr/bin/env bash
#
# consumers.sh [조직] — 이 저장소가 내보내는 것을 어느 저장소가 어떤 상태로 받고 있는지 한 표로 보여 준다.
#
# 왜: 하네스는 다섯 길(플러그인 · 재사용 워크플로 · composite action · git 의존성 · 복사하는 정본)로 퍼지고
#   길마다 낡는 방식이 다르다. 하네스를 고치기 전에 "누가 받는가", 고친 뒤에 "누가 낡았는가" 를 손으로 세지 않는다.
#   목록을 문서에 적어 두지 않는 이유도 같다 — 저장소가 늘거나 줄 때마다 낡는다.
#
# 읽기 전용이다. 각 저장소 기본 브랜치의 파일을 GitHub API 로 읽는다(로컬 체크아웃 · 브랜치 상태와 무관).
# 필요: gh(로그인) · jq. 정본은 이 스크립트가 있는 체크아웃의 작업 트리에서 읽는다.
#
# 열:
#   plugin    .claude/settings.json 이 mongshell-dev 를 켰는가            on | off | -
#   core      루트 CLAUDE.md 의 harness-core 마커                          =(정본과 같음) | 낡음:<값> | -
#   automerge .github/workflows/automerge.yml 이 공용 워크플로를 부르는가   @main | <다른 ref> | -
#   setup     워크플로가 setup-node-pnpm 을 부르는가                        @main | <다른 ref> | -
#   checks    lockfile 에 고정된 @mongshell/checks 커밋                     =(checks/ 최신 커밋) | 뒤처짐:<sha> | -
#   pr-tpl    .github/pull_request_template.md 가 정본과 같은가             = | 다름 | -
#   settings  .claude/settings.json 이 정본과 같은가(키 정렬 후)            = | 다름 | -
#   dependabot .github/dependabot.yml 이 정본과 다른 줄 수                  =(0) | <줄 수> | -   (directories · 저장소 고유 ignore 는 허용 차이)
#
# exit 0 = 표를 냈다(드리프트가 있어도 0 — 판정은 읽는 쪽). exit 1 = gh · jq 없음 또는 조직 조회 실패.
#
set -euo pipefail

ORG="${1:-mongshell-io}"
SELF="claude-harness"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TPL="$ROOT/plugins/mongshell-dev/templates"

command -v gh >/dev/null || { echo "gh 가 없습니다" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq 가 없습니다" >&2; exit 1; }

CORE_SSOT=$(grep -o 'harness-core: [0-9-]*' "$ROOT/plugins/mongshell-dev/references/claude-md-core.md" | head -1 | sed 's/harness-core: //')
CHECKS_SSOT=$(git -C "$ROOT" log -1 --format=%H origin/main -- checks 2>/dev/null || git -C "$ROOT" log -1 --format=%H -- checks)

# 저장소 기본 브랜치의 파일 내용(stdout). 없으면 exit 1.
raw() { gh api -H 'Accept: application/vnd.github.raw' "repos/$ORG/$1/contents/$2" 2>/dev/null; }

# 워크플로 파일들에서 하네스 참조의 ref 를 모은다 (예: @main). 없으면 빈 값.
ref_of() { # <저장소> <하네스 경로 조각>
	local repo="$1" needle="$2" f
	for f in $(gh api "repos/$ORG/$repo/contents/.github/workflows" -q '.[].name' 2>/dev/null); do
		raw "$repo" ".github/workflows/$f" | grep -o "$ORG/$SELF/$needle@[A-Za-z0-9._/-]*" || true
	done | sed 's/.*@/@/' | sort -u | paste -sd, -
}

row() {
	local repo="$1" settings claude lock v plugin core automerge setup checks prtpl sset dep
	settings=$(raw "$repo" .claude/settings.json || true)
	claude=$(raw "$repo" CLAUDE.md || true)

	plugin=-
	if [ -n "$settings" ]; then
		v=$(printf '%s' "$settings" | jq -r '.enabledPlugins["mongshell-dev@mongshell"] // empty' 2>/dev/null || true)
		case "$v" in true) plugin=on ;; false) plugin=off ;; esac
	fi

	core=-
	v=$(printf '%s' "$claude" | grep -o 'harness-core: [0-9-]*' | head -1 | sed 's/harness-core: //' || true)
	if [ -n "$v" ]; then [ "$v" = "$CORE_SSOT" ] && core='=' || core="낡음:$v"; fi

	automerge=$(ref_of "$repo" '.github/workflows/automerge.yml'); automerge=${automerge:--}
	setup=$(ref_of "$repo" '.github/actions/setup-node-pnpm'); setup=${setup:--}

	checks=-
	lock=$(raw "$repo" pnpm-lock.yaml || true)
	v=$(printf '%s' "$lock" | grep -o "$ORG/$SELF/tar\.gz/[0-9a-f]\{40\}" | head -1 | sed 's|.*/||' || true)
	if [ -n "$v" ]; then [ "$v" = "$CHECKS_SSOT" ] && checks='=' || checks="뒤처짐:${v:0:7}"; fi

	prtpl=-
	if v=$(raw "$repo" .github/pull_request_template.md); then
		[ "$v" = "$(cat "$TPL/pull_request_template.md")" ] && prtpl='=' || prtpl=다름
	fi

	sset=-
	if [ -n "$settings" ]; then
		[ "$(printf '%s' "$settings" | jq -S . 2>/dev/null)" = "$(jq -S . "$TPL/claude-settings.json")" ] && sset='=' || sset=다름
	fi

	dep=-
	if v=$(raw "$repo" .github/dependabot.yml); then
		dep=$(diff <(cat "$TPL/dependabot.yml") <(printf '%s\n' "$v") | grep -c '^[<>]' || true)
		[ "$dep" = 0 ] && dep='='
	fi

	printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$repo" "$plugin" "$core" "$automerge" "$setup" "$checks" "$prtpl" "$sset" "$dep"
}

REPOS=$(gh repo list "$ORG" --no-archived --limit 200 --json name -q '.[].name' | grep -vx "$SELF" | sort) ||
	{ echo "조직 저장소 목록을 읽지 못했습니다: $ORG" >&2; exit 1; }

{
	printf 'repo\tplugin\tcore\tautomerge\tsetup\tchecks\tpr-tpl\tsettings\tdependabot\n'
	for r in $REPOS; do row "$r"; done
} | column -t -s "$(printf '\t')"

printf '\n정본: harness-core %s · checks %s\n' "$CORE_SSOT" "${CHECKS_SSOT:0:7}"
