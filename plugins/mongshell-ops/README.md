# mongshell-ops

Mongshell 운영 도구 플러그인. 개발 하네스(`mongshell-dev`)와 달리 특정 저장소의 개발 절차가 아니라, 이 사람이 운영하는 외부 시스템과 Claude Code 를 잇는다.

| 구성 | 역할 |
|---|---|
| `skills/openclaw/SKILL.md` | OpenClaw 에게 요청 → 답 대기 → 판정 흐름과 승인 정책 |
| `scripts/openclaw-slack` | Slack Web API 호출 (`ask` / `wait` / `read` / `recent`). Python 3 표준 라이브러리만 쓴다 |

## 구조

```
Claude Code ──(openclaw-slack, 봇 토큰)──▶ Slack OpenClaw 채널
                                            │  OpenClaw 봇 멘션
                                            ▼
                                        OpenClaw (서버 맥) ──▶ 스레드 답글
Claude Code ◀──(openclaw-slack wait)──────────────────────────┘
```

| 항목 | 값 |
|---|---|
| Slack 워크스페이스 | Onuheim |
| 채널 | `C0650TKLGJ0` |
| OpenClaw 봇 | 사용자 ID `U0C8Z50KM6K` |
| 운영자 본인 | 사용자 ID `U064VMBS36H` — 스크립트가 이 ID 의 글만 `운영자(본인)` 으로 표시한다 |
| Claude Code 봇 | Slack 앱 **Mongshell-Claude** (`A0CA46T34J3`, 봇 사용자 `U0CAE9CTTDK`) |
| 토큰 위치 | 각 PC 의 macOS 키체인 — account `claude`, service `slack-onuheim-claude-bot` |

채널·봇 이름은 Slack 에서 바꿀 수 있지만 스크립트는 ID 만 쓰므로 영향이 없다. ID 는 토큰 없이는 아무것도 할 수 없는 식별자라 이 공개 저장소에 둔다. **토큰은 어떤 경우에도 커밋하지 않는다.** 다른 워크스페이스·채널로 바꾸려면 환경변수 `OPENCLAW_SLACK_CHANNEL`·`OPENCLAW_SLACK_AGENT`·`OPENCLAW_SLACK_OWNER` 로 덮어쓴다.

### OpenClaw 쪽 전제

OpenClaw 는 기본으로 다른 봇의 글을 무시한다. 이 채널에만 봇의 멘션을 받도록 켜 두었다 (2026-10-20, 서버 맥 `~/.openclaw/openclaw.json`).

```json
"channels": { "slack": { "channels": { "C0650TKLGJ0": { "requireMention": true, "allowBots": "mentions" } } } }
```

설정을 바꾸면 게이트웨이 재시작이 필요하다 — 서버 맥에서 `openclaw gateway restart`, 또는 주인 계정이 Slack 에서 맨 앞에 공백 한 칸을 넣은 `/restart` 를 보낸다. OpenClaw 브라우저가 켜져 있으면 설정 반영이 미뤄질 수 있다.

⚠️ `allowBots: "mentions"` 는 Mongshell-Claude 만이 아니라 **이 채널에 들어온 모든 봇의 멘션**을 받는다. OpenClaw 는 서버 맥에서 셀러 계정 브라우저까지 다루므로, 이 채널에 다른 앱·웹훅을 초대하지 않는다. OpenClaw 가 발신자 허용 목록을 지원하면 `U0CAE9CTTDK` 로 좁히는 것이 낫다.

## 새 PC 셋업

1. 플러그인 설치 (`mongshell` 마켓플레이스를 이미 쓰는 PC 는 첫 줄 대신 `/plugin marketplace update mongshell`)

   ```
   /plugin marketplace add mongshellio/claude-harness
   /plugin install mongshell-ops@mongshell
   ```

