#!/usr/bin/env node
// 카탈로그 관리 도구 (Node 18+)
//
//   YT_API_KEY=... node tools/resolve-catalog.mjs [--limit 90]
//     videoId가 없는 곡을 YouTube Data API search.list로 찾아 채운다 (곡당 100 units).
//     기본 일일 할당량 10,000 units → 하루 90곡 정도가 안전.
//
//   node tools/resolve-catalog.mjs --verify
//     저장된 videoId가 아직 재생 가능한지 oEmbed로 확인한다 (API 키·할당량 불필요).
//     삭제/비공개된 영상은 videoId를 비워 다음 resolve 때 다시 찾게 한다.
import { readFile, writeFile } from 'node:fs/promises';

const FILE = new URL('../data/catalog.json', import.meta.url);
const args = process.argv.slice(2);
const verify = args.includes('--verify');
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 90;

const catalog = JSON.parse(await readFile(FILE, 'utf8'));
const tracks = catalog.tracks;

if (verify) {
  let broken = 0;
  for (const t of tracks.filter((t) => t.videoId)) {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${t.videoId}`)}`;
    const res = await fetch(url);
    if (res.ok) continue;
    console.log(`✗ ${t.id} ${t.artist} - ${t.title} (${t.videoId}) → HTTP ${res.status}, 비움`);
    t.videoId = null;
    broken++;
  }
  console.log(`확인 완료: 깨진 영상 ${broken}개`);
} else {
  const key = process.env.YT_API_KEY;
  if (!key) {
    console.error('YT_API_KEY 환경 변수가 필요합니다.');
    process.exit(1);
  }
  const todo = tracks.filter((t) => !t.videoId).slice(0, limit);
  console.log(`videoId 없는 곡 ${tracks.filter((t) => !t.videoId).length}개 중 ${todo.length}개 검색 (약 ${todo.length * 100} units)`);
  for (const t of todo) {
    const params = new URLSearchParams({
      part: 'snippet', type: 'video', videoCategoryId: '10', maxResults: '1',
      q: `${t.artist} ${t.title}`, key,
    });
    const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`중단: ${data?.error?.errors?.[0]?.reason || res.status}`);
      break; // 할당량 초과 등 — 지금까지 찾은 결과는 저장
    }
    const item = data.items?.[0];
    if (!item) {
      console.log(`? ${t.id} ${t.artist} - ${t.title}: 결과 없음`);
      continue;
    }
    t.videoId = item.id.videoId;
    console.log(`✓ ${t.id} ${t.artist} - ${t.title} → ${t.videoId} "${item.snippet.title}"`);
  }
}

catalog.updated = new Date().toISOString().slice(0, 10);
await writeFile(FILE, serialize(catalog));

// 곡 하나를 한 줄로 유지해 diff/검수가 쉽도록 직렬화
function serialize({ tracks, ...meta }) {
  const head = Object.entries(meta).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const value = (v) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v));
  const line = (t) => `{ ${Object.entries(t).map(([k, v]) => `${JSON.stringify(k)}: ${value(v)}`).join(', ')} }`;
  const rows = tracks.map((t, i) => `    ${line(t)}${i < tracks.length - 1 ? ',' : ''}`);
  return `{\n${head.join('\n')}\n  "tracks": [\n${rows.join('\n')}\n  ]\n}\n`;
}
