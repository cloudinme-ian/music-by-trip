# 다중 에이전트 작업 계획 (DRAFT)

> 상태: **draft v0.1** — 역할·계약·흐름의 초안입니다. 실제 운영하면서 다듬습니다.

## 1. 목표
Music by Trip을 역할이 분리된 여러 AI 에이전트가 **병렬로** 개발하되,
서로의 파일을 덮어쓰지 않고 **명시된 인터페이스 계약**으로만 협업하도록 합니다.

## 2. 에이전트 구성

| 에이전트 | 역할 | 소유 파일 (쓰기 권한) | 읽기 참고 |
|---|---|---|---|
| **orchestrator** (메인 세션) | 작업 분해, 할당, 결과 통합, 커밋 | `README.md`, `docs/` | 전체 |
| **ui-designer** | 보딩패스 디자인, 반응형, 다크모드, 접근성 | `css/style.css`, `index.html`(마크업 구조) | `README.md` 2장 |
| **frontend-dev** | UI 상태/렌더링, 설정 다이얼로그, 공유 URL, 히스토리 | `js/app.js`, `js/config.js`, `js/sample.js` | `js/providers/index.js` 계약 |
| **ai-integrator** | AI 공급자 구현(Gemini → Claude/OpenAI), 프롬프트 튜닝 | `js/prompt.js`, `js/providers/*` | 응답 스키마 |
| **youtube-integrator** | 영상 검색, 플레이리스트 링크, (향후) OAuth 플레이리스트 저장 | `js/youtube.js` | YouTube Data API 문서 |
| **catalog-curator** | 큐레이션 카탈로그 후보 수집·검수·태깅, 매칭 가중치 튜닝, videoId 채우기/검증 | `data/catalog.json`, `docs/CATALOG.md`, `tools/`, `js/tags.js`, `js/matcher.js` | `tools/match-preview.mjs` 결과 |
| **qa-reviewer** | 수동/자동 테스트, 보안(키 노출·XSS) 점검, 리뷰 코멘트 | `tests/` (신규) | 전체 (읽기 전용) |

> `.claude/agents/`에 Claude Code 서브에이전트 정의 초안이 있습니다. (youtube-integrator는 초기에는 ai-integrator가 겸임)

## 3. 인터페이스 계약 (에이전트 간 약속)

### 3.1 AI 공급자 → 앱
```ts
type Track = { title: string; artist: string; year: number | null; reason: string; videoId: string | null;
               source: 'live' | 'catalog'; catalogId?: string };
type Recommendation = { destination: string; code: string /* 3 letters */; summary: string; tracks: Track[] /* live 2 → catalog 3 */ };

recommend(opts: { apiKey: string; model: string; destination: string; mood: string }): Promise<Recommendation /* tracks = 장소 곡만, + profile */>
type Profile = { country: string /* ISO alpha-2 */; season: string; scenery: string[]; vibes: string[] }  // js/tags.js 어휘
// 실패 시: 사용자에게 그대로 보여줄 수 있는 한국어 메시지를 담은 Error를 throw
```

### 3.2 YouTube 모듈 → 앱
```ts
attachVideoIds(tracks: Track[], apiKey: string): Promise<{ tracks: Track[]; error: string | null }>
playlistUrl(videoIds: string[]): string
musicSearchUrl(track) / youtubeSearchUrl(track) / watchUrl(id) / musicWatchUrl(id) / thumbnailUrl(id): string
```

### 3.2.1 카탈로그 → 앱
```ts
type CatalogTrack = { id: string; title: string; artist: string; year: number; market: string;
                      moods: string[]; seasons: string[]; times: string[]; tempo: 'slow'|'mid'|'fast';
                      scenery: string[]; vibes: string[]; videoId: string | null };
loadCatalog(): Promise<CatalogTrack[]>
readRecent(): Set<string>;  rememberShown(ids: string[]): void
selectTracks(catalog, { profile, mood, recent, exclude }): ScoreResult[]   // js/matcher.js
toTrack(result, { destination, mood, profile }): Track                     // reason·tags·score 포함
```
- 모든 태그 값은 `js/tags.js` 어휘만 사용 (catalog-curator ↔ ai-integrator ↔ frontend-dev). 어휘를 바꾸면 카탈로그 전체를 `tools/check-catalog.mjs`로 재검증

