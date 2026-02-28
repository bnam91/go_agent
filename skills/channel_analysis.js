/**
 * /분석 @채널명 입력 시 indicator.js 실행 결과로 답장
 * 예: /분석 @잘사는김대리
 * 여러 검색 결과 시: /분석 채널명 2 (번호 선택)
 */

module.exports = {
  trigger: '/분석',
  description: ' 최근 업로드 영상 8개 조회 👉 /분석 + @채널아이디 혹은 채널명, URL 입력 (*여러 검색 결과 시: /분석 채널명 2 (번호 선택 후 재조회)',
  action: {
    script: '/Users/a1/github/dev_youtube/scripts/indicator.js',
    args: (trigger, fullText) => {
      const rest = fullText.replace(trigger, '').trim();
      if (!rest) return [];
      const parts = rest.split(/\s+/);
      const last = parts[parts.length - 1];
      if (/^\d+$/.test(last) && parts.length > 1) {
        return [parts.slice(0, -1).join(' '), last];
      }
      return [rest];
    },
  },
};
