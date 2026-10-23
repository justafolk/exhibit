import type { Session } from '../client';
import { Icon, PageHeading } from '../ui';

export function Settings({
  session,
  onLogout,
  pending,
}: {
  session: Session;
  onLogout: () => void;
  pending: boolean;
}) {
  return (
    <>
      <PageHeading
        title="Workspace settings"
        description="Your workspace identity, permissions, and current session."
      />
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>Workspace</h2>
          <span className="quiet-badge">
            {session.mode === 'demo' ? 'Sample workspace' : 'Private workspace'}
          </span>
        </div>
        <dl className="settings-list">
          <div>
            <dt>Workspace name</dt>
            <dd>{session.workspace.name}</dd>
          </div>
          <div>
            <dt>Workspace ID</dt>
            <dd>
              <code>{session.workspace.id}</code>
            </dd>
          </div>
          <div>
            <dt>Account</dt>
            <dd>
              {session.user.name}
              <small>{session.user.email}</small>
            </dd>
          </div>
          <div>
            <dt>Your role</dt>
            <dd>
              <span className="role-badge capitalize">
                {session.workspace.role}
              </span>
              <small>
                {session.workspace.role === 'owner'
                  ? 'Manage configuration and review evidence.'
                  : session.workspace.role === 'editor'
                    ? 'Prepare flows and review evidence.'
                    : 'Read workspace configuration and evidence.'}
              </small>
            </dd>
          </div>
        </dl>
        <div className="panel-foot split">
          <span>Permissions are assigned by your workspace administrator.</span>
          <a className="text-link" href="#/setup">
            Edit setup
            <Icon name="arrow" size={15} />
          </a>
        </div>
      </section>
      <section className="panel settings-panel session-panel">
        <div>
          <h2>Current session</h2>
          <p>
            {session.mode === 'demo'
              ? 'This session contains sample data and has no access to real repositories.'
              : 'Sign out to end your access on this browser.'}
          </p>
        </div>
        <button className="secondary" disabled={pending} onClick={onLogout}>
          <Icon name="logout" size={16} />
          {pending ? 'Signing out…' : 'Sign out'}
        </button>
      </section>
    </>
  );
}
