// UI 상태 관리와 렌더링
import { MOODS, loadSettings, saveSettings, clearSettings, DEFAULTS } from './config.js';
import { PROVIDERS, getProvider } from './providers/index.js';
import * as yt from './youtube.js';
import { SAMPLE } from './sample.js';
import { loadCatalog, readRecent, rememberShown } from './catalog.js';
import { selectTracks, toTrack } from './matcher.js';

const $ = (sel) => document.querySelector(sel);

const els = {
  form: $('#search-form'),
  input: $('#destination'),
  submit: $('#submit-btn'),
  moods: $('#moods'),
  result: $('#result'),
  demo: $('#demo-btn'),
  providerLabel: $('#provider-label'),
  dialog: $('#settings'),
  settingsForm: $('#settings-form'),
  openSettings: $('#open-settings'),
  closeSettings: $('#close-settings'),
  clearKeys: $('#clear-keys'),
  provider: $('#provider'),
  geminiKey: $('#gemini-key'),
  geminiModel: $('#gemini-model'),
  youtubeKey: $('#youtube-key'),
};

let settings = loadSettings();
let selectedMood = '';
let busy = false;
let currentRec = null;

const params = new URLSearchParams(location.search);
const DEBUG = params.has('debug');

const HTML_TO_IMAGE = 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.11/+esm';

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Moods ----------
function renderMoods() {
  els.moods.innerHTML = MOODS.map(
    (m) => `<button type="button" class="chip" aria-pressed="false" data-mood="${escapeHtml(m)}">${escapeHtml(m)}</button>`
  ).join('');
  els.moods.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const mood = chip.dataset.mood;
    selectedMood = selectedMood === mood ? '' : mood;
    els.moods.querySelectorAll('.chip').forEach((c) =>
      c.setAttribute('aria-pressed', String(c.dataset.mood === selectedMood))
    );
  });
}

// ---------- Settings ----------
function fillSettingsForm() {
  els.provider.innerHTML = Object.entries(PROVIDERS)
    .map(([id, p]) => `<option value="${id}">${escapeHtml(p.label)}</option>`)
    .join('');
  els.provider.value = settings.provider;
  els.geminiKey.value = settings.geminiKey;
  els.geminiModel.value = settings.geminiModel;
  els.youtubeKey.value = settings.youtubeKey;
}

function openSettings() {
  fillSettingsForm();
  els.dialog.showModal();
}

function bindSettings() {
  els.openSettings.addEventListener('click', openSettings);
  els.closeSettings.addEventListener('click', () => els.dialog.close());
  els.clearKeys.addEventListener('click', () => {
    clearSettings();
    settings = loadSettings();
    fillSettingsForm();
    updateProviderLabel();
  });
  els.settingsForm.addEventListener('submit', () => {
    settings = {
      provider: els.provider.value,
      geminiKey: els.geminiKey.value.trim(),
      geminiModel: els.geminiModel.value.trim() || DEFAULTS.geminiModel,
      youtubeKey: els.youtubeKey.value.trim(),
    };
    saveSettings(settings);
    updateProviderLabel();
  });
}

function updateProviderLabel() {
  els.providerLabel.textContent = getProvider(settings.provider).label;
}

// ---------- Rendering ----------
function renderLoading(destination) {
  els.result.innerHTML = `
    <article class="pass skeleton" aria-busy="true">
      <div class="pass-head"><span>BOARDING PASS</span><span>CHECK-IN</span></div>
      <p class="status-msg">${escapeHtml(destination)}행 사운드트랙 체크인 중…</p>
      ${'<div class="bar"></div>'.repeat(6)}
      <div class="barcode" style="opacity:.2"></div>
    </article>`;
}

function renderError(message, { showSettings = false } = {}) {
  els.result.innerHTML = `
    <div class="error" role="alert">
      <strong>추천을 가져오지 못했어요.</strong>
      <p>${escapeHtml(message)}</p>
      ${showSettings ? '<p><button type="button" class="link-btn" data-action="settings">⚙ 설정 열기</button></p>' : ''}
    </div>`;
}

function trackLinks(t) {
  if (t.videoId) {
    return `
      <a class="pill" href="${yt.watchUrl(t.videoId)}" target="_blank" rel="noopener" title="YouTube에서 재생">YT</a>
      <a class="pill" href="${yt.musicWatchUrl(t.videoId)}" target="_blank" rel="noopener" title="YouTube Music에서 재생">MUSIC</a>`;
  }
  return `
    <a class="pill" href="${yt.youtubeSearchUrl(t)}" target="_blank" rel="noopener" title="YouTube에서 검색">YT</a>
    <a class="pill" href="${yt.musicSearchUrl(t)}" target="_blank" rel="noopener" title="YouTube Music에서 검색">MUSIC</a>`;
}

