import { useEffect, useState } from 'react';
import { Icon, type IconName } from '../ui';

type Group = 'overview' | 'studio' | 'agents' | 'settings';
const groups: {
  id: Group;
  label: string;
  icon: IconName;
  children: {
    label: string;
    href: string;
    active: (page: string, params: URLSearchParams) => boolean;
  }[];
}[] = [
  {
    id: 'overview',
    label: 'Reviews',
    icon: 'runs',
    children: [
      { label: 'Dashboard', href: 'overview', active: (p) => p === 'overview' },
      {
        label: 'All changes',
        href: 'runs',
        active: (p, q) => p === 'runs' && q.get('attention') !== '1',
      },
      {
        label: 'Needs attention',
        href: 'runs?attention=1',
        active: (p, q) => p === 'runs' && q.get('attention') === '1',
      },
    ],
  },
  {
    id: 'studio',
    label: 'Agent recordings',
    icon: 'video',
    children: [
      {
        label: 'Recording gallery',
        href: 'studio',
        active: (p, q) => p === 'studio' && q.get('manual') !== '1',
      },
      {
        label: 'Evidence explorer',
        href: 'evidence/sample-project',
        active: (p, q) => p === 'evidence' && q.get('section') !== 'API',
      },
      {
        label: 'API / cURL evidence',
        href: 'evidence/sample-project?section=API',
        active: (p, q) => p === 'evidence' && q.get('section') === 'API',
      },
      {
        label: 'Manual tools',
        href: 'studio?manual=1',
        active: (p, q) => p === 'studio' && q.get('manual') === '1',
      },
    ],
  },
  {
    id: 'agents',
    label: 'Agent setup',
    icon: 'branch',
    children: [
      {
        label: 'Agent quick start',
        href: 'agents',
        active: (p) => p === 'agents',
      },
      {
        label: 'Repository & staging',
        href: 'setup',
        active: (p) => p === 'setup',
      },
      {
        label: 'Flow definitions',
        href: 'flows',
        active: (p) => p === 'flows',
      },
      {
        label: 'Contract inspector',
        href: 'prepare',
        active: (p) => p === 'prepare',
      },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: 'settings',
    children: [
      {
        label: 'Workspace details',
        href: 'settings',
        active: (p, q) => p === 'settings' && q.get('section') !== 'session',
      },
      {
        label: 'Access & session',
        href: 'settings?section=session',
        active: (p, q) => p === 'settings' && q.get('section') === 'session',
      },
    ],
  },
];
export function SidebarNavigation({
  route,
  activeGroup,
  count,
}: {
  route: string;
  activeGroup: string;
  count?: number;
}) {
  const [expanded, setExpanded] = useState<Record<Group, boolean>>({
    overview: true,
    studio: true,
    agents: true,
    settings: true,
  });
  useEffect(() => {
    if (groups.some((g) => g.id === activeGroup))
      setExpanded((state) => ({ ...state, [activeGroup]: true }));
  }, [activeGroup]);
  const page = route.split('/')[0].split('?')[0];
  const params = new URLSearchParams(route.split('?')[1]);
  return (
    <nav aria-label="Main navigation">
      {groups.map((group) => (
        <section
          key={group.id}
          className="nav-section"
          aria-label={`${group.label} actions`}
        >
          <div
            className={`nav-parent ${activeGroup === group.id ? 'active' : ''}`}
          >
            <a
              className="nav-item"
              href={`#/${group.id}`}
              aria-label={group.label}
              aria-current={activeGroup === group.id ? 'page' : undefined}
            >
              <Icon name={group.icon} />
              {group.label}
              {group.id === 'overview' && count !== undefined && (
                <span className="nav-count">{count}</span>
              )}
            </a>
            <button
              className="nav-expand"
              aria-label={`${expanded[group.id] ? 'Collapse' : 'Expand'} ${group.label}`}
              aria-expanded={expanded[group.id]}
              aria-controls={`nav-${group.id}`}
              onClick={() =>
                setExpanded((state) => ({
                  ...state,
                  [group.id]: !state[group.id],
                }))
              }
            >
              <span aria-hidden="true">{expanded[group.id] ? '⌄' : '›'}</span>
            </button>
          </div>
          <ul
            id={`nav-${group.id}`}
            className="nav-children"
            hidden={!expanded[group.id]}
          >
            {group.children.map((child) => (
              <li key={child.href}>
                <a
                  href={`#/${child.href}`}
                  aria-current={child.active(page, params) ? 'page' : undefined}
                >
                  {child.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}
