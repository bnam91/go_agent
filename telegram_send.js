const https = require('https');

const TIMEOUT_MS = 30000;

function sendMessage(botToken, chatId, text) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      chat_id: chatId,
      text,
    });

    const url = new URL(`https://api.telegram.org/bot${botToken}/sendMessage`);
    const options = {
      hostname: url.hostname,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
      timeout: TIMEOUT_MS,
      family: 4,
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (!data.ok) {
            reject(new Error(data.description || 'API 요청 실패'));
          } else {
            resolve(data.result);
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`연결 시간 초과 (${TIMEOUT_MS / 1000}초)`));
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

module.exports = { sendMessage };
