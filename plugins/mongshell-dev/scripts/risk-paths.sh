#!/usr/bin/env bash
#
# risk-paths.sh [저장소 루트] [기준 브랜치] — 위험 경로 정규식을 저장소 문서·설정에서 결정적으로 뽑는다.
#
# 배경: /qa marker 의 「위험 경로」 패턴을 세션이 손으로 치환하면 빠뜨림이 조용히 fail-open 이 된다
#   (Low 제안). 값의 권위는 루트 CLAUDE.md 작업 규약 코어 「정책 노브」(claude-md-core.md 정본) 이므로
#   거기서 직접 읽는다. 출처:
#     HUMAN — 「**사람이 머지** = `a/`·`b.ts`… 가 바뀐 PR」 문장의 백틱 경로.
#             없으면 `.github/workflows/automerge.yml` 의 `deny_paths:` (그 집행값) 를 그대로 쓴다.
#     HIGH  — 「**High 경로** = `…`… 가 바뀐 PR」 문장의 백틱 경로 (없으면 비움).
#   CLAUDE.md 는 가능하면 **기준 브랜치의 것**(`git show origin/<base>:CLAUDE.md`)을 읽는다 — PR 이 자기
#   정책 노브를 고쳐 위험 경로를 줄이지 못하게. 작업 트리 CLAUDE.md 의 집합이 다르면 stderr 로 경고한다.
#   기준 브랜치 ref 가 없으면(오프라인 · 새 저장소) 작업 트리 CLAUDE.md 를 읽는다.
#   HUMAN 의 경로 집합과 deny_paths 의 갈래 집합이 다르면 stderr 로 경고한다
#   (정책 노브 = 권위, deny_paths = 집행 — 드리프트 감지만, 판정은 사람).
#   deny_paths 는 작업 트리의 호출 파일에서 읽는다(CLAUDE.md 와 달리 기준 브랜치를 보지 않는다). 쓰이는 곳은
#   드리프트 경고와, 정책 노브 문장이 없을 때의 HUMAN 폴백이다. 호출 파일을 바꾸는 PR 은 공용 automerge 가
#   항상 거부하므로(.github/workflows/) PR 이 이 값을 고쳐도 자동 머지 범위는 넓어지지 않는다 — 달라지는 것은
#   marker 에 찍히는 「사람이 머지」 줄뿐이다.
#
# 경로 → ERE: `/` 로 끝나면 디렉토리 접두(`dir/`), 아니면 파일(`file$`). 메타문자는 이스케이프.
#   POSIX ERE 만 쓴다 — 러너·로컬의 BSD/GNU grep 이 같게 읽도록.
#
# 출력 (stdout, 두 줄):
#   HUMAN=^(…)                       사람이 머지 집합 (자동 머지 거부)
#   RISKY=^\.github/|^(…)|^(…)       위험 경로 = .github/ ∪ HUMAN ∪ HIGH
# exit 0 = 성공
# exit 1 = fail-closed (호출자는 marker 를 쓰지 않는다):
#   사람이 머지 집합을 어느 출처에서도 못 찾음 · 문장에 `<…>` 자리표시가 남음 · 머리는 있는데 종결자 `가 바뀐 PR` 이 없음
#
set -euo pipefail

ROOT="${1:-.}"
BASE="${2:-}"
CALLER="$ROOT/.github/workflows/automerge.yml"
END='가 바뀐 PR'

warn() { printf '경고: %s\n' "$*" >&2; }
fail() { printf '%s\n' "$*" >&2; exit 1; }

# 기준 브랜치: 인자 > origin/HEAD > main
if [ -z "$BASE" ]; then
	BASE=$(git -C "$ROOT" symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || true)
	BASE="${BASE:-main}"
fi

# 문서 텍스트(stdin) 를 한 줄로 펴서(줄바꿈 → 공백, 연속 공백 접기) 「<머리> … 가 바뀐 PR」 구간을 출력한다.
#   머리 없음 → 빈 출력 · exit 0 / 머리는 있는데 종결자 없음 → exit 2
segment() {
	tr '\n\t' '  ' | tr -s ' ' |
		awk -v h="$1" -v e="$END" '{ i = index($0, h); if (i == 0) exit 0; s = substr($0, i + length(h)); j = index(s, e); if (j == 0) exit 2; print substr(s, 1, j - 1) }'
}

