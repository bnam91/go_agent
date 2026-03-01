/**
 * /클로드코드 → Claude 대화 세션 시작
 * 이후 같은 채팅방 메시지는 Claude로 전달. /종료 로 대화 종료.
 * telegram_log.js에서 세션 로직으로 처리 (스크립트 미실행)
 */

module.exports = {
  trigger: '/클로드코드',
  description: 'Claude 대화 시작 (세션 유지). /종료 로 대화 종료.',
  sessionStart: true,
};
