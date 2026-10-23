import { useEffect, useState } from 'react';
import type { Flow, Session, WorkspaceClient } from '../client';
import { Empty, Icon, Notice, PageHeading } from '../ui';
import { FlowEditor } from '../components/FlowEditor';
import { message } from '../navigation';

export function Flows({
  client,
  session,
}: {
  client: WorkspaceClient;
  session: Session;
}) {
  const [flows, setFlows] = useState<Flow[]>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<Flow | null | undefined>();
  const [saved, setSaved] = useState('');
  const canEdit = session.workspace.role !== 'viewer';
  useEffect(() => {
    let active = true;
    setError('');
    client
      .listFlows()
      .then((value) => {
        if (active) setFlows(value.flows);
      })
      .catch((reason) => {
        if (active) setError(message(reason));
      });
    return () => {
      active = false;
    };
  }, [client, revision]);
  return (
    <>
      <PageHeading
        title="Flow catalog"
        description="Define reusable behavior checks, preconditions, and cleanup boundaries."
        action={
          canEdit ? (
            <button
              className="primary"
              onClick={() => {
                setSelected(null);
                setSaved('');
              }}
            >
              <Icon name="plus" size={16} />
              Create flow
            </button>
          ) : (
            <span className="quiet-badge">Viewer · read only</span>
          )
        }
      />
      <Notice>
        <strong>Definitions are not approvals.</strong> Saving a flow records
        your intended checks. Trusted identity, reviewed runbooks, staging
        access, and execution budgets remain separate requirements.
      </Notice>
      {saved && (
        <p className="save-success" role="status">
          <Icon name="check" size={16} />
          {saved}
        </p>
      )}
      <div
        className={
          selected !== undefined ? 'flow-workspace editing' : 'flow-workspace'
        }
      >
        <section className="panel flow-list">
          <div className="panel-heading">
            <div>
              <h2>Workspace flows</h2>
              <p>
                {flows
                  ? `${flows.length} definitions · latest 100`
                  : 'Loading your catalog…'}
              </p>
            </div>
            <a href="#/prepare" className="text-link">
              Prepare evidence
              <Icon name="arrow" size={15} />
            </a>
          </div>
          {error ? (
            <div role="alert">
              <Empty
                title="Flow catalog is unavailable"
                action={
                  <button
                    className="secondary"
                    onClick={() => setRevision((value) => value + 1)}
                  >
                    Try again
                  </button>
                }
              >
                {error}
              </Empty>
            </div>
          ) : !flows ? (
            <div className="loading-state" role="status">
              Loading flow definitions…
            </div>
          ) : !flows.length ? (
            <Empty
              title="Define your first flow"
              action={
                canEdit ? (
                  <button
                    className="secondary"
                    onClick={() => setSelected(null)}
                  >
                    Create a flow definition
                  </button>
                ) : undefined
              }
            >
              Capture one meaningful behavior with clear preconditions,
              deterministic assertions, and cleanup instructions.
            </Empty>
          ) : (
            <ul className="flow-cards">
              {flows.map((flow) => (
                <li
                  key={flow.id}
                  className={selected?.id === flow.id ? 'selected-flow' : ''}
                >
                  <div className="flow-card-heading">
                    <span className="flow-symbol">
                      <Icon name="flow" size={19} />
                    </span>
                    <div>
                      <h3>{flow.name}</h3>
                      <span className="quiet-badge">
                        Authored · not approved
                      </span>
                    </div>
                    <button
                      className="text-link"
                      aria-label={`${canEdit ? 'Edit' : 'View'} ${flow.name}`}
                      onClick={() => {
                        setSelected(flow);
                        setSaved('');
                      }}
                    >
                      {canEdit ? 'Edit' : 'View'}
                      <Icon name="arrow" size={14} />
                    </button>
                  </div>
                  {flow.description && <p>{flow.description}</p>}
                  <div className="flow-card-meta">
                    <span>{flow.assertions.length} assertions</span>
                    <span>{flow.preconditions.length} preconditions</span>
                    <span>
                      Updated {new Date(flow.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                  <code className="flow-id">{flow.id}</code>
                </li>
              ))}
            </ul>
          )}
        </section>
        {selected !== undefined && (
          <FlowEditor
            key={selected?.id || 'new'}
            flow={selected}
            client={client}
            canEdit={canEdit}
            onClose={() => setSelected(undefined)}
            onSaved={(flow) => {
              setFlows((items) => [
                flow,
                ...(items || []).filter((item) => item.id !== flow.id),
              ]);
              setSelected(undefined);
              setSaved(
                session.mode === 'demo'
                  ? 'Flow definition saved for this sample session. It is not approved for execution.'
                  : 'Flow definition saved. It is not approved for execution.',
              );
            }}
          />
        )}
      </div>
    </>
  );
}
