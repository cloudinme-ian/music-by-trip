// 모든 AI 공급자가 공유하는 프롬프트와 응답 스키마
// AI 역할: ① 장소 곡 LIVE_COUNT곡 실시간 추천 ② 여행지 태그 프로필 생성
// 무드 곡 PICK_COUNT곡은 AI가 아니라 js/matcher.js가 프로필 ↔ 카탈로그 태그를 비교해 고른다.
import { LIVE_COUNT } from './config.js';
import { SCENERY, VIBES, SEASONS } from './tags.js';

export function buildPrompt({ destination, mood, today = new Date().toISOString().slice(0, 10) }) {
  const moodLine = mood ? `- 듣는 상황: ${mood}\n` : '';
  return `당신은 여행과 음악을 사랑하는 음악 큐레이터입니다.
아래 여행지에 대해 [A] 장소 곡 ${LIVE_COUNT}곡과 [B] 여행지 프로필을 만들어 주세요.

- 여행지: ${destination}
- 오늘 날짜: ${today}
${moodLine}
[A] 장소 곡 ${LIVE_COUNT}곡 → tracks
1. 여행지 현지의 언어·전통 장르·현지 아티스트의 곡, 또는 그 장소를 직접 노래한 곡입니다.
   여행지가 한국 안이라면 한국 가요 전체가 아니라, 그 도시·지역을 노래했거나 그 지역 출신 아티스트의 곡이어야 합니다.
2. 실제로 존재하고 YouTube에서 검색 가능한 곡만 추천합니다. 지어낸 곡은 절대 안 됩니다.
3. 두 곡의 아티스트는 서로 다르게 합니다.
4. title과 artist는 YouTube 검색이 잘 되도록 원어(공식 표기) 그대로 씁니다.
5. reason은 이 곡이 왜 그 장소에 어울리는지 한국어 한 문장으로 씁니다.

[B] 여행지 프로필 → profile (아래 목록의 단어만 그대로 사용)
- country: 여행지가 속한 나라의 ISO 3166-1 alpha-2 코드 (예: 일본 JP, 영국 GB, 한국 KR)
- season: 오늘 날짜 기준 여행지의 계절. 남반구는 계절이 반대이고, 열대 지역은 여름으로 봅니다. [${SEASONS.join(', ')}]
- scenery: 여행지를 대표하는 풍경 1~4개, 대표성이 높은 순서. [${SCENERY.join(', ')}]
- vibes: 여행지의 분위기 1~3개, 대표성이 높은 순서. [${VIBES.join(', ')}]

공통:
- destination은 여행지의 한국어 대표 이름입니다.
- code는 대문자 영문 3글자 약어입니다. 공항이 있는 도시는 IATA 공항 코드, 공항이 없는 곳은 지명을 줄인 약어(예: 경주 → GJU), 나라는 ISO 3글자 국가 코드(예: 크로아티아 → HRV)를 씁니다.
- summary는 여행지의 분위기를 한국어 한 문장으로 묘사합니다.`;
}

// Gemini responseSchema(OpenAPI 부분집합) 형식. 다른 공급자는 필요 시 변환해서 사용.
// 프로필 태그는 enum으로 제한 → 카탈로그와 같은 어휘만 나온다.
export const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    destination: { type: 'STRING' },
    code: { type: 'STRING' },
    summary: { type: 'STRING' },
    profile: {
      type: 'OBJECT',
      properties: {
        country: { type: 'STRING' },
        season: { type: 'STRING', format: 'enum', enum: SEASONS },
        scenery: { type: 'ARRAY', items: { type: 'STRING', format: 'enum', enum: SCENERY } },
        vibes: { type: 'ARRAY', items: { type: 'STRING', format: 'enum', enum: VIBES } },
      },
      required: ['country', 'season', 'scenery', 'vibes'],
      propertyOrdering: ['country', 'season', 'scenery', 'vibes'],
    },
    tracks: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING' },
          artist: { type: 'STRING' },
          year: { type: 'INTEGER' },
          reason: { type: 'STRING' },
        },
        required: ['title', 'artist', 'reason'],
        propertyOrdering: ['title', 'artist', 'year', 'reason'],
      },
    },
  },
  required: ['destination', 'code', 'summary', 'profile', 'tracks'],
  propertyOrdering: ['destination', 'code', 'summary', 'profile', 'tracks'],
};

const only = (list, allowed, max) => [...new Set((Array.isArray(list) ? list : []).filter((x) => allowed.includes(x)))].slice(0, max);

export function normalizeProfile(p = {}) {
  return {
    country: String(p.country || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 2),
    season: SEASONS.includes(p.season) ? p.season : '',
    scenery: only(p.scenery, SCENERY, 4),
    vibes: only(p.vibes, VIBES, 3),
  };
}

// 공급자 응답을 앱 내부 형식으로 정규화 (장소 곡 + 프로필). 무드 곡은 matcher가 붙인다.
export function normalizeRecommendation(raw, { destination }) {
  const live = (Array.isArray(raw?.tracks) ? raw.tracks : [])
    .filter((t) => t && t.title && t.artist)
    .slice(0, LIVE_COUNT)
    .map((t) => ({
      title: String(t.title).trim(),
      artist: String(t.artist).trim(),
      year: Number.isInteger(t.year) ? t.year : null,
      reason: String(t.reason || '').trim(),
      videoId: null,
      source: 'live',
    }));

  const code = String(raw?.code || '').replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
  return {
    destination: String(raw?.destination || destination).trim(),
    code: code || 'DST',
    summary: String(raw?.summary || '').trim(),
    profile: normalizeProfile(raw?.profile),
    tracks: live,
  };
}
