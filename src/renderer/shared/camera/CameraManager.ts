import type { CameraDevice, CameraState } from '../types/index.ts';

export function cameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError': return '카메라 권한이 거부되었습니다. Windows 카메라 개인정보 설정도 확인하세요.';
    case 'NotFoundError': return '사용 가능한 카메라가 없습니다.';
    case 'NotReadableError': return '카메라를 열 수 없습니다. 다른 앱의 사용 여부를 확인하세요.';
    case 'OverconstrainedError': return '선택한 카메라가 없습니다. 장치 목록을 새로고침하세요.';
    default: return '카메라 연결에 실패했습니다. 연결 상태를 확인하고 다시 시작하세요.';
  }
}

/** Single owner of the stream. stop() invalidates even an outstanding permission request. */
export class CameraManager {
  private media: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>;
  private stream: MediaStream | null = null;
  private generation = 0;
  private pending: Promise<MediaStream | null> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private listeners = new Set<(state: CameraState, stream: MediaStream | null) => void>();
  state: CameraState = { status: 'stopped', error: null };

  constructor(media: Pick<MediaDevices, 'getUserMedia' | 'enumerateDevices'>) { this.media = media; }
  getStream(): MediaStream | null { return this.stream; }
  subscribe(listener: (state: CameraState, stream: MediaStream | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.state, this.stream);
    return () => this.listeners.delete(listener);
  }
  private notify(status: CameraState['status'], error: string | null = null): void {
    this.state = { status, error };
    for (const listener of this.listeners) listener(this.state, this.stream);
  }
  async devices(): Promise<CameraDevice[]> {
    const devices = await this.media.enumerateDevices();
    return devices.filter(device => device.kind === 'videoinput').map((device, index) => ({
      deviceId: device.deviceId, label: device.label || `카메라 ${index + 1}`
    }));
  }
  start(deviceId = ''): Promise<MediaStream | null> {
    if (this.stream) return Promise.resolve(this.stream);
    if (this.pending) return this.pending;
    const generation = this.generation;
    this.notify('starting');
    const task = this.queue.then(async () => {
      if (generation !== this.generation) return null;
      try {
        const stream = await this.media.getUserMedia({
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false
        });
        if (generation !== this.generation) {
          stream.getTracks().forEach(track => track.stop());
          return null;
        }
        this.stream = stream;
        for (const track of stream.getVideoTracks()) {
          track.addEventListener('ended', () => {
            if (this.stream !== stream) return;
            this.stop();
            this.notify('error', '카메라 연결이 끊겼습니다. 장치를 확인한 뒤 다시 시작하세요.');
          }, { once: true });
        }
        this.notify('running');
        return stream;
      } catch (error) {
        if (generation === this.generation) this.notify('error', cameraError(error));
        return null;
      } finally {
        if (generation === this.generation) this.pending = null;
      }
    });
    this.pending = task;
    this.queue = task;
    return task;
  }
  stop(): void {
    this.generation++;
    this.pending = null;
    const stream = this.stream;
    this.stream = null;
    // Notify borrowers before ending the shared tracks.
    this.notify('stopped');
    stream?.getTracks().forEach(track => track.stop());
  }
}
