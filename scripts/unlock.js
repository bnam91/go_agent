#!/usr/bin/env node
/**
 * 봇별 .telegram_log.<봇명>.lock 파일 삭제
 */
const fs = require('fs');
const path = require('path');
const cwd = process.cwd();
const files = fs.readdirSync(cwd).filter((f) => f.startsWith('.telegram_log.') && f.endsWith('.lock'));
files.forEach((f) => {
  fs.unlinkSync(path.join(cwd, f));
  console.log('락 해제:', f);
});
if (files.length === 0) console.log('해제할 락이 없습니다.');
