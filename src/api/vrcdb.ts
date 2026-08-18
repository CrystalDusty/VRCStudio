// Avatar search using community VRChat avatar databases.
//
// Primary provider is api.avtrdb.com. Per their FAQ they require:
//   - User-Agent that identifies the app AND contains contact info (URL/email)
//   - Referer: https://vrcx.app + VRCX-ID UUID (allowlist gate)
// Without these we get 403 "Host not in allowlist" or 403 "Please add proper
// contact information to your user-agent".
//
// Routes through Electron's main process so we can set Referer + custom
// User-Agent (which browser fetch() blocks for security reasons).

const VRCX_ID_KEY = 'vrcstudio_vrcx_id';

function getVrcxId(): string {
  let id = localStorage.getItem(VRCX_ID_KEY);
  if (!id) {
    id = (crypto as any).randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(VRCX_ID_KEY, id);
  }
  return id;
}

// User-Agent that satisfies avtrdb's contact-info requirement.
const CONTACT_UA = 'VRCStudio/1.0.0 (+https://github.com/crystaldusty/vrcstudio; contact: vrcstudio@proton.me)';

const AVTRDB_HEADERS = (): Record<string, string> => ({
  'User-Agent': CONTACT_UA,
  'Referer': 'https://vrcx.app',
  'VRCX-ID': getVrcxId(),
});

export const VRCDB_PROVIDERS = [
  {
    id: 'avtrdb',
    label: 'avtrdb.com',
    // The VRCX endpoint supports: search, n (page size), page (1-indexed)
    // matching the web UI at avtrdb.com/search?query=...&page=N&page_size=N
    searchPageUrl: (q: string, pageSize: number, page: number) =>
      `https://api.avtrdb.com/v3/avatar/search/vrcx?search=${encodeURIComponent(q)}&n=${pageSize}&page=${page}`,
    byAuthorUrl: (id: string) => `https://api.avtrdb.com/v3/avatar/search/vrcx?authorId=${encodeURIComponent(id)}`,
    // Free-text search matches the avatar id. The old `fileId=` param expects
    // a file_… id, so passing an avtr_… id there returned unrelated rows —
    // callers must still verify the id on the way out.
    byIdUrl: (id: string) => `https://api.avtrdb.com/v3/avatar/search/vrcx?search=${encodeURIComponent(id)}&n=25&page=1`,
    webPageUrl: (avatarId: string) => `https://avtrdb.com/avatar/${encodeURIComponent(avatarId)}`,
    headers: AVTRDB_HEADERS,
  },
] as const;

export type ProviderId = typeof VRCDB_PROVIDERS[number]['id'];

const PROVIDER_KEY = 'vrcstudio_vrcdb_provider';

export function getProviderId(): ProviderId {
  const stored = localStorage.getItem(PROVIDER_KEY) as ProviderId | null;
  return VRCDB_PROVIDERS.find(p => p.id === stored) ? (stored as ProviderId) : 'avtrdb';
}

export function setProviderId(id: ProviderId) {
  localStorage.setItem(PROVIDER_KEY, id);
}

function getProvider() {
  const id = getProviderId();
  return VRCDB_PROVIDERS.find(p => p.id === id) ?? VRCDB_PROVIDERS[0];
}

export interface VRCDBAvatar {
  id: string;
  name: string;
  authorId: string;
  authorName: string;
  description: string;
  imageUrl: string;
  thumbnailImageUrl: string;
  releaseStatus: string;
}

export interface VRCDBPage {
  avatars: VRCDBAvatar[];
  /** true when the API returned a full page (more pages likely exist) */
  hasMore: boolean;
  /** total avatar count if the API returned it */
  total?: number;
}

function normalise(raw: unknown): VRCDBAvatar[] {
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : (raw as any)?.avatars ?? (raw as any)?.data ?? (raw as any)?.results ?? (raw && typeof raw === 'object' ? [raw] : []);
  return (list as any[])
    .filter(a => a && typeof a === 'object' && (a.id || a.avatarId || a.Id))
    .map(a => ({
      id: a.id ?? a.avatarId ?? a.Id ?? '',
      name: a.name ?? a.avatarName ?? '',
      authorId: a.authorId ?? a.userId ?? '',
      authorName: a.authorName ?? a.userName ?? '',
      description: a.description ?? '',
      imageUrl: a.imageUrl ?? a.thumbnailImageUrl ?? '',
      thumbnailImageUrl: a.thumbnailImageUrl ?? a.imageUrl ?? '',
      releaseStatus: a.releaseStatus ?? 'public',
    }));
}

