import { Alert, Box, Button, Paper, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '../auth/auth-context';
import { apiRequest } from '../api/api-client';
import type { BookingSummary } from '../bookings/booking-types';

export function HomePage(): React.JSX.Element {
  const { session } = useAuth();
  const upcoming = useQuery({ queryKey: ['bookings', 'upcoming'], queryFn: () => apiRequest<BookingSummary[]>('/api/v1/bookings/upcoming') });
  const bookings = Array.isArray(upcoming.data) ? upcoming.data : [];

  return (
    <Stack spacing={5}>
      <Box>
        <Typography component="p" color="primary" fontWeight={700}>Northstar Labs</Typography>
        <Typography component="h1" sx={{ mt: 2 }} variant="h2">
          Здравствуйте, {session!.user.name}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 680, mt: 3 }} variant="h5">
          Найдите свободную переговорную и забронируйте удобное время в офисе.
        </Typography>
      </Box>

      <Paper component="section" sx={{ p: 3 }}>
        <Typography component="h2" variant="h5">Ближайшие встречи</Typography>
        {upcoming.isError ? <Alert severity="error" sx={{ mt: 2 }}>Не удалось загрузить ближайшие встречи.</Alert> : null}
        {upcoming.isSuccess && bookings.length === 0 ? <><Typography color="text.secondary" sx={{ mt: 1 }}>Ближайших активных встреч нет.</Typography><Button component={Link} sx={{ mt: 2 }} to="/search" variant="outlined">Найти переговорную</Button></> : null}
        <Stack spacing={1} sx={{ mt: 2 }}>{bookings.map((booking) => <Button component={Link} key={booking.id} sx={{ justifyContent: 'flex-start' }} to={`/bookings/${booking.id}`}>{booking.subject} — {booking.room.name}, {booking.date} {booking.start}–{booking.end}{booking.isCurrent ? ' · идёт сейчас' : ''}</Button>)}</Stack>
      </Paper>
    </Stack>
  );
}
