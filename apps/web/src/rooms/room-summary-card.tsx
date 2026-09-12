import { Box, Button, Card, CardActions, CardContent, Chip, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

import { equipmentLabels, type Room } from './room-types';

export function RoomSummaryCard({ room, bookingQuery }: { room: Room; bookingQuery?: string }): React.JSX.Element {
  const detailUrl = `/catalog/${encodeURIComponent(room.id)}`;
  const bookingUrl = `/bookings/new?roomId=${encodeURIComponent(room.id)}${bookingQuery ? `&${bookingQuery}` : ''}`;
  return (
    <Card component="article" data-testid={`room-card-${room.id}`} variant="outlined">
      {room.imageUrl ? (
        <Box alt={`Изображение комнаты ${room.name}`} component="img" onError={(event) => { event.currentTarget.style.display = 'none'; }} src={room.imageUrl} sx={{ bgcolor: 'grey.100', display: 'block', height: 150, objectFit: 'cover', width: '100%' }} />
      ) : (
        <Box aria-label={`Изображение отсутствует: ${room.name}`} role="img" sx={{ alignItems: 'center', bgcolor: 'grey.100', color: 'text.secondary', display: 'flex', height: 150, justifyContent: 'center' }}>
          Изображение отсутствует
        </Box>
      )}
      <CardContent>
        <Stack alignItems="flex-start" direction="row" justifyContent="space-between" spacing={2}>
          <Typography component="h2" variant="h5">{room.name}</Typography>
          <Chip color={room.status === 'available' ? 'success' : 'default'} label={room.status === 'available' ? 'Доступна' : 'Недоступна'} size="small" />
        </Stack>
        <Typography color="text.secondary" sx={{ mt: 1 }}>Этаж {room.floor} · {room.location} · до {room.capacity} человек</Typography>
        <Typography color="text.secondary" sx={{ mt: 1 }}>
          {room.equipment.length > 0 ? room.equipment.map((code) => equipmentLabels[code]).join(', ') : 'Оборудование отсутствует'}
        </Typography>
      </CardContent>
      <CardActions>
        <Button component={Link} to={detailUrl}>Открыть карточку</Button>
        {room.status === 'available' ? <Button component={Link} to={bookingUrl} variant="contained">Забронировать</Button> : null}
      </CardActions>
    </Card>
  );
}
