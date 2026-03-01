/**
 * /레퍼24 입력 시 indicator_day.js 실행 결과로 답장
 */

module.exports = {
  trigger: '/레퍼24',
  description: '레퍼 채널들 중 최근 24시간 동안 업로드된 영상 목록 조회',
  schedule: { time: '09:00', chatId: 8406936211 },
  action: {
    script: '~/Documents/github_skills/dev_youtube/scripts/indicator_day.js',
    allowEmptyArgs: true,
  },
};
