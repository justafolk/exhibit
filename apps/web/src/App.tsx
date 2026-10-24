import { useEffect, useRef, useState } from 'react';
import {
  emptySetup,
  apiClient,
  type RunList,
  type Session,
  type Setup,
  type WorkspaceClient,
} from './client';
import { Empty, Icon, type IconName } from './ui';
import { Brand } from './components/Brand';
import { SignIn } from './pages/SignIn';
import { Overview } from './pages/Overview';
import { Runs } from './pages/Runs';
import { RunDetail } from './pages/RunDetail';
import { SetupPage } from './pages/SetupPage';
import { Flows } from './pages/Flows';
import { Prepare } from './pages/Prepare';
import { Settings } from './pages/Settings';
import { Recordings } from './pages/Recordings';
import { AgentSetup } from './pages/AgentSetup';
import { SampleEvidence } from './components/SampleEvidence';
import { SidebarNavigation } from './components/SidebarNavigation';
import { go, message, readRoute, decodeRoutePart } from './navigation';

type Page =
  | 'overview'
  | 'runs'
  | 'setup'
  | 'flows'
  | 'settings'
  | 'prepare'
  | 'studio'
  | 'agents'
  | 'evidence';
const navigation: { id: Page; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Reviews', icon: 'runs' },
  { id: 'studio', label: 'Agent recordings', icon: 'video' },
  { id: 'agents', label: 'Agent setup', icon: 'branch' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

export function App({ client = apiClient }: { client?: WorkspaceClient }) {
  const [session, setSession] = useState<Session | null>();
  const [authError, setAuthError] = useState('');
  const [route, setRoute] = useState(readRoute);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileViewport, setMobileViewport] = useState(
    () => window.matchMedia('(max-width: 700px)').matches,
  );
  const drawerRef = useRef<HTMLElement>(null);
  const closeNavigationRef = useRef<HTMLButtonElement>(null);
  const openNavigationRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 700px)');
    const resize = () => {
      setMobileViewport(media.matches);
      if (!media.matches) setMobileOpen(false);
    };
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeNavigationRef.current?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMobileOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]',
        ) || [],
      ).filter((element) => element.offsetParent !== null);
      const first = elements[0],
        last = elements[elements.length - 1];
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          !drawerRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        last?.focus();
      } else if (
        !event.shiftKey &&
        (document.activeElement === last ||
          !drawerRef.current?.contains(document.activeElement))
      ) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', trap);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', trap);
      if (openNavigationRef.current?.offsetParent !== null)
        openNavigationRef.current?.focus();
    };
  }, [mobileOpen]);
  const [data, setData] = useState<RunList>();
  const [setup, setSetup] = useState<Setup>(emptySetup);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [logoutPending, setLogoutPending] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  useEffect(() => {
    const expired = () => {
      setSession(null);
      setData(undefined);
      setSetup(emptySetup);
      setAuthError('Your session has expired. Sign in again to continue.');
      go('sign-in');
    };
    window.addEventListener('exhibit:session-expired', expired);
    return () => window.removeEventListener('exhibit:session-expired', expired);
  }, []);
  useEffect(() => {
    let active = true;
    client
      .session()
      .then((value) => {
        if (active) setSession(value);
      })
      .catch((reason) => {
        if (active) {
          setAuthError(message(reason));
          setSession(null);
        }
      });
    return () => {
      active = false;
    };
  }, [client, revision]);
  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute());
      setMobileOpen(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (!session) {
      setData(undefined);
      return;
    }
    let active = true;
    setError('');
    Promise.all([client.listRuns(), client.getSetup()])
      .then(([runs, config]) => {
        if (active) {
          setData(runs);
          setSetup(config);
        }
      })
      .catch((reason) => {
        if (active) setError(message(reason));
      });
    return () => {
      active = false;
    };
  }, [client, session, revision]);
  const page = (route.split('/')[0].split('?')[0] || 'overview') as Page;
  const navigationPage =
    page === 'evidence'
      ? 'studio'
      : page === 'runs'
        ? 'overview'
        : ['setup', 'flows', 'prepare'].includes(page)
          ? 'agents'
          : page;
  const selectedPage = navigation.find((item) => item.id === navigationPage);
  const runId =
    page === 'runs' && route.includes('/')
      ? decodeRoutePart(route.split('/')[1].split('?')[0])
      : null;
  const onSession = (value: Session) => {
    setSession(value);
    setAuthError('');
    if (route === 'sign-in') go('overview');
  };
  async function logout() {
    setLogoutPending(true);
    try {
      await client.logout();
      setSession(null);
      setData(undefined);
      setSetup(emptySetup);
      go('sign-in');
    } catch (reason) {
      setError(message(reason));
    } finally {
      setLogoutPending(false);
    }
  }
  if (session === undefined)
    return (
      <div className="boot-state" role="status">
        <Brand />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!session)
    return (
      <>
        {authError && (
          <div className="auth-error" role="alert">
            {authError}
            <button
              className="text-link"
              onClick={() => {
                setAuthError('');
                setSession(undefined);
                setRevision((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        )}
        <SignIn client={client} onSession={onSession} />
      </>
    );
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        Skip to content
      </a>
      {mobileOpen && (
        <button
          className="nav-backdrop"
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside
        ref={drawerRef}
        role={mobileOpen ? 'dialog' : undefined}
        aria-modal={mobileOpen ? true : undefined}
        inert={mobileViewport && !mobileOpen}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('a')) setMobileOpen(false);
        }}
        className={`sidebar ${mobileOpen ? 'is-open' : ''}`}
        aria-label="Workspace navigation"
      >
        <div className="sidebar-brand">
          <Brand />
          <button
            ref={closeNavigationRef}
            className="icon-button mobile-close"
            aria-label="Close navigation"
            onClick={() => setMobileOpen(false)}
          >
            <Icon name="close" />
          </button>
        </div>
        <a className="workspace-switch" href="#/settings">
          <span className="workspace-avatar">
            {session.workspace.name.charAt(0).toUpperCase()}
          </span>
          <span>
            <strong>{session.workspace.name}</strong>
            <small>
              {session.mode === 'demo'
                ? 'Sample workspace'
                : 'Private workspace'}
            </small>
          </span>
          <span className="workspace-caret">⌄</span>
        </a>
        <div className="nav-group-label">WORKSPACE</div>
        <SidebarNavigation
          route={route}
          activeGroup={navigationPage}
          count={data?.runs.length}
        />
        <div className="sidebar-bottom">
          <div className="boundary-note">
            <Icon name="shield" size={17} />
            <span>
              Staging only<small>Production stays untouched.</small>
            </span>
          </div>
          <a href="#/settings" className="account-link">
            <span className="account-avatar">
              {session.user.name
                .split(' ')
                .map((part) => part[0])
                .join('')
                .slice(0, 2)}
            </span>
            <span>
              <strong>{session.user.name}</strong>
              <small className="capitalize">{session.workspace.role}</small>
            </span>
            <Icon name="settings" size={16} />
          </a>
        </div>
      </aside>
      <div className="main-shell" inert={mobileOpen}>
        <header className="topbar">
          <div className="breadcrumb">
            <button
              ref={openNavigationRef}
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Icon name="menu" />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {selectedPage?.label || 'Overview'}
              {runId ? ' / Report' : ''}
            </strong>
          </div>
          <form
            className="global-search"
            onSubmit={(event) => {
              event.preventDefault();
              go(`runs?q=${encodeURIComponent(globalSearch)}`);
            }}
          >
            <Icon name="search" size={16} />
            <input
              ref={searchRef}
              aria-label="Quick search"
              placeholder="Quick search…"
              value={globalSearch}
              onChange={(event) => setGlobalSearch(event.target.value)}
            />
            <kbd>⌘ K</kbd>
          </form>
          <span className="topbar-status">
            <span className="status-point" />
            {session.mode === 'demo' ? 'Sample mode' : 'Private workspace'}
          </span>
        </header>
        <main id="main-content" tabIndex={-1}>
          {session.mode === 'demo' && (
            <div className="sample-banner">
              <span className="sample-label">SAMPLE DATA</span>
              <span>
                You’re exploring illustrative evidence. No pull requests have
                been executed.
              </span>
              <a href="#/agents">
                Agent setup
                <Icon name="arrow" size={14} />
              </a>
            </div>
          )}
          {error ? (
            <div role="alert" className="panel">
              <Empty
                title="Workspace is unavailable"
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
          ) : !data ? (
            <div className="loading-state" role="status">
              Loading workspace evidence…
            </div>
          ) : runId ? (
            <RunDetail client={client} id={runId} />
          ) : page === 'runs' ? (
            <Runs key={route} data={data} client={client} />
          ) : page === 'setup' ? (
            <SetupPage
              key={session.workspace.id}
              initial={setup}
              session={session}
              client={client}
              onSave={setSetup}
            />
          ) : page === 'flows' ? (
            <Flows client={client} session={session} />
          ) : page === 'prepare' ? (
            <Prepare client={client} session={session} setup={setup} />
          ) : page === 'evidence' ? (
            <SampleEvidence key={route} />
          ) : page === 'studio' ? (
            <Recordings
              key={route}
              client={client}
              session={session}
              runs={data}
            />
          ) : page === 'agents' ? (
            <AgentSetup />
          ) : page === 'settings' ? (
            <Settings
              key={route}
              client={client}
              onWorkspace={(workspace) => setSession({ ...session, workspace })}
              session={session}
              onLogout={logout}
              pending={logoutPending}
            />
          ) : (
            <Overview
              data={data}
              setup={setup}
              session={session}
              client={client}
            />
          )}
          <footer className="page-footer">
            <span>Exhibit · evidence with context</span>
            <span>Built for agents. Reviewed by humans.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
