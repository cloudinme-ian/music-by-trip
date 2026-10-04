// 태그 매칭: 여행지 프로필(AI가 태그 어휘로 생성)과 카탈로그 곡 태그를 비교해 무드 곡을 고른다.
// 순수 함수만 있으므로 브라우저와 Node(tools/match-preview.mjs) 양쪽에서 쓴다.
import { HOME_MARKET, PICK_COUNT } from './config.js';
import { MOOD_HINTS, VIBE_TEMPOS } from './tags.js';

// 점수 가중치 — 결과가 마음에 안 들면 여기부터 조정 (tools/match-preview.mjs로 확인)
export const WEIGHTS = {
  mood: 3,              // 사용자가 고른 상황이 곡의 moods에 있음
  scenery: 2,           // 풍경 태그 1개 일치당
  vibe: 2,              // 분위기 태그 1개 일치당
  maxTagMatches: 2,     // 풍경/분위기 각각 최대 이만큼만 점수 인정 (태그 많은 곡이 무조건 이기지 않게)
  seasonMatch: 1.5,     // 여행지 현재 계절과 일치
  seasonAny: 0.5,       // 계절 무관 곡
  seasonMismatch: -1.5, // 다른 계절 전용 곡 (예: 한여름 해변에 겨울 노래)
  timeMatch: 1,
  timeMismatch: -1,
  tempo: 1,             // 무드/분위기가 원하는 템포
  recent: -3,           // 최근에 보여준 곡 (완전 제외 대신 감점)
  sameMarket: -1.5,     // 이미 뽑힌 곡과 같은 나라 (다양성)
  sameTempo: -0.5,      // 이미 뽑힌 곡과 같은 템포 (다양성)
};

// 무작위성: 상위 SHORTLIST곡 안에서 점수가 높을수록 잘 뽑히게 (TEMPERATURE가 낮을수록 1등 고정)
const SHORTLIST = 8;
const TEMPERATURE = 1.2;

const normMarket = (m) => (m === 'GB' ? 'UK' : String(m || '').toUpperCase());
const intersect = (a = [], b = []) => a.filter((x) => b.includes(x));
export const songKey = (t) => `${t.artist}|${t.title}`.toLowerCase().replace(/\s+/g, '');

// 여행지 현지 곡은 무드 곡에서 제외 (장소성은 장소 곡 2곡이 담당). 단, 서비스 기준 국가(KR)는 예외.
export function isExcluded(track, profile) {
  const country = normMarket(profile?.country);
  return Boolean(country) && country !== HOME_MARKET && normMarket(track.market) === country;
}

export function scoreTrack(track, { profile = {}, mood = '', recent = new Set() } = {}) {
  const parts = [];
  let score = 0;
  const add = (label, value) => {
    if (!value) return;
    score += value;
    parts.push([label, value]);
  };

  const scenery = intersect(track.scenery, profile.scenery);
  const vibes = intersect(track.vibes, profile.vibes);
  const moodHit = Boolean(mood) && (track.moods || []).includes(mood);
  let seasonHit = false;

  if (moodHit) add(`무드 ${mood}`, WEIGHTS.mood);
  if (scenery.length) add(`풍경 ${scenery.join('·')}`, Math.min(scenery.length, WEIGHTS.maxTagMatches) * WEIGHTS.scenery);
  if (vibes.length) add(`분위기 ${vibes.join('·')}`, Math.min(vibes.length, WEIGHTS.maxTagMatches) * WEIGHTS.vibe);

  if (profile.season) {
    if (!track.seasons?.length) add('계절 무관', WEIGHTS.seasonAny);
    else if (track.seasons.includes(profile.season)) {
      seasonHit = true;
      add(`계절 ${profile.season}`, WEIGHTS.seasonMatch);
    } else add(`계절 불일치(${track.seasons.join('·')})`, WEIGHTS.seasonMismatch);
  }

  const hints = MOOD_HINTS[mood] || {};
  if (hints.times && track.times?.length) {
    if (intersect(track.times, hints.times).length) add(`시간 ${hints.times.join('·')}`, WEIGHTS.timeMatch);
    else add(`시간 불일치(${track.times.join('·')})`, WEIGHTS.timeMismatch);
  }

  const tempos = hints.tempos || [...new Set((profile.vibes || []).flatMap((v) => VIBE_TEMPOS[v] || []))];
  if (tempos.length && tempos.includes(track.tempo)) add(`템포 ${track.tempo}`, WEIGHTS.tempo);

  if (recent.has(track.id)) add('최근 본 곡', WEIGHTS.recent);

  return { track, score, parts, matched: { scenery, vibes, mood: moodHit, season: seasonHit } };
}

