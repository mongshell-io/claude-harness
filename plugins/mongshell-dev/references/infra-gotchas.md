---
role: "Neon / drizzle / worktree 조합에서 반복 재발한 인프라 함정의 카탈로그 — 프로젝트를 가리지 않고 같은 스택이면 그대로 적용된다."
kind: reference
non_goals:
  - "프로젝트별 사고 이력과 그 복구 기록 (각 프로젝트 `docs/troubleshooting.md`)"
  - "디버깅 행동 규범 — 근본원인 우선 등 (소비 프로젝트 루트 CLAUDE.md 상시 코어 § 디버깅 원칙)"
  - "인프라 구성 자체의 설명 (각 프로젝트 `docs/architecture.md`)"
---

# 인프라 함정 카탈로그

Next.js + drizzle + Neon + git worktree 스택에서 **여러 프로젝트에 공통으로 적용되는** 함정 모음. 각 항목은 "증상 → 원인 → 대응" 순서다.

프로젝트에서 실제로 겪은 사고의 상세 기록과 복구 로그는 각 프로젝트 `docs/troubleshooting.md` 가 권위이고, 이 문서는 **재발 방지를 위해 이식되는 지식**만 담는다. 새 항목을 추가할 때는 "다른 프로젝트에서도 똑같이 터지는가?" 를 먼저 물을 것 — 아니면 프로젝트 `troubleshooting.md` 로 간다. 배포 플랫폼에 묶인 함정(플랫폼 CLI · 환경변수 · 배포 로그)은 플랫폼이 바뀌면 통째로 낡으므로 여기 두지 않고 각 프로젝트 문서에 둔다.

---

## DB / 마이그레이션

### 마이그레이션이 조용히 건너뛰어진다 (배포는 green, 런타임은 42703)

**증상**: 배포가 성공했는데 특정 엔드포인트만 500. 로그에 `42703 column ... does not exist`. 새로 추가한 컬럼을 쓰는 경로만 죽는다.

**원인**: `drizzle-kit migrate` 의 적용 게이트는 **hash 가 아니라 timestamp** 다. 내부적으로 `__drizzle_migrations` 에서 `max(created_at)` 을 읽어 그보다 최신인 것만 적용한다. 그래서 `drizzle/meta/_journal.json` 의 `when` 값이 `idx` 순서와 어긋나면(예: idx 43 의 `when` 이 미래값으로 부풀려져 idx 44 가 그 아래 위치), drizzle 은 idx 44 를 "이미 적용됨" 으로 오판하고 **에러 없이 건너뛴다**. 배포 로그에는 success 만 찍힌다.

**대응**:
- 가드: `_journal.json` 의 `when` 이 **러닝맥스 기준 단조 증가**인지 배포 전에 검사한다(직전 항목과의 비교가 아니라 러닝맥스여야 prod 게이트와 일치).
- 진단: 로컬 `drizzle/*.sql` 의 sha256 과 DB `__drizzle_migrations.hash` 를 전수 대조한다. 어긋나는 지점이 skip 된 마이그레이션이다.
- 언블록: `psql` 로 한 트랜잭션에서 `ADD COLUMN IF NOT EXISTS` 등 멱등 DDL 을 직접 적용하고 해당 hash 를 장부에 기록한다. 재배포는 불필요하다.
- `when` 값을 정정하는 방향은 **택하지 말 것** — 비멱등 재적용이 발생해 배포가 깨진다. 부풀려진 값을 그대로 두고 이후 마이그레이션이 그 위에 오도록 하는 편이 prod 게이트와 정합한다.

### 마이그레이션 번호를 재조정하면 옛 번호가 적용된 DB 가 어긋난다

**증상**: 번호 충돌로 마이그레이션을 재번호(예: 0017 → 0019)한 뒤, 그 브랜치를 한 번이라도 적용해 본 DB(로컬 · 임시 DB 브랜치)에서 `migrate` 가 실패하거나 조용히 건너뛴다.

**원인**: 그 DB 의 장부에는 **옛 번호의 마이그레이션이 이미 적용된 상태**로 남아 있다. prod 는 영향받지 않는다.

**대응**: 그 DB 를 부모(운영 사본)에서 다시 만든다. 재번호 자체를 피할 수 있으면 그게 최선이다 — 마이그레이션이 걸린 PR 은 병렬로 열지 말고 순서대로 머지한다.

### 컬럼을 지우는 마이그레이션에서 제약 이름이 안 맞는다

**증상**: `DROP CONSTRAINT` 가 "존재하지 않는 제약" 으로 실패.

**원인**: 테이블을 rename 해도 **Postgres 는 FK 제약 이름을 따라 바꾸지 않는다.** DB 에는 옛 이름이 남아 있는데 drizzle 스냅샷에는 새 이름으로 기록돼, 생성된 마이그레이션이 존재하지 않는 이름을 DROP 하려 든다. drizzle 은 `IF EXISTS` 를 붙이지 않는다.

