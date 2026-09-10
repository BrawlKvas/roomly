import { Button, Stack, Typography } from '@mui/material';
import { Link } from 'react-router-dom';

export function NotFoundPage(): React.JSX.Element {
  return (
    <Stack alignItems="flex-start" spacing={3}>
      <Typography component="p" color="primary" fontWeight={700}>
        Ошибка 404
      </Typography>
      <Typography component="h1" variant="h2">
        Страница не найдена
      </Typography>
      <Typography color="text.secondary">
        Проверьте адрес или вернитесь на главную страницу Roomly.
      </Typography>
      <Button component={Link} to="/" variant="contained">
        На главную
      </Button>
    </Stack>
  );
}