2. 봇 토큰을 키체인에 넣는다. 토큰은 https://api.slack.com/apps → **Mongshell-Claude** → OAuth & Permissions 의 **Bot User OAuth Token**(`xoxb-…`)에서 언제든 다시 볼 수 있다. 아래를 실행하면 `security` 가 입력을 숨긴 채 두 번 묻는다 — 토큰이 명령행 인자로 남지 않는다.

   ```bash
   security add-generic-password -a claude -s slack-onuheim-claude-bot -U -w
   ```

   Claude Code 가 토큰을 직접 꺼내 보지 못하게 하려면 사용자 설정(`~/.claude/settings.json`)의 `permissions.deny` 에 `"Bash(security find-generic-password:*)"` 를 넣는다. 스크립트는 Bash 도구가 아니라 자체 프로세스로 키체인을 읽으므로 이 규칙에 막히지 않는다.

   macOS 가 아니면 키체인 대신 환경변수 `OPENCLAW_SLACK_TOKEN` 을 쓴다.

3. 확인 — 채널 최근 글이 보이면 끝이다.

   ```bash
   "$(python3 -c 'import json,os;print(json.load(open(os.path.expanduser("~/.claude/plugins/installed_plugins.json")))["plugins"]["mongshell-ops@mongshell"][0]["installPath"])')/scripts/openclaw-slack" recent --limit 3
   ```

## 문제 해결

| 증상 | 원인 · 조치 |
|---|---|
| 종료 코드 4 "봇 토큰이 없습니다" | 이 PC 키체인에 토큰이 없다 → 새 PC 셋업 2번 |
| `invalid_auth` · `token_revoked` | 앱을 재설치했거나 토큰이 바뀌었다 → 새 토큰으로 2번 다시 |
| `not_in_channel` | 봇이 채널 멤버가 아니다 → 채널에서 `/invite @Mongshell-Claude` |
| `wait` 시간 초과 + "👀 반응도 없습니다" | OpenClaw 가 글을 못 받았다 → 위 "OpenClaw 쪽 전제" 설정과 게이트웨이 재시작 여부 확인 |
| `wait` 시간 초과 + "👀" 있음 | 받았지만 아직 답을 쓰는 중 → 같은 `--since` 로 다시 `wait` |
| `CERTIFICATE_VERIFY_FAILED` | python.org 설치본 python3 의 인증서 문제. 스크립트가 macOS 시스템 루트를 직접 싣지만(이때 Apple 의 루트별 부분 불신 정책은 적용되지 않는다), 그래도 나면 `/Applications/Python 3.x/Install Certificates.command` 를 실행 |
| 종료 코드 3 + "게시됐을 수 있으니" | 글 올리기 도중 연결이 끊겼다. 중복을 막으려고 재시도하지 않는다 → `recent` 로 올라갔는지 보고 다시 올린다 |

## Slack 앱 매니페스트 (재생성용)

앱을 잃었을 때 api.slack.com/apps → Create New App → From a manifest 에 붙인다. 만든 뒤 Install → 토큰을 키체인에 넣고 → 채널에 초대한다. 앱 ID·봇 ID 가 바뀌므로 위 표와 OpenClaw 쪽 설정을 갱신한다. scope 는 공개 채널 기준 최소다(비공개 채널이면 `groups:history` 추가). 2026-10-20 에 만든 현재 앱은 이보다 넓은 scope(`channels:read`·`groups:*`)로 설치돼 있다. 토큰이 샜다고 의심되면 앱 화면 OAuth & Permissions 의 **Revoke All OAuth Tokens** 로 폐기하고 다시 설치해 새 토큰을 키체인에 넣는다.

```json
{
  "display_information": { "name": "Mongshell-Claude", "description": "Claude Code 가 OpenClaw 에게 요청을 올리고 답을 읽는 손" },
  "features": { "bot_user": { "display_name": "Mongshell-Claude", "always_online": false } },
  "oauth_config": { "scopes": { "bot": ["chat:write", "channels:history", "users:read"] } },
  "settings": { "org_deploy_enabled": false, "socket_mode_enabled": false, "token_rotation_enabled": false }
}
```