**대응**: 생성된 SQL 에서 `DROP CONSTRAINT` 줄을 지운다 — `DROP COLUMN` 이 FK 를 이름과 무관하게 자동 정리한다. 머지 전에 운영 사본(로컬 스냅샷이나 임시 DB 브랜치)에서 `BEGIN; ... ROLLBACK;` 으로 dry-run 검증할 것.

### 빈 DB 에 전체 마이그레이션을 재생하면 재현이 안 된다

**증상**: "처음부터 다 돌려보기" 가 로컬에서만 실패하거나, 반대로 로컬에서만 통과.

**원인**: DB URL 우선순위가 의도와 다르게 해석돼(pooled/direct, 여러 env 변수 중 어느 것이 이겼는지) 실제로는 다른 DB 를 대상으로 돌고 있는 경우가 대부분이다.

**대응**: 마이그레이션 도구가 **실행 첫 줄에 대상 host/db 를 에코**하게 만든다. 사람이 매번 눈으로 확인하는 습관이 실질적인 사고 방지다.

---

## 인증 / 시크릿

### DB 를 복제해 만든 환경에서 로그인은 되는데 이후 전부 500

**증상**: `POST /sign-in` 은 200 인데 직후 세션 조회부터 모든 API 가 500. 원본 환경은 멀쩡하다. 로그에 `Failed to decrypt private key`.

**원인**: better-auth 의 **jwt 플러그인**은 RS256 개인키를 `BETTER_AUTH_SECRET` 으로 암호화해 `jwks` 테이블에 저장한다. 다른 환경의 DB 를 복제하면(운영 스냅샷으로 만든 로컬 DB, 운영에서 가지를 친 임시 DB 브랜치) **원본의 secret 으로 암호화된 행**을 물려받는데, 복제본 환경의 secret 은 다른 값이다. 로그인 POST 자체는 JWKS 를 안 건드려 200 이고, 세션 조회부터 무너지는 것이 이 증상의 서명이다.

**대응**: 복제 직후 복제본의 `jwks` 행을 지운다. 키가 없으면 better-auth 가 그 환경 자신의 secret 으로 새 키 쌍을 만든다. secret 을 원본과 통일하는 대안은 **복제본에서 발급된 토큰이 원본에서도 검증 가능**해지므로 택하지 않는다.

> 같은 계열의 함정: DB 를 복제해서 만드는 환경에서는 **"DB 에 저장된 암호화 산출물"이 전부 의심 대상**이다. 세션 키, 토큰, 암호화된 설정값 모두 같은 방식으로 깨진다.

---

## 로컬 / worktree

### worktree 에서 로컬 build 가 폰트에서 실패한다 (코드 문제 아님)

**증상**: worktree 에서 `build` 가 `next/font` module-not-found 로 exit 1. 같은 커밋이 메인 체크아웃이나 배포 빌드에서는 정상.

**원인**: worktree 에 lockfile 이 둘 존재해 Next 가 **workspace root 를 메인 repo 로 오탐**한다. 네트워크 문제가 아니다(샌드박스를 풀어도 재현된다).

**대응**: `next.config` 에서 `turbopack.root` 를 그 설정 파일의 디렉터리로 고정한다. 고정돼 있지 않은 프로젝트에서 이 증상이 나오면 코드 결함으로 판정하지 않는다.

### worktree 의 node_modules 는 없거나 stale 하다

메인 repo 의 심링크를 믿지 말고 **worktree 자체에 설치**한 뒤 검증한다. typecheck/build 의 모듈 미해결은 코드를 의심하기 전에 환경부터 확인한다.

### 백그라운드 셸은 선행 `cd` 를 무시한다

**증상**: 검증이 통과했는데 실제로는 다른 트리를 검사한 false-green.

**원인**: 백그라운드로 띄운 셸이 메인 체크아웃에서 실행된다.

**대응**: 백그라운드 셸에 **브랜치 가드**를 넣는다 — 기대한 브랜치가 아니면 즉시 실패시킨다.

### 파일 편집은 worktree 절대경로로

메인 체크아웃 경로로 편집하면 조용히 엉뚱한 트리에 들어간다. **diff 가 비면 잘못된 트리를 의심**한다.

### Neon 커넥션 문자열을 `sed` 로 치환하지 말 것

Neon 문자열은 `?sslmode=require&channel_binding=require` 처럼 `&` 를 포함하는데, `sed` 치환문에서 `&` 는 **"매치된 전체"** 를 뜻한다. `.env.local` 이 조용히 오염된다. 줄 필터 + append 로 대체한다:

```bash
grep -v -E '^(DATABASE_URL|DIRECT_URL)=' .env.local > .env.local.tmp
printf 'DATABASE_URL=%s\nDIRECT_URL=%s\n' "$POOLED" "$DIRECT" >> .env.local.tmp
mv .env.local.tmp .env.local
grep -cE '^(DATABASE_URL|DIRECT_URL)=.*neon\.tech' .env.local   # 반드시 2
```

마지막 검증 줄이 핵심이다 — 커넥션 문자열을 얻는 CLI 가 실패해도(인증 만료·네트워크) 뒤 명령들은 성공해서 **변수가 조용히 빈 값이 된다.**
