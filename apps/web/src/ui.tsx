import type { ReactNode } from 'react';
import type { Run } from './client';

export type IconName =
  | 'overview'
  | 'runs'
  | 'setup'
  | 'flow'
  | 'settings'
  | 'arrow'
  | 'check'
  | 'search'
  | 'branch'
  | 'clock'
  | 'close'
  | 'plus'
  | 'menu'
  | 'logout'
  | 'shield'
  | 'external'
  | 'file'
  | 'info'
  | 'video'
  | 'play'
  | 'pause'
  | 'record'
  | 'upload'
  | 'download'
  | 'muted'
  | 'volume';
const paths: Record<IconName, string> = {
  video: 'M3 5h12v14H3z M15 10l6-4v12l-6-4',
  play: 'M7 4l14 8-14 8z',
  pause: 'M7 4v16 M17 4v16',
  record: 'M20 12a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  upload: 'M12 16V3 M7 8l5-5 5 5 M4 16v5h16v-5',
  download: 'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',
  muted: 'M11 4L6 8H2v8h4l5 4z M16 9l6 6 M16 15l6-6',
  volume: 'M11 4L6 8H2v8h4l5 4z M15 8a6 6 0 0 1 0 8 M18 4a11 11 0 0 1 0 16',
  overview: 'M3 10l9-7 9 7v11h-6v-7H9v7H3z',
  runs: 'M4 3h12l4 4v14H4z M8 11h8 M8 15h8 M8 7h3',
  setup: 'M4 7h16 M4 17h16 M8 4v6 M16 14v6',
  flow: 'M12 3v6 M5 17v-5h14v5 M8 3h8 M2 17h6v4H2z M16 17h6v4h-6z',
  settings:
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M10 3h4l1 3 3 1 3-1 2 4-2 2v3l1 3-4 3-3-2h-3l-3 1-3-4 2-3v-3L3 8l4-3 3 1z',
  arrow: 'M5 12h14 M13 6l6 6-6 6',
  check: 'M5 12l4 4L19 6',
  search: 'M21 21l-5-5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  branch:
    'M6 6v12 M6 12h7a5 5 0 0 0 5-5 M4 3h4v4H4z M4 17h4v4H4z M16 3h4v4h-4z',
  clock: 'M12 7v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  close: 'M6 6l12 12 M6 18L18 6',
  plus: 'M12 5v14 M5 12h14',
  menu: 'M4 6h16 M4 12h16 M4 18h16',
  logout: 'M10 4H4v16h6 M10 12h11 M17 8l4 4-4 4',
  shield: 'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
  external: 'M14 3h7v7 M21 3L10 14 M10 3H3v18h18v-7',
  file: 'M4 3h12l4 4v14H4z M14 3v6h6 M8 13h8 M8 17h5',
  info: 'M12 11v6 M12 7h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
export const statusLabels: Record<Run['status'], string> = {
  verified: 'Verified',
  partial: 'Partial',
  failed: 'Failed',
  couldnt_run: 'Couldn’t run',
  queued: 'Queued',
  running: 'Running',
};
export function Badge({ status }: { status: Run['status'] }) {
  return (
    <span className={`badge ${status}`}>
      <span className="badge-dot" />
      {statusLabels[status]}
    </span>
  );
}
export const duration = (seconds: number) =>
  `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
export function PageHeading({
  title,
  description,
  action,
  level = 1,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  level?: 1 | 2;
}) {
  const Heading = level === 2 ? 'h2' : 'h1';
  return (
    <div className="page-heading">
      <div>
        <Heading>{title}</Heading>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon name="file" size={24} />
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <Icon name="info" size={17} />
      <div>{children}</div>
    </div>
  );
}
