import { useEffect, useState } from 'react';
import type { CIRecord, Run, SavedCIFile, WorkspaceClient } from '../client';
import { message } from '../navigation';
import { Empty, Notice } from '../ui';

export const ciFileURL = (run: string, file: string) =>
  `/api/v1/runs/${encodeURIComponent(run)}/files/${encodeURIComponent(file)}`;

export function CICaptures({ client }: { client: WorkspaceClient }) {
  const [files, setFiles] = useState<SavedCIFile[]>();
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    client
      .listCaptures()
      .then((r) => {
        if (active) setFiles(r.files);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [client, refresh]);
  return (
    <section className="panel ci-evidence">
      <div className="panel-heading">
        <h2>Workspace recordings</h2>
        <button className="secondary" onClick={() => setRefresh((v) => v + 1)}>
          Refresh recordings
        </button>
      </div>
      {error ? (
        <p role="alert">{error}</p>
      ) : !files ? (
        <p role="status">Loading stored recordings…</p>
      ) : files.length ? (
        <div className="ci-video-grid">
          {files.map((f) => (
            <article key={f.id}>
              <video
                controls
                preload="metadata"
                src={ciFileURL(f.runId, f.id)}
                aria-label={`${f.repository} PR ${f.pullRequest}: ${f.path}`}
              />
              <h3>{f.path}</h3>
              <p>
                {f.repository} · PR #{f.pullRequest} ·{' '}
                {new Date(f.createdAt).toLocaleString()}
              </p>
              <a href={`#/runs/${encodeURIComponent(f.runId)}`}>
                Open evidence report
              </a>
            </article>
          ))}
        </div>
      ) : (
        <Empty title="No CI recordings yet">
          Connect an ingestion token in Settings. Completed uploads will appear
          here with their original run and commit.
        </Empty>
      )}
    </section>
  );
}

function JSONOutput({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="ci-json">
      <summary>{title}</summary>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </details>
  );
}
export function CIReport({
  client,
  run,
}: {
  client: WorkspaceClient;
  run: Run;
}) {
  const [report, setReport] = useState<CIRecord>();
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    setReport(undefined);
    client
      .getCI(run.id)
      .then((r) => {
        if (active) setReport(r);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [client, run.id, retry]);
  useEffect(() => {
    if (!report || report.complete) return;
    const timer = window.setTimeout(() => setRetry((v) => v + 1), 10000);
    return () => window.clearTimeout(timer);
  }, [report]);
  if (error)
    return (
      <section className="panel ci-evidence">
        <p role="alert">{error}</p>
        <button className="secondary" onClick={() => setRetry((v) => v + 1)}>
          Retry evidence
        </button>
      </section>
    );
  if (!report) return <p role="status">Loading saved CI outputs…</p>;
  const data = report.submission;
  const codex =
    data.codexReport &&
    typeof data.codexReport === 'object' &&
    !Array.isArray(data.codexReport)
      ? (data.codexReport as Record<string, unknown>)
      : undefined;
  return (
    <section className="panel ci-evidence">
      <div className="panel-heading">
        <h2>GitHub Actions evidence</h2>
        <a href={run.ci?.url} target="_blank" rel="noreferrer">
          Workflow attempt {data.attempt} ↗
        </a>
      </div>
      <Notice>
        Repository-submitted evidence · unverified. Test outcomes and Codex
        advice do not establish a trusted verdict.
      </Notice>
      {!report.complete && (
        <p role="status">
          Upload incomplete. {data.files.filter((f) => f.uploaded).length} of{' '}
          {data.files.length} files saved. The uploader can resume this attempt.
        </p>
      )}
      <div className="ci-video-grid">
        {data.files
          .filter((f) => f.uploaded && f.mediaType.startsWith('video/'))
          .map((f) => (
            <article key={f.id}>
              <video
                controls
                preload="metadata"
                src={ciFileURL(run.id, f.id)}
                aria-label={f.path}
              />
              <p>{f.path}</p>
            </article>
          ))}
      </div>
      <h3>Codex CI review</h3>
      {codex ? (
        <>
          <p>Status: {String(codex.status ?? 'recorded')} · advisory</p>
          {typeof codex.review === 'string' && (
            <pre className="ci-review">{codex.review}</pre>
          )}
          {typeof codex.failure === 'string' && (
            <p role="alert">{codex.failure}</p>
          )}
        </>
      ) : (
        <p>No Codex report was produced for this attempt.</p>
      )}
      <h3>Reports and artifacts</h3>
      <ul className="ci-files">
        {data.files.map((f) => (
          <li key={f.id}>
            {f.uploaded ? (
              <a href={ciFileURL(run.id, f.id)} download>
                {f.path}
              </a>
            ) : (
              <span>{f.path} · pending</span>
            )}
            <small>
              {(f.bytes / 1024).toFixed(1)} KiB · SHA-256{' '}
              <code>{f.sha256}</code>
            </small>
          </li>
        ))}
      </ul>
      <JSONOutput
        title="Test manifest and API assertions"
        value={data.manifest}
      />
      <JSONOutput title="Complete Codex CI report" value={data.codexReport} />
      <JSONOutput
        title="Workflow jobs, steps and outputs"
        value={data.workflow}
      />
    </section>
  );
}