function extractMeta(raw: unknown): { total?: number } {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as any;
  const total = r.total ?? r.total_count ?? r.totalCount ?? r.meta?.total ?? r.meta?.total_count;
  return { total: typeof total === 'number' ? total : undefined };
}

async function fetchUrlRaw(url: string, headers: Record<string, string>): Promise<{ data: unknown; status: number; rawError?: string }> {
  if (window.electronAPI?.httpGet) {
    const res = await window.electronAPI.httpGet(url, headers);
    if (!res.ok) return { data: null, status: res.status, rawError: res.raw?.slice(0, 200) };
    const data = res.data ?? (() => { try { return JSON.parse(res.raw); } catch { return null; } })();
    return { data, status: res.status };
  }
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return { data: null, status: res.status, rawError: await res.text().then(t => t.slice(0, 200)).catch(() => '') };
    return { data: await res.json(), status: res.status };
  } catch (err) {
    return { data: null, status: 0, rawError: err instanceof Error ? err.message : 'Network error' };
  }
}

async function fetchPage(url: string, headers: Record<string, string>, pageSize: number): Promise<VRCDBPage> {
  const { data, status, rawError } = await fetchUrlRaw(url, headers);
  if (status < 200 || status >= 300) {
    throw new Error(`HTTP ${status}${rawError ? `: ${rawError}` : ''}`);
  }
  const avatars = normalise(data);
  const { total } = extractMeta(data);
  // If API returns a total we can be precise; otherwise use page fullness as heuristic
  const hasMore = total !== undefined ? avatars.length + 0 < total : avatars.length >= pageSize;
  return { avatars, hasMore, total };
}

// Fetch a single page from the active provider (page is 1-indexed)
async function tryFetchPage(
  pick: (p: typeof VRCDB_PROVIDERS[number]) => string | null,
  pageSize: number,
): Promise<VRCDBPage> {
  const order = [getProvider(), ...VRCDB_PROVIDERS.filter(p => p.id !== getProviderId())];
  const errors: string[] = [];
  for (const provider of order) {
    const url = pick(provider);
    if (!url) continue;
    try {
      return await fetchPage(url, provider.headers(), pageSize);
    } catch (err) {
      errors.push(`${provider.label}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error(errors.length ? `All providers failed:\n${errors.join('\n')}` : 'No provider supports this search type');
}

// Legacy single-fetch used for author/ID lookups (no pagination needed there)
async function tryProviders(pick: (p: typeof VRCDB_PROVIDERS[number]) => string | null): Promise<VRCDBAvatar[]> {
  const page = await tryFetchPage(pick, 200);
  return page.avatars;
}

export const vrcdb = {
  /** Fetch one page of search results. page is 1-indexed. */
  searchPage: (query: string, pageSize: number, page: number): Promise<VRCDBPage> =>
    tryFetchPage(p => p.searchPageUrl(query, pageSize, page), pageSize),

  /** Legacy: fetch up to `count` results in one shot (for author/ID lookups). */
  search: (query: string, count = 200): Promise<VRCDBAvatar[]> =>
    tryProviders(p => p.searchPageUrl(query, count, 1)),

  getByAuthor: (authorId: string): Promise<VRCDBAvatar[]> =>
    tryProviders(p => p.byAuthorUrl(authorId)),

  getById: (avatarId: string): Promise<VRCDBAvatar[]> =>
    tryProviders(p => p.byIdUrl(avatarId)),

  webUrlFor: (avatarId: string): string | null => {
    const p = VRCDB_PROVIDERS.find(p => p.id === getProviderId()) ?? VRCDB_PROVIDERS[0];
    return 'webPageUrl' in p ? p.webPageUrl(avatarId) : null;
  },
};
