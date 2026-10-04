// YouTube 링크 생성 · 영상 ID 확인/검색 · 임시 플레이리스트 링크
//
// 영상 ID를 얻는 순서 (앞 단계에서 찾으면 뒤 단계는 건너뜀):
//   1. 이미 있음 (카탈로그 곡)                         → 0 unit
//   2. AI가 제안한 ID를 oEmbed로 확인 (키 불필요)      → 0 unit
//   3. 사용자 YouTube 키가 있으면 search.list         → 곡당 100 units
//   4. 못 찾으면 검색 링크

const SEARCH_API = 'https://www.googleapis.com/youtube/v3/search';
const OEMBED = 'https://www.youtube.com/oembed';
export const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;

const query = (t) => `${t.artist} ${t.title}`;

export function musicSearchUrl(track) {
  return `https://music.youtube.com/search?q=${encodeURIComponent(query(track))}`;
}

export function youtubeSearchUrl(track) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query(track))}`;
}

export function watchUrl(videoId) {
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function musicWatchUrl(videoId) {
  return `https://music.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
}

export function thumbnailUrl(videoId) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}

// 로그인 없이 만드는 임시(무제) 재생목록 링크
export function playlistUrl(videoIds) {
  return `https://www.youtube.com/watch_videos?video_ids=${videoIds.map(encodeURIComponent).join(',')}`;
}

// 곡 하나의 대표 영상 ID 검색 (search.list = 100 units)
async function findVideoId(track, apiKey) {
  const params = new URLSearchParams({
    part: 'snippet',
    type: 'video',
    videoCategoryId: '10', // Music
    maxResults: '1',
    q: query(track),
    key: apiKey,
  });
  const res = await fetch(`${SEARCH_API}?${params}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason || res.status;
    throw new Error(`YouTube 검색 실패 (${reason})`);
  }
  return data.items?.[0]?.id?.videoId || null;
}

// ---------- 키 없이 확인: oEmbed ----------

// 비교용 정규화: 대소문자·공백·기호 제거 (모든 문자 체계의 글자/숫자는 유지)
const norm = (s) => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
// "Best Part (feat. H.E.R.)" → "Best Part"
const coreTitle = (s) => String(s || '').replace(/\s*[([（【].*?[)\]）】]\s*/g, ' ').trim() || s;
const artistParts = (s) =>
  String(s || '').split(/\s*(?:&|,|\/|\bx\b|\bfeat\.?|\bft\.?|\band\b|와|과)\s*/i).map(norm).filter((p) => p.length >= 2);
const channelName = (s) => String(s || '').replace(/\s*-\s*Topic$/i, '').replace(/VEVO$/i, '');
const UNWANTED = /cover|커버|karaoke|노래방|reaction|리액션|tutorial|강좌|lesson|\bmr\b|instrumental cover/i;

// oEmbed 결과(영상 제목·채널)가 곡과 맞는지: 곡 제목이 영상 제목에 있고, 아티스트가 제목이나 채널에 있어야 함
export function matchesTrack(info, track) {
  if (!info?.title || UNWANTED.test(info.title)) return false;
  const title = norm(info.title);
  const where = title + norm(channelName(info.author_name));
  const songTitle = norm(coreTitle(track.title));
  if (!songTitle || !title.includes(songTitle)) return false;
  return artistParts(track.artist).some((a) => where.includes(a));
}

// 영상이 존재하면 { title, author_name }, 없거나 비공개면 null. 키·할당량 불필요.
export async function fetchOEmbed(videoId) {
  if (!VIDEO_ID_RE.test(videoId || '')) return null;
  const url = `${OEMBED}?format=json&url=${encodeURIComponent(watchUrl(videoId))}`;
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

export async function verifyVideoId(videoId, track) {
  const info = await fetchOEmbed(videoId);
  return info && matchesTrack(info, track) ? videoId : null;
}

// ---------- 전체 해결 ----------

// 곡마다 위 순서대로 videoId를 채운다. suggestedId(AI 제안)는 확인 후 버린다.
export async function resolveVideoIds(tracks, { apiKey } = {}) {
  const errors = [];
  const resolved = await Promise.all(
    tracks.map(async ({ suggestedId, ...t }) => {
      if (t.videoId) return { ...t, idSource: t.idSource || 'catalog' };
      const verified = suggestedId ? await verifyVideoId(suggestedId, t) : null;
      if (verified) return { ...t, videoId: verified, idSource: 'ai-verified' };
      if (apiKey) {
        try {
          const found = await findVideoId(t, apiKey);
          if (found) return { ...t, videoId: found, idSource: 'search' };
        } catch (err) {
          errors.push(err.message);
        }
      }
      return { ...t, videoId: null };
    })
  );
  return { tracks: resolved, error: errors[0] || null };
}
