import type { components } from '../../../packages/contracts/src/api';

export type Run = components['schemas']['Run'];
export type RunList = components['schemas']['RunList'];
export type Session = components['schemas']['Session'];
export type Setup = components['schemas']['Setup'];
export type Workspace = components['schemas']['Workspace'];
export type Role = Session['workspace']['role'];
export type Flow = components['schemas']['Flow'];
export type FlowInput = components['schemas']['FlowInput'];
export type EvidenceContract = components['schemas']['EvidenceContract'];
export type ContractDraft = components['schemas']['ContractDraft'];
export type Evaluation = components['schemas']['Evaluation'];
export type Recording = components['schemas']['Recording'];
export type RecordingInput = components['schemas']['RecordingInput'];
export type RecordingChapter = components['schemas']['RecordingChapter'];
export type RecordingPresentation =
  components['schemas']['RecordingPresentation'];
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
  listRuns(filters?: { q?: string; status?: Run['status'] }): Promise<RunList>;
  getRun(id: string): Promise<Run>;
  getSetup(): Promise<Setup>;
  saveSetup(setup: Setup): Promise<Setup>;
  renameWorkspace(name: string): Promise<Workspace>;
  listFlows(): Promise<{ flows: Flow[] }>;
  createFlow(input: FlowInput): Promise<Flow>;
  updateFlow(id: string, input: FlowInput): Promise<Flow>;
  getDraft(): Promise<ContractDraft>;
  saveDraft(draft: ContractDraft): Promise<ContractDraft>;
  evaluateContract(draft: ContractDraft): Promise<Evaluation>;
  listRecordings(): Promise<{ recordings: Recording[] }>;
  createRecording(input: RecordingInput): Promise<Recording>;
}

export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'APIError';
  }
}
let csrfToken = '';
async function request<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  allowAnonymous = false,
): Promise<T> {
  const headers: Record<string, string> = {};
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  }
  const response = await fetch(`/api/v1${path}`, {
    method,
    headers,
    credentials: 'same-origin',
    cache: 'no-store',
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : `The service returned ${response.status}. Please try again.`;
    if (response.status === 401 && !allowAnonymous) {
      csrfToken = '';
      window.dispatchEvent(new Event('exhibit:session-expired'));
    }
    throw new APIError(response.status, message);
  }
  return payload as T;
}
function remember(session: Session) {
  csrfToken = session.csrfToken;
  return session;
}

// All workspace data comes from the API. Unavailable services never fall back to fixtures.
export const apiClient: WorkspaceClient = {
  async session() {
    try {
      return remember(
        await request<Session>('/auth/session', 'GET', undefined, true),
      );
    } catch (error) {
      if (error instanceof APIError && error.status === 401) {
        csrfToken = '';
        return null;
      }
      throw error;
    }
  },
  async login(email, password) {
    return remember(
      await request<Session>('/auth/login', 'POST', { email, password }, true),
    );
  },
  async demo() {
    return remember(await request<Session>('/auth/demo', 'POST', {}, true));
  },
  async logout() {
    await request('/auth/logout', 'POST', {});
    csrfToken = '';
  },
  listRuns: (filters) => {
    const params = new URLSearchParams();
    if (filters?.q) params.set('q', filters.q);
    if (filters?.status) params.set('status', filters.status);
    return request<RunList>(`/runs${params.size ? `?${params}` : ''}`);
  },
  getRun: (id) => request<Run>(`/runs/${encodeURIComponent(id)}`),
  getSetup: () => request<Setup>('/setup'),
  saveSetup: (setup) => request<Setup>('/setup', 'PUT', setup),
  renameWorkspace: (name) =>
    request<Workspace>('/workspace', 'PATCH', { name }),
  listFlows: () => request<{ flows: Flow[] }>('/flows'),
  createFlow: (input) => request<Flow>('/flows', 'POST', input),
  updateFlow: (id, input) =>
    request<Flow>(`/flows/${encodeURIComponent(id)}`, 'PATCH', input),
  getDraft: () => request<ContractDraft>('/contract-draft'),
  saveDraft: (draft) => request<ContractDraft>('/contract-draft', 'PUT', draft),
  evaluateContract: (draft) =>
    request<Evaluation>('/contracts/evaluate', 'POST', draft),
  listRecordings: () => request<{ recordings: Recording[] }>('/recordings'),
  createRecording: (input) => request<Recording>('/recordings', 'POST', input),
};
