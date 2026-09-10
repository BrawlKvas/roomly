import { AppBar, Box, Button, Container, Stack, Toolbar, Typography } from '@mui/material';
import { Link, Outlet } from 'react-router-dom';

import { useAuth } from '../auth/auth-context';

export function AppLayout(): React.JSX.Element {
  const { session, signOut } = useAuth();
  const user = session!.user;
  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar
        color="transparent"
        elevation={0}
        position="static"
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Container maxWidth="lg">
          <Toolbar disableGutters>
            <Typography
              color="primary"
              component={Link}
              sx={{ fontSize: '1.25rem', fontWeight: 800, textDecoration: 'none' }}
              to="/"
            >
              Roomly
            </Typography>
            <Stack direction="row" spacing={1} sx={{ ml: 'auto' }}>
              <Button component={Link} to="/catalog">Каталог</Button>
              <Button component={Link} to="/search">Поиск</Button>
              <Button component={Link} to="/bookings">Мои бронирования</Button>
              {user.role === 'admin' ? <Button component={Link} to="/admin/rooms">Комнаты</Button> : null}
              {user.role === 'admin' ? <Button component={Link} to="/admin/bookings">Все бронирования</Button> : null}
              <Button component={Link} to="/profile">Профиль</Button>
              <Button onClick={() => void signOut()}>Выйти</Button>
            </Stack>
          </Toolbar>
        </Container>
      </AppBar>
      <Container component="main" maxWidth="lg" sx={{ py: { xs: 6, md: 10 } }}>
        <Outlet />
      </Container>
    </Box>
  );
}
