import type { ResultMode } from '../types';
import { parseNames } from '../input';
import { decodeShare } from '../share';
import { recorderSupported } from '../recorder';

export interface StartConfig {
  names: string[];
  mode: ResultMode;
  seed?: number; // 공유 링크로 들어온 첫 시작에만 지정 (같은 코스 재현)
}

export interface Placement {
  rank: number;
  name: string;
  color?: string;
  running?: boolean; // 아직 달리는 중 (잠정 순위)
}

export interface UI {
  canvas: HTMLCanvasElement;
  onStart(handler: (cfg: StartConfig) => void): void;
  onSkip(handler: () => void): void;
  onShare(handler: () => void): void;
  onToggleMute(handler: (muted: boolean) => void): void;
  onToggleRecord(handler: (on: boolean) => void): void;
  onSaveVideo(handler: () => void): void;
  setVideoRecorded(recorded: boolean): void; // 이 레이스 실제 녹화 여부 (시작 시점 확정값)
  setVideoReady(state: 'ready' | 'failed'): void;
  setLiveStandings(placements: Placement[]): void;
  showResult(ranking: string[], mode: ResultMode): void;
  flashShare(text: string): void;
}

const NAMES_KEY = 'race.names';
const MUTE_KEY = 'race.muted';
const REC_KEY = 'race.record';

