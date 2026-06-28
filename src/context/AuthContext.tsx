import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { dbGet, dbRemove, dbSet, dbUpdate } from '@/lib/firebase';

export type AuthRole = 'admin' | 'user';

export type AuthAccount = {
  username: string;
  password: string;
  role: AuthRole;
};

type AuthUser = {
  username: string;
  role: AuthRole;
};

type AuthContextValue = {
  user: AuthUser | null;
  accounts: AuthAccount[];
  loading: boolean;
  login: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  registerUser: (username: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
  refreshAccounts: () => Promise<void>;
  createAccount: (account: AuthAccount) => Promise<void>;
  updateAccount: (username: string, updates: Partial<Omit<AuthAccount, 'username'>>) => Promise<void>;
  deleteAccount: (username: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const STORAGE_KEY = 'show-manager-auth-user';
const DEFAULT_ADMIN: AuthAccount = {
  username: 'admin',
  password: 'admin',
  role: 'admin',
};

const loadStoredUser = () => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    return JSON.parse(stored) as AuthUser;
  } catch {
    return null;
  }
};

const persistUser = (user: AuthUser | null) => {
  if (!user) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
};

const normalizeAccounts = (data: unknown): AuthAccount[] => {
  if (!data || typeof data !== 'object') return [];
  return Object.values(data as Record<string, AuthAccount>);
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [accounts, setAccounts] = useState<AuthAccount[]>([]);
  const [userAccounts, setUserAccounts] = useState<AuthAccount[]>([]);
  const [user, setUser] = useState<AuthUser | null>(() => loadStoredUser());
  const [loading, setLoading] = useState(true);
  const [accountsSource, setAccountsSource] = useState<'db' | 'unknown'>('unknown');

  const ensureDefaultAdmin = useCallback(async (data: AuthAccount[]) => {
    if (data.length > 0) return;
    await dbSet('authAccounts', {
      [DEFAULT_ADMIN.username]: DEFAULT_ADMIN,
    });
  }, []);

  const refreshAccounts = useCallback(async () => {
    try {
      const [authData, userData] = await Promise.all([dbGet('authAccounts'), dbGet('userAccounts')]);
      const normalised = normalizeAccounts(authData);
      await ensureDefaultAdmin(normalised);
      const updatedData = normalised.length === 0 ? [DEFAULT_ADMIN] : normalised;
      setAccounts(updatedData);
      setUserAccounts(normalizeAccounts(userData));
      setAccountsSource('db');
    } catch (error) {
      console.error(error);
      setAccounts([]);
      setUserAccounts([]);
      setAccountsSource('unknown');
    }
  }, [ensureDefaultAdmin]);

  useEffect(() => {
    const load = async () => {
      await refreshAccounts();
      setLoading(false);
    };
    load();
  }, [refreshAccounts]);

  useEffect(() => {
    if (!user) return;
    if (accountsSource !== 'db') return;
    const exists = [...accounts, ...userAccounts].find((account) => account.username === user.username);
    if (!exists) {
      setUser(null);
      persistUser(null);
    }
  }, [accounts, accountsSource, user, userAccounts]);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const [authData, userData] = await Promise.all([dbGet('authAccounts'), dbGet('userAccounts')]);
        const normalised = normalizeAccounts(authData);
        await ensureDefaultAdmin(normalised);
        const latestAccounts = normalised.length === 0 ? [DEFAULT_ADMIN] : normalised;
        const latestUserAccounts = normalizeAccounts(userData);
        setAccounts(latestAccounts);
        setUserAccounts(latestUserAccounts);
        const account = [...latestAccounts, ...latestUserAccounts].find(
          (item) => item.username === username.trim()
        );
        if (!account || account.password !== password) {
          return { ok: false, message: 'Invalid username or password.' };
        }
        const nextUser = { username: account.username, role: account.role } satisfies AuthUser;
        setUser(nextUser);
        persistUser(nextUser);
        return { ok: true };
      } catch (error) {
        console.error(error);
        return { ok: false, message: 'Unable to reach authentication service.' };
      }
    },
    [ensureDefaultAdmin]
  );

  const registerUser = useCallback(async (username: string, password: string) => {
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      return { ok: false, message: 'Please enter username and password.' };
    }
    try {
      const [authData, userData] = await Promise.all([dbGet('authAccounts'), dbGet('userAccounts')]);
      const adminAccounts = normalizeAccounts(authData);
      const existingUserAccounts = normalizeAccounts(userData);
      const exists = [...adminAccounts, ...existingUserAccounts].some(
        (account) => account.username === trimmedUsername
      );
      if (exists) {
        return { ok: false, message: 'Username already exists.' };
      }
      const account: AuthAccount = {
        username: trimmedUsername,
        password,
        role: 'user',
      };
      await dbSet(`userAccounts/${trimmedUsername}`, account as unknown as Record<string, unknown>);
      setUserAccounts((prev) => [...prev, account]);
      return { ok: true };
    } catch (error) {
      console.error(error);
      return { ok: false, message: 'Unable to register right now.' };
    }
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    persistUser(null);
  }, []);

  const createAccount = useCallback(async (account: AuthAccount) => {
    await dbSet(`authAccounts/${account.username}`, account as unknown as Record<string, unknown>);
    setAccounts((prev) => [...prev, account]);
  }, []);

  const updateAccount = useCallback(async (username: string, updates: Partial<Omit<AuthAccount, 'username'>>) => {
    await dbUpdate(`authAccounts/${username}`, updates as unknown as Record<string, unknown>);
    setAccounts((prev) =>
      prev.map((account) => (account.username === username ? { ...account, ...updates } : account))
    );
  }, []);

  const deleteAccount = useCallback(async (username: string) => {
    await dbRemove(`authAccounts/${username}`);
    setAccounts((prev) => prev.filter((account) => account.username !== username));
    if (user?.username === username) {
      logout();
    }
  }, [logout, user?.username]);

  const value = useMemo(
    () => ({
      user,
      accounts,
      loading,
      login,
      registerUser,
      logout,
      refreshAccounts,
      createAccount,
      updateAccount,
      deleteAccount,
    }),
    [
      accounts,
      createAccount,
      deleteAccount,
      login,
      loading,
      logout,
      refreshAccounts,
      registerUser,
      updateAccount,
      user,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
