// YouTube 링크 생성 · 영상 검색 · 임시 플레이리스트 링크

const SEARCH_API = 'https://www.googleapis.com/youtube/v3/search';

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

// videoId가 없는 곡만 검색해 붙인다 (카탈로그 곡은 이미 있음 → 0 unit). 실패한 곡은 검색 링크로 남는다.
export async function attachVideoIds(tracks, apiKey) {
  const results = await Promise.allSettled(
    tracks.map((t) => (t.videoId ? Promise.resolve(t.videoId) : findVideoId(t, apiKey)))
  );
  const firstError = results.find((r) => r.status === 'rejected')?.reason;
  return {
    tracks: tracks.map((t, i) => ({
      ...t,
      videoId: results[i].status === 'fulfilled' ? results[i].value : null,
    })),
    error: firstError ? firstError.message : null,
  };
}
