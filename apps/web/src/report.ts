import { displayLabel } from './labels';
import type { Run } from './client';
import { statusLabels } from './ui';

const inline = (value: string) =>
  value.replace(/[\r\n]+/g, ' ').replace(/[\\`*_{}\[\]<>#!|]/g, '\\$&');
export function markdownReport(run: Run): string {
  const lines = [
    `# Evidence report: ${inline(displayLabel(run.title))}`,
    '',
    run.sample
      ? '**Illustrative review — statuses and assertions are examples; no workspace execution is claimed.**'
      : '**Stored evidence report.**',
    '',
    `- Recorded outcome: ${statusLabels[run.status]}`,
    `- Repository: ${inline(run.repository)}`,
    `- Pull request: #${run.pullRequest}`,
    `- Run ID: ${inline(run.id)}`,
    `- Head SHA: ${inline(run.headSha)}`,
    `- Environment: ${inline(run.environment)}`,
    `- Created: ${inline(run.createdAt)}`,
    `- Duration: ${run.durationSeconds} seconds`,
    '',
    '## Assertions',
    '',
    ...run.assertions.map(
      (assertion) =>
        `- ${assertion.passed ? 'PASS' : 'FAIL'}: ${inline(assertion.label)}`,
    ),
    ...(run.assertions.length ? [] : ['No assertions recorded.']),
    '',
    '## Coverage gaps',
    '',
    ...run.notCovered.map((gap) => `- ${inline(gap)}`),
    ...(run.notCovered.length
      ? []
      : ['No gaps were recorded. This does not establish complete coverage.']),
    '',
    '## Tested flows',
    '',
    ...run.flows.map((flow) => `- ${inline(flow)}`),
    ...(run.flows.length ? [] : ['No flows recorded.']),
    '',
    '## Evidence limits',
    '',
    'Recordings, traces, and execution attempts are not attached to this report.',
    'A recorded outcome does not establish coverage beyond the assertions and flows listed above.',
    '',
  ];
  return lines.join('\n');
}
export function downloadReport(run: Run) {
  const url = URL.createObjectURL(
    new Blob([markdownReport(run)], { type: 'text/markdown;charset=utf-8' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `exhibit-${run.id.replace(/[^a-zA-Z0-9_-]/g, '-')}.md`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
