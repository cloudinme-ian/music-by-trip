// 기본값과 localStorage 설정 관리

// 5곡 = 장소 곡(AI 실시간 추천) 2 + 무드 곡(카탈로그에서 태그 매칭으로 선택) 3
export const LIVE_COUNT = 2;
export const PICK_COUNT = 3;
export const TRACK_COUNT = LIVE_COUNT + PICK_COUNT;

export { MOODS } from './tags.js';

// 서비스 기준 국가: 이 나라 곡은 국내 여행지여도 무드 곡에서 제외하지 않는다
export const HOME_MARKET = 'KR';

export const DEFAULTS = {
  provider: 'gemini',
  geminiKey: '',
  geminiModel: 'gemini-2.5-flash',
  youtubeKey: '',
};

const STORAGE_KEY = 'music-by-trip:settings';

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // 사생활 보호 모드 등에서 저장 실패 — 이번 세션에서만 사용
  }
}

export function clearSettings() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
