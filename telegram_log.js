#!/usr/bin/env node

/**
 * 특정 메시지를 받으면 실시간으로 log.txt에 기록합니다.
 * 사용법: node telegram_log.js [필터키워드...]
 *   - 필터 없음: 모든 메시지 로깅
 *   - 필터 있음: 메시지에 해당 키워드가 포함된 경우만 로깅
 */

const fs = require('fs');
const path = require('path');
const config = require('./config.js');
const { getUpdates } = require('./telegram_read.js');
const { sendMessage } = require('./telegram_send.js');
const claudeSession = require('./claude_session.js');

const LOG_FILE = path.join(__dirname, 'log.txt');
const LOCK_FILE = path.join(__dirname, '.telegram_log.lock');
const SKILLS_DIR = path.join(__dirname, 'skills');

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const pid = Number(fs.readFileSync(LOCK_FILE, 'utf8').trim());
      process.kill(pid, 0); // 프로세스 존재 여부만 확인 (에러 시 없음)
      return false; // 이미 실행 중
    } catch {
      fs.unlinkSync(LOCK_FILE); // 죽은 프로세스의 stale lock 제거
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  return true;
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE);
  } catch {}
}

function loadSkills() {
  const skills = [];
  if (!fs.existsSync(SKILLS_DIR)) return skills;
  const files = fs.readdirSync(SKILLS_DIR).filter((f) => f.endsWith('.js'));
  for (const file of files) {
    try {
      const skill = require(path.join(SKILLS_DIR, file));
      const hasReply = skill.trigger && skill.reply;
      const hasAction = skill.trigger && skill.action?.script;
      const hasSessionStart = skill.trigger && skill.sessionStart;
      if (hasReply || hasAction || hasSessionStart) skills.push(skill);
    } catch (e) {
      console.error(`스킬 로드 실패 (${file}):`, e.message);
    }
  }
  return skills;
}

const HELP_TRIGGER = '/?';
const SESSION_END_TRIGGER = '/종료';
const CLAUDE_SESSION_TRIGGER = '/클로드코드';

function buildHelpMessage(skills) {
  if (skills.length === 0) return '등록된 트리거가 없습니다.';
  const lines = ['📋 등록된 트리거와 설명\n\n'];
  for (const s of skills) {
    const desc = s.description || '(설명 없음)';
    lines.push(`📌 ${s.trigger}\n${desc}\n\n`);
  }
  return lines.join('').trimEnd();
}

function getMatchedSkill(text, skills) {
  if (text.trim() === HELP_TRIGGER) return null; // /?는 별도 처리
  return skills.find((s) => text.includes(s.trigger)) ?? null;
}

async function getReplyFromSkill(text, skill) {
  if (skill.reply) return skill.reply;
  if (!skill.action?.script) return null;

  const { spawn } = require('child_process');
  const scriptPath = skill.action.script;
  const argsFn = skill.action.args || (() => []);
  const args = argsFn(skill.trigger, text);

  if (args.length === 0 && !skill.action.allowEmptyArgs) {
    return Promise.resolve('채널을 입력하세요. 예: /분석 @잘사는김대리');
  }

  return new Promise((resolve, reject) => {
    const cwd = path.dirname(path.dirname(scriptPath));
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()));

    child.on('close', (code) => {
      const output = stdout.trim();
      if (code !== 0) {
        reject(new Error(stderr || `스크립트 종료 코드: ${code}`));
      } else {
        resolve(output || '결과가 없습니다.');
      }
    });
    child.on('error', reject);
  });
}

const POLL_TIMEOUT = 50; // 초 (Telegram long polling, 최대 60)

