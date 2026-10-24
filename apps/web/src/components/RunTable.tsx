import { displayLabel } from '../labels';
import type { Run } from '../client';
import { Badge, duration, Icon } from '../ui';

export function RunTable({
  runs,
  compact = false,
  reportQuery = '',
}: {
  runs: Run[];
  compact?: boolean;
  reportQuery?: string;
}) {
  return (
    <div className="table-scroll">
      <table>
        {runs.some((run) => run.sample) && (
          <caption className="table-context">
            Includes illustrative review records. Status examples do not certify
            execution; open a report for context.
          </caption>
        )}
        <thead>
          <tr>
            <th>Pull request</th>
            <th>Outcome</th>
            {!compact && <th>Coverage</th>}
            <th>Duration</th>
            <th>
              <span className="sr-only">Open report</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td>
                <a
                  className="run-title"
                  href={`#/runs/${encodeURIComponent(run.id)}${reportQuery}`}
                >
                  {displayLabel(run.title)}
                </a>
                <div className="run-meta">
                  <Icon name="branch" size={13} />
                  <span>{run.repository}</span>
                  <span>#{run.pullRequest}</span>
                </div>
              </td>
              <td>
                <Badge status={run.status} />
              </td>
              {!compact && (
                <td className="coverage">
                  {run.flows.length} {run.flows.length === 1 ? 'flow' : 'flows'}
                  <small>
                    <code>{run.headSha.slice(0, 7)}</code>
                  </small>
                </td>
              )}
              <td className="duration">{duration(run.durationSeconds)}</td>
              <td>
                <a
                  className="icon-button"
                  href={`#/runs/${encodeURIComponent(run.id)}${reportQuery}`}
                  aria-label={`Open report for PR ${run.pullRequest}`}
                >
                  <Icon name="arrow" size={16} />
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
