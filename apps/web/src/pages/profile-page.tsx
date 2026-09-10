import { Paper, Stack, Typography } from '@mui/material';

import { useAuth } from '../auth/auth-context';

export function ProfilePage(): React.JSX.Element {
  const { session } = useAuth();
  const user = session!.user;
  return (
    <Stack spacing={3}>
      <Typography component="h1" variant="h2">Профиль</Typography>
      <Paper component="dl" sx={{ display: 'grid', gap: 2, m: 0, p: 3 }}>
        <div><Typography component="dt" fontWeight={700}>Имя</Typography><Typography component="dd" sx={{ m: 0 }}>{user.name}</Typography></div>
        <div><Typography component="dt" fontWeight={700}>Email</Typography><Typography component="dd" sx={{ m: 0 }}>{user.email}</Typography></div>
        <div><Typography component="dt" fontWeight={700}>Роль</Typography><Typography component="dd" sx={{ m: 0 }}>{user.role === 'admin' ? 'Администратор' : 'Сотрудник'}</Typography></div>
      </Paper>
    </Stack>
  );
}
