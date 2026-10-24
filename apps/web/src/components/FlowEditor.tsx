import { useState } from 'react';
import type { Flow, FlowInput, WorkspaceClient } from '../client';
import { Icon } from '../ui';
import { message } from '../navigation';

const emptyFlow: FlowInput = {
  name: '',
  description: '',
  preconditions: [],
  assertions: [],
  cleanup: '',
  runbookRef: '',
};
const lines = (value: string) =>
  value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
export function FlowEditor({
  flow,
  client,
  canEdit,
  onSaved,
  onClose,
}: {
  flow: Flow | null;
  client: WorkspaceClient;
  canEdit: boolean;
  onSaved: (flow: Flow) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FlowInput>(flow || emptyFlow);
  const [preconditions, setPreconditions] = useState(
    flow?.preconditions.join('\n') || '',
  );
  const [assertions, setAssertions] = useState(
    flow?.assertions.join('\n') || '',
  );
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  function text(
    key: 'name' | 'description' | 'cleanup' | 'runbookRef',
    value: string,
  ) {
    setDraft({ ...draft, [key]: value });
  }
  return (
    <section className="panel flow-editor">
      <div className="panel-heading">
        <div>
          <h2>
            {flow
              ? canEdit
                ? 'Edit flow definition'
                : 'Flow definition'
              : 'New flow definition'}
          </h2>
          <p>Authored metadata. This is not execution approval.</p>
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Close flow editor"
          onClick={onClose}
          disabled={pending}
        >
          <Icon name="close" />
        </button>
      </div>
      <form
        className="setup-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canEdit) return;
          setPending(true);
          setError('');
          const input: FlowInput = {
            name: draft.name,
            description: draft.description,
            cleanup: draft.cleanup,
            runbookRef: draft.runbookRef,
            preconditions: lines(preconditions),
            assertions: lines(assertions),
          };
          try {
            onSaved(
              flow
                ? await client.updateFlow(flow.id, input)
                : await client.createFlow(input),
            );
          } catch (reason) {
            setError(message(reason));
          } finally {
            setPending(false);
          }
        }}
      >
        <fieldset disabled={!canEdit || pending}>
          <div className="form-field">
            <label htmlFor="flow-name">Flow name</label>
            <input
              id="flow-name"
              required
              maxLength={120}
              value={draft.name}
              placeholder="Checkout with a saved address"
              onChange={(event) => text('name', event.target.value)}
              autoFocus={canEdit}
            />
          </div>
          <div className="form-field">
            <label htmlFor="flow-description">Description</label>
            <textarea
              id="flow-description"
              maxLength={2000}
              rows={3}
              value={draft.description}
              placeholder="What behavior should this flow establish?"
              onChange={(event) => text('description', event.target.value)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="flow-preconditions">Preconditions</label>
            <textarea
              id="flow-preconditions"
              required
              rows={3}
              value={preconditions}
              aria-describedby="preconditions-help"
              placeholder="A dedicated test tenant exists\nThe user has a saved address"
              onChange={(event) => setPreconditions(event.target.value)}
            />
            <p className="field-help" id="preconditions-help">
              One condition per line. Up to 20 conditions, 500 characters each.
            </p>
          </div>
          <div className="form-field">
            <label htmlFor="flow-assertions">Deterministic assertions</label>
            <textarea
              id="flow-assertions"
              required
              rows={3}
              value={assertions}
              aria-describedby="assertions-help"
              placeholder="The saved address is selected\nThe order total matches the cart"
              onChange={(event) => setAssertions(event.target.value)}
            />
            <p className="field-help" id="assertions-help">
              Describe observable pass/fail checks, one per line. Up to 20
              assertions.
            </p>
          </div>
          <div className="form-field">
            <label htmlFor="flow-cleanup">Cleanup instructions</label>
            <textarea
              id="flow-cleanup"
              required
              maxLength={2000}
              rows={3}
              value={draft.cleanup}
              placeholder="Remove only records tagged with the current run ID."
              onChange={(event) => text('cleanup', event.target.value)}
            />
            <p className="field-help">
              Describe the cleanup boundary. These instructions are not executed
              by this form.
            </p>
          </div>
          <div className="form-field">
            <label htmlFor="flow-runbook">Versioned runbook reference</label>
            <input
              id="flow-runbook"
              required
              maxLength={1000}
              value={draft.runbookRef}
              placeholder="agents/runbooks/checkout.yaml@full-40-character-commit"
              onChange={(event) => text('runbookRef', event.target.value)}
            />
            <p className="field-help">
              Use a path followed by @ and its full lowercase commit SHA.
            </p>
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <span>
            {canEdit
              ? 'Saving does not approve or run this flow.'
              : 'Your viewer role can read definitions.'}
          </span>
          {canEdit && (
            <button className="primary" disabled={pending}>
              {pending ? 'Saving…' : 'Save flow'}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
