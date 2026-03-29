import { create } from 'zustand';

export interface AccountProfile {
  id: string;
  label: string;
  username: string;
  authCookie: string;
  twoFactorAuth?: string;
  lastUsed: number;
  avatarUrl?: string;
  displayName?: string;
}

const ACCOUNTS_KEY = 'vrcstudio_accounts';
const ACTIVE_KEY = 'vrcstudio_active_account';

function loadAccounts(): AccountProfile[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAccounts(accounts: AccountProfile[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

interface MultiAccountState {
  accounts: AccountProfile[];
  activeAccountId: string | null;

  addAccount: (account: Omit<AccountProfile, 'id' | 'lastUsed'>) => string;
  removeAccount: (id: string) => void;
  updateAccount: (id: string, updates: Partial<AccountProfile>) => void;
  setActiveAccount: (id: string) => void;
  getActiveAccount: () => AccountProfile | undefined;
  getAccount: (id: string) => AccountProfile | undefined;
}

export const useMultiAccountStore = create<MultiAccountState>((set, get) => ({
  accounts: loadAccounts(),
  activeAccountId: localStorage.getItem(ACTIVE_KEY),

  addAccount: (account) => {
    const id = `acct_${Date.now()}`;
    const newAccount: AccountProfile = { ...account, id, lastUsed: Date.now() };
    const accounts = [...get().accounts, newAccount];
    saveAccounts(accounts);
    set({ accounts });
    return id;
  },

  removeAccount: (id) => {
    const accounts = get().accounts.filter(a => a.id !== id);
    saveAccounts(accounts);
    const updates: Partial<MultiAccountState> = { accounts };
    if (get().activeAccountId === id) {
      updates.activeAccountId = accounts[0]?.id || null;
      localStorage.setItem(ACTIVE_KEY, updates.activeAccountId || '');
    }
    set(updates);
  },

  updateAccount: (id, updates) => {
    const accounts = get().accounts.map(a => a.id === id ? { ...a, ...updates } : a);
    saveAccounts(accounts);
    set({ accounts });
  },

  setActiveAccount: (id) => {
    localStorage.setItem(ACTIVE_KEY, id);
    const accounts = get().accounts.map(a =>
      a.id === id ? { ...a, lastUsed: Date.now() } : a
    );
    saveAccounts(accounts);
    set({ activeAccountId: id, accounts });
  },

  getActiveAccount: () => {
    const { accounts, activeAccountId } = get();
    return accounts.find(a => a.id === activeAccountId);
  },

  getAccount: (id) => get().accounts.find(a => a.id === id),
}));
