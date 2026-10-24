import { displayLabel } from '../labels';
import { useEffect, useState } from 'react';
import type { Run, WorkspaceClient } from '../client';
import { Badge, duration, Empty, Icon, Notice, PageHeading } from '../ui';
import { message } from '../navigation';
import { markdownReport, downloadReport } from '../report';

export function RunDetail({
  client,
  id,
}: {
  client: WorkspaceClient;
  id: string;
}) {
  const [run, setRun] = useState<Run>();
  const [error, setError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [exportError, setExportError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRun(undefined);
    setError('');
    client
      .getRun(id)
      .then((value) => {
        if (active) setRun(value);
      })
      .catch((reason) => {
        if (active) setError(message(reason));
      });
    return () => {
      active = false;
    };
  }, [client, id, retry]);
  if (error)
    return (
      <div role="alert">
        <Empty
          title="Report unavailable"
          action={
            <button
              className="secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              Try again
            </button>
          }
        >
          {error}
        </Empty>
      </div>
    );
  if (!run)
    return (
      <div role="status" className="loading-state">
        Loading evidence report…
      </div>
    );
  return (
    <>
      <a
        href={`#/runs${window.location.hash.includes('?') ? '?' + window.location.hash.split('?')[1] : ''}`}
        className="back-link"
      >
        ← All evidence runs
      </a>
      <PageHeading
        title={displayLabel(run.title)}
        description={`${run.repository} · Pull request #${run.pullRequest}`}
        action={
          <div className="report-actions">
            <Badge status={run.status} />
            <button
              className="secondary"
              onClick={async () => {
                setExportError('');
                setExportStatus('');
                try {
                  if (!navigator.clipboard)
                    throw new Error(
                      'Clipboard access is unavailable. Download the report instead.',
                    );
                  await navigator.clipboard.writeText(markdownReport(run));
                  setExportStatus(
                    'Report copied. Includes source commit and coverage limits.',
                  );
                } catch {
                  setExportError(
                    'Could not access your clipboard. Download the report instead.',
                  );
                }
              }}
            >
              Copy report
            </button>
            <button
              className="secondary"
              onClick={() => {
                downloadReport(run);
                setExportError('');
                setExportStatus('Markdown report downloaded.');
              }}
            >
              Download report
            </button>
          </div>
        }
      />
      {exportStatus && (
        <p className="export-message" role="status">
          {exportStatus}
        </p>
      )}
      {exportError && (
        <p className="form-error" role="alert">
          {exportError}
        </p>
      )}
      {run.sample && (
        <Notice>
          <strong>Illustrative review.</strong> Statuses and assertions are
          examples; no workspace execution is claimed.
        </Notice>
      )}
      <section className="panel report-provenance">
        <div className="panel-heading">
          <h2>Run provenance</h2>
          <span className="quiet-badge">Evidence context</span>
        </div>
        <dl className="provenance-grid">
          <div>
            <dt>Run ID</dt>
            <dd>
              <code>{run.id}</code>
            </dd>
          </div>
          <div>
            <dt>Environment</dt>
            <dd>{run.environment}</dd>
          </div>
          <div>
            <dt>Duration</dt>
            <dd>{duration(run.durationSeconds)}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{new Date(run.createdAt).toLocaleString()}</dd>
          </div>
          <div className="full">
            <dt>Head commit</dt>
            <dd>
              <code>{run.headSha}</code>
            </dd>
          </div>
        </dl>
      </section>
      <div className="report-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Assertions</h2>
            <span className="quiet-badge">
              {run.assertions.filter((item) => item.passed).length} /{' '}
              {run.assertions.length} passed
            </span>
          </div>
          {run.assertions.length ? (
            <ul className="assertion-list">
              {run.assertions.map((assertion, index) => (
                <li key={`${index}-${assertion.label}`}>
                  <span
                    className={`assertion-symbol ${assertion.passed ? 'pass' : 'fail'}`}
                  >
                    {assertion.passed ? (
                      <Icon name="check" size={14} />
                    ) : (
                      <Icon name="close" size={14} />
                    )}
                  </span>
                  <span>{assertion.label}</span>
                  <span className="quiet-text">
                    {assertion.passed ? 'Passed' : 'Failed'}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty title="No assertions recorded">
              This report contains no assertion results.
            </Empty>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Coverage gaps</h2>
            <span className="quiet-badge">{run.notCovered.length}</span>
          </div>
          {run.notCovered.length ? (
            <ul className="gap-list">
              {run.notCovered.map((item, index) => (
                <li key={`${index}-${item}`}>
                  <span className="gap-dot" />
                  {item}
                </li>
              ))}
            </ul>
          ) : (
            <p className="panel-copy">
              No coverage gaps were recorded. This does not establish complete
              coverage.
            </p>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Tested flows</h2>
        </div>
        <div className="flow-chips">
          {run.flows.length ? (
            run.flows.map((flow) => (
              <span key={flow}>
                <Icon name="flow" size={15} />
                <code>{flow}</code>
              </span>
            ))
          ) : (
            <span>No flows recorded</span>
          )}
        </div>
      </section>
      {run.sample && (
        <p className="sample-report-link">
          Want to inspect actual footage?{' '}
          <a href="#/evidence/sample-project">
            Open the Field Store recordings
          </a>
          . It is a separate CI run, not evidence for this illustrative report.
        </p>
      )}
      <Notice>
        Recordings and traces are not attached to this report. Artifact
        collection must be connected before downloads are available.
      </Notice>
    </>
  );
}
