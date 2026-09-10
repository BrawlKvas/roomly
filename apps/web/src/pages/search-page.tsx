import { Alert, Button, Checkbox, CircularProgress, FormControlLabel, FormGroup, Paper, Stack, TextField, Typography } from '@mui/material';
import { useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';

import { ApiError, apiRequest } from '../api/api-client';
import { RoomSummaryCard } from '../rooms/room-summary-card';
import { equipmentLabels, officeToday, type EquipmentCode, type Room } from '../rooms/room-types';

interface SearchValues {
  date: string;
  start: string;
  end: string;
  minimumCapacity: string;
  floor: string;
  equipment: EquipmentCode[];
}

const equipmentCodes = Object.keys(equipmentLabels) as EquipmentCode[];
const searchSchema = z.object({
  date: z.string().min(1),
  end: z.string().min(1),
  equipment: z.array(z.enum(['tv', 'projector', 'whiteboard', 'video_conferencing'])),
  floor: z.string(),
  minimumCapacity: z.string(),
  start: z.string().min(1),
});

const resolver: Resolver<SearchValues> = async (values) => {
  const errors: FieldErrors<SearchValues> = {};
  const parsed = searchSchema.safeParse(values);
  if (!parsed.success || !values.date) errors.date = { message: 'Укажите дату.', type: 'required' };
  if (!parsed.success || !values.start) errors.start = { message: 'Укажите время начала.', type: 'required' };
  if (!parsed.success || !values.end) errors.end = { message: 'Укажите время окончания.', type: 'required' };
  if (values.minimumCapacity && !/^\d+$/.test(values.minimumCapacity)) errors.minimumCapacity = { message: 'Укажите целое число.', type: 'validate' };
  if (values.floor && !/^\d+$/.test(values.floor)) errors.floor = { message: 'Укажите целое число.', type: 'validate' };
  return Object.keys(errors).length > 0 || !parsed.success ? { errors, values: {} } : { errors: {}, values: parsed.data };
};

function defaults(): SearchValues {
  return { date: officeToday(), end: '', equipment: [], floor: '', minimumCapacity: '', start: '' };
}

export function SearchPage(): React.JSX.Element {
  const [, setSearchParams] = useSearchParams();
  const form = useForm<SearchValues>({ defaultValues: defaults(), resolver });
  const [results, setResults] = useState<Room[] | undefined>();
  const hideResults = () => setResults(undefined);

  const submit = form.handleSubmit(async (values) => {
    const params = toParams(values);
    try {
      const found = await apiRequest<Room[]>(`/api/v1/rooms/search?${params.toString()}`);
      setResults(found);
      setSearchParams(params);
      form.clearErrors('root');
    } catch (error) {
      setResults(undefined);
      if (error instanceof ApiError) applyServerErrors(form, error);
      else form.setError('root', { message: 'Не удалось выполнить поиск. Повторите попытку.', type: 'server' });
    }
  });

  const reset = () => {
    form.reset(defaults());
    form.clearErrors();
    setResults(undefined);
    setSearchParams({});
  };
  const values = form.watch();
  const bookingQuery = new URLSearchParams({ date: values.date, end: values.end, start: values.start }).toString();

  return (
    <Stack spacing={4}>
      <div><Typography component="h1" variant="h2">Поиск свободной переговорной</Typography><Typography color="text.secondary" sx={{ mt: 1 }}>Выберите дату и интервал в московском времени. Поиск не бронирует комнату.</Typography></div>
      <Paper component="form" noValidate onSubmit={submit} sx={{ p: 3 }}>
        <Stack spacing={2}>
          {form.formState.errors.root ? <Alert severity="error">{form.formState.errors.root.message}</Alert> : null}
          <Stack direction={{ sm: 'row', xs: 'column' }} spacing={2}>
            <TextField error={Boolean(form.formState.errors.date)} helperText={form.formState.errors.date?.message} label="Дата" onChange={(event) => { hideResults(); form.setValue('date', event.target.value); }} slotProps={{ inputLabel: { shrink: true } }} type="date" value={values.date} />
            <TextField error={Boolean(form.formState.errors.start)} helperText={form.formState.errors.start?.message} label="Начало" onChange={(event) => { hideResults(); form.setValue('start', event.target.value); }} slotProps={{ inputLabel: { shrink: true } }} type="time" value={values.start} />
            <TextField error={Boolean(form.formState.errors.end)} helperText={form.formState.errors.end?.message} label="Окончание" onChange={(event) => { hideResults(); form.setValue('end', event.target.value); }} slotProps={{ inputLabel: { shrink: true } }} type="time" value={values.end} />
          </Stack>
          <Stack direction={{ sm: 'row', xs: 'column' }} spacing={2}>
            <TextField error={Boolean(form.formState.errors.minimumCapacity)} helperText={form.formState.errors.minimumCapacity?.message} label="Минимальная вместимость" onChange={(event) => { hideResults(); form.setValue('minimumCapacity', event.target.value); }} type="number" value={values.minimumCapacity} />
            <TextField error={Boolean(form.formState.errors.floor)} helperText={form.formState.errors.floor?.message} label="Этаж" onChange={(event) => { hideResults(); form.setValue('floor', event.target.value); }} type="number" value={values.floor} />
          </Stack>
          <FormGroup row>{equipmentCodes.map((code) => <FormControlLabel control={<Checkbox checked={values.equipment.includes(code)} onChange={(_event, checked) => { hideResults(); form.setValue('equipment', checked ? [...values.equipment, code] : values.equipment.filter((item) => item !== code)); }} />} key={code} label={equipmentLabels[code]} />)}</FormGroup>
          <Stack direction="row" spacing={2}><Button disabled={form.formState.isSubmitting} type="submit" variant="contained">Найти</Button><Button onClick={reset} type="button">Сбросить</Button></Stack>
        </Stack>
      </Paper>
      {form.formState.isSubmitting ? <CircularProgress aria-label="Поиск комнат" /> : null}
      {results?.length === 0 ? <Alert severity="info">Нет подходящих свободных комнат.</Alert> : null}
      {results?.map((room) => <RoomSummaryCard bookingQuery={bookingQuery} key={room.id} room={room} />)}
    </Stack>
  );
}

function toParams(values: SearchValues): URLSearchParams {
  const params = new URLSearchParams({ date: values.date, end: values.end, start: values.start });
  if (values.minimumCapacity) params.set('minimumCapacity', values.minimumCapacity);
  if (values.floor) params.set('floor', values.floor);
  values.equipment.forEach((code) => params.append('equipment', code));
  return params;
}

function applyServerErrors(form: ReturnType<typeof useForm<SearchValues>>, error: ApiError): void {
  const fieldNames = new Set<keyof SearchValues>(['date', 'start', 'end', 'minimumCapacity', 'floor', 'equipment']);
  let assigned = false;
  for (const item of error.fieldErrors) {
    const [field, message] = item.split(': ', 2);
    if (field && message && fieldNames.has(field as keyof SearchValues)) {
      form.setError(field as keyof SearchValues, { message, type: 'server' });
      assigned = true;
    }
  }
  if (!assigned) form.setError('root', { message: error.message, type: 'server' });
}
