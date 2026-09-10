import { Alert, Button, Chip, CircularProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/api-client';
import type { BookingSummary, BookingView } from '../bookings/booking-types';

interface FilterValues { dateFrom: string; dateTo: string; status: string; }
const views: Array<{ value: BookingView; label: string }> = [{ value: 'upcoming', label: 'Предстоящие' }, { value: 'current', label: 'Идут сейчас' }, { value: 'past', label: 'Прошедшие' }, { value: 'cancelled', label: 'Отменённые' }, { value: 'all', label: 'Все' }];

export function BookingsPage(): React.JSX.Element {
  const form = useForm<FilterValues>({ defaultValues: { dateFrom: '', dateTo: '', status: 'all' } });
  const [view, setView] = useState<BookingView>('upcoming');
  const [applied, setApplied] = useState(new URLSearchParams({ view: 'upcoming', status: 'all' }));
  const [bookings, setBookings] = useState<BookingSummary[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const load = async (params: URLSearchParams) => {
    setLoading(true); setError(undefined);
    try { setBookings(await apiRequest<BookingSummary[]>(`/api/v1/bookings/my?${params.toString()}`)); }
    catch (reason) { setBookings(undefined); setError(reason instanceof ApiError ? reason.message : 'Не удалось загрузить бронирования.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(applied); }, [applied]);
  const change = () => setBookings(undefined);
  const submit = form.handleSubmit((values) => {
    const params = new URLSearchParams({ view, status: values.status });
    if (values.dateFrom) params.set('dateFrom', values.dateFrom);
    if (values.dateTo) params.set('dateTo', values.dateTo);
    setApplied(params);
  });
  const reset = () => { form.reset({ dateFrom: '', dateTo: '', status: 'all' }); setBookings(undefined); setApplied(new URLSearchParams({ view, status: 'all' })); };
  return <Stack spacing={4}>
    <Stack alignItems={{ sm: 'center' }} direction={{ sm: 'row', xs: 'column' }} justifyContent="space-between" spacing={2}><div><Typography component="h1" variant="h2">Мои бронирования</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Просматривайте будущие, текущие и сохранённые в истории встречи.</Typography></div><Button component={Link} to="/bookings/new" variant="contained">Новое бронирование</Button></Stack>
    <Stack direction={{ sm: 'row', xs: 'column' }} spacing={1}>{views.map((item) => <Button key={item.value} onClick={() => { setView(item.value); setBookings(undefined); setApplied(new URLSearchParams({ ...Object.fromEntries(applied), view: item.value })); }} variant={view === item.value ? 'contained' : 'outlined'}>{item.label}</Button>)}</Stack>
    <Paper component="form" onSubmit={submit} sx={{ p: 3 }}><Stack direction={{ md: 'row', xs: 'column' }} spacing={2}><TextField label="С даты" slotProps={{ inputLabel: { shrink: true } }} type="date" {...form.register('dateFrom', { onChange: change })} /><TextField label="По дату" slotProps={{ inputLabel: { shrink: true } }} type="date" {...form.register('dateTo', { onChange: change })} /><TextField label="Статус" select {...form.register('status', { onChange: change })}><MenuItem value="all">Все статусы</MenuItem><MenuItem value="scheduled">Запланировано</MenuItem><MenuItem value="completed">Завершено</MenuItem><MenuItem value="cancelled">Отменено</MenuItem></TextField><Button type="submit" variant="contained">Применить</Button><Button onClick={reset} type="button">Сбросить</Button></Stack></Paper>
    {loading ? <CircularProgress aria-label="Загрузка бронирований" /> : null}{error ? <Alert severity="error">{error}</Alert> : null}
    {bookings?.length === 0 ? <Alert severity="info">В этом представлении нет бронирований.</Alert> : null}
    {bookings?.map((booking) => <Paper component={Link} key={booking.id} sx={{ color: 'inherit', p: 3, textDecoration: 'none' }} to={`/bookings/${encodeURIComponent(booking.id)}`}><Stack alignItems="flex-start" direction="row" justifyContent="space-between" spacing={2}><div><Typography component="h2" variant="h5">{booking.subject}</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>{booking.room.name} · {booking.date} · {booking.start}–{booking.end} · {booking.participants} чел.</Typography></div><Stack direction="row" spacing={1}><Chip label={booking.status === 'cancelled' ? 'Отменено' : booking.status === 'completed' ? 'Завершено' : 'Запланировано'} size="small" />{booking.isCurrent ? <Chip color="primary" label="Идёт сейчас" size="small" /> : null}</Stack></Stack></Paper>)}
  </Stack>;
}
