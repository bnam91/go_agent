const https = require('https');

const TIMEOUT_MS = 30000;

function getUpdates(botToken, options = {}) {
  const { offset, timeout } = options;
  const params = new URLSearchParams();
  if (offset != null) params.set('offset', offset);
  if (timeout != null) params.set('timeout', timeout);
  const query = params.toString();
  const url = `https://api.telegram.org/bot${botToken}/getUpdates${query ? `?${query}` : ''}`;
  const reqTimeout = timeout != null ? (timeout + 10) * 1000 : TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: reqTimeout, family: 4 }, (res) => {
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
      reject(new Error(`연결 시간 초과 (${reqTimeout / 1000}초). VPN 사용 또는 api.telegram.org 접속 가능 여부를 확인하세요.`));
    });
    req.on('error', reject);
  });
}

module.exports = { getUpdates };
