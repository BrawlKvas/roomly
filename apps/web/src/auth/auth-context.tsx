import type { SessionResponse } from '@roomly/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { ApiError, apiRequest } from '../api/api-client';

export type AuthEndReason = 'expired' | 'logout' | undefined;

interface AuthContextValue {
  endReason: AuthEndReason;
  isLoading: boolean;
  session: SessionResponse | undefined;
  signIn: (session: SessionResponse) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const sessionQueryKey = ['auth', 'me'] as const;
const channelName = 'roomly-auth';

interface SessionQueryValue {
  generation: number;
  session: SessionResponse | null;
}

function readSession(signal?: AbortSignal): Promise<SessionResponse | null> {
  return apiRequest<SessionResponse>(
    '/api/v1/auth/me',
    signal ? { signal } : {},
  ).catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  });
}

export function AuthProvider({ children }: PropsWithChildren): React.JSX.Element {
  const queryClient = useQueryClient();
  const [endReason, setEndReason] = useState<AuthEndReason>();
  const [session, setSession] = useState<SessionResponse | undefined>();
  const channel = useRef<BroadcastChannel | undefined>(undefined);
  const generation = useRef(0);
  const sessionQuery = useQuery({
    queryFn: async ({ signal }): Promise<SessionQueryValue> => ({
      generation: generation.current,
      session: await readSession(signal),
    }),
    queryKey: sessionQueryKey,
    retry: false,
    staleTime: 0,
  });

  const endSession = useCallback(
    (reason: Exclude<AuthEndReason, undefined>) => {
      setEndReason(reason);
      generation.current += 1;
      setSession(undefined);
      void queryClient.cancelQueries({ queryKey: sessionQueryKey });
      queryClient.removeQueries({ queryKey: sessionQueryKey });
    },
    [queryClient],
  );

  const signIn = useCallback(
    (session: SessionResponse) => {
      generation.current += 1;
      setEndReason(undefined);
      setSession(session);
      queryClient.setQueryData<SessionQueryValue>(sessionQueryKey, {
        generation: generation.current,
        session,
      });
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await apiRequest<void>('/api/v1/auth/logout', { method: 'POST' });
    } finally {
      endSession('logout');
      channel.current?.postMessage({ type: 'logout' });
    }
  }, [endSession]);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const current = new BroadcastChannel(channelName);
    channel.current = current;
    current.onmessage = (event: MessageEvent<{ type?: string }>) => {
      if (event.data?.type === 'logout') endSession('logout');
    };
    return () => {
      channel.current = undefined;
      current.close();
    };
  }, [endSession]);

  useEffect(() => {
    if (sessionQuery.data?.generation !== generation.current) return;
    setSession(sessionQuery.data.session ?? undefined);
  }, [sessionQuery.data]);

  const expiresAt = session?.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const delay = Math.max(0, Date.parse(expiresAt) - Date.now());
    const timeout = window.setTimeout(() => endSession('expired'), delay);
    return () => window.clearTimeout(timeout);
  }, [endSession, expiresAt]);

  const value = useMemo<AuthContextValue>(
    () => ({
      endReason,
      isLoading: sessionQuery.isPending && !session,
      session: endReason ? undefined : session,
      signIn,
      signOut,
    }),
    [endReason, session, sessionQuery.isPending, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
