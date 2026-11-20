---
role: "외부 LLM(gemini CLI · DeepSeek API) 리뷰의 실행 절차 — /qa 의 --gemini / --deepseek 와 architect 권고문 교차검증이 공유한다."
kind: operational
non_goals:
  - "어떤 검증이 언제 도는가 (qa 스킬 Step 1 조건표)"
  - "공통 분류 등급의 뜻 (하네스 README)"
---

# 외부 LLM 리뷰 절차

`/qa --gemini` · `/qa --deepseek` 가 지정됐거나, architect 권고문을 DeepSeek 로 교차검증하기로 했을 때만 읽는다. 지정되지 않은 호출에서는 이 파일을 읽지 않는다.

두 옵션은 서로 독립이고 `--branch` 에 자동 포함되지 않는다. 둘 다 지정하면 둘 다 돈다.

## 사전 점검

**gemini** — `command -v gemini >/dev/null && command -v gtimeout >/dev/null`. `gemini` 가 없으면 설치 안내(https://github.com/google-gemini/gemini-cli), `gtimeout` 이 없으면 `brew install coreutils` 안내와 함께 사용자에게 묻는다: 설치 후 재호출 / 이번 호출만 건너뛰기. 건너뛰면 리포트에 `⏭️ gemini: 사용자 스킵 선택`.

**deepseek** — 키와 도구를 각각 `&&` 로 확인한다 (`command -v jq curl` 처럼 한 호출에 묶으면 exit code 가 마지막 인자 기준이라 `jq` 부재를 놓친다):

```bash
[ -n "$DEEPSEEK_API_KEY" ] && command -v jq >/dev/null && command -v curl >/dev/null
```

false 면 무엇이 없는지 알리고 같은 두 갈래를 묻는다. 키는 `~/.zshrc` 등 머신 로컬에 `export` 한다 (git 에 커밋하지 않는다). 건너뛰면 `⏭️ deepseek: 사용자 스킵 선택`.

## 실행 (/qa Step 3a 의 다른 bash 검증과 함께 백그라운드로)

```bash
QA_TMP="/tmp/qa-$(basename "$(git rev-parse --show-toplevel)")"
PROMPT='다음 diff 를 리뷰해줘. 내부 reviewer(code-reviewer / security-reviewer)가 다루지 않는 관점 중심으로 critical / suggestion / nice 로 분류해줘: 대안 설계(더 단순한 구현 가능 여부) / 가독성·명명(오해 여지) / 누락된 엣지 케이스(입력 조합·순서 의존). 형식: critical → suggestion → nice 순서, 파일:line 명시, 한국어 평이체.'

# gemini — gtimeout 은 brew coreutils. quota 소진 시 에러 없이 멈추고 SIGTERM 도 무시하는 사례가 있어 -k 30 으로 강제 종료한다.
# stderr 는 따로 받는다 — 섞으면 실패(명령 없음 · 인증 오류 · 시간 초과)의 오류 문구가 리뷰 결과로 읽힌다.
git diff $RANGE | gtimeout -k 30 600 gemini --approval-mode plan -p "$PROMPT" > "$QA_TMP/gemini.txt" 2>"$QA_TMP/gemini-err.txt" &
GEMINI_PID=$!

# deepseek — OpenAI 호환 REST. 모델명은 https://api-docs.deepseek.com/quick_start/pricing 에서 확인한다.
git diff $RANGE | jq -Rs --arg sys "$PROMPT" \
  '{model:"deepseek-v4-pro",messages:[{role:"system",content:$sys},{role:"user",content:.}],stream:false}' \
| curl -sS --max-time 600 https://api.deepseek.com/chat/completions \
    -H "Authorization: Bearer $DEEPSEEK_API_KEY" -H "Content-Type: application/json" -d @- 2>>"$QA_TMP/deepseek-err.txt" \
| jq -r '.choices[0].message.content // empty' > "$QA_TMP/deepseek-result.txt" 2>>"$QA_TMP/deepseek-err.txt" &

# gemini 가 0 이 아닌 코드로 끝났으면(시간 초과는 124 · 137) 받은 출력을 버린다 — 잘린 응답을 결과로 쓰지 않는다.
wait "$GEMINI_PID" || : > "$QA_TMP/gemini.txt"
wait

# gemini 가 stdout 에 섞는 안내 줄만 걷어 낸다
grep -v -E '^(Warning:|Ripgrep is not available|Falling back)' "$QA_TMP/gemini.txt" > "$QA_TMP/gemini-result.txt"
```

실행할 쪽의 줄만 쓴다.

## 결과 분류

- 입력은 `gemini-result.txt` / `deepseek-result.txt` 다. 비어 있으면 그 도구는 "응답 실패" 로 적는다 (단서는 `gemini-err.txt` · `deepseek-err.txt`).
- critical → P0, suggestion → P1, nice → P2. 모든 항목에 `(외부 LLM 의견)` 을 붙이고 출처를 `[gemini]` · `[deepseek]` 로 표기한다.
- 리포트의 검증 결과 요약에 도구별로 한 줄: `✅ 완료` / `⏭️ 사용자 스킵 선택` / `❌ 응답 실패`.
- 재검증에서 다시 돌릴 때는 사용자가 기각을 확정한 항목의 요약 목록을 프롬프트 끝에 붙인다: `이미 검토 후 기각 확정된 항목 — 재보고 금지: <목록>`.

## architect 권고문 교차검증

메인 세션이 opt-in 으로 실행한다 (기본은 건너뛴다). 위 deepseek 호출과 같되:

- 입력은 diff 가 아니라 권고문 전문.
- JSON body 에 `"reasoning_effort":"high"` 와 `"thinking":{"type":"enabled"}` 를 더한다.
- 프롬프트: "이미 채택된 권장 옵션에 대해서만 critical/suggestion/nice 로: (1) 기각되지 않은 더 단순한 대안 (2) 숨은 트레이드오프·운영부담 (3) SSOT·Out-of-Scope 충돌 (4) Decision 후보 누락. 동의 코멘트 금지. 1인 운영 단순성 판단축. 한국어 평이체."
- findings 는 권고문 항목을 인용해 제시한다.
