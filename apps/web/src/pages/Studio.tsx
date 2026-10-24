import { useEffect, useRef, useState } from 'react';
import type {
  Recording,
  RecordingChapter,
  RecordingInput,
  RecordingPresentation,
  RunList,
  Session,
  WorkspaceClient,
} from '../client';
import { Icon, Notice, PageHeading } from '../ui';
import { message } from '../navigation';
import { useLocalMedia } from '../studio/useLocalMedia';
import {
  downloadBlob,
  downloadJSON,
  formatBytes,
  timecode,
} from '../studio/media';
import { RecordingPlayer } from '../studio/RecordingPlayer';
import { ChapterEditor } from '../studio/ChapterEditor';
import { SavedRecordings } from '../studio/SavedRecordings';

const defaultPresentation: RecordingPresentation = {
  frame: 'paper',
  zoom: 1,
  playbackRate: 1,
};
export function Studio({
  client,
  session,
  runs,
}: {
  client: WorkspaceClient;
  session: Session;
  runs: RunList;
}) {
  const local = useLocalMedia();
  const { media } = local;
  const [name, setName] = useState('');
  const [runId, setRunId] = useState('');
  const [chapters, setChapters] = useState<RecordingChapter[]>([]);
  const [presentation, setPresentation] = useState(defaultPresentation);
  const [currentTime, setCurrentTime] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>();
  const [listError, setListError] = useState('');
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [savedFingerprint, setSavedFingerprint] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const mounted = useRef(false);
  const busy = local.preparing || local.captureState !== 'idle' || saving;
  const canSave = session.workspace.role !== 'viewer';
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!media) return;
    setName(media.fileName.replace(/\.[^.]+$/, '').slice(0, 120));
    setRunId('');
    setChapters([]);
    setPresentation({ ...defaultPresentation });
    setCurrentTime(0);
    setSavedFingerprint('');
    setSaveStatus('');
    setSaveError('');
  }, [media]);
  useEffect(() => {
    let active = true;
    setListError('');
    client
      .listRecordings()
      .then((result) => {
        if (active)
          setRecordings((items) => {
            const listedIds = new Set(result.recordings.map((item) => item.id));
            return [
              ...(items || []).filter((item) => !listedIds.has(item.id)),
              ...result.recordings,
            ].slice(0, 100);
          });
      })
      .catch((reason) => {
        if (active) setListError(message(reason));
      });
    return () => {
      active = false;
    };
  }, [client, revision]);
  const input: RecordingInput | undefined = media
    ? {
        name: name.trim(),
        fileName: media.fileName,
        sha256: media.sha256,
        bytes: media.bytes,
        mediaType: media.mediaType,
        durationSeconds: media.durationSeconds,
        runId,
        chapters,
        presentation,
      }
    : undefined;
  const fingerprint = input ? JSON.stringify(input) : '';
  const manifest = input
    ? {
        manifestVersion: 1,
        ...input,
        origin: 'manual',
        verification: 'unverified',
        mediaStored: false,
        mediaLocation: 'browser-local',
        checksumSource: 'browser-declared',
        source: media?.source,
        dimensions: { width: media?.width, height: media?.height },
      }
    : undefined;
  function edited() {
    local.clearError();
    setSaveStatus('');
    setSaveError('');
  }
  async function saveMetadata() {
    if (!input || !canSave) return;
    local.clearError();
    setSaving(true);
    setSaveError('');
    setSaveStatus('');
    try {
      const recording = await client.createRecording(input);
      if (!mounted.current) return;
      setRecordings((items) => [recording, ...(items || [])].slice(0, 100));
      setSavedFingerprint(JSON.stringify(input));
      setSaveStatus(
        'Unverified metadata saved. The video remains local and has not been uploaded.',
      );
    } catch (reason) {
      if (mounted.current) setSaveError(message(reason));
    } finally {
      if (mounted.current) setSaving(false);
    }
  }
  function seek(seconds: number) {
    const video = videoRef.current;
    if (!video || !media) return;
    video.currentTime = Math.min(media.durationSeconds, seconds);
    setCurrentTime(seconds);
  }
  return (
    <>
      <PageHeading
        title="Recording studio"
        description="A focused walkthrough, with the original always intact."
        action={
          <div className="studio-actions">
            {local.captureState === 'recording' ||
            local.captureState === 'stopping' ? (
              <button
                className="record-stop"
                onClick={local.stopRecording}
                disabled={local.captureState === 'stopping'}
              >
                <span className="record-square" />
                {local.captureState === 'stopping'
                  ? 'Finishing…'
                  : 'Stop recording'}
              </button>
            ) : (
              <button
                className="secondary"
                onClick={() => void local.recordScreen()}
                disabled={busy}
              >
                <Icon name="record" size={16} />
                {local.captureState === 'choosing'
                  ? 'Choose a screen…'
                  : 'Record screen'}
              </button>
            )}
            <label className={`primary import-video ${busy ? 'disabled' : ''}`}>
              <Icon name="upload" size={16} />
              Import video
              <input
                type="file"
                aria-label="Import video"
                accept="video/webm,video/mp4,.webm,.mp4"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void local.importFile(file);
                  event.target.value = '';
                }}
              />
            </label>
          </div>
        }
      />
      <Notice>
        <strong>Manual recordings are unverified context.</strong> Media stays
        in this browser. Saving metadata never uploads a video or changes an
        evidence verdict.
      </Notice>
      {local.error && (
        <p className="form-error" role="alert">
          {local.error}
        </p>
      )}
      {local.preparing && (
        <div className="studio-progress" role="status">
          <Icon name="clock" size={17} />
          Preparing video and computing its original SHA-256…
        </div>
      )}
      {(local.captureState === 'recording' ||
        local.captureState === 'stopping') && (
        <div className="capture-banner" role="status">
          <span className="capture-dot" />
          <strong>Recording {timecode(local.elapsed)}</strong>
          <span>Screen only · no audio · stops after 5 minutes</span>
        </div>
      )}
      <div className="studio-layout">
        <div className="studio-main">
          {media ? (
            <>
              <RecordingPlayer
                key={media.url}
                media={media}
                presentation={presentation}
                onPresentation={(value) => {
                  setPresentation(value);
                  edited();
                }}
                videoRef={videoRef}
                currentTime={currentTime}
                onTime={setCurrentTime}
                disabled={busy}
              />
              <ChapterEditor
                chapters={chapters}
                onChange={(value) => {
                  setChapters(value);
                  edited();
                }}
                currentTime={currentTime}
                durationSeconds={media.durationSeconds}
                onSeek={seek}
                disabled={busy}
              />
            </>
          ) : (
            <section className="panel studio-empty">
              <div className="empty-video-stage">
                <div className="studio-empty-frame">
                  <span className="studio-empty-icon">
                    <Icon name="video" size={30} />
                  </span>
                  <h2>Your recording will appear here</h2>
                  <p>
                    Import a walkthrough or record a screen.
                    <br />
                    Then add key moments to guide the review.
                  </p>
                </div>
                <div className="empty-timeline">
                  <Icon name="play" size={15} />
                  <span />
                  <time>00:00</time>
                </div>
              </div>
              <div className="studio-empty-details">
                <div>
                  <Icon name="shield" size={18} />
                  <strong>Original preserved</strong>
                  <span>Presentation never edits the source.</span>
                </div>
                <div>
                  <Icon name="flow" size={18} />
                  <strong>Key moments</strong>
                  <span>Chapters make review intentional.</span>
                </div>
                <div>
                  <Icon name="file" size={18} />
                  <strong>Clear provenance</strong>
                  <span>A checksum, not a verification claim.</span>
                </div>
              </div>
              <div className="panel-foot">
                WebM or MP4 · up to 128 MiB and 1 hour · screen capture up to 5
                minutes
              </div>
            </section>
          )}
        </div>
        <aside className="panel recording-details">
          <div className="panel-heading">
            <h2>Recording provenance</h2>
            <span className="quiet-badge">Unverified</span>
          </div>
          {media && input ? (
            <>
              <fieldset className="recording-fields" disabled={busy}>
                <div className="form-field">
                  <label htmlFor="recording-name">Recording name</label>
                  <input
                    id="recording-name"
                    maxLength={120}
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      edited();
                    }}
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="recording-run">Related evidence run</label>
                  <select
                    id="recording-run"
                    value={runId}
                    onChange={(event) => {
                      setRunId(event.target.value);
                      edited();
                    }}
                  >
                    <option value="">No association</option>
                    {runs.runs.map((run) => (
                      <option key={run.id} value={run.id}>
                        #{run.pullRequest} · {run.title}
                        {run.sample ? ' (sample)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="field-help">
                    An association adds context only. It does not verify this
                    recording.
                  </p>
                </div>
              </fieldset>
              <dl className="recording-facts">
                <div>
                  <dt>Source</dt>
                  <dd>
                    {media.source === 'capture'
                      ? 'Manual screen capture'
                      : 'Manual file import'}
                  </dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{timecode(media.durationSeconds)}</dd>
                </div>
                <div>
                  <dt>Original file</dt>
                  <dd>
                    {formatBytes(media.bytes)} ·{' '}
                    {media.mediaType.replace('video/', '').toUpperCase()}
                  </dd>
                </div>
                <div>
                  <dt>Dimensions</dt>
                  <dd>
                    {media.width} × {media.height}
                  </dd>
                </div>
                <div className="recording-hash">
                  <dt>Original SHA-256</dt>
                  <dd>
                    <code>{media.sha256}</code>
                  </dd>
                </div>
              </dl>
              <div className="recording-exports">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => downloadBlob(media.blob, media.fileName)}
                >
                  <Icon name="download" size={15} />
                  Download original
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    downloadJSON(
                      manifest,
                      `exhibit-${media.fileName.replace(/\.[^.]+$/, '')}.json`,
                    )
                  }
                >
                  <Icon name="file" size={15} />
                  Download manifest
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !canSave ||
                    !input.name ||
                    fingerprint === savedFingerprint
                  }
                  onClick={() => void saveMetadata()}
                >
                  {saving ? 'Saving metadata…' : 'Save metadata'}
                  <Icon name="arrow" size={15} />
                </button>
                {!canSave && (
                  <p className="field-help">
                    Your viewer role can capture and export locally. An owner or
                    editor can save workspace metadata.
                  </p>
                )}
                {saveError && (
                  <p className="form-error" role="alert">
                    {saveError}
                  </p>
                )}
                {saveStatus && (
                  <p className="recording-save-status" role="status">
                    {saveStatus}
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="recording-provenance-empty">
              <Icon name="shield" size={25} />
              <p>
                Import or capture a video to see its source, size, duration, and
                SHA-256 checksum here.
              </p>
              <strong>No recording loaded</strong>
            </div>
          )}
          <div className="recording-local-note">
            <Icon name="info" size={15} />
            <p>
              Closing or leaving the studio clears local media. Download the
              original and manifest before you leave. Saved manifests do not
              contain video.
            </p>
          </div>
        </aside>
      </div>
      <SavedRecordings
        recordings={recordings}
        error={listError}
        onRetry={() => setRevision((value) => value + 1)}
      />
    </>
  );
}
