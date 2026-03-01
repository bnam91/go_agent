#!/usr/bin/env node
/**
 * Claude 대화 세션 관리
 * - chatId별 대화 기록 저장 (파일)
 * - claude -p로 대화 이어가기
 * - --dangerously-skip-permissions: 텔레그램에서 도구 실행 시 승인 없이 실행 (사용자 요청)
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SESSIONS_DIR = path.join(__dirname, 'sessions');
const MAX_MESSAGES = 20; // 최근 10턴 유지
const CLAUDE_PROMPT_PREFIX = `다음은 User와 Assistant의 대화입니다. 마지막 User 메시지에 대한 Assistant 응답만 작성하세요. (인사, 설명 등 불필요한 말 없이 본문만)\n\n`;

function ensureSessionsDir() {
  if (!fs.existsSync(SESSIONS_DIR)) {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  }
}

function getSessionPath(chatId) {
  ensureSessionsDir();
  return path.join(SESSIONS_DIR, `${chatId}.json`);
}

function loadSession(chatId) {
  const p = getSessionPath(chatId);
  if (!fs.existsSync(p)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return data.messages || [];
  } catch {
    return null;
  }
}

function saveSession(chatId, messages) {
  const p = getSessionPath(chatId);
  const trimmed = messages.slice(-MAX_MESSAGES);
  fs.writeFileSync(
    p,
    JSON.stringify({ messages: trimmed, updatedAt: new Date().toISOString() }, null, 0),
    'utf8'
  );
}

function clearSession(chatId) {
  const p = getSessionPath(chatId);
  if (fs.existsSync(p)) fs.unlinkSync(p);
}

function hasSession(chatId) {
  return fs.existsSync(getSessionPath(chatId));
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

const CLAUDE_TIMEOUT_MS = 120 * 1000; // 120초

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
