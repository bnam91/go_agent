# heyclaude.md — go_agent 환경 세팅

> 이 파일은 Claude Code가 읽고 따라하는 안내문입니다. 사람이 직접 보지 않아도 OK.

## 트리거 조건

사용자가 "go_agent 세팅", "유튜브 텔레그램 처음 세팅" 같은 말을 하거나, 아래 사전 요구사항 중 하나라도 빠져있으면 이 단계를 진행한다. 모두 **idempotent** — 이미 있으면 skip.

## 사전 요구사항 체크

```bash
echo "=== go_agent 환경 점검 ==="
command -v node >/dev/null 2>&1                                      && echo "✓ node"             || echo "❌ node 없음"
[ -d "$HOME/Documents/github_skills/go-finder" ]                     && echo "✓ go-finder 레포"    || echo "❌ go-finder 미클론 (git clone https://github.com/bnam91/go-finder.git $HOME/Documents/github_skills/go-finder)"
[ -d "$HOME/Documents/github_skills/go-finder/node_modules" ]        && echo "✓ go-finder npm install" || echo "❌ npm install 필요 (cd ~/Documents/github_skills/go-finder && npm install)"
[ -f "$HOME/Documents/github_cloud/module_auth/auth.js" ]            && echo "✓ module_auth"      || echo "❌ module_auth 없음 (Google OAuth 모듈)"
[ -f "$HOME/Desktop/github/go_agent/scripts/send_youtube_to_jisu.js" ] && echo "✓ send_youtube_to_jisu.js" || echo "❌ jisu 스크립트 누락"
```

빠진 게 있으면 아래 단계로 보충.

---

## 사용자별 콘텐츠 분기 컨벤션 (⚠️ 중요)

각 `scripts/send_youtube_to_<user>.js`는 **execFile에 env로 시트 분기 정보를 넘긴다**. 이걸 받는 쪽은 `go-finder`의 `indicator/utils/sheetLookup.js`.

### 송신측 (이 레포)
```js
execFile('node', [SCRIPT_PATH], {
  timeout: 120000,
  env: {
    ...process.env,
    SHEET_SPREADSHEET_ID: '<해당 사용자의 채널 시트 ID>',
    SHEET_NAME: 'list',
  },
}, callback);
```

### 수신측 (go-finder/indicator/utils/sheetLookup.js)
```js
const SPREADSHEET_ID = process.env.SHEET_SPREADSHEET_ID || '<지수 기본 시트 ID>';
const SHEET_NAME = process.env.SHEET_NAME || 'list';
```

### 새 수신자(예: '민수') 추가 절차
1. `scripts/send_youtube_to_<user>.js` 복사 작성 — `CHAT_ID`와 `SHEET_SPREADSHEET_ID`만 교체
2. `~/Library/LaunchAgents/com.user.youtube_to_<user>.plist` 등록 (macOS) 또는 작업 스케줄러(Windows)
3. 필요 시 해당 사용자용 시트 생성 (탭 이름 `list`, 헤더 `프로필 / 채널명 / 채널ID / 채널링크`)

### 함정 (과거 발생 사례)
- 송신측이 env를 보내지만 **수신측 sheetLookup.js가 env를 무시하고 하드코딩 시트만 읽는** 상태로 push된 적 있음
- 증상: 모든 수신자에게 동일한 콘텐츠가 다른 chat_id로 전송됨
- 디버깅: 수신측에서 `process.env.SHEET_SPREADSHEET_ID`를 읽고 있는지 먼저 확인

---

## launchd 등록 패턴 (macOS)

`~/Library/LaunchAgents/com.user.youtube_to_<user>.plist`:

```xml
<key>ProgramArguments</key>
<array>
    <string>/usr/local/bin/node</string>
    <string>/Users/<me>/Desktop/github/go_agent/scripts/send_youtube_to_<user>.js</string>
</array>
<key>WorkingDirectory</key>
<string>/Users/<me>/Desktop/github/go_agent</string>
<key>StartCalendarInterval</key>
<dict>
    <key>Hour</key><integer>9</integer>
    <key>Minute</key><integer>0</integer>
</dict>
<key>StandardOutPath</key>
<string>/Users/<me>/Desktop/github/go_agent/logs/youtube_to_<user>.out.log</string>
<key>StandardErrorPath</key>
<string>/Users/<me>/Desktop/github/go_agent/logs/youtube_to_<user>.err.log</string>
```

부팅: `launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.user.youtube_to_<user>.plist`

---

## 검증

```bash
# 즉시 트리거 (자동 스케줄 대기 없이)
launchctl kickstart -k gui/$(id -u)/com.user.youtube_to_jisu
launchctl kickstart -k gui/$(id -u)/com.user.youtube_to_hyunbin

# 로그 확인
tail -30 ~/Desktop/github/go_agent/logs/youtube_to_jisu.out.log
tail -30 ~/Desktop/github/go_agent/logs/youtube_to_hyunbin.out.log

# 종료 코드
launchctl print gui/$(id -u)/com.user.youtube_to_jisu | grep "last exit code"
```

각 수신자가 **다른 채널 목록**을 받는지 텔레그램 봇 채팅에서 직접 확인.

---

## 알려진 이슈

- send 스크립트 주석에 "Windows 작업 스케줄러에서 실행"이라고 쓰여있으나 **macOS launchd로 동일하게 사용 가능**.
- BOT_TOKEN이 코드에 하드코딩됨 — 공개 레포 푸시 시 노출 주의.
- `go-finder`가 detached HEAD 상태로 작업되는 경우가 있어, sheetLookup.js 같은 핵심 파일이 0바이트로 남아있는 사고 발생 가능. `git status`로 빈 파일 의심되면 `git checkout HEAD -- <파일>`로 복원.
