import { useEffect, useRef, useState } from 'react';
import {
  checkMedia,
  digest,
  inspectVideo,
  MAX_CAPTURE_SECONDS,
  MAX_MEDIA_BYTES,
  type LocalMedia,
} from './media';
import { message } from '../navigation';

type CaptureState = 'idle' | 'choosing' | 'recording' | 'stopping';
export function useLocalMedia() {
  const [media, setMedia] = useState<LocalMedia>();
  const [preparing, setPreparing] = useState(false);
  const [captureState, setCaptureState] = useState<CaptureState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const alive = useRef(false);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const urlRef = useRef<string | undefined>(undefined);
  const recorderRef = useRef<MediaRecorder | undefined>(undefined);
  const streamRef = useRef<MediaStream | undefined>(undefined);
  const timeoutRef = useRef<number | undefined>(undefined);
  const intervalRef = useRef<number | undefined>(undefined);
  function stopTracks() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = undefined;
  }
  function clearTimers() {
    window.clearTimeout(timeoutRef.current);
    window.clearInterval(intervalRef.current);
    timeoutRef.current = undefined;
    intervalRef.current = undefined;
  }
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      generation.current++;
      abortRef.current?.abort();
      clearTimers();
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        if (recorder.state !== 'inactive') recorder.stop();
      }
      recorderRef.current = undefined;
      stopTracks();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = undefined;
    };
  }, []);
  async function prepare(
    blob: Blob,
    fileName: string,
    source: LocalMedia['source'],
    captureDuration?: number,
  ) {
    const token = ++generation.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPreparing(true);
    setError('');
    let url: string | undefined;
    try {
      const mediaType = checkMedia(blob, fileName);
      url = URL.createObjectURL(blob);
      const [info, sha256] = await Promise.all([
        inspectVideo(url, controller.signal, captureDuration),
        digest(blob),
      ]);
      if (!alive.current || token !== generation.current) {
        URL.revokeObjectURL(url);
        return;
      }
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url;
      setMedia({
        blob,
        url,
        fileName,
        mediaType,
        bytes: blob.size,
        sha256,
        source,
        ...info,
      });
    } catch (reason) {
      if (url) URL.revokeObjectURL(url);
      controller.abort();
      if (
        alive.current &&
        token === generation.current &&
        !(reason instanceof DOMException && reason.name === 'AbortError')
      )
        setError(message(reason));
    } finally {
      if (alive.current && token === generation.current) setPreparing(false);
    }
  }
  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      if (alive.current) setCaptureState('stopping');
      recorder.stop();
    }
    stopTracks();
  }
  async function recordScreen() {
    if (
      !navigator.mediaDevices?.getDisplayMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      setError(
        'Screen capture is unavailable in this browser. Import a WebM or MP4 recording instead.',
      );
      return;
    }
    const token = ++generation.current;
    abortRef.current?.abort();
    setPreparing(false);
    setError('');
    setCaptureState('choosing');
    let started = 0;
    try {
      const selected = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      if (!alive.current || token !== generation.current) {
        selected.getTracks().forEach((track) => track.stop());
        return;
      }
      selected.getAudioTracks().forEach((track) => track.stop());
      streamRef.current = selected;
      if (!selected.getVideoTracks().length)
        throw new Error(
          'No screen video track was selected. Try recording again.',
        );
      const mimeType = [
        'video/webm;codecs=vp8',
        'video/webm',
        'video/mp4',
      ].find((type) => MediaRecorder.isTypeSupported(type));
      if (!mimeType)
        throw new Error(
          'This browser has no supported recording encoder. Import a WebM or MP4 video instead.',
        );
      const recorder = new MediaRecorder(
        new MediaStream(selected.getVideoTracks()),
        { mimeType, videoBitsPerSecond: 2500000 },
      );
      recorderRef.current = recorder;
      const chunks: Blob[] = [];
      let bytes = 0;
      let failed = false;
      recorder.ondataavailable = (event) => {
        if (!event.data.size || failed) return;
        bytes += event.data.size;
        if (bytes > MAX_MEDIA_BYTES) {
          failed = true;
          setError(
            'Recording stopped at the 128 MiB limit. Your previous recording is unchanged.',
          );
          stopRecording();
          return;
        }
        chunks.push(event.data);
        if ((performance.now() - started) / 1000 >= MAX_CAPTURE_SECONDS)
          stopRecording();
      };
      recorder.onerror = () => {
        failed = true;
        if (alive.current)
          setError(
            'The browser could not complete this recording. Your previous recording is unchanged.',
          );
        stopRecording();
      };
      recorder.onstop = () => {
        const durationSeconds = (performance.now() - started) / 1000;
        clearTimers();
        stopTracks();
        recorderRef.current = undefined;
        if (!alive.current || token !== generation.current) return;
        setCaptureState('idle');
        if (!failed) {
          const type = recorder.mimeType.split(';')[0];
          const extension = type === 'video/mp4' ? 'mp4' : 'webm';
          const fileName = `exhibit-capture-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
          void prepare(
            new Blob(chunks, { type }),
            fileName,
            'capture',
            durationSeconds,
          );
        }
      };
      selected.getVideoTracks().forEach((track) => {
        track.onended = stopRecording;
      });
      started = performance.now();
      recorder.start(250);
      setElapsed(0);
      setCaptureState('recording');
      intervalRef.current = window.setInterval(() => {
        if (alive.current) setElapsed((performance.now() - started) / 1000);
      }, 250);
      timeoutRef.current = window.setTimeout(
        stopRecording,
        MAX_CAPTURE_SECONDS * 1000,
      );
    } catch (reason) {
      clearTimers();
      stopTracks();
      recorderRef.current = undefined;
      if (!alive.current || token !== generation.current) return;
      setCaptureState('idle');
      const denied =
        reason instanceof DOMException &&
        ['NotAllowedError', 'AbortError'].includes(reason.name);
      setError(
        denied
          ? 'Screen sharing was cancelled or denied. You can try again or import a video.'
          : message(reason),
      );
    }
  }
  return {
    media,
    preparing,
    captureState,
    elapsed,
    error,
    clearError: () => setError(''),
    importFile: (file: File) => prepare(file, file.name, 'import'),
    recordScreen,
    stopRecording,
  };
}
