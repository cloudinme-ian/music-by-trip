// 큐레이션 카탈로그 로딩과 "최근 본 곡" 기록 (선택 로직은 js/matcher.js)

const CATALOG_URL = 'data/catalog.json';
const RECENT_KEY = 'music-by-trip:recent-catalog';
const RECENT_LIMIT = 30; // 최근 보여준 곡을 이만큼 기억해 감점한다

let catalogPromise = null;

export function loadCatalog() {
  catalogPromise ??= fetch(CATALOG_URL)
    .then((res) => {
      if (!res.ok) throw new Error(`카탈로그를 불러오지 못했습니다 (${res.status}).`);
      return res.json();
    })
    .then((data) => data.tracks || [])
    .catch((err) => {
      catalogPromise = null; // 다음 시도에서 다시 받기
      throw err;
    });
  return catalogPromise;
}

export function readRecent() {
  try {
    return new Set(JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

export function rememberShown(ids) {
  try {
    const next = [...ids, ...[...readRecent()].filter((id) => !ids.includes(id))].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {}
}
