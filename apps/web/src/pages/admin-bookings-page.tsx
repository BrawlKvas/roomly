import { Alert, Button, CircularProgress, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError, apiRequest } from '../api/api-client';
import type { BookingSummary } from '../bookings/booking-types';
import type { Room } from '../rooms/room-types';

interface Owner { id: string; name: string; email: string; role: 'employee' | 'admin'; }

export function AdminBookingsPage(): React.JSX.Element {
  const rooms = useQuery({ queryKey: ['rooms'], queryFn: () => apiRequest<Room[]>('/api/v1/rooms') });
  const owners = useQuery({ queryKey: ['admin', 'owners'], queryFn: () => apiRequest<Owner[]>('/api/v1/bookings/admin/owners') });
  const [items, setItems] = useState<BookingSummary[]>(); const [error, setError] = useState<string>(); const [loading, setLoading] = useState(false);
  const load = async (form: HTMLFormElement) => { setLoading(true); setError(undefined); const params = new URLSearchParams(); new FormData(form).forEach((value, key) => { if (typeof value === 'string' && value) params.set(key, value); }); try { setItems(await apiRequest<BookingSummary[]>(`/api/v1/bookings/admin/all?${params}`)); } catch (reason) { setItems(undefined); setError(reason instanceof ApiError ? reason.fieldErrors.join(' ') || reason.message : 'Не удалось загрузить бронирования.'); } finally { setLoading(false); } };
  const reset = (form: HTMLFormElement) => { form.reset(); setItems(undefined); setError(undefined); };
  return <Stack spacing={4}><div><Typography component="h1" variant="h2">Все бронирования</Typography><Typography color="text.secondary">Доступны полные данные встреч всех владельцев.</Typography></div><Paper component="form" onSubmit={(event) => { event.preventDefault(); void load(event.currentTarget); }} sx={{ p: 3 }}><Stack direction={{ md: 'row', xs: 'column' }} spacing={2}><TextField label="Комната" name="roomId" select><MenuItem value="">Все комнаты</MenuItem>{rooms.data?.map((room) => <MenuItem key={room.id} value={room.id}>{room.name}</MenuItem>)}</TextField><TextField label="Владелец" name="ownerId" select><MenuItem value="">Все владельцы</MenuItem>{owners.data?.map((owner) => <MenuItem key={owner.id} value={owner.id}>{owner.name} — {owner.email}</MenuItem>)}</TextField><TextField label="Статус" name="status" select><MenuItem value="">Все статусы</MenuItem><MenuItem value="scheduled">Запланировано</MenuItem><MenuItem value="completed">Завершено</MenuItem><MenuItem value="cancelled">Отменено</MenuItem></TextField><TextField label="Дата" name="date" slotProps={{ inputLabel: { shrink: true } }} type="date" /><TextField label="С даты" name="dateFrom" slotProps={{ inputLabel: { shrink: true } }} type="date" /><TextField label="По дату" name="dateTo" slotProps={{ inputLabel: { shrink: true } }} type="date" /><Button type="submit" variant="contained">Применить</Button><Button onClick={(event) => reset(event.currentTarget.form!)} type="button">Сбросить</Button></Stack></Paper>{rooms.isPending || owners.isPending || loading ? <CircularProgress /> : null}{error ? <Alert severity="error">{error}</Alert> : null}{items?.length === 0 ? <Alert severity="info">Бронирований не найдено.</Alert> : null}{items?.map((booking) => <Paper component={Link} key={booking.id} sx={{ color: 'inherit', p: 3, textDecoration: 'none' }} to={`/bookings/${booking.id}`}><Typography variant="h5">{booking.subject}</Typography><Typography color="text.secondary">{booking.room.name} · {booking.date} {booking.start}–{booking.end} · {booking.participants} чел.</Typography></Paper>)}</Stack>;
}
