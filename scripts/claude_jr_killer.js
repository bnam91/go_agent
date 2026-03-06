// claude_jr_killer.js - title [Claude Jr] cmd 프로세스 30분 초과 시 종료
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const INTERVAL_MS = 5 * 60 * 1000; // 5분
const MAX_AGE_MS = 30 * 60 * 1000; // 30분
const LOG_FILE = path.join(__dirname, 'claude_jr_killer.log');

function timestamp() {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function writeLog(message) {
  const line = `[${timestamp()}] ${message}\n`;
  fs.appendFileSync(LOG_FILE, line, 'utf-8');
  process.stdout.write(line);
}

function getClaudeJrProcesses() {
  try {
    const output = execSync(
      `wmic process where "name='cmd.exe'" get ProcessId,CommandLine,CreationDate`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );

    const lines = output.split('\n').filter(line => line.includes('Claude Jr'));
    const now = Date.now();
    const results = [];

    for (const line of lines) {
      // CreationDate 형식: 20260306110042.947334+540
      const dateMatch = line.match(/(\d{14})\.\d+[+-]\d+/);
      const pidMatch = line.match(/(\d+)\s*$/);

      if (!dateMatch || !pidMatch) continue;

      const raw = dateMatch[1];
      const created = new Date(
        parseInt(raw.slice(0, 4)),      // year
        parseInt(raw.slice(4, 6)) - 1,  // month
        parseInt(raw.slice(6, 8)),       // day
        parseInt(raw.slice(8, 10)),      // hour
        parseInt(raw.slice(10, 12)),     // minute
        parseInt(raw.slice(12, 14))      // second
      );

      const ageMs = now - created.getTime();
      results.push({ pid: pidMatch[1].trim(), ageMs, created });
    }

    return results;
  } catch (e) {
    writeLog(`ERROR: ${e.message}`);
    return [];
  }
}

function check() {
  const processes = getClaudeJrProcesses();

  if (processes.length === 0) {
    return;
  }

  for (const proc of processes) {
    const ageMin = Math.floor(proc.ageMs / 60000);
    if (proc.ageMs > MAX_AGE_MS) {
      writeLog(`KILL PID ${proc.pid} - 실행 ${ageMin}분 경과`);
      try {
        execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
        writeLog(`KILLED PID ${proc.pid}`);
      } catch (e) {
        writeLog(`KILL 실패 PID ${proc.pid}: ${e.message}`);
      }
    } else {
      writeLog(`SKIP PID ${proc.pid} - 실행 ${ageMin}분 (30분 미만)`);
    }
  }
}

writeLog('claude_jr_killer 시작 - 스캔 간격: 5분, 종료 기준: 30분');
check();
setInterval(check, INTERVAL_MS);