// ?debug: 여행지 프로필과 무드 곡 점수 내역 표시 (태그·가중치 튜닝용)
function renderDebug(rec) {
  const p = rec.profile || {};
  const rows = rec.tracks.filter((t) => t.source === 'catalog').map((t) => `
    <tr><td>${escapeHtml(t.catalogId)} ${escapeHtml(t.artist)} - ${escapeHtml(t.title)}</td><td>${t.score}</td>
    <td>${t.scoreParts.map(([k, v]) => `${escapeHtml(k)} ${v > 0 ? '+' : ''}${v}`).join(', ')}</td></tr>`).join('');
  return `
    <details class="debug" data-capture="skip" open>
      <summary>매칭 디버그</summary>
      <p>프로필 — 나라 ${escapeHtml(p.country)} · 계절 ${escapeHtml(p.season)} · 풍경 ${escapeHtml((p.scenery || []).join(', '))} · 분위기 ${escapeHtml((p.vibes || []).join(', '))}</p>
      <div class="debug-table"><table><tr><th>곡</th><th>최종 점수</th><th>내역 (다양성 보정 전)</th></tr>${rows}</table></div>
    </details>`;
}

// 장소 곡(AI) + 무드 곡(카탈로그 태그 매칭) 합치기
async function withCatalogPicks(rec, mood) {
  const catalog = await loadCatalog();
  const picks = selectTracks(catalog, { profile: rec.profile, mood, recent: readRecent(), exclude: rec.tracks });
  const ctx = { destination: rec.destination, mood, profile: rec.profile };
  return { ...rec, tracks: [...rec.tracks, ...picks.map((p) => toTrack(p, ctx))] };
}

function renderPass(rec, { mood, ytNote }) {
  const ids = rec.tracks.map((t) => t.videoId).filter(Boolean);
  const flightNo = `MBT ${String(rec.tracks.length).padStart(2, '0')}${rec.code.charCodeAt(0) % 10}`;
  const issued = new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD (로컬 시간)
  currentRec = { ...rec, issued };

  const items = rec.tracks.map((t, i) => `
    <li class="track">
      <span class="track-no">${String(i + 1).padStart(2, '0')}</span>
      <div>
        ${t.videoId ? `<img class="track-thumb" src="${yt.thumbnailUrl(t.videoId)}" alt="" loading="lazy">` : ''}
        <p class="track-title">${escapeHtml(t.title)}${t.source === 'live' ? ' <span class="track-tag" title="AI가 여행지에 맞춰 실시간으로 고른 장소 곡">LOCAL</span>' : ''}</p>
        <span class="track-artist">${escapeHtml(t.artist)}${t.year ? ` · ${t.year}` : ''}</span>
      </div>
      <div class="track-links" data-capture="skip">${trackLinks(t)}</div>
      ${t.reason ? `<p class="track-reason">${escapeHtml(t.reason)}</p>` : ''}
      ${t.tags?.length ? `<p class="track-tags">${t.tags.map((x) => `#${escapeHtml(x)}`).join(' ')}</p>` : ''}
    </li>`).join('');

  const playlist = ids.length >= 2
    ? `<a class="btn btn-primary" href="${yt.playlistUrl(ids)}" target="_blank" rel="noopener">▶ 플레이리스트로 전체 재생</a>`
    : '';
  const note = ytNote || (ids.length < 2
    ? '⚙ 설정에 YouTube Data API 키를 넣으면 실제 영상 링크와 전체 재생 플레이리스트 링크가 만들어집니다.'
    : '');

  els.result.innerHTML = `
    <article class="pass">
      <div class="pass-head"><span>BOARDING PASS</span><span>${escapeHtml(flightNo)} · ${issued}</span></div>
      <div class="pass-route">
        <div class="from">
          <div class="label">FROM</div>
          <div class="code">HRE</div>
          <div class="name">지금 여기</div>
        </div>
        <div class="plane" aria-hidden="true">✈︎</div>
        <div class="to">
          <div class="label">TO</div>
          <div class="code">${escapeHtml(rec.code)}</div>
          <div class="name">${escapeHtml(rec.destination)}${mood ? ` · ${escapeHtml(mood)}` : ''}</div>
        </div>
      </div>
      ${rec.summary ? `<p class="pass-summary">${escapeHtml(rec.summary)}</p>` : ''}
      <div class="perforation" aria-hidden="true"></div>
      <ol class="tracks">${items}</ol>
      <div class="perforation" aria-hidden="true"></div>
      <div class="pass-foot" data-capture="skip">
        ${playlist}
        <button type="button" class="btn btn-ghost" data-action="save-image">이미지로 저장</button>
        <button type="button" class="btn btn-ghost" data-action="copy">목록 복사</button>
        ${note ? `<p class="pass-note">${escapeHtml(note)}</p>` : ''}
      </div>
      <div class="barcode" aria-hidden="true"></div>
      ${DEBUG ? renderDebug(rec) : ''}
    </article>`;

  els.result.dataset.copy = [
    `🎧 ${rec.destination} 여행 사운드트랙`,
    ...rec.tracks.map((t, i) => `${i + 1}. ${t.artist} - ${t.title}  ${t.videoId ? yt.watchUrl(t.videoId) : yt.musicSearchUrl(t)}`),
    ids.length >= 2 ? `▶ ${yt.playlistUrl(ids)}` : '',
  ].filter(Boolean).join('\n');
}

