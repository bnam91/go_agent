#!/usr/bin/env node
/**
 * claude CLI를 현재 터미널에서 대화형으로 실행합니다.
 * 실행: node claudecode.js [claude 인자...]
 * 예: node claudecode.js
 * 예: node claudecode.js -c  (이전 대화 이어하기)
 */

const { spawn } = require('child_process');

const args = process.argv.slice(2);
const claude = spawn('claude', args, {
  stdio: 'inherit',
  shell: true,
});

// 시그널 전달 (Ctrl+C 등)
['SIGINT', 'SIGTERM'].forEach((sig) => {
  process.on(sig, () => {
    claude.kill(sig);
  });
});

claude.on('close', (code, signal) => {
  process.exit(code ?? (signal ? 1 : 0));
});

claude.on('error', (err) => {
  console.error('claude 실행 실패:', err.message);
  process.exit(1);
});