export function mountUI(root: HTMLElement): UI {
  root.innerHTML = `
    <div class="layout">
      <aside class="panel">
        <h1>네온 낙하 레이스</h1>
        <textarea id="names" rows="9" placeholder="한 줄에 한 명"></textarea>
        <label>결과 모드
          <select id="mode">
            <option value="ranking">전체 순위</option>
            <option value="winner">당첨 1명</option>
            <option value="penalty">벌칙 1명</option>
          </select>
        </label>
        <button id="start">시작</button>
        <p id="hint"></p>
        <h2 class="live-title">실시간 순위</h2>
        <ul id="live"></ul>
      </aside>
      <main class="stage">
        <canvas id="canvas" width="600" height="760"></canvas>
        <button id="mute" class="mute" title="소리 켜기/끄기">🔊</button>
        <button id="rec" class="rec" title="레이스 녹화">⚪ REC</button>
        <button id="skip" class="skip hidden">건너뛰기 ⏭</button>
        <div id="overlay" class="overlay hidden"></div>
      </main>
    </div>
  `;

  const $ = <T extends HTMLElement>(sel: string) => root.querySelector(sel) as T;
  const namesEl = $<HTMLTextAreaElement>('#names');
  const modeEl = $<HTMLSelectElement>('#mode');
  const startEl = $<HTMLButtonElement>('#start');
  const hintEl = $<HTMLParagraphElement>('#hint');
  const liveEl = $<HTMLUListElement>('#live');
  const overlayEl = $<HTMLDivElement>('#overlay');
  const skipEl = $<HTMLButtonElement>('#skip');
  const muteEl = $<HTMLButtonElement>('#mute');
  const recEl = $<HTMLButtonElement>('#rec');
  const canvas = $<HTMLCanvasElement>('#canvas');

  let startHandler: ((cfg: StartConfig) => void) | null = null;
  let skipHandler: (() => void) | null = null;
  let shareHandler: (() => void) | null = null;
  let muteHandler: ((muted: boolean) => void) | null = null;
  let recordHandler: ((on: boolean) => void) | null = null;
  let saveVideoHandler: (() => void) | null = null;
  let rollTimer = 0; // 슬롯머신 발표 인터벌

  // 녹화 토글 (미지원 브라우저는 버튼 숨김)
  let recordOn = false;
  let recordedThisRace = false; // 시작 시점 main이 알려준 실제 녹화 여부
  const recSupported = recorderSupported(canvas);
  if (!recSupported) {
    recEl.classList.add('hidden');
  } else {
    try { recordOn = localStorage.getItem(REC_KEY) === '1'; } catch { /* noop */ }
  }
  const renderRec = () => {
    recEl.classList.toggle('on', recordOn);
    recEl.textContent = recordOn ? '🔴 REC' : '⚪ REC';
  };
  renderRec();
  recEl.addEventListener('click', () => {
    recordOn = !recordOn;
    renderRec();
    try { localStorage.setItem(REC_KEY, recordOn ? '1' : '0'); } catch { /* noop */ }
    recordHandler?.(recordOn);
  });

  let muted = false;
  try { muted = localStorage.getItem(MUTE_KEY) === '1'; } catch { /* noop */ }
  const renderMute = () => { muteEl.textContent = muted ? '🔇' : '🔊'; };
  renderMute();
  muteEl.addEventListener('click', () => {
    muted = !muted;
    renderMute();
    try { localStorage.setItem(MUTE_KEY, muted ? '1' : '0'); } catch { /* noop */ }
    muteHandler?.(muted);
  });

  // 공유 링크 우선 복원 → 없으면 localStorage. seed는 첫 시작에만 적용.
  const shared = decodeShare(typeof location !== 'undefined' ? location.hash : '');
  let pendingSeed = shared.seed;
  try {
    if (shared.names) namesEl.value = shared.names.join('\n');
    else {
      const saved = localStorage.getItem(NAMES_KEY);
      if (saved) namesEl.value = saved;
    }
  } catch { /* noop */ }
  if (shared.mode) modeEl.value = shared.mode;
  namesEl.addEventListener('input', () => {
    try { localStorage.setItem(NAMES_KEY, namesEl.value); } catch { /* noop */ }
  });

  const refreshStartState = () => {
    const ok = parseNames(namesEl.value).length >= 2;
    startEl.disabled = !ok;
    hintEl.textContent = ok ? '' : '최소 2명 이상 입력하세요.';
  };
  namesEl.addEventListener('input', refreshStartState);
  refreshStartState();

  startEl.addEventListener('click', () => {
    const names = parseNames(namesEl.value);
    if (names.length < 2) {
      hintEl.textContent = '최소 2명 이상 입력하세요.';
      return;
    }
    hintEl.textContent = '';
    if (rollTimer) { clearInterval(rollTimer); rollTimer = 0; } // 발표 중 재시작 시 고아 인터벌 방지
    overlayEl.classList.add('hidden');
    overlayEl.innerHTML = '';
    liveEl.innerHTML = '';
    skipEl.classList.remove('hidden');
    startHandler?.({ names, mode: modeEl.value as ResultMode, seed: pendingSeed });
    pendingSeed = undefined; // 공유 시드는 1회성 — 다음 시작부터 새 코스
  });

  skipEl.addEventListener('click', () => skipHandler?.());

  return {
    canvas,
    onStart(handler) { startHandler = handler; },
    onSkip(handler) { skipHandler = handler; },
    onShare(handler) { shareHandler = handler; },
    onToggleMute(handler) { muteHandler = handler; handler(muted); }, // 등록 즉시 초기값 동기화
    onToggleRecord(handler) { recordHandler = handler; handler(recordOn); },
    onSaveVideo(handler) { saveVideoHandler = handler; },
    setVideoRecorded(recorded) { recordedThisRace = recorded; },
    setVideoReady(state) {
      const b = overlayEl.querySelector<HTMLButtonElement>('#savevid');
      if (!b) return;
      if (state === 'ready') { b.disabled = false; b.textContent = '🎬 영상 저장'; }
      else { b.disabled = true; b.textContent = '🎬 영상 없음'; }
    },
    flashShare(text) {
      const el = overlayEl.querySelector<HTMLSpanElement>('#shareMsg');
      if (el) el.textContent = text;
    },
    setLiveStandings(placements) {
      liveEl.innerHTML = [...placements]
        .sort((a, b) => a.rank - b.rank)
        .map((p) => `<li class="${p.running ? 'running' : ''}">`
          + `<span class="rank">${p.rank}위</span>`
          + (p.color ? `<i class="dot" style="background:${p.color}"></i>` : '')
          + `${escapeHtml(p.name)}</li>`)
        .join('');
    },
    showResult(ranking, mode) {
      if (rollTimer) { clearInterval(rollTimer); rollTimer = 0; }
      skipEl.classList.add('hidden');
      overlayEl.classList.remove('hidden');
      overlayEl.innerHTML = renderResult(ranking, mode);

      // 당첨/벌칙: 이름 슬롯머신 셔플 후 확정 (드럼롤 같은 긴장)
      const bigEl = overlayEl.querySelector<HTMLParagraphElement>('.big');
      if (bigEl && mode !== 'ranking' && ranking.length > 1) {
        const target = bigEl.textContent ?? '';
        bigEl.classList.add('rolling');
        let n = 0;
        rollTimer = window.setInterval(() => {
          bigEl.textContent = ranking[Math.floor(Math.random() * ranking.length)];
          if (++n >= 14) {
            clearInterval(rollTimer);
            rollTimer = 0;
            bigEl.textContent = target;
            bigEl.classList.remove('rolling');
            bigEl.classList.add('reveal');
          }
        }, 75);
      }
      overlayEl.querySelector<HTMLButtonElement>('#restart')
        ?.addEventListener('click', () => {
          // 명단이 2명 미만으로 지워진 상태면 오버레이만 닫아 힌트가 보이게 한다
          overlayEl.classList.add('hidden');
          startEl.click();
        });
      // 제외 재경주: 당첨자(1등) 또는 꼴찌를 빼고 같은 명단으로 다시.
      // localStorage 저장은 건너뛴다 — 저장 명단은 사용자가 직접 입력한 원본 유지.
      overlayEl.querySelector<HTMLButtonElement>('#rematch')
        ?.addEventListener('click', () => {
          const remaining = mode === 'winner' ? ranking.slice(1) : ranking.slice(0, -1);
          namesEl.value = remaining.join('\n');
          refreshStartState();
          startEl.click();
        });
      overlayEl.querySelector<HTMLButtonElement>('#share')
        ?.addEventListener('click', () => shareHandler?.());
      // 이 레이스를 실제로 녹화했을 때만 영상 저장 버튼 (라이브 토글이 아닌 시작 시점 확정값)
      if (recordedThisRace && recSupported) {
        const row = overlayEl.querySelector('.share-row');
        if (row) {
          const b = document.createElement('button');
          b.id = 'savevid';
          b.className = 'restart alt';
          b.disabled = true;
          b.textContent = '🎬 영상 준비 중…';
          b.addEventListener('click', () => saveVideoHandler?.());
          row.appendChild(b);
        }
      }
    },
  };
}

function renderResult(ranking: string[], mode: ResultMode): string {
  if (ranking.length === 0) return '';
  const restart = `<button id="restart" class="restart">다시하기</button>`;
  const share = `<div class="share-row"><button id="share" class="restart alt">🔗 링크 복사</button><span id="shareMsg" class="share-msg"></span></div>`;
  // 제외 후 2명 이상 남을 때만 제외 재경주 제공
  const canRematch = ranking.length > 2;
  if (mode === 'winner') {
    const rematch = canRematch
      ? `<button id="rematch" class="restart alt">당첨자 빼고 한 번 더</button>` : '';
    return `<div class="result"><h2>🎉 당첨</h2><p class="big">${escapeHtml(ranking[0])}</p>${restart}${rematch}${share}</div>`;
  }
  if (mode === 'penalty') {
    const last = ranking[ranking.length - 1];
    const rematch = canRematch
      ? `<button id="rematch" class="restart alt">꼴찌 빼고 재경주</button>` : '';
    return `<div class="result"><h2>💀 벌칙</h2><p class="big">${escapeHtml(last)}</p>${restart}${rematch}${share}</div>`;
  }
  const items = ranking.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
  return `<div class="result"><h2>최종 순위</h2><ol>${items}</ol>${restart}${share}</div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
