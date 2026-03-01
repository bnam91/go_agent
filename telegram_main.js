#!/usr/bin/env node

const readline = require('readline');
const config = require('./config.js');
const { getUpdates } = require('./telegram_read.js');
const { sendMessage } = require('./telegram_send.js');

function question(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function handleNetworkError(err) {
  const isNetworkError =
    err.code === 'ETIMEDOUT' ||
    err.code === 'EHOSTUNREACH' ||
    err.cause?.errors?.some((e) => e.code === 'ETIMEDOUT' || e.code === 'EHOSTUNREACH');
  if (isNetworkError) {
    console.error('api.telegram.org에 연결할 수 없습니다.');
    console.error('→ VPN 사용 또는 네트워크 연결을 확인하세요.');
    console.error('→ 한국에서는 api.telegram.org 접속이 제한될 수 있습니다.');
  } else {
    console.error(err);
  }
  process.exit(1);
}

async function cmdRead() {
  const bot = config.getBot();
  const updates = await getUpdates(bot.token);
  console.log(JSON.stringify(updates, null, 2));
}

async function cmdSend(args) {
  const bot = config.getBot();
  const users = bot.users || {};
  const usersByName = Object.fromEntries(
    Object.entries(users).map(([id, name]) => [name, Number(id)])
  );

  const target = args[0];
  const text = args.slice(1).join(' ').trim();

  if (!target || !text) {
    console.error('사용법: node telegram_main.js send <사용자명|chatId> <메시지>');
    console.error('예: node telegram_main.js send 현빈 hello world!');
    process.exit(1);
  }

  let chatId = usersByName[target];
  if (chatId == null) {
    chatId = Number(target);
    if (Number.isNaN(chatId)) {
      console.error(`사용자를 찾을 수 없습니다: ${target}`);
      console.error('등록된 사용자:', Object.keys(usersByName).join(', '));
      process.exit(1);
    }
  }

  await sendMessage(bot.token, chatId, text);
  const userName = users[chatId] || chatId;
  console.log(`메시지 전송 완료: ${userName}에게 "${text}"`);
}

async function main() {
  const cmd = process.argv[2];
  const args = process.argv.slice(3);

  if (cmd === 'read') {
    await cmdRead();
  } else if (cmd === 'send') {
    await cmdSend(args);
  } else if (cmd === 'log') {
    const { run } = require('./telegram_log.js');
    // args: [봇명, 필터...] 또는 [--bot=봇명, 필터...] 예: log finder, log agent keyword
    await run(args);
  } else if (!cmd) {
    // 대화형 모드
    console.log('\n1. read  - 받은 메시지 조회');
    console.log('2. send  - 메시지 전송');
    console.log('3. log   - 메시지 실시간 로깅 (log.txt)\n');
    const choice = await question('선택 (1, 2 또는 3): ');

    if (choice === '1') {
      await cmdRead();
    } else if (choice === '3') {
      const { run } = require('./telegram_log.js');
      const botKeys = Object.keys(config.bots);
      console.log('봇:', botKeys.join(', '));
      const botChoice = await question(`실행할 봇 (기본: ${config.selectedBot}): `);
      const botName = botChoice.trim() || config.selectedBot;
      await run([botName]);
    } else if (choice === '2') {
      const bot = config.getBot();
      const users = bot.users || {};
      const userEntries = Object.entries(users).map(([id, name]) => ({ chatId: Number(id), name }));
      userEntries.forEach((u, i) => console.log(`${i + 1}. ${u.name}(${u.chatId})`));
      const num = await question('받는 사람 번호: ');
      const idx = Number(num) - 1;
      if (idx < 0 || idx >= userEntries.length) {
        console.error('잘못된 번호입니다.');
        process.exit(1);
      }
      const target = String(userEntries[idx].chatId);
      const text = await question('메시지: ');
      await cmdSend([target, text]);
    } else {
      console.error('1, 2 또는 3을 입력하세요.');
      process.exit(1);
    }
  } else {
    console.error('사용법: node telegram_main.js [read|send|log] [인자...]');
    console.error('  인자 없이 실행 시 대화형 모드');
    process.exit(1);
  }
}

main().catch(handleNetworkError);
