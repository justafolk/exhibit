import { useEffect, useState } from 'react';
import type { IngestionToken, WorkspaceClient } from '../client';
import { message } from '../navigation';

export function IngestionSettings({ client }: { client: WorkspaceClient }) {
  const [tokens, setTokens] = useState<IngestionToken[]>();
  const [repository, setRepository] = useState('');
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let active = true;
    client
      .listIngestionTokens()
      .then((r) => {
        if (active) setTokens(r.tokens);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, [client, refresh]);
  return (
    <section className="panel settings-panel ci-evidence">
      <h2>GitHub Actions uploads</h2>
      <p>
        Save run reports, API results, and original recordings to this
        workspace. Create a token for the repository that produces the evidence.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError('');
          setSecret('');
          try {
            const r = await client.createIngestionToken(repository);
            setSecret(r.secret);
            setRefresh((v) => v + 1);
          } catch (e) {
            setError(message(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label htmlFor="ingestion-repository">GitHub repository</label>
        <div className="rename-form">
          <input
            id="ingestion-repository"
            placeholder="owner/repository"
            value={repository}
            onChange={(e) => setRepository(e.target.value)}
            required
            maxLength={200}
            pattern="[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"
          />
          <button className="secondary" disabled={busy}>
            Create upload token
          </button>
        </div>
      </form>
      {error && <p role="alert">{error}</p>}
      {secret && (
        <div role="status">
          <p>
            Shown once. Add this value as the repository Actions secret{' '}
            <code>EXHIBIT_INGEST_TOKEN</code>.
          </p>
          <input readOnly aria-label="New ingestion token" value={secret} />
          <button className="secondary" onClick={() => setSecret('')}>
            Hide token
          </button>
        </div>
      )}
      <p>
        Set the Actions variable <code>EXHIBIT_INGEST_URL</code> to{' '}
        <code>{window.location.origin}</code>. Tokens expire after 90 days. Only
        the isolated upload job should receive this secret.
      </p>
      {!tokens && !error && <p role="status">Loading upload tokens…</p>}
      <ul className="ci-files">
        {tokens?.map((t) => (
          <li key={t.id}>
            <span>
              {t.repository} ·{' '}
              {t.revokedAt
                ? 'Revoked'
                : `Expires ${new Date(t.expiresAt).toLocaleDateString()}`}
            </span>
            {!t.revokedAt && (
              <button
                className="secondary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError('');
                  try {
                    await client.revokeIngestionToken(t.id);
                    setSecret('');
                    setRefresh((v) => v + 1);
                  } catch (e) {
                    setError(message(e));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Revoke token
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
