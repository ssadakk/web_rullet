// 레이스 하이라이트 녹화: canvas.captureStream + MediaRecorder.
// 켜고 끌 수 있고, 미지원 브라우저에선 isSupported()=false로 토글을 숨긴다.

const MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

// 이 브라우저가 지원하는 첫 mimeType (없으면 null)
export function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const t of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

export function recorderSupported(canvas: HTMLCanvasElement): boolean {
  return typeof MediaRecorder !== 'undefined'
    && typeof canvas.captureStream === 'function'
    && pickMime() !== null;
}

export class Recorder {
  private rec: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private mime = 'video/webm';
  // 캔버스 캡처 비디오 트랙만 우리 소유 — 종료 시 stop. 오디오 트랙은 sfx 공유 자원이라 건드리지 않는다.
  private videoTracks: MediaStreamTrack[] = [];

  // 진행 중 녹화를 즉시 동기 정리 (트랙 누수·race 방지)
  private dispose(): void {
    for (const t of this.videoTracks) t.stop();
    this.videoTracks = [];
    this.rec = null;
    this.chunks = [];
  }

  // 녹화 시작. audioStream이 있으면 오디오 트랙을 합쳐 소리도 담는다. 성공 시 true.
  start(canvas: HTMLCanvasElement, fps: number, audioStream?: MediaStream | null): boolean {
    const mime = pickMime();
    if (!mime || typeof canvas.captureStream !== 'function') return false;
    if (this.rec) this.dispose(); // 이전 미완 녹화를 동기 정리
    this.mime = mime;
    const chunks: Blob[] = [];
    let stream: MediaStream;
    let rec: MediaRecorder;
    try {
      stream = canvas.captureStream(fps);
      if (audioStream) {
        for (const t of audioStream.getAudioTracks()) stream.addTrack(t);
      }
      rec = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      return false; // 일부 환경(오염 캔버스 등)에서 생성 실패 → 조용히 녹화 포기
    }
    this.chunks = chunks;
    this.videoTracks = stream.getVideoTracks();
    this.rec = rec;
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.start();
    return true;
  }

  isRecording(): boolean {
    return this.rec !== null && this.rec.state === 'recording';
  }

  // 녹화 종료 → Blob. 녹화 중이 아니면 트랙만 정리하고 null.
  stop(): Promise<Blob | null> {
    const rec = this.rec;
    if (!rec || rec.state === 'inactive') {
      for (const t of this.videoTracks) t.stop();
      this.videoTracks = [];
      return Promise.resolve(null);
    }
    const localChunks = this.chunks;
    const localTracks = this.videoTracks;
    return new Promise((resolve) => {
      rec.onstop = () => {
        const blob = localChunks.length ? new Blob(localChunks, { type: this.mime }) : null;
        for (const t of localTracks) t.stop();
        // 그 사이 start()로 새 녹화가 시작됐다면 새 상태는 건드리지 않는다
        if (this.rec === rec) {
          this.rec = null;
          this.chunks = [];
          this.videoTracks = [];
        }
        resolve(blob);
      };
      rec.stop();
    });
  }

  ext(): string {
    return this.mime.startsWith('video/mp4') ? 'mp4' : 'webm';
  }
}