### 3.3 디자인 → 프론트엔드
- 렌더링에 사용하는 클래스 이름: `.pass`, `.pass-head`, `.pass-route`, `.pass-summary`, `.perforation`, `.tracks`, `.track*`(장소 곡 배지 `.track-tag` 포함), `.pill`, `.pass-foot`, `.barcode`, `.skeleton`, `.error`
- 색상은 CSS 변수(`--paper`, `--card`, `--ink`, `--muted`, `--line`, `--accent` …)만 사용. 하드코딩 금지.
- 클래스 이름을 바꿀 때는 frontend-dev와 같은 작업 단위에서 변경.

## 4. 작업 흐름

```
           ┌──────────────── orchestrator ────────────────┐
           │  1. 이슈/요구사항 → 작업 카드로 분해          │
           └──────┬──────────────┬──────────────┬─────────┘
                  ▼              ▼              ▼
            ui-designer    frontend-dev    ai-integrator      (병렬, 각자 git worktree)
                  └──────────────┬──────────────┘
                                 ▼
                            qa-reviewer   ── 문제 발견 시 해당 에이전트로 되돌림
                                 ▼
                     orchestrator: 통합 · README 갱신 · 커밋/PR
```

1. **분해** — orchestrator가 요구사항을 "한 에이전트·한 소유 파일 범위" 단위 카드로 나눕니다.
2. **병렬 구현** — 각 에이전트는 별도 worktree에서 작업, 계약(3장)을 바꾸려면 먼저 orchestrator에 제안.
3. **검증** — qa-reviewer가 `?demo` 화면, 실제 키 호출(선택), 400px 폭, 다크모드, XSS(AI 응답에 `<script>` 포함) 확인.
4. **통합** — orchestrator가 병합, README 로드맵 체크, 커밋.

## 5. 초기 작업 보드 (v0.2 후보)

| # | 카드 | 담당 | 의존 |
|---|---|---|---|
| 1 | 공유 URL `?to=교토&mood=산책` 진입 시 자동 추천 | frontend-dev | – |
| 2 | 추천 히스토리(localStorage, 최근 10개) 사이드 리스트 | frontend-dev + ui-designer | – |
| 3 | Claude 공급자 추가 (`js/providers/claude.js`) | ai-integrator | 3.1 계약 |
| 4 | 프롬프트 개선: 실존하지 않는 곡 감소 (YouTube 검색 결과로 검증 후 재요청) | ai-integrator + youtube-integrator | 3.2 |
| 5 | ~~보딩패스 이미지로 저장~~ (완료: html-to-image) | ui-designer | – |
| 6 | 스모크 테스트 (Playwright, `?demo` 렌더링 확인) | qa-reviewer | – |
| 7 | 카탈로그 30곡 → 100곡 (외부 AI 생성 → `check-catalog` → 검수) → 300~500곡 | catalog-curator | docs/CATALOG.md 6장 |
| 7-1 | 대표 여행지 10곳으로 `match-preview` 돌려 가중치 튜닝 | catalog-curator | 7 |
| 8 | 카탈로그 videoId 채우기 + 주 1회 `--verify` | catalog-curator | YouTube 키 |
| 9 | 반응 좋은 장소 곡을 카탈로그 후보로 올리는 검수 큐 | catalog-curator + frontend-dev | 7 |

## 6. 규칙
- API 키·개인 정보는 코드/커밋/로그에 남기지 않는다.
- AI가 생성한 텍스트는 반드시 `escapeHtml`을 거쳐 렌더링한다.
- 빌드 도구 없이 동작하는 정적 구조를 유지한다 (도입 시 orchestrator 합의).
- 각 에이전트는 작업 종료 시 **변경 파일 목록 + 계약 변경 여부 + 확인 방법**을 보고한다.

## 7. 열린 질문 (TBD)
- 공개 배포 시 키 은닉 프록시를 어디에 둘지 (Cloudflare Workers / Vercel Functions …)
- OAuth로 실제 플레이리스트 저장까지 갈지, 임시 플레이리스트 링크로 충분한지
- 에이전트 실행 방식: Claude Code 서브에이전트 vs Workflow 오케스트레이션
