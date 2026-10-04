#!/usr/bin/env node
// 카탈로그 영상 ID 관리 도구 (Node 18+)
//
//   GEMINI_API_KEY=... node tools/resolve-catalog.mjs --ai [--limit 90]
//     Gemini에게 영상 ID를 물어보고, oEmbed로 실제 영상 제목·채널이 곡과 맞는 것만 채운다.
//     YouTube 할당량 0. 확인 실패한 곡은 비워 둔다 (다시 --ai, 또는 아래 YT_API_KEY 모드).
//
//   YT_API_KEY=... node tools/resolve-catalog.mjs [--limit 90]
//     videoId가 없는 곡을 YouTube Data API search.list로 찾아 채운다 (곡당 100 units).
//     기본 일일 할당량 10,000 units → 하루 90곡 정도가 안전.
//
//   node tools/resolve-catalog.mjs --verify
//     저장된 videoId가 아직 재생 가능하고 곡과 맞는지 oEmbed로 확인한다 (API 키·할당량 불필요).
//     삭제/비공개되었거나 다른 영상이면 videoId를 비워 다음 resolve 때 다시 찾게 한다.
import { readFile, writeFile } from 'node:fs/promises';
import { fetchOEmbed, matchesTrack, verifyVideoId, VIDEO_ID_RE } from '../js/youtube.js';

const FILE = new URL('../data/catalog.json', import.meta.url);
const args = process.argv.slice(2);
const limitIdx = args.indexOf('--limit');
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 90;

const catalog = JSON.parse(await readFile(FILE, 'utf8'));
const tracks = catalog.tracks;
const label = (t) => `${t.id} ${t.artist} - ${t.title}`;

if (args.includes('--verify')) await verifyAll();
else if (args.includes('--ai')) await resolveWithGemini();
else await resolveWithSearch();

catalog.updated = new Date().toISOString().slice(0, 10);
await writeFile(FILE, serialize(catalog));

async function verifyAll() {
  let broken = 0;
  for (const t of tracks.filter((t) => t.videoId)) {
    const info = await fetchOEmbed(t.videoId);
    if (info && matchesTrack(info, t)) continue;
    console.log(`✗ ${label(t)} (${t.videoId}) → ${info ? `다른 영상 "${info.title}" / ${info.author_name}` : '없음/비공개'}, 비움`);
    t.videoId = null;
    broken++;
  }
  console.log(`확인 완료: 깨진/불일치 영상 ${broken}개`);
}

async function resolveWithGemini() {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  if (!key) exit('GEMINI_API_KEY 환경 변수가 필요합니다.');

  const todo = tracks.filter((t) => !t.videoId).slice(0, limit);
  console.log(`videoId 없는 곡 ${todo.length}개 → Gemini(${model})에 질의 → oEmbed로 확인 (YouTube 할당량 0)`);
  if (!todo.length) return;

  const prompt = `아래 곡들의 공식 뮤직비디오 또는 공식 음원(아티스트 채널·Topic 채널) YouTube 영상 ID(11자리)를 알려 주세요.
정확히 알고 있는 것만 쓰고, 조금이라도 확실하지 않으면 빈 문자열로 두세요.

${todo.map((t) => `${t.id} | ${t.artist} - ${t.title}`).join('\n')}`;

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'ARRAY',
          items: {
            type: 'OBJECT',
            properties: { id: { type: 'STRING' }, videoId: { type: 'STRING' } },
            required: ['id', 'videoId'],
          },
        },
      },
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) exit(`Gemini 오류 (${res.status}) ${data?.error?.message || ''}`);

  const text = (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('');
  const suggested = new Map(JSON.parse(text || '[]').map((x) => [x.id, x.videoId]));

  let ok = 0;
  for (const t of todo) {
    const id = suggested.get(t.id);
    if (!VIDEO_ID_RE.test(id || '')) {
      console.log(`- ${label(t)}: 제안 없음`);
      continue;
    }
    if (await verifyVideoId(id, t)) {
      t.videoId = id;
      ok++;
      console.log(`✓ ${label(t)} → ${id}`);
    } else {
      const info = await fetchOEmbed(id);
      console.log(`✗ ${label(t)}: ${id} → ${info ? `다른 영상 "${info.title}" / ${info.author_name}` : '존재하지 않음'}`);
    }
  }
  console.log(`확인된 ID ${ok}/${todo.length}개 저장`);
}

async function resolveWithSearch() {
  const key = process.env.YT_API_KEY;
  if (!key) exit('YT_API_KEY 환경 변수가 필요합니다. (할당량 없이 채우려면 GEMINI_API_KEY와 --ai)');

  const todo = tracks.filter((t) => !t.videoId).slice(0, limit);
  console.log(`videoId 없는 곡 ${todo.length}개 검색 (약 ${todo.length * 100} units)`);
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
      console.log(`? ${label(t)}: 결과 없음`);
      continue;
    }
    t.videoId = item.id.videoId;
    const mark = matchesTrack({ title: item.snippet.title, author_name: item.snippet.channelTitle }, t) ? '✓' : '⚠ 검수 필요';
    console.log(`${mark} ${label(t)} → ${t.videoId} "${item.snippet.title}"`);
  }
}

function exit(message) {
  console.error(message);
  process.exit(1);
}

// 곡 하나를 한 줄로 유지해 diff/검수가 쉽도록 직렬화
function serialize({ tracks, ...meta }) {
  const head = Object.entries(meta).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`);
  const value = (v) => (Array.isArray(v) ? `[${v.map((x) => JSON.stringify(x)).join(', ')}]` : JSON.stringify(v));
  const line = (t) => `{ ${Object.entries(t).map(([k, v]) => `${JSON.stringify(k)}: ${value(v)}`).join(', ')} }`;
  const rows = tracks.map((t, i) => `    ${line(t)}${i < tracks.length - 1 ? ',' : ''}`);
  return `{\n${head.join('\n')}\n  "tracks": [\n${rows.join('\n')}\n  ]\n}\n`;
}