function diversity(track, picked) {
  let penalty = 0;
  for (const p of picked) {
    if (normMarket(p.track.market) === normMarket(track.market)) penalty += WEIGHTS.sameMarket;
    if (p.track.tempo === track.tempo) penalty += WEIGHTS.sameTempo;
  }
  return penalty;
}

// 점수 + 다양성 보정 + 가중 무작위로 count곡 선택. 반환: scoreTrack 결과 + final(보정 후 점수)
export function selectTracks(catalog, { profile, mood, recent = new Set(), exclude = [], count = PICK_COUNT, random = Math.random } = {}) {
  const excludeKeys = new Set(exclude.map(songKey));
  let pool = catalog
    .filter((t) => !isExcluded(t, profile) && !excludeKeys.has(songKey(t)))
    .map((t) => scoreTrack(t, { profile, mood, recent }));

  const picked = [];
  while (picked.length < count && pool.length) {
    const ranked = pool
      .map((s) => ({ ...s, final: s.score + diversity(s.track, picked) }))
      .sort((a, b) => b.final - a.final)
      .slice(0, SHORTLIST);
    const top = ranked[0].final;
    const weights = ranked.map((s) => Math.exp((s.final - top) / TEMPERATURE));
    let r = random() * weights.reduce((a, b) => a + b, 0);
    const chosen = ranked.find((_, i) => (r -= weights[i]) <= 0) || ranked[0];

    picked.push(chosen);
    pool = pool.filter((s) => s.track.id !== chosen.track.id && s.track.artist !== chosen.track.artist);
  }
  return picked;
}

// 받침 유무로 조사 선택 (한글이 아니면 병기)
function josa(word, withBatchim, without) {
  const code = String(word).trim().slice(-1).charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return `${withBatchim}(${without})`;
  return code % 28 ? withBatchim : without;
}

// 일치한 태그로 "왜 이 곡인지" 한 문장 만들기
export function explain({ matched }, { destination, mood }) {
  const s = matched.scenery.join('·');
  const v = matched.vibes.join('·');
  let text;
  if (s && v) text = `${destination}의 ${s} 풍경과 ${v} 분위기에 어울려요.`;
  else if (s) text = `${destination}의 ${s} 풍경에 어울려요.`;
  else if (v) text = `${v} 분위기가 ${destination}${josa(destination, '과', '와')} 잘 맞아요.`;
  else text = `${destination} 여행의 배경음악으로 무난한 곡이에요.`;
  if (matched.mood) text += ` '${mood}'에도 잘 맞아요.`;
  return text;
}

// 선택 결과 → 앱의 Track 형식
export function toTrack(result, ctx) {
  const t = result.track;
  const m = result.matched;
  return {
    title: t.title,
    artist: t.artist,
    year: t.year ?? null,
    reason: explain(result, ctx),
    videoId: t.videoId || null,
    catalogId: t.id,
    source: 'catalog',
    tags: [...m.scenery, ...m.vibes, ...(m.mood ? [ctx.mood] : []), ...(m.season ? [ctx.profile?.season] : [])],
    score: Math.round(result.final * 10) / 10,
    scoreParts: result.parts,
  };
}
