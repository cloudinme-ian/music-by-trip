#!/usr/bin/env node
// 카탈로그 검증: 태그 어휘, 필수 필드, 중복, 분포를 확인한다.
//   node tools/check-catalog.mjs [파일=data/catalog.json]
import { readFile } from 'node:fs/promises';
import { MOODS, SCENERY, VIBES, SEASONS, TIMES, TEMPOS } from '../js/tags.js';

const file = process.argv[2] || new URL('../data/catalog.json', import.meta.url);
const { tracks = [] } = JSON.parse(await readFile(file, 'utf8'));

const errors = [];
const warns = [];
const ids = new Set();
const songs = new Set();
const VOCAB = { moods: MOODS, seasons: SEASONS, times: TIMES, scenery: SCENERY, vibes: VIBES };

for (const t of tracks) {
  const at = `${t.id ?? '(id 없음)'} ${t.artist ?? '?'} - ${t.title ?? '?'}`;
  if (!/^c\d{3,}$/.test(t.id || '')) errors.push(`${at}: id 형식은 c001 같은 형태`);
  if (ids.has(t.id)) errors.push(`${at}: 중복 id`);
  ids.add(t.id);
  const key = `${t.artist}|${t.title}`.toLowerCase().replace(/\s+/g, '');
  if (songs.has(key)) errors.push(`${at}: 같은 곡이 이미 있음`);
  songs.add(key);
  if (!t.title || !t.artist) errors.push(`${at}: title/artist 필수`);
  if (!Number.isInteger(t.year)) warns.push(`${at}: year 없음`);
  if (!/^[A-Z]{2}$/.test(t.market || '')) errors.push(`${at}: market은 2글자 대문자 국가 코드 (영국은 UK)`);
  if (!TEMPOS.includes(t.tempo)) errors.push(`${at}: tempo는 ${TEMPOS.join('/')}`);
  for (const [field, allowed] of Object.entries(VOCAB)) {
    if (!Array.isArray(t[field])) { errors.push(`${at}: ${field}는 배열이어야 함`); continue; }
    const bad = t[field].filter((x) => !allowed.includes(x));
    if (bad.length) errors.push(`${at}: ${field}에 어휘 밖의 값 ${JSON.stringify(bad)}`);
  }
  if (!t.moods?.length) errors.push(`${at}: moods 최소 1개`);
  if (!t.scenery?.length) warns.push(`${at}: scenery 없음 → 풍경 매칭 불가`);
  if (!t.vibes?.length) warns.push(`${at}: vibes 없음 → 분위기 매칭 불가`);
  if ((t.scenery?.length || 0) > 3 || (t.vibes?.length || 0) > 3) warns.push(`${at}: 태그가 많으면 변별력이 떨어짐 (풍경·분위기 각 2~3개 권장)`);
}

const count = (field) => {
  const c = {};
  for (const t of tracks) for (const v of [].concat(t[field] ?? [])) c[v] = (c[v] || 0) + 1;
  return c;
};
const show = (title, c, all) =>
  console.log(`${title}: ${(all || Object.keys(c)).map((k) => `${k} ${c[k] || 0}`).join(' · ')}`);

console.log(`곡 ${tracks.length}개 · videoId 있음 ${tracks.filter((t) => t.videoId).length}개\n`);
show('나라', count('market'));
show('무드', count('moods'), MOODS);
show('풍경', count('scenery'), SCENERY);
show('분위기', count('vibes'), VIBES);
show('계절', count('seasons'), SEASONS);
show('템포', count('tempo'), TEMPOS);

const thin = MOODS.filter((m) => (count('moods')[m] || 0) < Math.max(3, tracks.length * 0.1));
if (thin.length) warns.push(`곡이 적은 무드: ${thin.join(', ')} (무드마다 전체의 10% 이상 권장)`);

if (warns.length) console.log(`\n⚠ 경고 ${warns.length}\n- ${warns.join('\n- ')}`);
if (errors.length) {
  console.log(`\n✗ 오류 ${errors.length}\n- ${errors.join('\n- ')}`);
  process.exit(1);
}
console.log('\n✓ 오류 없음');
