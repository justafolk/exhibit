import { APIEvidence } from './APIEvidence';
import { useEffect, useRef, useState } from 'react';
import {
  fieldStore,
  sampleAsset,
  sampleWorkflowURL,
} from '../sample/fieldStore';
import { Icon, Notice, PageHeading } from '../ui';

const scenarios = fieldStore.scenarios;
const sections = ['Overview', 'API', 'Artifacts', 'Provenance'] as const;
const fileKind = (mime: string) =>
  mime.startsWith('video/')
    ? 'Video'
    : mime.startsWith('image/')
      ? 'Screenshot'
      : 'Trace';
const bytes = (n: number) => `${(n / 1024).toFixed(1)} KiB`;

export function FeaturedEvidence() {
  return (
    <section
      className="panel featured-evidence"
      aria-label="Recorded sample evidence"
    >
      <a className="featured-preview" href="#/evidence/sample-project">
        <img
          src={sampleAsset(scenarios[0].poster)}
          alt="Field Store order confirmation captured by Playwright"
          loading="lazy"
        />
        <span>
          <Icon name="play" size={17} /> Watch the recorded run
        </span>
      </a>
      <div>
        <span className="eyebrow">REAL CI CAPTURE · SAMPLE PROJECT</span>
        <h2>See an agent's work, not just its summary.</h2>
        <p>
          Saved-address checkout, a declined payment, and an out-of-stock cart.
          Three actual recordings from the sample project's GitHub Action.
        </p>
        <div className="evidence-facts">
          <span>
            <Icon name="check" size={14} />3 checks passed
          </span>
          <span>
            <Icon name="video" size={14} />3 recordings
          </span>
          <span>
            <Icon name="file" size={14} />7 artifacts
          </span>
        </div>
        <a className="text-link" href="#/evidence/sample-project">
          Explore the evidence <Icon name="arrow" size={14} />
        </a>
        <small>
          Curated sample · provenance unverified · PR #1 ·{' '}
          {fieldStore.headSha.slice(0, 7)}
        </small>
      </div>
    </section>
  );
}

export function SampleGallery() {
  return (
    <section className="sample-gallery" aria-label="Sample recording gallery">
      <div className="gallery-heading">
        <div>
          <span className="eyebrow">FROM SAMPLE-PROJECT-EXHIBIT</span>
          <h2>Three scenarios. Original footage.</h2>
          <p>
            Imported from one completed CI run. Each clip is a real browser
            test, with its trace attached.
          </p>
        </div>
        <a
          href="#/evidence/sample-project?section=Provenance"
          className="text-link"
        >
          Inspect the source <Icon name="arrow" size={14} />
        </a>
      </div>
      <div className="recording-cards">
        {scenarios.map((s) => (
          <a
            className="panel recording-card"
            key={s.id}
            href={`#/evidence/sample-project?scenario=${s.id}`}
          >
            <div>
              <img
                src={sampleAsset(s.poster)}
                alt={`${s.title} preview`}
                loading="lazy"
              />
              <span className="recording-play">
                <Icon name="play" size={19} />
              </span>
              <span className="clip-length">
                {s.videoDurationSeconds.toFixed(2)}s
              </span>
            </div>
            <section>
              <span className="result-pass">
                <Icon name="check" size={13} />
                Test passed
              </span>
              <h3>{s.title}</h3>
              <p>{s.description}</p>
              <footer>
                <span>Video + browser trace</span>
                <Icon name="arrow" size={15} />
              </footer>
            </section>
          </a>
        ))}
      </div>
      <p className="sample-caption">
        Synthetic storefront data. These recordings are curated public samples,
        separate from your workspace's saved manifests.
      </p>
    </section>
  );
}

