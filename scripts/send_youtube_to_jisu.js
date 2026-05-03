/**
 * 매일 아침 8시 - 지수에게 유튜브 24h 업로드 영상 전송
 * Windows 작업 스케줄러에서 실행
 */

const { execFile } = require('child_process');
const https = require('https');
const path = require('path');
const os = require('os');
const fs = require('fs');

function log(msg) {
  console.error(`[${new Date().toISOString()}] ${msg}`);
}

const BOT_TOKEN = '7849782487:AAEp6gwgun05PAH3Q7VSFbZ4D9-f4gga_qo';
const CHAT_ID = '8406936211'; // 지수

const SCRIPT_PATH = path.join(os.homedir(), 'Documents', 'github_skills', 'go-finder', 'scripts', 'indicator_day.js');

function sendMessage(text) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ chat_id: CHAT_ID, text });
    const options = {
      hostname: 'api.telegram.org',
      path: `/bot${BOT_TOKEN}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      family: 4,
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.ok) resolve(data.result);
          else reject(new Error(data.description || 'API 오류'));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

async function sendInChunks(text) {
  const LIMIT = 4000;
  if (text.length <= LIMIT) {
    await sendMessage(text);
    return;
  }
  for (let i = 0; i < text.length; i += LIMIT) {
    await sendMessage(text.slice(i, i + LIMIT));
  }
}

log('스크립트 시작');
execFile('node', [SCRIPT_PATH], { timeout: 120000 }, async (err, stdout, stderr) => {
  if (err) {
    log(`execFile 오류: ${err.message}`);
    if (stderr) log(`stderr: ${stderr.substring(0, 500)}`);
    console.error('스크립트 실행 오류:', err.message);
    try { await sendMessage(`[유튜브 알림 오류]\n${err.message}`); } catch {}
    process.exit(1);
  }
  const result = stdout.trim();
  if (!result) {
    log('출력 없음 - 전송 생략');
    console.log('출력 없음 - 전송 생략');
    process.exit(0);
  }
  try {
    await sendInChunks(result);
    log('전송 완료');
    console.log('전송 완료');
  } catch (e) {
    log(`전송 실패: ${e.message}`);
    console.error('전송 실패:', e.message);
    process.exit(1);
  }
});
