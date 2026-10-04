// AI 공급자 레지스트리 — 새 공급자는 여기에 등록
// 계약: recommend({ apiKey, model, destination, mood }) → { destination, code, summary, profile, tracks[장소 곡] }
// 프롬프트/스키마/정규화는 js/prompt.js 공용 함수 사용. 무드 곡은 앱이 js/matcher.js로 붙인다.
import * as gemini from './gemini.js';

export const PROVIDERS = {
  gemini: {
    label: 'Gemini',
    recommend: gemini.recommend,
    credentials: (s) => ({ apiKey: s.geminiKey, model: s.geminiModel }),
  },
  // claude: { label: 'Claude', recommend: claude.recommend, credentials: (s) => ({ ... }) },
};

export function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS.gemini;
}
