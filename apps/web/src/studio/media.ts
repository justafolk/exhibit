export const MAX_MEDIA_BYTES = 128 * 1024 * 1024;
export const MAX_DURATION_SECONDS = 3600;
export const MAX_CAPTURE_SECONDS = 300;
export type MediaKind = 'video/webm' | 'video/mp4';
export type LocalMedia = {
  blob: Blob;
  url: string;
  fileName: string;
  mediaType: MediaKind;
  bytes: number;
  sha256: string;
  durationSeconds: number;
  width: number;
  height: number;
  source: 'import' | 'capture';
};
export function mediaKind(blob: Blob, fileName: string): MediaKind {
  const kind = blob.type.split(';')[0].toLowerCase();
  if (kind === 'video/webm' || kind === 'video/mp4') return kind;
  if (!kind || kind === 'application/octet-stream') {
    if (/\.webm$/i.test(fileName)) return 'video/webm';
    if (/\.mp4$/i.test(fileName)) return 'video/mp4';
  }
  throw new Error(
    'Choose a WebM or MP4 video. Other file types are not supported.',
  );
}
export function checkMedia(blob: Blob, fileName: string) {
  if (!blob.size)
    throw new Error(
      'This recording is empty. Choose another video or record again.',
    );
  if (blob.size > MAX_MEDIA_BYTES)
    throw new Error('This video exceeds 128 MiB. Choose a smaller file.');
  if (
    !fileName ||
    new TextEncoder().encode(fileName).length > 200 ||
    /[/\\]/.test(fileName)
  )
    throw new Error(
      'Use a video filename of at most 200 bytes without directory separators.',
    );
  return mediaKind(blob, fileName);
}
export async function digest(blob: Blob) {
  if (!globalThis.crypto?.subtle)
    throw new Error(
      'Checksum creation requires HTTPS or localhost. Open the studio in a secure context.',
    );
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), (value) =>
    value.toString(16).padStart(2, '0'),
  ).join('');
}

// MediaRecorder WebM commonly omits its duration. A bounded seek asks the
// browser to inspect the end of the local blob, without changing its bytes.
export function inspectVideo(
  url: string,
  signal: AbortSignal,
): Promise<{ durationSeconds: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    let seekingEnd = false;
    let settled = false;
    let decoded = false;
    let discovered = 0;
    const clean = () => {
      window.clearTimeout(timeout);
      signal.removeEventListener('abort', abort);
      video.onloadedmetadata = null;
      video.onloadeddata = null;
      video.ondurationchange = null;
      video.onseeked = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clean();
      reject(error);
    };
    const abort = () =>
      fail(new DOMException('Media preparation cancelled', 'AbortError'));
    const finish = () => {
      if (settled) return;
      if (Number.isFinite(video.duration) && video.duration > 0)
        discovered = video.duration;
      // Capture wall time includes encoder/stop delays and cannot bound chapters.
      // Require a duration read from the playable bytes for captures and imports.
      const duration = discovered;
      if (duration > MAX_DURATION_SECONDS) {
        fail(
          new Error(
            'This video is longer than one hour. Choose a shorter recording.',
          ),
        );
        return;
      }
      if (!decoded || !duration || !Number.isFinite(duration)) return;
      if (!video.videoWidth || !video.videoHeight) {
        fail(new Error('This file has no playable video track.'));
        return;
      }
      settled = true;
      const result = {
        durationSeconds: duration,
        width: video.videoWidth,
        height: video.videoHeight,
      };
      clean();
      resolve(result);
    };
    const timeout = window.setTimeout(
      () =>
        fail(
          new Error(
            'Could not read this video’s duration or frames. Try a playable WebM or MP4 export.',
          ),
        ),
      12000,
    );
    video.onerror = () =>
      fail(
        new Error(
          'This video cannot be decoded. It may be corrupt or use an unsupported codec.',
        ),
      );
    video.onloadedmetadata = () => {
      if (!video.videoWidth || !video.videoHeight) {
        fail(new Error('This file has no playable video track.'));
        return;
      }
      finish();
      if (!settled && !Number.isFinite(video.duration) && !seekingEnd) {
        seekingEnd = true;
        try {
          video.currentTime = 86400;
        } catch {
          fail(
            new Error(
              'Could not inspect this recording. Try another WebM or MP4 export.',
            ),
          );
        }
      }
    };
    video.onloadeddata = () => {
      decoded = true;
      finish();
    };
    video.ondurationchange = finish;
    video.onseeked = () => {
      if (
        seekingEnd &&
        !Number.isFinite(video.duration) &&
        video.currentTime > 0 &&
        video.currentTime < 86400
      )
        discovered = video.currentTime;
      decoded = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      finish();
    };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    video.src = url;
    video.load();
  });
}
export function timecode(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(whole / 60)).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}`;
}
export const formatBytes = (bytes: number) =>
  `${(bytes / (1024 * 1024)).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MiB`;
export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function downloadJSON(value: unknown, name: string) {
  downloadBlob(
    new Blob([JSON.stringify(value, null, 2) + '\n'], {
      type: 'application/json',
    }),
    name,
  );
}
