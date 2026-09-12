import { Alert, Button, CircularProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/api-client';
import type { BookingDetail } from '../bookings/booking-types';
import { errorMessage, isUnknownResult } from '../bookings/booking-utils';
import { officeToday, type Room } from '../rooms/room-types';

interface FormValues { roomId: string; subject: string; description: string; participants: string; date: string; start: string; end: string; }

function serverMessage(error: unknown): string {
  if (error instanceof ApiError && error.fieldErrors.length) return error.fieldErrors.map((item) => item.replace(/^\w+: /, '')).join(' ');
  return errorMessage(error);
}

export function BookingFormPage({ edit = false }: { edit?: boolean }): React.JSX.Element {
  const { bookingId = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => apiRequest<Room[]>('/api/v1/rooms') });
  const existing = useQuery({ enabled: edit && Boolean(bookingId), queryKey: ['bookings', bookingId], queryFn: () => apiRequest<BookingDetail>(`/api/v1/bookings/${encodeURIComponent(bookingId)}`) });
  const form = useForm<FormValues>({ defaultValues: { roomId: params.get('roomId') ?? '', subject: '', description: '', participants: '', date: params.get('date') ?? officeToday(), start: params.get('start') ?? '', end: params.get('end') ?? '' } });
  const errorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (edit && existing.data && !form.formState.isDirty) {
      const booking = existing.data;
      form.reset({ roomId: booking.room.id, subject: booking.subject, description: booking.description ?? '', participants: String(booking.participants), date: booking.date, start: booking.start, end: booking.end });
    }
  }, [edit, existing.data, form, form.formState.isDirty]);

  useEffect(() => {
    if (form.formState.errors.root) errorRef.current?.focus();
  }, [form.formState.errors.root]);

  if (rooms.isPending || (edit && existing.isPending)) return <CircularProgress aria-label="Загрузка формы бронирования" />;
  if (rooms.isError || (edit && existing.isError)) return <Alert severity="error">Не удалось загрузить данные бронирования.</Alert>;

  const submit = form.handleSubmit(async (values) => {
    form.clearErrors('root');
    const payload = { ...values, participants: Number(values.participants), ...(edit ? { version: existing.data!.version } : {}) };
    try {
      // A fresh room read makes stale search/card data visible before the command is sent.
      await apiRequest<Room>(`/api/v1/rooms/${encodeURIComponent(values.roomId)}`);
      const result = await apiRequest<BookingDetail>(edit ? `/api/v1/bookings/${encodeURIComponent(bookingId)}` : '/api/v1/bookings', { body: JSON.stringify(payload), headers: { 'content-type': 'application/json' }, method: edit ? 'PATCH' : 'POST' });
      await queryClient.invalidateQueries({ queryKey: ['bookings'] });
      await queryClient.invalidateQueries({ queryKey: ['rooms'] });
      navigate(`/bookings/${encodeURIComponent(result.id)}`, { state: { message: edit ? 'Изменения сохранены.' : 'Бронирование создано.' } });
    } catch (error) {
      form.setError('root', { message: isUnknownResult(error) ? 'Результат операции неизвестен. Обновите список или детали перед повтором.' : serverMessage(error) });
    }
  });
  const dirtyLeave = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (form.formState.isDirty && !window.confirm('Уйти без сохранения введённых изменений?')) event.preventDefault();
  };
  const register = form.register;
  return <Stack spacing={4}>
    <div><Typography component="h1" variant="h2">{edit ? 'Изменение бронирования' : 'Новое бронирование'}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Время указывается по Москве. Комната и интервал повторно проверяются при сохранении.</Typography></div>
    <Paper component="form" noValidate onSubmit={submit} sx={{ maxWidth: 760, p: 3 }}>
      <Stack spacing={2}>
        {form.formState.errors.root ? <Alert ref={errorRef} severity="error" tabIndex={-1}>{form.formState.errors.root.message}</Alert> : null}
        <TextField label="Комната" select {...register('roomId', { required: 'Выберите комнату.' })} error={Boolean(form.formState.errors.roomId)} helperText={form.formState.errors.roomId?.message}>
          <MenuItem value="">Выберите комнату</MenuItem>{rooms.data!.filter((room) => room.status === 'available' || room.id === form.getValues('roomId')).map((room) => <MenuItem key={room.id} value={room.id}>{room.name} — до {room.capacity} человек{room.status === 'unavailable' ? ' (недоступна)' : ''}</MenuItem>)}
        </TextField>
        <TextField label="Тема" {...register('subject', { required: 'Укажите тему.' })} error={Boolean(form.formState.errors.subject)} helperText={form.formState.errors.subject?.message} />
        <TextField label="Описание" minRows={3} multiline {...register('description')} />
        <TextField label="Количество участников" type="number" {...register('participants', { required: 'Укажите количество участников.' })} error={Boolean(form.formState.errors.participants)} helperText={form.formState.errors.participants?.message} />
        <Stack direction={{ sm: 'row', xs: 'column' }} spacing={2}><TextField label="Дата" slotProps={{ inputLabel: { shrink: true } }} type="date" {...register('date', { required: 'Укажите дату.' })} /><TextField label="Начало" type="time" {...register('start', { required: 'Укажите время начала.' })} /><TextField label="Окончание" type="time" {...register('end', { required: 'Укажите время окончания.' })} /></Stack>
        <Stack direction="row" spacing={2}><Button disabled={form.formState.isSubmitting} type="submit" variant="contained">{edit ? 'Сохранить изменения' : 'Создать бронирование'}</Button><Button component={Link} onClick={dirtyLeave} to={edit ? `/bookings/${bookingId}` : '/bookings'}>Отмена</Button></Stack>
      </Stack>
    </Paper>
  </Stack>;
}
