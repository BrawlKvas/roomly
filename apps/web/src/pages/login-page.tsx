import { Alert, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import type { LoginRequest, SessionResponse } from '@roomly/api-client';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { ApiError, apiRequest } from '../api/api-client';
import { useAuth } from '../auth/auth-context';
import { isValidLoginEmail, normalizeLoginEmail } from '../auth/email';

const loginSchema = z.object({ email: z.string(), password: z.string() });

const loginResolver: Resolver<LoginRequest> = async (values) => {
  const normalizedValues = { ...values, email: normalizeLoginEmail(values.email) };
  const parsed = loginSchema.safeParse(normalizedValues);
  const errors: FieldErrors<LoginRequest> = {};
  if (!parsed.success || !isValidLoginEmail(normalizedValues.email)) {
    errors.email = { message: 'Укажите корректный email.', type: 'validate' };
  }
  if (values.password.length === 0) {
    errors.password = { message: 'Введите пароль.', type: 'required' };
  }
  if (Object.keys(errors).length > 0 || !parsed.success) return { errors, values: {} };
  return { errors: {}, values: parsed.data };
};

export function LoginPage(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn } = useAuth();
  const form = useForm<LoginRequest>({
    defaultValues: { email: '', password: '' },
    resolver: loginResolver,
  });
  const expired = (location.state as { reason?: string } | null)?.reason === 'expired';

  const submit = form.handleSubmit(async (values) => {
    const email = normalizeLoginEmail(values.email);
    form.setValue('email', email);
    try {
      const session = await apiRequest<SessionResponse>('/api/v1/auth/login', {
        body: JSON.stringify({ email, password: values.password }),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
      });
      form.reset({ email, password: '' });
      signIn(session);
      navigate('/', { replace: true });
    } catch (error) {
      form.setValue('password', '');
      form.setError('root', {
        message:
          error instanceof ApiError && error.status === 401
            ? 'Неверные учётные данные.'
            : 'Не удалось выполнить вход. Повторите попытку.',
        type: 'server',
      });
    }
  });

  return (
    <Paper component="section" elevation={1} sx={{ margin: 'auto', maxWidth: 460, p: 4 }}>
      <Stack component="form" noValidate onSubmit={submit} spacing={3}>
        <div>
          <Typography component="h1" variant="h4">Вход в Roomly</Typography>
          <Typography color="text.secondary" sx={{ mt: 1 }}>Используйте учётную запись Northstar Labs.</Typography>
        </div>
        {expired ? <Alert severity="info">Срок входа истёк. Войдите снова.</Alert> : null}
        {form.formState.errors.root ? <Alert severity="error">{form.formState.errors.root.message}</Alert> : null}
        <TextField autoComplete="email" error={Boolean(form.formState.errors.email)} helperText={form.formState.errors.email?.message} id="email" label="Email" {...form.register('email')} />
        <TextField autoComplete="current-password" error={Boolean(form.formState.errors.password)} helperText={form.formState.errors.password?.message} id="password" label="Пароль" type="password" {...form.register('password')} />
        <Button disabled={form.formState.isSubmitting} type="submit" variant="contained">Войти</Button>
      </Stack>
    </Paper>
  );
}