els.result.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  if (btn.dataset.action === 'settings') openSettings();
  if (btn.dataset.action === 'save-image') savePassImage(btn);
  if (btn.dataset.action === 'copy') {
    try {
      await navigator.clipboard.writeText(els.result.dataset.copy || '');
      btn.textContent = '복사됨 ✓';
    } catch {
      btn.textContent = '복사 실패';
    }
  }
});

// ---------- Save as image ----------
// 보딩패스를 PNG로 만든다. 링크 버튼 등 data-capture="skip" 요소는 이미지에서 제외(CSS).
async function savePassImage(btn) {
  const pass = els.result.querySelector('.pass');
  if (!pass || !currentRec) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = '이미지 만드는 중…';
  try {
    const { toBlob } = await import(HTML_TO_IMAGE);
    // 화면 밖에 여백 있는 복제본을 만들어 촬영 (절취선 홈·둥근 모서리가 배경 위에 보이도록)
    const host = document.createElement('div'); // 화면 밖 배치용 (이미지에는 포함되지 않음)
    host.className = 'capture-host';
    const stage = document.createElement('div');
    stage.className = 'capture-stage';
    stage.style.width = `${pass.offsetWidth}px`;
    stage.append(pass.cloneNode(true));
    host.append(stage);
    document.body.append(host);
    let blob;
    try {
      blob = await toBlob(stage, {
        pixelRatio: 2,
        imagePlaceholder: 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==',
      });
    } finally {
      host.remove();
    }
    if (!blob) throw new Error('이미지를 만들지 못했습니다.');

    const name = `music-by-trip_${currentRec.code}_${currentRec.issued}.png`;
    const file = new File([blob], name, { type: 'image/png' });
    // 모바일: 공유 시트(사진 앱 저장), 데스크톱: 파일 다운로드
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: `${currentRec.destination} 여행 사운드트랙` });
    } else {
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    btn.textContent = '저장됨 ✓';
  } catch (err) {
    if (err?.name === 'AbortError') {
      btn.textContent = label; // 공유 취소
    } else {
      console.error(err);
      btn.textContent = '저장 실패';
    }
  } finally {
    btn.disabled = false;
  }
}

// ---------- Flow ----------
async function recommend(destination, mood) {
  const provider = getProvider(settings.provider);
  const creds = provider.credentials(settings);
  if (!creds.apiKey) {
    renderError(`${provider.label} API 키가 필요합니다.`, { showSettings: true });
    openSettings();
    return;
  }

  setBusy(true);
  renderLoading(destination);
  try {
    loadCatalog().catch(() => {}); // AI 응답을 기다리는 동안 미리 받아 두기
    let rec = await withCatalogPicks(await provider.recommend({ ...creds, destination, mood }), mood);
    rememberShown(rec.tracks.map((t) => t.catalogId).filter(Boolean));
    let ytNote = '';
    if (settings.youtubeKey) {
      const { tracks, error } = await yt.attachVideoIds(rec.tracks, settings.youtubeKey);
      rec = { ...rec, tracks };
      if (error) ytNote = `일부 곡은 영상을 찾지 못해 검색 링크로 표시합니다. (${error})`;
    }
    renderPass(rec, { mood, ytNote });
  } catch (err) {
    console.error(err);
    renderError(err.message || String(err), { showSettings: /키|key/i.test(err.message) });
  } finally {
    setBusy(false);
  }
}

function setBusy(value) {
  busy = value;
  els.submit.disabled = value;
  els.submit.textContent = value ? '추천 중…' : '추천 받기';
}

// 샘플: 장소 곡·프로필은 고정, 무드 곡은 실제 매칭 로직으로 고른다
async function showDemo() {
  els.input.value = SAMPLE.destination;
  const note = '샘플 결과입니다. ⚙ 설정에서 Gemini API 키를 넣으면 실제 추천을 받을 수 있어요.';
  try {
    renderPass(await withCatalogPicks(SAMPLE, selectedMood), { mood: selectedMood, ytNote: note });
  } catch (err) {
    renderError(err.message || String(err));
  }
}

// ---------- Init ----------
renderMoods();
bindSettings();
updateProviderLabel();

els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  const destination = els.input.value.trim();
  if (!destination || busy) return;
  recommend(destination, selectedMood);
});
els.demo.addEventListener('click', showDemo);

if (params.has('demo')) showDemo();
