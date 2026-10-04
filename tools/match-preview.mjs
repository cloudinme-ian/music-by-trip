#!/usr/bin/env node
// 태그 매칭 미리보기: 여행지 프로필을 직접 넣어 어떤 무드 곡이 몇 점으로 뽑히는지 본다 (AI 호출 없음).
//   node tools/match-preview.mjs --country JP --season 가을 --scenery 유적·고도,골목 --vibes 고요,낭만 [--mood 산책] [--dest 교토] [--top 10] [--runs 200]
import { readFile } from 'node:fs/promises';
import { scoreTrack, selectTracks, isExcluded, explain, WEIGHTS } from '../js/matcher.js';
import { normalizeProfile } from '../js/prompt.js';

const arg = (name, def = '') => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
};
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);

const profile = normalizeProfile({
  country: arg('country'), season: arg('season'), scenery: list(arg('scenery')), vibes: list(arg('vibes')),
});
const mood = arg('mood');
const destination = arg('dest', '여행지');
const top = Number(arg('top', 10));
const runs = Number(arg('runs', 200));

const { tracks } = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
console.log('프로필', profile, mood ? `무드 ${mood}` : '(무드 없음)');

const scored = tracks
  .filter((t) => !isExcluded(t, profile))
  .map((t) => scoreTrack(t, { profile, mood }))
  .sort((a, b) => b.score - a.score);
console.log(`\n점수 상위 ${top}곡 (현지 곡 제외 ${tracks.length - scored.length}곡, 다양성 보정 전)`);
for (const s of scored.slice(0, top)) {
  console.log(`${String(s.score).padStart(5)}  ${s.track.id} ${s.track.artist} - ${s.track.title}`);
  console.log(`       ${s.parts.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ')}`);
  console.log(`       "${explain(s, { destination, mood })}"`);
}

// 같은 프로필로 여러 번 뽑았을 때 곡별 선택 빈도 (무작위성·편중 확인)
const freq = {};
for (let i = 0; i < runs; i++) {
  for (const p of selectTracks(tracks, { profile, mood })) freq[p.track.id] = (freq[p.track.id] || 0) + 1;
}
console.log(`\n${runs}회 선택 시 등장 빈도`);
for (const [id, n] of Object.entries(freq).sort((a, b) => b[1] - a[1])) {
  const t = tracks.find((x) => x.id === id);
  console.log(`${String(Math.round((n / runs) * 100)).padStart(4)}%  ${id} ${t.artist} - ${t.title}`);
}
console.log('\n가중치', WEIGHTS);
