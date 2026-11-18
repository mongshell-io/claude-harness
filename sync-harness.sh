#!/usr/bin/env bash
#
# sync-harness.sh — 공유 하네스의 **vendored 예외 채널**.
#
# 기본 배포는 플러그인(mongshell-dev)이다. 이 스크립트는 플러그인을 설치하지 않는
# 소비 프로젝트(예: 협업 저장소)에 한해, 플러그인 소스를 프로젝트 `.claude/` 로
# 렌더링해 커밋 가능한 사본을 만든다.
#
#   ./sync-harness.sh sync  <프로젝트경로>   plugins/mongshell-dev → <프로젝트>/.claude/
#   ./sync-harness.sh check <프로젝트경로>   쓰지 않고 차이만 보고 (exit 1 = 드리프트)
#
# 렌더 규칙:
#   - 파일 상단에 "직접 수정 금지" 배너 삽입 (frontmatter/shebang 뒤).
#     배너는 중립 문구 — 플러그인·저장소 이름을 노출하지 않는다.
#   - `${CLAUDE_PLUGIN_ROOT}` 를 `.claude` 로 치환 — 본문 경로 정본은 플러그인
#     컨텍스트이고, vendored 사본에서는 같은 상대 구조가 .claude/ 아래에 있다.
#   - 플러그인 메타(.claude-plugin/)는 배포하지 않는다.
#   - 앱 저장소 설정 정본(templates/)은 배포하지 않는다 — 저장소 루트 경로로 복사해 쓰는
#     파일이라 .claude/ 사본이 필요 없고, 배너가 JSON·YAML 을 깨뜨린다.
#
# 프로젝트 소유 파일(PROJECT_OWNED)은 sync 가 절대 건드리지 않는다.
#
set -euo pipefail

SSOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_DIR="$SSOT_DIR/plugins/mongshell-dev"

# `.claude/` 안에 있지만 프로젝트가 소유하는 것 — sync 대상도, 고아 후보도 아니다.
PROJECT_OWNED="browser-scenarios.md launch.json settings.json settings.local.json"

die() { printf '\033[31m%s\033[0m\n' "$*" >&2; exit 1; }
info() { printf '%s\n' "$*"; }

usage() {
	sed -n '3,20p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
	exit 2
}

# 배포본 상단에 붙일 배너 — 중립 문구 (저장소·플러그인 이름 비노출).
banner_for() {
	local rel="$1"
	case "$rel" in
	*.md)
		printf '<!-- 생성물 — 직접 수정하지 마세요.\n'
		printf '     공유 하네스 SSOT 에서 배포됩니다 — 수정은 SSOT 저장소에서 하고 재배포하세요. -->\n'
		;;
	*)
		printf '// 생성물 — 직접 수정하지 마세요.\n'
		printf '// 공유 하네스 SSOT 에서 배포됩니다 — 수정은 SSOT 저장소에서 하고 재배포하세요.\n'
		;;
	esac
}

# 배너 삽입 위치: frontmatter 는 닫는 --- 뒤, shebang 은 1행 뒤 (둘 다 위치 제약).
render_raw() {
	local src="$1" rel="$2" fm_end
	if [ "$(head -1 "$src")" = "---" ]; then
		fm_end="$(awk 'NR>1 && $0=="---" {print NR; exit}' "$src")"
		[ -n "$fm_end" ] || die "frontmatter 가 닫히지 않았습니다: $rel"
		head -n "$fm_end" "$src"
		printf '\n'
		banner_for "$rel"
		tail -n "+$((fm_end + 1))" "$src"
	elif [ "$(head -c 2 "$src")" = '#!' ]; then
		# shebang 은 1행에서만 유효 — shebang 뒤에 배너를 넣는다.
		head -n 1 "$src"
		banner_for "$rel"
		tail -n +2 "$src"
	else
		banner_for "$rel"
		printf '\n'
		cat "$src"
	fi
}

# 최종 렌더 = 배너 삽입 + 플러그인 경로 정본을 vendored 경로로 치환.
render() {
	render_raw "$@" | sed -e 's|\${CLAUDE_PLUGIN_ROOT}|.claude|g'
}

