#!/usr/bin/env node
/**
 * Claude 대화 세션 관리
 * - 봇별·chatId별 대화 기록 저장 (sessions/<봇명>/<chatId>.json)
 * - claude -p로 대화 이어가기
 * - --dangerously-skip-permissions: 텔레그램에서 도구 실행 시 승인 없이 실행 (사용자 요청)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
const MAX_MESSAGES = 20; // 최근 10턴 유지
const CLAUDE_PROMPT_PREFIX = `다음은 User와 Assistant의 대화입니다. 마지막 User 메시지에 대한 Assistant 응답만 작성하세요. (인사, 설명 등 불필요한 말 없이 본문만)\n출력 형식: 텔레그램 메시지용이므로 마크다운 테이블(|---|) 사용 금지. 목록이나 줄바꿈으로 표현할 것.\n\n`;

function ensureSessionsDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getSessionPath(chatId, botName = 'agent') {
  const botDir = path.join(SESSIONS_DIR, String(botName));
  ensureSessionsDir(botDir);
  return path.join(botDir, `${chatId}.json`);
}

function loadSession(chatId, botName = 'agent') {
  const p = getSessionPath(chatId, botName);
  if (!fs.existsSync(p)) {
    // 기존 sessions/<chatId>.json → sessions/agent/<chatId>.json 마이그레이션
    const legacyPath = path.join(SESSIONS_DIR, `${chatId}.json`);
    if (botName === 'agent' && fs.existsSync(legacyPath)) {
      try {
        const data = fs.readFileSync(legacyPath, 'utf8');
        ensureSessionsDir(path.join(SESSIONS_DIR, 'agent'));
        fs.writeFileSync(p, data, 'utf8');
        fs.unlinkSync(legacyPath);
      } catch {
        return null;
      }
    } else {
      return null;
    }
  }
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data.messages || [];
  } catch {
    return null;
  }
}

function saveSession(chatId, messages, botName = 'agent') {
  const p = getSessionPath(chatId, botName);
  const trimmed = messages.slice(-MAX_MESSAGES);
  fs.writeFileSync(
    p,
    JSON.stringify({ messages: trimmed, updatedAt: new Date().toISOString() }, null, 0),
    'utf8'
  );
}

function clearSession(chatId, botName = 'agent') {
  const p = getSessionPath(chatId, botName);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function hasSession(chatId, botName = 'agent') {
  const p = getSessionPath(chatId, botName);
  if (fs.existsSync(p)) return true;
  // 기존 sessions/<chatId>.json 마이그레이션 (loadSession에서 처리)
  const legacyPath = path.join(SESSIONS_DIR, `${chatId}.json`);
  if (botName === 'agent' && fs.existsSync(legacyPath)) {
    loadSession(chatId, botName); // 마이그레이션 수행
    return true;
  }
  return false;
}

function formatPromptForClaude(messages, newUserMessage) {
  const lines = [CLAUDE_PROMPT_PREFIX];
  for (const m of messages) {
    const role = m.role === 'user' ? 'User' : 'Assistant';
    lines.push(`${role}: ${m.content}\n`);
  }
  lines.push(`User: ${newUserMessage}`);
  return lines.join('');
}

// 환경변수 CLAUDE_TIMEOUT_SEC 없으면 900초(15분). 예: CLAUDE_TIMEOUT_SEC=600 npm run log mini004
const CLAUDE_TIMEOUT_MS = (Number(process.env.CLAUDE_TIMEOUT_SEC) || 900) * 1000;

function runClaude(messages, newUserMessage) {
  const prompt = formatPromptForClaude(messages, newUserMessage);
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', prompt, '--dangerously-skip-permissions'], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));

    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`타임아웃 (${CLAUDE_TIMEOUT_MS / 1000}초)`));
    }, CLAUDE_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timeoutId);
      if (settled) return;
      settled = true;
      const output = stdout.trim();
      if (code !== 0) {
        reject(new Error(stderr || `claude 종료 코드: ${code}`));
      } else {
        resolve(output || '(응답 없음)');
      }
    });
    child.on('error', (err) => {
      clearTimeout(timeoutId);
      if (!settled) {
        settled = true;
        reject(err);
      }
    });
  });
}

module.exports = {
  loadSession,
  saveSession,
  clearSession,
  hasSession,
  runClaude,
};