# 구간 → 백틱 경로(줄당 하나). 괄호 설명 안의 백틱은 정본 규약상 쓰지 않는다 (claude-md-core.md 안내).
#   자리표시(`<`)가 남아 있으면 fail (exit 1).
paths_of() {
	local text="$1" head="$2" seg rc=0
	seg=$(printf '%s' "$text" | segment "$head") || rc=$?
	[ "$rc" = 0 ] || fail "「${head}」 문장의 종결자 「${END}」 를 찾지 못함 — 정책 노브 문장 형식을 확인 (claude-md-core.md 「경로 나열 형식」)"
	case "$seg" in *'<'*) fail "「${head}」 문장에 자리표시 <…> 가 남아 있음 — 프로젝트 값으로 채울 것 (claude-md-core.md 자리표시 표)";; esac
	printf '%s' "$seg" | grep -o '`[^`]*`' | tr -d '`' || true
}

# 경로 목록(줄당 하나) → ERE 갈래(줄당 하나)
to_branches() {
	sed -e 's/[].[^$*+?(){}|\\]/\\&/g' -e '/\/$/!s/$/$/'
}

join_alt() { paste -sd'|' -; }

# 문서 원천: 기준 브랜치 CLAUDE.md 우선, 없으면 작업 트리
DOC_TEXT=""
WORK_TEXT=""
[ -f "$ROOT/CLAUDE.md" ] && WORK_TEXT=$(cat "$ROOT/CLAUDE.md")
if DOC_TEXT=$(git -C "$ROOT" show "origin/$BASE:CLAUDE.md" 2>/dev/null); then
	:
else
	DOC_TEXT="$WORK_TEXT"
fi

HUMAN_PATHS=$(paths_of "$DOC_TEXT" '**사람이 머지** =')
HIGH_PATHS=$(paths_of "$DOC_TEXT" '**High 경로** =')

# 작업 트리가 정책 노브 집합을 바꿨으면 경고 (판정은 기준 브랜치 값으로 한다)
if [ -n "$WORK_TEXT" ] && [ "$WORK_TEXT" != "$DOC_TEXT" ]; then
	w_human=$(paths_of "$WORK_TEXT" '**사람이 머지** =')
	w_high=$(paths_of "$WORK_TEXT" '**High 경로** =')
	[ "$(printf '%s\n' "$w_human" | sort)" = "$(printf '%s\n' "$HUMAN_PATHS" | sort)" ] ||
		warn "작업 트리 CLAUDE.md 가 「사람이 머지」 집합을 바꿨다 — 판정은 origin/$BASE 값으로 한다 (머지 뒤부터 새 집합)"
	[ "$(printf '%s\n' "$w_high" | sort)" = "$(printf '%s\n' "$HIGH_PATHS" | sort)" ] ||
		warn "작업 트리 CLAUDE.md 가 「High 경로」 집합을 바꿨다 — 판정은 origin/$BASE 값으로 한다 (머지 뒤부터 새 집합)"
fi

DENY=""
if [ -f "$CALLER" ]; then
	DENY=$(sed -n "s/^[[:space:]]*deny_paths:[[:space:]]*'\(.*\)'[[:space:]]*\$/\1/p" "$CALLER" | head -1)
	# 값이 있는 줄만 본다 — 재사용 워크플로 자신(inputs 정의의 빈 `deny_paths:`)은 호출 파일이 아니다.
	if [ -z "$DENY" ] && grep -q '^[[:space:]]*deny_paths:[[:space:]]*[^[:space:]]' "$CALLER"; then
		warn "$CALLER 의 deny_paths 를 읽지 못함 — 한 줄 홑따옴표 형식(deny_paths: '^(…)')만 읽는다 (automerge-wiring.md)"
	fi
fi

if [ -n "$HUMAN_PATHS" ]; then
	HUMAN="^($(printf '%s\n' "$HUMAN_PATHS" | to_branches | join_alt))"
	if [ -n "$DENY" ]; then
		mine=$(printf '%s\n' "$HUMAN_PATHS" | to_branches | sort)
		theirs=$(printf '%s\n' "$DENY" | sed -e 's/^\^(//' -e 's/)$//' | tr '|' '\n' | sort)
		[ "$mine" = "$theirs" ] ||
			warn "CLAUDE.md 「사람이 머지」 ($HUMAN) 와 automerge.yml deny_paths ($DENY) 가 다르다 — 권위는 CLAUDE.md, 호출 파일을 맞출 것"
	fi
elif [ -n "$DENY" ]; then
	HUMAN="$DENY"
else
	fail "사람이 머지 집합 미발견 — 루트 CLAUDE.md 정책 노브에 「**사람이 머지** = \`…\` ${END}」 문장이 없고 $CALLER 의 deny_paths 도 없다"
fi

RISKY="^\\.github/|$HUMAN"
if [ -n "$HIGH_PATHS" ]; then
	RISKY="$RISKY|^($(printf '%s\n' "$HIGH_PATHS" | to_branches | join_alt))"
fi

printf 'HUMAN=%s\n' "$HUMAN"
printf 'RISKY=%s\n' "$RISKY"
