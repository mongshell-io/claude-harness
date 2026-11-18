#!/usr/bin/env bash
#
# risk-paths.sh [저장소 루트] — 위험 경로 정규식을 저장소 문서·설정에서 결정적으로 뽑는다.
#
# 배경: /qa marker 의 「위험 경로」 패턴을 세션이 손으로 치환하면 빠뜨림이 조용히 fail-open 이 된다
#   (Low 제안). 값의 권위는 루트 CLAUDE.md 작업 규약 코어 「정책 노브」(claude-md-core.md 정본) 이므로
#   거기서 직접 읽는다. 출처:
#     HUMAN — 「**사람이 머지** = `a/`·`b.ts`… 가 바뀐 PR」 문장의 백틱 경로.
#             없으면 `.github/workflows/automerge.yml` 의 `deny_paths:` (그 집행값) 를 그대로 쓴다.
#     HIGH  — 「**High 경로** = `…`… 가 바뀐 PR」 문장의 백틱 경로 (없으면 비움).
#   두 출처가 모두 있으면 HUMAN 의 경로 집합과 deny_paths 의 갈래 집합을 대조해 다르면 stderr 로 경고한다
#   (정책 노브 = 권위, deny_paths = 집행 — 드리프트 감지만, 판정은 사람).
#
# 경로 → ERE: `/` 로 끝나면 디렉토리 접두(`dir/`), 아니면 파일(`file$`). 메타문자는 이스케이프.
#   POSIX ERE 만 쓴다 — 러너·로컬의 BSD/GNU grep 이 같게 읽도록.
#
# 출력 (stdout, 두 줄):
#   HUMAN=^(…)                       사람이 머지 집합 (자동 머지 거부)
#   RISKY=^\.github/|^(…)|^(…)       위험 경로 = .github/ ∪ HUMAN ∪ HIGH
# exit 0 = 성공 / exit 1 = 사람이 머지 집합을 어느 출처에서도 찾지 못함 (fail-closed — 호출자는 marker 를 쓰지 않는다)
#
set -euo pipefail

ROOT="${1:-.}"
DOC="$ROOT/CLAUDE.md"
CALLER="$ROOT/.github/workflows/automerge.yml"

# 문서를 한 줄로 펴서(줄바꿈 → 공백) 「<머리> = … 가 바뀐 PR」 구간의 백틱 토큰을 한 줄에 하나씩 뽑는다.
# 괄호 설명 안의 백틱은 정본 규약상 쓰지 않는다 (claude-md-core.md 안내).
paths_after() {
	local head="$1"
	[ -f "$DOC" ] || return 0
	tr '\n' ' ' <"$DOC" |
		awk -v h="$head" '{ i = index($0, h); if (i == 0) exit; s = substr($0, i + length(h)); j = index(s, "가 바뀐 PR"); if (j > 0) s = substr(s, 1, j - 1); print s }' |
		grep -o '`[^`]*`' | tr -d '`' || true
}

# 경로 목록(줄당 하나) → ERE 갈래(줄당 하나)
to_branches() {
	sed -e 's/[].[^$*+?(){}|\\]/\\&/g' -e '/\/$/!s/$/$/'
}

join_alt() { paste -sd'|' -; }

HUMAN_PATHS=$(paths_after '**사람이 머지** =')
HIGH_PATHS=$(paths_after '**High 경로** =')

DENY=""
if [ -f "$CALLER" ]; then
	DENY=$(sed -n "s/^[[:space:]]*deny_paths:[[:space:]]*'\(.*\)'[[:space:]]*\$/\1/p" "$CALLER" | head -1)
fi

if [ -n "$HUMAN_PATHS" ]; then
	HUMAN="^($(printf '%s\n' "$HUMAN_PATHS" | to_branches | join_alt))"
	if [ -n "$DENY" ]; then
		mine=$(printf '%s\n' "$HUMAN_PATHS" | to_branches | sort)
		theirs=$(printf '%s\n' "$DENY" | sed -e 's/^\^(//' -e 's/)$//' | tr '|' '\n' | sort)
		[ "$mine" = "$theirs" ] ||
			printf '경고: CLAUDE.md 「사람이 머지」 (%s) 와 automerge.yml deny_paths (%s) 가 다르다 — 권위는 CLAUDE.md, 호출 파일을 맞출 것\n' "$HUMAN" "$DENY" >&2
	fi
elif [ -n "$DENY" ]; then
	HUMAN="$DENY"
else
	printf '사람이 머지 집합 미발견 — 루트 CLAUDE.md 정책 노브에 「**사람이 머지** = `…` 가 바뀐 PR」 문장이 없고 %s 의 deny_paths 도 없다\n' "$CALLER" >&2
	exit 1
fi

RISKY="^\\.github/|$HUMAN"
if [ -n "$HIGH_PATHS" ]; then
	RISKY="$RISKY|^($(printf '%s\n' "$HIGH_PATHS" | to_branches | join_alt))"
fi

printf 'HUMAN=%s\n' "$HUMAN"
printf 'RISKY=%s\n' "$RISKY"
