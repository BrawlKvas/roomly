import { Alert, Button, Stack, Typography } from '@mui/material';
import { Component, type ErrorInfo, type PropsWithChildren } from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  PropsWithChildren,
  ErrorBoundaryState
> {
  override state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Roomly UI error', error, errorInfo);
  }

  override render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <Stack alignItems="flex-start" spacing={3} sx={{ p: 4 }}>
          <Typography component="h1" variant="h4">
            Не удалось показать страницу
          </Typography>
          <Alert severity="error">
            Обновите страницу. Если ошибка повторится, сообщите администратору.
          </Alert>
          <Button onClick={() => window.location.reload()} variant="contained">
            Обновить
          </Button>
        </Stack>
      );
    }

    return this.props.children;
  }
}
