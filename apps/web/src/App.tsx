import { CssBaseline, ThemeProvider } from '@mui/material';
import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { roomlyTheme } from './app/theme';
import { AppErrorBoundary } from './components/app-error-boundary';
import { AppLayout } from './components/app-layout';
import { AuthProvider } from './auth/auth-context';
import { RedirectAuthenticated, RequireAuth } from './auth/auth-routes';
import { HomePage } from './pages/home-page';
import { LoginPage } from './pages/login-page';
import { NotFoundPage } from './pages/not-found-page';
import { ProfilePage } from './pages/profile-page';
import { CatalogPage } from './pages/catalog-page';
import { RoomPage } from './pages/room-page';
import { SearchPage } from './pages/search-page';
import { BookingsPage } from './pages/bookings-page';
import { BookingDetailPage } from './pages/booking-detail-page';
import { BookingFormPage } from './pages/booking-form-page';

interface RoomlyAppProps {
  queryClient: QueryClient;
}

export function RoomlyApp({ queryClient }: RoomlyAppProps): React.JSX.Element {
  return (
    <AppErrorBoundary>
      <ThemeProvider theme={roomlyTheme}>
        <CssBaseline />
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route element={<RedirectAuthenticated />}>
                  <Route element={<LoginPage />} path="/login" />
                </Route>
                <Route element={<RequireAuth />}>
                  <Route element={<AppLayout />}>
                    <Route element={<HomePage />} path="/" />
                    <Route element={<CatalogPage />} path="/catalog" />
                    <Route element={<RoomPage />} path="/catalog/:roomId" />
                    <Route element={<ProfilePage />} path="/profile" />
                    <Route element={<SearchPage />} path="/search" />
                    <Route element={<BookingsPage />} path="/bookings" />
                    <Route element={<BookingFormPage />} path="/bookings/new" />
                    <Route element={<BookingDetailPage />} path="/bookings/:bookingId" />
                    <Route element={<BookingFormPage edit />} path="/bookings/:bookingId/edit" />
                    <Route element={<NotFoundPage />} path="*" />
                  </Route>
                </Route>
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
