import { CircularProgress, Stack } from '@mui/material';
import { Navigate, Outlet } from 'react-router-dom';

import { useAuth } from './auth-context';

export function RequireAuth(): React.JSX.Element {
  const { endReason, isLoading, session } = useAuth();
  if (isLoading && !endReason) {
    return <Stack alignItems="center" sx={{ py: 8 }}><CircularProgress aria-label="Проверка входа" /></Stack>;
  }
  return session ? <Outlet /> : <Navigate replace state={{ reason: endReason }} to="/login" />;
}

export function RedirectAuthenticated(): React.JSX.Element {
  const { isLoading, session } = useAuth();
  if (isLoading) return <CircularProgress aria-label="Проверка входа" />;
  return session ? <Navigate replace to="/" /> : <Outlet />;
}

export function RequireAdmin(): React.JSX.Element {
  const { session } = useAuth();
  return session?.user.role === 'admin' ? <Outlet /> : <Navigate replace to="/" />;
}
