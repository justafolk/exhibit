import { displayLabel } from '../labels';
import { useEffect, useState } from 'react';
import type {
  ContractDraft,
  Evaluation,
  Flow,
  Session,
  Setup,
  WorkspaceClient,
} from '../client';
import { Empty, Icon, Notice, PageHeading } from '../ui';
import { EvaluationPanel } from '../components/EvaluationPanel';
import { message } from '../navigation';

type DraftForm = Omit<ContractDraft, 'pullRequest'> & { pullRequest: string };
const toForm = (draft: ContractDraft): DraftForm => ({
  ...draft,
  pullRequest: draft.pullRequest ? String(draft.pullRequest) : '',
  environment: draft.environment || 'staging',
});
const toContract = (draft: DraftForm): ContractDraft => ({
  ...draft,
  pullRequest: Number(draft.pullRequest) || 0,
});
const changeKinds = ['frontend', 'backend', 'fullstack', 'docs', 'migration'];

export function Prepare({
  client,
  session,
  setup,
}: {
  client: WorkspaceClient;
  session: Session;
  setup: Setup;
}) {
  const [draft, setDraft] = useState<DraftForm>();
  const [flows, setFlows] = useState<Flow[]>([]);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [pending, setPending] = useState<'save' | 'evaluate' | null>(null);
  const [result, setResult] = useState<Evaluation>();
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const canEdit = session.workspace.role !== 'viewer';
  useEffect(() => {
    let active = true;
    setLoadError('');
    Promise.all([client.getDraft(), client.listFlows()])
      .then(([value, catalog]) => {
        if (active) {
          setDraft(toForm(value));
          setFlows(catalog.flows);
          setDirty(false);
        }
      })
      .catch((reason) => {
        if (active) setLoadError(message(reason));
      });
    return () => {
      active = false;
    };
  }, [client, revision]);
  function update<K extends keyof DraftForm>(key: K, value: DraftForm[K]) {
    if (!draft) return;
    setDraft({ ...draft, [key]: value });
    setDirty(true);
    setResult(undefined);
    setSaved('');
  }
  const missing = (field: string) =>
    result?.missing.includes(field) || undefined;
  async function save() {
    if (!draft || !canEdit) return;
    setPending('save');
    setError('');
    setSaved('');
    try {
      const value = await client.saveDraft(toContract(draft));
      setDraft(toForm(value));
      setDirty(false);
      setSaved(
        session.mode === 'demo'
          ? 'Draft saved for this preview session.'
          : 'Draft saved.',
      );
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(null);
    }
  }
  async function evaluate() {
    if (!draft || !canEdit) return;
    setPending('evaluate');
    setError('');
    setSaved('');
    setResult(undefined);
    try {
      setResult(await client.evaluateContract(toContract(draft)));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(null);
    }
  }
  if (loadError)
    return (
      <div role="alert">
        <Empty
          title="Preparation is unavailable"
          action={
            <button
              className="secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </button>
          }
        >
          {loadError}
        </Empty>
      </div>
    );
  if (!draft)
    return (
      <div className="loading-state" role="status">
        Loading your evidence draft…
      </div>
    );
  const unavailableFlows = draft.flowIds.filter(
    (id) => !flows.some((flow) => flow.id === id),
  );
  return (
    <>
      <PageHeading
        title="Prepare evidence"
        description="Build a complete, commit-specific request before execution is considered."
        action={
          <a className="secondary" href="#/flows">
            <Icon name="flow" size={16} />
            Manage flows
          </a>
        }
      />
      {!canEdit && (
        <Notice>
          Your viewer role can read this workspace’s draft. An owner or editor
          can save changes and evaluate its completeness.
        </Notice>
      )}
      <div className="prepare-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Evidence contract</h2>
              <p>One workspace draft. Saving replaces the previous draft.</p>
            </div>
            <span className="quiet-badge">
              {dirty ? 'Unsaved changes' : 'Draft'}
            </span>
          </div>
          <form
            className="setup-form prepare-form"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <fieldset disabled={!canEdit || pending !== null}>
              <div className="defaults-row">
                <span>Reuse your repository and staging references.</span>
                <button
                  className="text-link"
                  type="button"
                  onClick={() => {
                    setDraft({
                      ...draft,
                      repository: setup.repository,
                      testTenant: setup.testTenant,
                      runbookRef: setup.runbookRef,
                      environment: 'staging',
                    });
                    setDirty(true);
                    setResult(undefined);
                    setSaved('');
                  }}
                >
                  Use workspace defaults
                  <Icon name="arrow" size={14} />
                </button>
              </div>
              <div className="form-field">
                <label htmlFor="contract-repository">Repository</label>
                <input
                  id="contract-repository"
                  value={draft.repository}
                  maxLength={300}
                  placeholder="your-team/your-repository"
                  aria-invalid={missing('repository')}
                  onChange={(event) => update('repository', event.target.value)}
                />
              </div>
              <div className="form-row">
                <div className="form-field">
                  <label htmlFor="contract-pullRequest">
                    Pull request number
                  </label>
                  <input
                    id="contract-pullRequest"
                    type="number"
                    min={1}
                    step={1}
                    value={draft.pullRequest}
                    placeholder="e.g. 42"
                    aria-invalid={missing('pullRequest')}
                    onChange={(event) =>
                      update('pullRequest', event.target.value)
                    }
                  />
                </div>
                <div className="form-field">
                  <label htmlFor="contract-changeKind">Change type</label>
                  <select
                    id="contract-changeKind"
                    value={draft.changeKind}
                    aria-invalid={missing('changeKind')}
                    onChange={(event) =>
                      update('changeKind', event.target.value)
                    }
                  >
                    <option value="">Select a change type</option>
                    <option value="frontend">Frontend</option>
                    <option value="backend">Backend</option>
                    <option value="fullstack">Full stack</option>
                    <option value="docs">Documentation</option>
                    <option value="migration">Database migration</option>
                    {draft.changeKind &&
                      !changeKinds.includes(draft.changeKind) && (
                        <option value={draft.changeKind}>
                          Unsupported: {draft.changeKind}
                        </option>
                      )}
                  </select>
                </div>
              </div>
              <div className="form-field">
                <label htmlFor="contract-headSha">Head commit SHA</label>
                <input
                  id="contract-headSha"
                  value={draft.headSha}
                  maxLength={200}
                  placeholder="Full 40-character lowercase commit SHA"
                  spellCheck={false}
                  autoCapitalize="none"
                  aria-invalid={missing('headSha')}
                  onChange={(event) => update('headSha', event.target.value)}
                />
                <p className="field-help">
                  Use the exact pull request head. This form does not resolve or
                  verify it with GitHub.
                </p>
              </div>
              <div className="form-field">
                <label htmlFor="contract-environment">Environment</label>
                <input
                  id="contract-environment"
                  value={draft.environment}
                  readOnly
                  aria-invalid={missing('environment')}
                />
                <p className="field-help">
                  Only staging is eligible. Workspace defaults restore the
                  staging boundary.
                </p>
              </div>
              <fieldset
                className="flow-selection"
                id="contract-flowIds"
                tabIndex={-1}
                aria-invalid={missing('flowIds')}
              >
                <legend>Saved flows</legend>
                {flows.length ? (
                  flows.map((flow) => (
                    <label className="flow-option" key={flow.id}>
                      <input
                        type="checkbox"
                        aria-label={displayLabel(flow.name)}
                        checked={draft.flowIds.includes(flow.id)}
                        onChange={(event) =>
                          update(
                            'flowIds',
                            event.target.checked
                              ? [...draft.flowIds, flow.id]
                              : draft.flowIds.filter((id) => id !== flow.id),
                          )
                        }
                      />
                      <span>
                        <strong>{displayLabel(flow.name)}</strong>
                        <small>
                          {flow.assertions.length} assertions · authored, not
                          approved
                        </small>
                      </span>
                    </label>
                  ))
                ) : (
                  <p className="field-help">
                    No definitions are saved yet.{' '}
                    <a href="#/flows">Create a flow</a> to include its intended
                    checks.
                  </p>
                )}
                {unavailableFlows.map((id) => (
                  <div className="unavailable-flow" key={id}>
                    <span>
                      Not in the loaded catalog: <code>{id}</code>
                    </span>
                    {canEdit && (
                      <button
                        className="text-link"
                        type="button"
                        onClick={() =>
                          update(
                            'flowIds',
                            draft.flowIds.filter((value) => value !== id),
                          )
                        }
                      >
                        Remove unavailable flow {id}
                      </button>
                    )}
                  </div>
                ))}
              </fieldset>
              <div className="form-field">
                <label htmlFor="contract-runbookRef">
                  Versioned runbook reference
                </label>
                <input
                  id="contract-runbookRef"
                  value={draft.runbookRef}
                  maxLength={1000}
                  placeholder="agents/runbooks/flow.yaml@full-commit-SHA"
                  aria-invalid={missing('runbookRef')}
                  onChange={(event) => update('runbookRef', event.target.value)}
                />
              </div>
              <div className="form-field">
                <label htmlFor="contract-testTenant">
                  Test tenant reference
                </label>
                <input
                  id="contract-testTenant"
                  value={draft.testTenant}
                  maxLength={300}
                  placeholder="A dedicated staging tenant"
                  aria-invalid={missing('testTenant')}
                  onChange={(event) => update('testTenant', event.target.value)}
                />
                <p className="field-help">
                  References only. Keep passwords, cookies, and API keys out of
                  the draft.
                </p>
              </div>
            </fieldset>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {saved && (
              <p className="save-success" role="status">
                <Icon name="check" size={16} />
                {saved}
              </p>
            )}
            <div className="prepare-actions">
              <button
                className="secondary"
                disabled={!canEdit || pending !== null}
              >
                {pending === 'save' ? 'Saving…' : 'Save draft'}
              </button>
              <button
                className="primary"
                type="button"
                disabled={!canEdit || pending !== null}
                onClick={() => void evaluate()}
              >
                {pending === 'evaluate' ? 'Evaluating…' : 'Evaluate contract'}
                <Icon name="arrow" size={15} />
              </button>
            </div>
          </form>
        </section>
        <EvaluationPanel result={result} pending={pending === 'evaluate'} />
      </div>
    </>
  );
}
