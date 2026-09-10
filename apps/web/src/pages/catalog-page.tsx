import { Alert, CircularProgress, Stack, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '../api/api-client';
import { RoomSummaryCard } from '../rooms/room-summary-card';
import type { Room } from '../rooms/room-types';

export function CatalogPage(): React.JSX.Element {
  const catalogue = useQuery({ queryFn: () => apiRequest<Room[]>('/api/v1/rooms'), queryKey: ['rooms'] });
  return (
    <Stack spacing={3}>
      <div><Typography component="h1" variant="h2">Каталог переговорных</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Доступность комнаты не означает, что она свободна в любое время.</Typography></div>
      {catalogue.isPending ? <CircularProgress aria-label="Загрузка каталога" /> : null}
      {catalogue.isError ? <Alert severity="error">Не удалось загрузить каталог. Обновите страницу и попробуйте снова.</Alert> : null}
      {catalogue.data?.length === 0 ? <Alert severity="info">В каталоге пока нет переговорных.</Alert> : null}
      {catalogue.data?.map((room) => <RoomSummaryCard key={room.id} room={room} />)}
    </Stack>
  );
}
