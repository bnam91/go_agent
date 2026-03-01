/**
 * Telegram Bot 설정
 * ⚠️ config.js는 .gitignore에 포함되어 있으므로 Git에 커밋되지 않습니다.
 *
 * 봇별 skillsDir: 해당 봇이 사용할 스킬 폴더
 * 실행: npm run log:finder, npm run log:agent (프로세스 분리)
 */

module.exports = {
  selectedBot: 'finder', // read/send 시 기본 봇
  bots: {
    agent: {
      description: 'Claude 대화, 코드 실행 등 에이전트용',
      token: '8702727796:AAFEGeQulDaWoUmCAEaTHpCFCXaPb2_jJuo',
      username: 'gogo_agent_bot',
      skillsDir: 'skills',
      users: {
        6942656480: '현빈'
      },
    },finder: {
      description: '유튜브 채널 분석, 레퍼24 등 검색/조회용',
      token: '7849782487:AAEp6gwgun05PAH3Q7VSFbZ4D9-f4gga_qo',
      username: 'gogo_finder_bot',
      skillsDir: 'skills',
      users: {
        6942656480: '현빈',
        8406936211: '지수',
      },
    },
    mini004: {
      description: '미니PC 004 전용 (윈도우)',
      token: '8685844376:AAGlP0ovCKQK3SC0rIa_rYEYX2fTPzDt2XY',
      username: 'gogo_mini_004_bot',
      skillsDir: 'skills',
      users: {
        6942656480: '현빈',
        8406936211: '지수',
      },
    },
    imac: {
      description: 'iMac 전용',
      token: '8739714301:AAGPKkzMyhnsBkuXd9MDVVsL-Kp_Vuky71k',
      username: 'gogo_imac_bot',
      skillsDir: 'skills',
      users: {},
    },
  },
  getBot(name) {
    const key = name || this.selectedBot;
    const bot = this.bots[key];
    if (!bot) {
      throw new Error(`봇 "${key}"을(를) 찾을 수 없습니다. (사용 가능: ${Object.keys(this.bots).join(', ')})`);
    }
    return bot;
  },
};
