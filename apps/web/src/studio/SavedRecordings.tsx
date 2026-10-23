import type { Recording } from '../client';
import { Icon } from '../ui';
import { downloadJSON, formatBytes, timecode } from './media';
export function SavedRecordings({
  recordings,
  error,
  onRetry,
}: {
  recordings?: Recording[];
  error: string;
  onRetry: () => void;
}) {
  return (
    <section className="panel saved-recordings">
      <div className="panel-heading">
        <div>
          <h2>Saved manifests</h2>
          <p>
            Workspace metadata only. Reimport your original file to play it.
          </p>
        </div>
        <span className="quiet-badge">{recordings?.length ?? '—'}</span>
      </div>
      {error ? (
        <div className="saved-recording-error" role="alert">
          <p>{error}</p>
          <button className="text-link" onClick={onRetry}>
            Retry saved manifests
            <Icon name="arrow" size={14} />
          </button>
        </div>
      ) : !recordings ? (
        <p className="panel-copy" role="status">
          Loading saved manifests…
        </p>
      ) : !recordings.length ? (
        <p className="panel-copy">
          No recording metadata has been saved. You can keep recordings entirely
          local, or save an unverified manifest for your workspace.
        </p>
      ) : (
        <ul className="saved-recording-list">
          {recordings.map((recording) => (
            <li key={recording.id}>
              <span className="saved-recording-icon">
                <Icon name="file" size={19} />
              </span>
              <div>
                <h3>{recording.name}</h3>
                <p>
                  {timecode(recording.durationSeconds)} ·{' '}
                  {formatBytes(recording.bytes)} ·{' '}
                  {new Date(recording.createdAt).toLocaleString()}
                </p>
                <div className="saved-manifest-meta">
                  <span className="quiet-badge">
                    Unverified · media not uploaded
                  </span>
                  {recording.runId && (
                    <a
                      href={`#/runs/${encodeURIComponent(recording.runId)}`}
                      className="text-link"
                    >
                      Related run
                      <Icon name="arrow" size={13} />
                    </a>
                  )}
                </div>
              </div>
              <button
                className="secondary"
                aria-label={`Download manifest for ${recording.name}`}
                onClick={() =>
                  downloadJSON(
                    {
                      manifestVersion: 1,
                      ...recording,
                      mediaLocation: 'browser-local',
                      checksumSource: 'browser-declared',
                    },
                    `exhibit-${recording.id}.json`,
                  )
                }
              >
                <Icon name="download" size={15} />
                Manifest
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