function logToFile(line) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${line}\n`;
  fs.appendFileSync(LOG_FILE, entry);
  console.log(entry.trim());
}

function extractMessage(update) {
  const msg = update.message || update.edited_message;
  if (!msg || !msg.text) return null;
  const from = msg.from;
  const name = from?.username || from?.first_name || from?.id || '알 수 없음';
  const chatId = msg.chat?.id;
  return { name, chatId, text: msg.text };
}

function shouldLog(text, filters) {
  if (!filters || filters.length === 0) return true;
  const lower = text.toLowerCase();
  return filters.some((f) => lower.includes(f.toLowerCase()));
}

async function run(filters = []) {
  const forceIdx = filters.indexOf('--force');
  if (forceIdx >= 0) {
    filters.splice(forceIdx, 1);
    releaseLock();
    console.log('기존 락 해제 후 시작합니다.');
  }

  if (!acquireLock()) {
    console.error('이미 다른 터미널에서 npm run log가 실행 중입니다.');
    console.error('→ 기존 프로세스를 종료(Ctrl+C)한 뒤 다시 시도하세요.');
    console.error('→ 또는 npm run log -- --force 로 강제 시작');
    process.exit(1);
  }

  const releaseOnExit = () => {
    releaseLock();
    process.exit(0);
  };
  process.on('SIGINT', releaseOnExit);
  process.on('SIGTERM', releaseOnExit);

  const bot = config.getBot();
  const skills = loadSkills();
  let offset = 0;

  console.log('메시지 로깅 시작. log.txt에 기록됩니다.');
  if (skills.length > 0) {
    console.log('스킬 활성화:', skills.map((s) => s.trigger).join(', '), '| 도움말: /?');
  }
  if (filters.length > 0) {
    console.log('필터 키워드:', filters.join(', '));
  } else {
    console.log('필터 없음 - 모든 메시지 로깅');
  }
  console.log('종료: Ctrl+C\n');

  logToFile('--- 로깅 시작 ---');

  let lastScheduledDate = null;
  const scheduledSkills = skills.filter((s) => s.schedule?.time && s.schedule?.chatId);
  if (scheduledSkills.length > 0) {
    console.log('예약 전송:', scheduledSkills.map((s) => `${s.trigger} → ${s.schedule.time}`).join(', '));
    setInterval(async () => {
      const now = new Date();
      const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      const today = now.toISOString().slice(0, 10);
      if (lastScheduledDate === today) return;
      for (const skill of scheduledSkills) {
        if (skill.schedule.time !== hm) continue;
        lastScheduledDate = today;
        try {
          const replyText = await getReplyFromSkill(skill.trigger, skill);
          if (replyText) {
            const MAX_LEN = 4096;
            for (let i = 0; i < replyText.length; i += MAX_LEN) {
              const chunk = replyText.slice(i, i + MAX_LEN);
              if (chunk.trim()) await sendMessage(bot.token, skill.schedule.chatId, chunk);
            }
            logToFile(`[예약] ${skill.schedule.chatId}: ${skill.trigger} (${replyText.slice(0, 50)}...)`);
          }
        } catch (e) {
          console.error('예약 전송 실패:', e.message);
          logToFile(`[예약 실패] ${e.message}`);
        }
      }
    }, 30000);
  }

  while (true) {
    try {
      const updates = await getUpdates(bot.token, {
        offset,
        timeout: POLL_TIMEOUT,
      });

      for (const update of updates) {
        offset = Math.max(offset, update.update_id + 1);
        const msg = extractMessage(update);
        if (!msg) continue;
        if (!shouldLog(msg.text, filters)) continue;

        const line = `${msg.name} (${msg.chatId}): ${msg.text}`;
        logToFile(line);

        if (msg.text.trim() === HELP_TRIGGER && msg.chatId) {
          const helpText = buildHelpMessage(skills);
          await sendMessage(bot.token, msg.chatId, helpText);
          logToFile(`[답장] ${msg.chatId}: [도움말]`);
          continue;
        }

        // Claude 세션: /종료 → 대화 종료
        if (claudeSession.hasSession(msg.chatId) && msg.text.trim() === SESSION_END_TRIGGER) {
          claudeSession.clearSession(msg.chatId);
          await sendMessage(bot.token, msg.chatId, 'Claude 대화가 종료되었습니다.');
          logToFile(`[세션 종료] ${msg.chatId}`);
          continue;
        }

        // Claude 세션 중: 모든 메시지를 Claude로 전달
        if (claudeSession.hasSession(msg.chatId)) {
          try {
            const messages = claudeSession.loadSession(msg.chatId) || [];
            const replyText = await claudeSession.runClaude(messages, msg.text);
            messages.push({ role: 'user', content: msg.text });
            messages.push({ role: 'assistant', content: replyText });
            claudeSession.saveSession(msg.chatId, messages);
            const MAX_LEN = 4096;
            for (let i = 0; i < replyText.length; i += MAX_LEN) {
              const chunk = replyText.slice(i, i + MAX_LEN);
              if (chunk.trim()) await sendMessage(bot.token, msg.chatId, chunk);
            }
            logToFile(`[Claude] ${msg.chatId}: ${replyText.slice(0, 80)}${replyText.length > 80 ? '...' : ''}`);
          } catch (e) {
            console.error('Claude 답장 실패:', e.message);
            await sendMessage(bot.token, msg.chatId, `오류: ${e.message}`);
            logToFile(`[Claude 실패] ${e.message}`);
          }
          continue;
        }

        // /클로드코드 → 세션 시작
        if (msg.text.includes(CLAUDE_SESSION_TRIGGER) && msg.chatId) {
          const firstMsg = msg.text.replace(CLAUDE_SESSION_TRIGGER, '').trim();
          const messages = [];
          if (firstMsg) {
            try {
              const replyText = await claudeSession.runClaude(messages, firstMsg);
              messages.push({ role: 'user', content: firstMsg });
              messages.push({ role: 'assistant', content: replyText });
              claudeSession.saveSession(msg.chatId, messages);
              const MAX_LEN = 4096;
              for (let i = 0; i < replyText.length; i += MAX_LEN) {
                const chunk = replyText.slice(i, i + MAX_LEN);
                if (chunk.trim()) await sendMessage(bot.token, msg.chatId, chunk);
              }
              logToFile(`[Claude 세션 시작] ${msg.chatId}: ${firstMsg}`);
            } catch (e) {
              console.error('Claude 시작 실패:', e.message);
              await sendMessage(bot.token, msg.chatId, `오류: ${e.message}`);
            }
          } else {
            claudeSession.saveSession(msg.chatId, []);
            await sendMessage(
              bot.token,
              msg.chatId,
              'Claude 대화를 시작합니다. 메시지를 보내주세요. /종료 로 대화를 끝냅니다.'
            );
            logToFile(`[Claude 세션 시작] ${msg.chatId}`);
          }
          continue;
        }

        const matchedSkill = getMatchedSkill(msg.text, skills);
        if (matchedSkill && msg.chatId) {
          try {
            let replyText = await getReplyFromSkill(msg.text, matchedSkill);
            if (replyText) {
              const MAX_LEN = 4096;
              const chunks = [];
              for (let i = 0; i < replyText.length; i += MAX_LEN) {
                chunks.push(replyText.slice(i, i + MAX_LEN));
              }
              for (const chunk of chunks) {
                if (chunk.trim()) await sendMessage(bot.token, msg.chatId, chunk);
              }
              logToFile(`[답장] ${msg.chatId}: ${replyText.slice(0, 80)}${replyText.length > 80 ? '...' : ''}`);
            }
          } catch (e) {
            console.error('답장 실패:', e.message);
            logToFile(`[답장 실패] ${e.message}`);
          }
        }
      }
    } catch (err) {
      console.error('오류:', err.message);
      logToFile(`[오류] ${err.message}`);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

if (require.main === module) {
  const filters = process.argv.slice(2);
  run(filters).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
