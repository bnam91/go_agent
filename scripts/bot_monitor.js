// bot_monitor.js - 텔레그램 봇 실행 여부 2분 간격 모니터링
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const BOT_NAME = 'mini004';
const BOT_DIR = 'C:\\Users\\darli\\Desktop\\github\\go_agent';
const LOG_FILE = path.join(__dirname, 'bot_monitor.log');
const INTERVAL_MS = 2 * 60 * 1000; // 2분

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function isBotRunning(botName) {
  try {
    const output = execSync(
      `wmic process where "name='node.exe'" get ProcessId,CommandLine`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );

    const lines = output.split('\n').filter(Boolean);
    const matched = lines.filter(line =>
      line.includes('telegram_main.js') &&
      line.includes('log') &&
      line.includes(botName)
    );

    return {
      running: matched.length > 0,
      pids: matched.map(line => {
        const m = line.match(/\d+\s*$/);
        return m ? m[0].trim() : '?';
      }),
    };
  } catch (e) {
    return { running: false, error: e.message };
  }
}

function writeLog(message) {
  const line = `[${timestamp()}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf-8');
  process.stdout.write(line);
}

function restartBot() {
  writeLog('RESTART 시도 중...');
  try {
    const child = spawn('cmd.exe', ['/c', `cd /d ${BOT_DIR} && npm run log mini004 -- --force`], {
      detached: true,
      stdio: 'ignore',
      cwd: BOT_DIR,
    });
    child.unref();
    writeLog('RESTART 명령 실행됨');
  } catch (e) {
    writeLog(`RESTART 실패: ${e.message}`);
  }
}

let lastStatus = null;

function check() {
  const result = isBotRunning(BOT_NAME);

  if (result.error) {
    writeLog(`ERROR: ${result.error}`);
    return;
  }

  const status = result.running ? 'RUNNING' : 'STOPPED';

  if (status !== lastStatus) {
    writeLog(`STATUS CHANGED → ${status}${result.running ? ` (PID: ${result.pids.join(', ')})` : ''}`);
    lastStatus = status;
  }

  if (!result.running) {
    restartBot();
  }
}

writeLog(`모니터링 시작 - 봇: ${BOT_NAME}, 간격: 2분`);
check(); // 즉시 1회 실행
setInterval(check, INTERVAL_MS);
