// 카탈로그 곡과 여행지 프로필이 "같이" 쓰는 태그 어휘.
// 매칭은 같은 단어끼리만 일어나므로, 카탈로그·AI 프롬프트·검증 도구 모두 이 목록을 기준으로 한다.

// 듣는 상황 (사용자가 칩으로 선택)
export const MOODS = ['드라이브', '산책', '카페', '야경', '비 오는 날', '비행기 안'];

// 풍경: 여행지에 "보이는 것"
export const SCENERY = ['바다', '섬', '산', '숲', '호수·강', '시골·들판', '설경', '사막', '도시', '골목', '유적·고도', '도로'];

// 분위기: 여행지에서 "느껴지는 것"
export const VIBES = ['낭만', '여유', '활기', '고요', '레트로', '이국적', '쓸쓸함', '설렘', '모험', '힐링'];

export const SEASONS = ['봄', '여름', '가을', '겨울'];
export const TIMES = ['낮', '밤'];
export const TEMPOS = ['slow', 'mid', 'fast'];

// 무드 → 어울리는 템포/시간대 힌트 (곡의 moods 태그와 별개로 가산점)
export const MOOD_HINTS = {
  '드라이브': { tempos: ['mid', 'fast'] },
  '산책': { tempos: ['slow', 'mid'], times: ['낮'] },
  '카페': { tempos: ['slow'] },
  '야경': { times: ['밤'] },
  '비 오는 날': { tempos: ['slow'] },
  '비행기 안': { tempos: ['slow', 'mid'] },
};

// 분위기 → 어울리는 템포 (무드를 고르지 않았을 때 템포 선호를 추정)
export const VIBE_TEMPOS = {
  '낭만': ['slow', 'mid'],
  '여유': ['slow', 'mid'],
  '활기': ['mid', 'fast'],
  '고요': ['slow'],
  '레트로': [],
  '이국적': [],
  '쓸쓸함': ['slow'],
  '설렘': ['mid', 'fast'],
  '모험': ['mid', 'fast'],
  '힐링': ['slow', 'mid'],
};