export function SampleEvidence() {
  const params = new URLSearchParams(window.location.hash.split('?')[1]);
  const [selected, setSelected] = useState(
    scenarios.find((s) => s.id === params.get('scenario')) || scenarios[0],
  );
  const [section, setSection] = useState<(typeof sections)[number]>(
    sections.find((s) => s === params.get('section')) || 'Overview',
  );
  const [kind, setKind] = useState('All files');
  const [speed, setSpeed] = useState(0.5);
  const [mediaError, setMediaError] = useState(false);
  const [position, setPosition] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setPosition(0);
    setMediaError(false);
  }, [selected]);
  function update(nextScenario: typeof selected, nextSection: typeof section) {
    setSelected(nextScenario);
    setSection(nextSection);
    const query = new URLSearchParams({
      scenario: nextScenario.id,
      section: nextSection,
    });
    window.history.replaceState(null, '', `#/evidence/sample-project?${query}`);
  }
  function step(delta: number) {
    const player = video.current;
    if (!player || !Number.isFinite(player.duration)) return;
    player.pause();
    player.currentTime = Math.min(
      player.duration,
      Math.max(0, player.currentTime + delta),
    );
    setPosition(player.currentTime);
  }
  const artifacts = fieldStore.artifacts.filter(
    (a) => kind === 'All files' || fileKind(a.mediaType) === kind,
  );
  return (
    <>
      <a className="back-link" href="#/studio">
        ← All agent recordings
      </a>
      <PageHeading
        title="Checkout evidence, ready to inspect"
        description="Field Store · sample-project-exhibit · Pull request #1"
        action={
          <a
            className="secondary"
            href={sampleWorkflowURL}
            target="_blank"
            rel="noreferrer"
          >
            Open GitHub run <Icon name="external" size={14} />
          </a>
        }
      />
      <div className="evidence-status">
        <span className="result-pass">
          <Icon name="check" size={14} />3 browser checks passed
        </span>
        <span className="quiet-badge">Sample · provenance unverified</span>
        <span>
          Attempt {fieldStore.attempt} ·{' '}
          {(fieldStore.durationMs / 1000).toFixed(2)}s suite ·{' '}
          {fieldStore.headSha.slice(0, 7)}
        </span>
      </div>
      <div
        className="evidence-section-nav"
        role="group"
        aria-label="Evidence sections"
      >
        {sections.map((item) => (
          <button
            key={item}
            aria-pressed={section === item}
            className={section === item ? 'selected' : ''}
            onClick={() => update(selected, item)}
          >
            {item}
            {item === 'Artifacts' && <span>7</span>}
          </button>
        ))}
        <a href={sampleAsset('report.md')} download="field-store-report.md">
          <Icon name="download" size={15} /> Download report
        </a>
      </div>
      {section === 'Overview' && (
        <>
          <div className="evidence-viewer-grid">
            <section className="panel evidence-player">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">ORIGINAL CI RECORDING</span>
                  <h2>{selected.title}</h2>
                </div>
                <span className="quiet-badge">
                  {selected.videoDurationSeconds.toFixed(2)}s
                </span>
              </div>
              <video
                key={selected.video}
                ref={video}
                src={sampleAsset(selected.video)}
                poster={sampleAsset(selected.poster)}
                controls
                playsInline
                preload="metadata"
                aria-label={`Recording: ${selected.title}`}
                onLoadedMetadata={(event) => {
                  event.currentTarget.playbackRate = speed;
                }}
                onTimeUpdate={(event) =>
                  setPosition(event.currentTarget.currentTime)
                }
                onError={() => setMediaError(true)}
              />
              {mediaError && (
                <p role="alert" className="form-error">
                  This recording could not be loaded.{' '}
                  <a href={sampleAsset(selected.video)} download>
                    Download the original video
                  </a>{' '}
                  or reload the page.
                </p>
              )}
              <div className="evidence-playback">
                <button
                  className="secondary"
                  onClick={() => step(-0.1)}
                  aria-label="Back 0.1 seconds"
                >
                  −0.1s
                </button>
                <button
                  className="secondary"
                  onClick={() => step(0.1)}
                  aria-label="Forward 0.1 seconds"
                >
                  +0.1s
                </button>
                <span>
                  {position.toFixed(1)}s /{' '}
                  {selected.videoDurationSeconds.toFixed(2)}s
                </span>
                <label>
                  Playback speed
                  <select
                    aria-label="Playback speed"
                    value={speed}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      setSpeed(value);
                      if (video.current) video.current.playbackRate = value;
                    }}
                  >
                    <option value={0.25}>0.25×</option>
                    <option value={0.5}>0.5×</option>
                    <option value={1}>1×</option>
                  </select>
                </label>
              </div>
              <p className="player-note">
                CI clips are short. Slow playback or step through the original
                footage. The source video is unchanged.
              </p>
              <div className="evidence-player-downloads">
                <a href={sampleAsset(selected.video)} download>
                  <Icon name="download" size={14} />
                  Original video
                </a>
                <a href={sampleAsset(selected.trace)} download>
                  <Icon name="download" size={14} />
                  Browser trace
                </a>
              </div>
            </section>
            <aside className="panel scenario-list">
              <div className="panel-heading">
                <div>
                  <h2>Recorded scenarios</h2>
                  <p>One browser test per clip</p>
                </div>
              </div>
              {scenarios.map((s) => (
                <button
                  key={s.id}
                  aria-pressed={selected.id === s.id}
                  onClick={() => update(s, 'Overview')}
                >
                  <span className="scenario-check">
                    <Icon name="check" size={14} />
                  </span>
                  <span>
                    <strong>{s.title}</strong>
                    <small>{s.description}</small>
                    <em>
                      Passed · {s.testDurationMs}ms test ·{' '}
                      {s.videoDurationSeconds.toFixed(2)}s video
                    </em>
                  </span>
                  <Icon name="play" size={14} />
                </button>
              ))}
              <div className="scenario-source">
                <Icon name="branch" size={15} />
                <span>
                  {fieldStore.repository}
                  <small>PR #1 · Attempt {fieldStore.attempt}</small>
                </span>
              </div>
            </aside>
          </div>
          <div className="evidence-bottom-grid">
            <section className="panel">
              <div className="panel-heading">
                <h2>What the tests checked</h2>
                <span className="quiet-badge">3 / 3 passed</span>
              </div>
              <ul className="assertion-list">
                {fieldStore.assertions.map((a) => (
                  <li key={a.id}>
                    <span className="assertion-symbol pass">
                      <Icon name="check" size={14} />
                    </span>
                    <span>
                      {a.label
                        .replace(/^Browser test: /, '')
                        .replace(/ \(\)$/, '')}
                    </span>
                    <span className="quiet-text">Passed</span>
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel evidence-gaps">
              <h2>What remains unverified</h2>
              <ul>
                {fieldStore.notCovered.map((gap) => (
                  <li key={gap}>{gap}</li>
                ))}
              </ul>
              <p>
                A passing test and matching file hashes do not establish a
                trusted customer verdict.
              </p>
            </section>
          </div>
          <section className="panel attempt-history">
            <div className="panel-heading">
              <div>
                <h2>Attempts stay visible</h2>
                <p>
                  A successful retry does not hide the earlier failed workflow.
                </p>
              </div>
            </div>
            {fieldStore.attempts.map((attempt) => (
              <a
                href={attempt.url}
                target="_blank"
                rel="noreferrer"
                key={attempt.attempt}
              >
                <span
                  className={
                    attempt.conclusion === 'success'
                      ? 'attempt-dot passed'
                      : 'attempt-dot failed'
                  }
                />
                <strong>Attempt {attempt.attempt}</strong>
                <span>
                  {attempt.conclusion === 'success'
                    ? 'Workflow succeeded · 3 browser tests passed'
                    : 'Workflow failed · test results not in this snapshot'}
                </span>
                <time>{new Date(attempt.startedAt).toLocaleString()}</time>
                <Icon name="external" size={14} />
              </a>
            ))}
          </section>
        </>
      )}
      {section === 'API' && <APIEvidence />}
      {section === 'Artifacts' && (
        <section className="panel evidence-artifacts">
          <div className="panel-heading">
            <div>
              <h2>Original artifacts</h2>
              <p>All 7 original sizes and SHA-256 hashes checked at import.</p>
            </div>
            <label className="artifact-kind">
              File type
              <select
                aria-label="Filter artifacts"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {['All files', 'Video', 'Trace', 'Screenshot'].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="artifact-summary">
            <a
              className="secondary"
              href={sampleAsset('manifest.json')}
              download="field-store-manifest.json"
            >
              <Icon name="download" size={15} />
              Download manifest
            </a>
            <span>
              Checksums identify these bytes; provenance remains unverified.
            </span>
          </div>
          <ul className="artifact-list">
            {artifacts.map((a) => (
              <li key={a.path}>
                <Icon
                  name={a.mediaType.startsWith('video/') ? 'video' : 'file'}
                  size={20}
                />
                <div>
                  <strong>{a.path.split('/').at(-1)}</strong>
                  <p>{a.path.split('/')[0]}</p>
                  <code>SHA-256 {a.sha256}</code>
                </div>
                <span>
                  {fileKind(a.mediaType)}
                  <small>{bytes(a.bytes)}</small>
                </span>
                <a
                  className="secondary"
                  href={sampleAsset(a.path)}
                  download
                  aria-label={`Download ${a.path}`}
                >
                  <Icon name="download" size={14} />
                  Download
                </a>
              </li>
            ))}
          </ul>
          {kind === 'Trace' && (
            <p className="artifact-help">
              Download a trace, then inspect it locally with Playwright Trace
              Viewer. Only share trace contents with people who should have
              access.
            </p>
          )}
        </section>
      )}
      {section === 'Provenance' && (
        <div className="evidence-bottom-grid">
          <section className="panel">
            <div className="panel-heading">
              <h2>Where this evidence came from</h2>
              <span className="quiet-badge">Imported sample snapshot</span>
            </div>
            <dl className="sample-provenance">
              <div>
                <dt>Repository</dt>
                <dd>
                  <a
                    href={`https://github.com/${fieldStore.repository}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {fieldStore.repository}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Pull request</dt>
                <dd>
                  <a
                    href={`https://github.com/${fieldStore.repository}/pull/1`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    #1 · agent-test
                  </a>
                </dd>
              </div>
              <div>
                <dt>Source commit</dt>
                <dd>
                  <a
                    href={`https://github.com/${fieldStore.repository}/commit/${fieldStore.headSha}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <code>{fieldStore.headSha}</code>
                  </a>
                </dd>
              </div>
              <div>
                <dt>Workflow / attempt</dt>
                <dd>
                  <a href={sampleWorkflowURL} target="_blank" rel="noreferrer">
                    {fieldStore.workflowRunId} / {fieldStore.attempt}
                  </a>
                </dd>
              </div>
              <div>
                <dt>Capture started</dt>
                <dd>{new Date(fieldStore.startedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt>Artifact archive</dt>
                <dd>
                  ID {fieldStore.artifactId}
                  <code>{fieldStore.archiveSha256}</code>
                </dd>
              </div>
              <div>
                <dt>Verification</dt>
                <dd>Self-reported sample · unverified</dd>
              </div>
            </dl>
          </section>
          <section className="panel evidence-gaps">
            <h2>Coverage and cleanup</h2>
            <p>
              Executed against the local sample server on its GitHub runner. No
              staging deployment, production payment, or customer account was
              exercised.
            </p>
            <h3>Collector cleanup declaration</h3>
            <p>{fieldStore.cleanup.details}</p>
            <h3>Original confirmation screenshot</h3>
            <a
              href={sampleAsset(
                `${scenarios[0].video.split('/')[0]}/confirmation.png`,
              )}
              target="_blank"
              rel="noreferrer"
            >
              <img
                className="confirmation-preview"
                src={sampleAsset(
                  `${scenarios[0].video.split('/')[0]}/confirmation.png`,
                )}
                alt="Original sample order confirmation screenshot"
              />
            </a>
          </section>
        </div>
      )}
      <Notice>
        <strong>Public sample evidence.</strong> These are real recordings of
        synthetic scenarios, curated from a fixed CI artifact. Live ingestion of
        workspace artifacts is separate work.
      </Notice>
    </>
  );
}
