import { useState, type FormEvent } from 'react';
import type { Session, WorkspaceClient } from '../client';
import { Icon } from '../ui';
import { Brand } from '../components/Brand';
import { message } from '../navigation';

export function SignIn({
  client,
  onSession,
}: {
  client: WorkspaceClient;
  onSession: (session: Session) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<'login' | 'demo' | null>(null);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending('login');
    setError('');
    try {
      onSession(await client.login(email, password));
    } catch (reason) {
      setError(message(reason));
    } finally {
      setPending(null);
    }
  }
  return (
    <div className="auth-page">
      <header>
        <Brand />
        <span className="auth-note">
          Your agent ships code. Exhibit brings the evidence.
        </span>
      </header>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-symbol">
            <Icon name="shield" size={26} />
          </div>
          <h1>Welcome to Exhibit</h1>
          <p className="auth-description">
            Review agent-authored changes with their assertions,
            <br className="desktop-only" /> recordings, and coverage gaps.
          </p>
          <form onSubmit={submit}>
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary auth-submit" disabled={pending !== null}>
              {pending === 'login' ? 'Signing in…' : 'Sign in'}
              <Icon name="arrow" size={17} />
            </button>
          </form>
          <div className="auth-divider">
            <span>Just taking a look?</span>
          </div>
          <button
            className="secondary auth-submit"
            disabled={pending !== null}
            onClick={async () => {
              setPending('demo');
              setError('');
              try {
                onSession(await client.demo());
              } catch (reason) {
                setError(message(reason));
              } finally {
                setPending(null);
              }
            }}
          >
            {pending === 'demo'
              ? 'Opening preview…'
              : 'Explore workspace preview'}
            <Icon name="arrow" size={17} />
          </button>
          <p className="auth-help">
            Illustrative data only. No repositories are connected and no pull
            requests are executed.
          </p>
        </div>
        <p className="auth-provision">
          Need an account? Ask your workspace administrator to provision access.
        </p>
      </main>
      <footer>Commit-linked evidence. Human judgment.</footer>
    </div>
  );
}
