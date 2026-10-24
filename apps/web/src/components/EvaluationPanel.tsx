import type { Evaluation } from '../client';
import { Icon } from '../ui';
const labels: Record<string, string> = {
  repository: 'Repository',
  pullRequest: 'Pull request number',
  headSha: 'Head commit SHA',
  changeKind: 'Change type',
  environment: 'Environment',
  flowIds: 'Saved flows',
  runbookRef: 'Runbook reference',
  testTenant: 'Test tenant',
};
export function EvaluationPanel({
  result,
  pending,
}: {
  result?: Evaluation;
  pending: boolean;
}) {
  return (
    <aside className="panel readiness-panel">
      <div className="panel-heading">
        <h2>Contract readiness</h2>
        <Icon name="shield" size={17} />
      </div>
      {pending ? (
        <div className="readiness-content" role="status">
          Evaluating supplied metadata…
        </div>
      ) : result ? (
        <div className={`readiness-content ${result.state}`} role="status">
          <span className="readiness-state">
            {result.state === 'ready'
              ? 'Ready for policy review'
              : result.state === 'needs_info'
                ? 'Needs information'
                : 'Not testable'}
          </span>
          <p>{result.reason}</p>
          {result.missing.length > 0 && (
            <>
              <h3>Missing or invalid fields</h3>
              <ul>
                {result.missing.map((field) => (
                  <li key={field}>
                    <button
                      className="text-link"
                      type="button"
                      onClick={() =>
                        document.getElementById(`contract-${field}`)?.focus()
                      }
                    >
                      {labels[field] || field}
                      <span className="field-code">{field}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : (
        <div className="readiness-content">
          <div className="aside-symbol">
            <Icon name="file" size={22} />
          </div>
          <h3>Prepare, then evaluate.</h3>
          <p>
            Fill the fields you know. You can save an incomplete draft and
            return when the remaining details are available.
          </p>
        </div>
      )}
      <div className="readiness-limit">
        <strong>No run is started here.</strong>
        <p>
          Completeness does not verify GitHub identity, resolve flow approvals,
          authorize staging access, or allocate a runner.
        </p>
      </div>
    </aside>
  );
}
