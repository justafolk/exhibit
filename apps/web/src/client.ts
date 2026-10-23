import type { components } from '../../../packages/contracts/src/api';
import sampleRuns from './sample-runs.json';

export type Run = components['schemas']['Run'];
export type RunList = components['schemas']['RunList'];
export type Role = 'owner' | 'editor' | 'viewer';
export type Session = {
  user: { id: string; email: string; name: string };
  workspace: { id: string; name: string; role: Role };
  mode: 'demo' | 'postgres';
  csrfToken: string;
};
export type Setup = {
  repository: string;
  stagingUrl: string;
  testTenant: string;
  runbookRef: string;
};
export const emptySetup: Setup = {
  repository: '',
  stagingUrl: '',
  testTenant: '',
  runbookRef: '',
};
export interface WorkspaceClient {
  session(): Promise<Session | null>;
  login(email: string, password: string): Promise<Session>;
  demo(): Promise<Session>;
  logout(): Promise<void>;
  listRuns(): Promise<RunList>;
  getRun(id: string): Promise<Run>;
  getSetup(): Promise<Setup>;
  saveSetup(setup: Setup): Promise<Setup>;
}

const previewSession: Session = {
  user: {
    id: 'preview-user',
    email: 'preview@example.invalid',
    name: 'Sample reviewer',
  },
  workspace: { id: 'preview-workspace', name: 'Exhibit sample', role: 'owner' },
  mode: 'demo',
  csrfToken: '',
};
const sessionKey = 'exhibit.preview.session';
const setupKey = 'exhibit.preview.setup';
// This adapter is intentionally separate from the interface. It has no authority
// outside the clearly labelled browser preview and is replaced at integration.
export const previewClient: WorkspaceClient = {
  async session() {
    return sessionStorage.getItem(sessionKey) === 'active'
      ? previewSession
      : null;
  },
  async login() {
    throw new Error(
      'Account sign-in is not connected in this interface preview. Explore the sample workspace instead.',
    );
  },
  async demo() {
    sessionStorage.setItem(sessionKey, 'active');
    return previewSession;
  },
  async logout() {
    sessionStorage.removeItem(sessionKey);
    sessionStorage.removeItem(setupKey);
  },
  async listRuns() {
    return { mode: 'demo', runs: sampleRuns as Run[] };
  },
  async getRun(id) {
    const run = (sampleRuns as Run[]).find((item) => item.id === id);
    if (!run) throw new Error('This evidence run could not be found.');
    return run;
  },
  async getSetup() {
    const saved = sessionStorage.getItem(setupKey);
    return saved
      ? ({ ...emptySetup, ...JSON.parse(saved) } as Setup)
      : { ...emptySetup };
  },
  async saveSetup(setup) {
    sessionStorage.setItem(setupKey, JSON.stringify(setup));
    return { ...setup };
  },
};
