# go_agent 프로젝트 아이디어 노트

> 2026-03-02 기준 정리

---

## 1. 스킬 구조

- **현재**: `skills/` 폴더에 .js 파일로 스킬 정의
- **방향**: 클로드 코드(Claude Code)의 스킬 등록 방식으로 전환
- **/? 입력 시**: 각 OS에 등록된 파일명 기반 스킬 목록 표시 (`~/.claude/commands` 등)

---

## 2. 봇 관리 방식

### PC 기반 봇 배치
- 미니PC, iMac 등 **기기별로 봇 지정**
- 한 PC에서 여러 봇 실행 가능 (`BOTS=finder,agent`)
- PC별 `config` 또는 환경변수로 실행할 봇 선택

### 봇 역할 분리
| 유형 | 예시 | 용도 |
|------|------|------|
| 공통 | claudecode | 모든 봇에 필수 |
| 기능별 | agent, youtube, finder | 특정 기능 전담 |
| 중앙 | control | 전체 조율·명령 분배 |

---

## 3. MD 파일 기반 봇 간 대화

**아이디어**: 봇들이 md 파일을 공유 메시지 큐처럼 사용해 서로 통신한다.

### 구조 예시
```
bot_messages/
  inbox/
    from_finder.md      # finder → 다른 봇
    from_agent.md
  outbox/
    to_finder.md       # 다른 봇 → finder
  central/
    commands.md        # 중앙 봇이 모든 봇에게 내리는 지시
```

### 동작 방식
1. **봇 A → 봇 B**: `bot_messages/outbox/to_B.md`에 메시지 append
2. **봇 B**: 주기적으로 자신의 inbox를 읽고 처리
3. **형식**: `[timestamp] [from:봇명] 메시지` 또는 YAML frontmatter
4. **중앙 봇**: `commands.md`에 지시 작성 → 각 봇이 폴링하여 수행

### 장점
- 파일 기반이라 구현 단순
- 로그/이력 추적 용이
- Git으로 버전 관리 가능 (선택)

---

## 4. 스킬 동기화

**필요성**: 여러 PC에서 같은 스킬 세트를 유지해야 함

### 방안
1. **원본 저장소**: `github_skills/dev_youtube` 등에서 스킬 스크립트 관리
2. **동기화 스크립트**: `npm run sync:skills` → 원본에서 `~/.claude/commands`로 복사
3. **rsync / git pull**: PC별로 주기적 동기화
4. **중앙 config**: 스킬 목록을 JSON/YAML로 관리하고, 동기화 시 참조

### 예시
```bash
# sync_skills.js
# ~/.claude/commands ← ~/Documents/github_skills/*/scripts 복사
```

---

## 5. 유저별 권한

**필요성**: 봇/기능별로 접근 가능한 사용자 제한

### 구조
```js
// config.js
users: {
  6942656480: { name: '현빈', roles: ['admin', 'youtube'] },
  8406936211: { name: '지수', roles: ['viewer'] },
}
// 스킬/봇별로 허용 roles 정의
```

### 적용
- **admin**: 모든 봇·스킬 사용
- **youtube**: /분석, /레퍼24 등 유튜브 관련만
- **viewer**: 읽기 전용 또는 제한된 명령만

### 구현
- `telegram_log.js`에서 메시지 수신 시 `msg.from.id`로 권한 확인
- 스킬 실행 전 `canUse(userId, skillName)` 체크

---

## 6. 중앙 컨트롤 봇

**역할**: 다른 봇들에게 작업 지시, 상태 수집, 일정 관리

### MD 기반 지시 예시
```markdown
# commands.md (중앙 봇이 작성)

## 2026-03-02 09:00
- [ ] finder: /레퍼24 결과 매일 09:00 전송
- [ ] agent: 사용자 6942656480 질문 처리 대기
```

### 봇 반응
- 각 봇이 `commands.md`를 주기적으로 읽고, 자신에게 할당된 항목만 수행
- 완료 시 `[x]` 체크 또는 `completed.md`에 기록

---

## 7. TODO (추후 검토)

- [ ] `~/.claude/commands` 연동 강화
- [ ] 스킬 동기화 스크립트 작성
- [ ] 유저 권한 시스템 도입
- [ ] 봇 간 MD 메시지 프로토콜 설계
- [ ] 중앙 컨트롤 봇 프로토타입

---

## 8. PM2 프로세스 관리

> 봇 프로세스를 백그라운드에서 항상 실행 유지하기 위해 PM2 사용

### PM2란?
Node.js 기반 프로세스 관리자. 프로세스가 꺼지면 자동 재시작하고, 백그라운드 실행 및 로그 수집을 지원함.

### 현재 등록된 프로세스
- `mini004` (id: 0) — `telegram_main.js` 실행 (mini004 PC 전담 봇)

### 주요 명령어
```bash
pm2 list              # 실행 중인 프로세스 목록
pm2 start telegram_main.js --name mini004  # 새 프로세스 등록
pm2 restart mini004   # 재시작
pm2 stop mini004      # 정지
pm2 delete mini004    # 삭제
pm2 logs mini004      # 실시간 로그 확인
pm2 save              # 현재 프로세스 목록 저장 (재부팅 후 복구용)
pm2 startup           # 시스템 부팅 시 자동 시작 설정
```

### PC별 봇 실행 구조
각 PC마다 담당 봇 이름으로 PM2에 등록해서 관리
- mini004 PC → `mini004` 프로세스
- iMac → 별도 프로세스 이름으로 등록 예정
