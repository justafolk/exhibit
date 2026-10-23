import { useState } from 'react';
import type { Setup, Session, WorkspaceClient } from '../client';
import { Icon, PageHeading } from '../ui';
import { message } from '../navigation';

export function SetupPage({
  initial,
  session,
  client,
  onSave,
}: {
  initial: Setup;
  session: Session;
  client: WorkspaceClient;
  onSave: (value: Setup) => void;
}) {
  const [draft, setDraft] = useState(initial);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const canEdit = session.workspace.role === 'owner';
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const fields: {
    key: keyof Setup;
    title: string;
    placeholder: string;
    help: string;
    type?: string;
  }[] = [
    {
      key: 'repository',
      title: 'Repository',
      placeholder: 'your-team/your-repository',
      help: 'Repository metadata only. A GitHub App installation is a separate step.',
    },
    {
      key: 'stagingUrl',
      title: 'Staging URL',
      placeholder: 'https://staging.example.com',
      help: 'The isolated environment for your approved flow. Never production.',
      type: 'url',
    },
    {
      key: 'testTenant',
      title: 'Test tenant reference',
      placeholder: 'exhibit-staging-tenant',
      help: 'A dedicated tenant reference. Do not paste credentials or access tokens.',
    },
    {
      key: 'runbookRef',
      title: 'Versioned runbook reference',
      placeholder:
        'agents/runbooks/checkout.yaml@0123456789abcdef0123456789abcdef01234567',
      help: 'Use an immutable reference reviewed by your team. Saving is not approval.',
    },
  ];
  return (
    <>
      <PageHeading
        title="Workspace setup"
        description="Define where evidence belongs before connecting execution."
      />
      <div className="form-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Repository & staging</h2>
              <p>Start with one repository and one dedicated test tenant.</p>
            </div>
            <span className="quiet-badge">
              {canEdit ? 'Owner access' : 'Read only'}
            </span>
          </div>
          <form
            className="setup-form"
            onSubmit={async (event) => {
              event.preventDefault();
              setPending(true);
              setError('');
              setSaved(false);
              try {
                const result = await client.saveSetup(draft);
                setDraft(result);
                onSave(result);
                setSaved(true);
              } catch (reason) {
                setError(message(reason));
              } finally {
                setPending(false);
              }
            }}
          >
            <fieldset disabled={!canEdit || pending}>
              {fields.map((field) => (
                <div className="form-field" key={field.key}>
                  <label htmlFor={field.key}>{field.title}</label>
                  <input
                    id={field.key}
                    type={field.type || 'text'}
                    value={draft[field.key]}
                    placeholder={field.placeholder}
                    maxLength={field.key === 'runbookRef' ? 1000 : 300}
                    aria-describedby={`${field.key}-help`}
                    onChange={(event) => {
                      setDraft({ ...draft, [field.key]: event.target.value });
                      setSaved(false);
                    }}
                  />
                  <p id={`${field.key}-help`} className="field-help">
                    {field.help}
                  </p>
                </div>
              ))}
            </fieldset>
            {dirty && (
              <details className="setup-review">
                <summary>Review configuration changes</summary>
                <dl>
                  {fields.map((field) => (
                    <div key={field.key}>
                      <dt>{field.title}</dt>
                      <dd>{draft[field.key] || 'Not supplied'}</dd>
                    </div>
                  ))}
                </dl>
                <p>
                  Saving these references does not connect integrations or grant
                  execution approval.
                </p>
              </details>
            )}
            {error && (
              <p role="alert" className="form-error">
                {error}
              </p>
            )}
            {saved && (
              <p role="status" className="save-success">
                <Icon name="check" size={16} />
                {session.mode === 'demo'
                  ? 'Sample workspace details saved for this session.'
                  : 'Workspace details saved.'}
              </p>
            )}
            <div className="form-actions">
              <span>
                {canEdit
                  ? dirty
                    ? 'You have unsaved changes.'
                    : 'No unsaved changes.'
                  : 'Only workspace owners can change setup.'}
              </span>
              <button
                className="primary"
                disabled={!canEdit || pending || !dirty}
              >
                {pending ? 'Saving…' : 'Save workspace details'}
              </button>
            </div>
          </form>
        </section>
        <aside className="form-aside">
          <div className="aside-symbol">
            <Icon name="shield" size={22} />
          </div>
          <h2>Configuration is the first step.</h2>
          <p>
            These details help prepare evidence requests. They do not grant
            access to your repository or staging environment.
          </p>
          <div className="integration-state">
            <span className="status-point amber" />
            <strong>Execution not connected</strong>
          </div>
          <p>
            A reviewed runbook, trusted GitHub installation, and isolated runner
            are required before customer code can run.
          </p>
          <a className="text-link" href="#/flows">
            Explore flow requirements
            <Icon name="arrow" size={15} />
          </a>
        </aside>
      </div>
    </>
  );
}