harness_files() {
	(cd "$HARNESS_DIR" && find . -type f ! -name '.DS_Store' ! -path './.claude-plugin/*' ! -path './templates/*' | sed 's|^\./||' | sort)
}

is_project_owned() {
	local rel="$1" owned
	for owned in $PROJECT_OWNED; do
		[ "$rel" = "$owned" ] && return 0
	done
	return 1
}

resolve_target() {
	local proj="$1"
	[ -d "$proj" ] || die "프로젝트 경로가 없습니다: $proj"
	# .git 은 일반 repo 에선 디렉토리, worktree 에선 파일 — git 자체에 판정을 맡긴다.
	git -C "$proj" rev-parse --is-inside-work-tree >/dev/null 2>&1 || die "git repo 가 아닙니다: $proj"
	(cd "$proj" && pwd)
}

cmd_sync() {
	local proj rel src dst tmp written=0 skipped=0
	proj="$(resolve_target "$1")"
	info "소스   : $HARNESS_DIR"
	info "대상   : $proj/.claude/"
	info ""

	tmp="$(mktemp)"
	trap 'rm -f "$tmp"' RETURN

	for rel in $(harness_files); do
		if is_project_owned "$rel"; then
			skipped=$((skipped + 1))
			continue
		fi
		src="$HARNESS_DIR/$rel"
		dst="$proj/.claude/$rel"
		render "$src" "$rel" >"$tmp"
		if [ -f "$dst" ] && cmp -s "$tmp" "$dst"; then
			continue
		fi
		mkdir -p "$(dirname "$dst")"
		cp "$tmp" "$dst"
		info "  갱신  .claude/$rel"
		written=$((written + 1))
	done

	# vendored 마커 — 하네스 루트 감지($H)의 센티널. 스킬 구성이 바뀌어도 안정.
	if [ ! -f "$proj/.claude/.harness" ]; then
		printf '# vendored harness 마커 — sync-harness.sh 가 생성. 삭제하지 마세요 (하네스 루트 감지용).\n' > "$proj/.claude/.harness"
		info "  갱신  .claude/.harness (vendored 마커)"
		written=$((written + 1))
	fi

	info ""
	if [ "$written" -eq 0 ]; then
		info "이미 최신입니다 (변경 0건)."
	else
		info "$written 개 파일을 갱신했습니다."
	fi
	[ "$skipped" -eq 0 ] || info "프로젝트 소유 $skipped 개는 건드리지 않았습니다."
	info ""
	info "다음: 프로젝트에서 git diff 로 확인 후 커밋하세요 — 협업자는 이 커밋으로 하네스를 받습니다."
}

cmd_check() {
	local proj rel src dst tmp drift=0 missing=0
	proj="$(resolve_target "$1")"
	tmp="$(mktemp)"
	trap 'rm -f "$tmp"' RETURN

	[ -f "$proj/.claude/.harness" ] || { info "  없음  .claude/.harness (vendored 마커)"; missing=$((missing + 1)); }

	for rel in $(harness_files); do
		is_project_owned "$rel" && continue
		src="$HARNESS_DIR/$rel"
		dst="$proj/.claude/$rel"
		if [ ! -f "$dst" ]; then
			info "  없음  .claude/$rel"
			missing=$((missing + 1))
			continue
		fi
		render "$src" "$rel" >"$tmp"
		if ! cmp -s "$tmp" "$dst"; then
			info "  드리프트  .claude/$rel"
			diff -u "$tmp" "$dst" | sed -n '3,12p' | sed 's/^/      /' || true
			drift=$((drift + 1))
		fi
	done

	if [ "$drift" -eq 0 ] && [ "$missing" -eq 0 ]; then
		info "정합합니다 — 공유 하네스와 차이가 없습니다."
		return 0
	fi
	info ""
	info "드리프트 $drift 건, 미배포 $missing 건."
	info "배포본을 직접 고쳤다면 그 변경을 SSOT 저장소로 옮긴 뒤 sync 하세요."
	return 1
}

[ $# -eq 2 ] || usage
case "$1" in
sync) cmd_sync "$2" ;;
check) cmd_check "$2" ;;
*) usage ;;
esac
