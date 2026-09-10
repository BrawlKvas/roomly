import { Alert, Box, Button, CircularProgress, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/api-client';
import { equipmentLabels, officeToday, type Room, type RoomSchedule } from '../rooms/room-types';

export function RoomPage(): React.JSX.Element {
  const { roomId = '' } = useParams();
  const [date, setDate] = useState(officeToday);
  const [appliedDate, setAppliedDate] = useState(officeToday);
  const room = useQuery({ queryFn: () => apiRequest<Room>(`/api/v1/rooms/${encodeURIComponent(roomId)}`), queryKey: ['rooms', roomId] });
  const schedule = useQuery({ enabled: Boolean(roomId && appliedDate), queryFn: () => apiRequest<RoomSchedule>(`/api/v1/rooms/${encodeURIComponent(roomId)}/schedule?date=${encodeURIComponent(appliedDate)}`), queryKey: ['rooms', roomId, 'schedule', appliedDate] });
  const bookingUrl = `/bookings/new?roomId=${encodeURIComponent(roomId)}`;

  if (room.isPending) return <CircularProgress aria-label="Загрузка комнаты" />;
  if (room.isError) return <Alert severity="error">{room.error instanceof ApiError && room.error.status === 404 ? 'Комната не найдена.' : 'Не удалось загрузить комнату.'}</Alert>;
  const value = room.data!;
  return (
    <Stack spacing={4}>
      <div><Typography component="h1" variant="h2">{value.name}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Этаж {value.floor} · {value.location} · до {value.capacity} человек</Typography></div>
      {value.imageUrl ? <Box alt={`Изображение комнаты ${value.name}`} component="img" src={value.imageUrl} sx={{ borderRadius: 2, maxHeight: 360, maxWidth: '100%' }} /> : <Paper aria-label="Изображение комнаты отсутствует" role="img" sx={{ color: 'text.secondary', p: 6, textAlign: 'center' }}>Изображение отсутствует</Paper>}
      <Paper sx={{ p: 3 }}><Typography component="h2" variant="h5">Характеристики</Typography><Typography sx={{ mt: 2 }}>{value.description ?? 'Описание отсутствует'}</Typography><Typography sx={{ mt: 2 }}>{value.equipment.length > 0 ? value.equipment.map((code) => equipmentLabels[code]).join(', ') : 'Оборудование отсутствует'}</Typography>{value.status === 'available' ? <Button component={Link} sx={{ mt: 3 }} to={bookingUrl} variant="contained">Забронировать комнату</Button> : <Alert severity="warning" sx={{ mt: 3 }}>Комната недоступна для новых бронирований.</Alert>}</Paper>
      <Paper component="section" sx={{ p: 3 }}>
        <Stack alignItems="end" component="form" direction="row" onSubmit={(event) => { event.preventDefault(); setAppliedDate(date); }} spacing={2}>
          <TextField id="schedule-date" label="Дата расписания" onChange={(event) => setDate(event.target.value)} slotProps={{ inputLabel: { shrink: true } }} type="date" value={date} />
          <Button type="submit" variant="outlined">Показать</Button>
        </Stack>
        {schedule.isPending ? <CircularProgress aria-label="Загрузка расписания" sx={{ mt: 3 }} /> : null}
        {schedule.isError ? <Alert severity="error" sx={{ mt: 3 }}>{schedule.error instanceof ApiError ? schedule.error.message : 'Не удалось загрузить расписание.'}</Alert> : null}
        {schedule.data ? <Schedule schedule={schedule.data} /> : null}
      </Paper>
    </Stack>
  );
}

export function Schedule({ schedule }: { schedule: RoomSchedule }): React.JSX.Element {
  return <Stack spacing={2} sx={{ mt: 3 }}><Typography component="h2" variant="h5">Расписание на {schedule.date}, 08:00–20:00</Typography>{!schedule.bookingAllowed ? <Alert severity="info">В выходные бронирование запрещено.</Alert> : null}{schedule.entries.length === 0 ? <Typography color="text.secondary">Занятых интервалов нет.</Typography> : schedule.entries.map((entry, index) => <Box key={entry.id ?? `${entry.startsAt}-${entry.endsAt}-${index}`}><Typography fontWeight={700}>{entry.startsAt}–{entry.endsAt}</Typography>{entry.subject ? <><Typography>{entry.subject}</Typography><Typography color="text.secondary">{entry.status === 'completed' ? 'Завершена' : 'Запланирована'}</Typography>{entry.id ? <Button component={Link} size="small" to={`/bookings/${encodeURIComponent(entry.id)}`}>Открыть встречу</Button> : null}</> : <Typography color="text.secondary">Занято</Typography>}<Divider sx={{ mt: 2 }} /></Box>)}</Stack>;
}
