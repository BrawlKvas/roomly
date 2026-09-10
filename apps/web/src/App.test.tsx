import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RoomlyApp } from './App';
import { createQueryClient } from './app/query-client';
import { RoomSummaryCard } from './rooms/room-summary-card';
import { SearchPage } from './pages/search-page';
import { Schedule } from './pages/room-page';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  });
}

function LocationProbe(): React.JSX.Element {
  return <output data-testid="location">{useLocation().search}</output>;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('authentication UI', () => {
  it('shows the login form for protected navigation and preserves email after an invalid form submit', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ message: 'Требуется вход' }, 401)));
    window.history.pushState({}, '', '/profile');
    const user = userEvent.setup();

    render(<RoomlyApp queryClient={createQueryClient()} />);

    const email = await screen.findByLabelText('Email');
    await user.type(email, 'bad address');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(email).toHaveValue('bad address');
    expect(screen.getByText('Укажите корректный email.')).toBeInTheDocument();
  });

  it('renders distinct navigation for an authenticated administrator', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          user: { email: 'admin@northstar.local', name: 'Илья', role: 'admin' },
        }),
      ),
    );
    window.history.pushState({}, '', '/');

    render(<RoomlyApp queryClient={createQueryClient()} />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Здравствуйте, Илья' })).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Комнаты' })).toHaveAttribute('href', '/admin/rooms');
      expect(screen.getByRole('link', { name: 'Все бронирования' })).toHaveAttribute('href', '/admin/bookings');
    });
  });

  it('does not expose administration navigation to an employee', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        json({
          expiresAt: new Date(Date.now() + 60_000).toISOString(),
          user: { email: 'employee@northstar.local', name: 'Анна', role: 'employee' },
        }),
      ),
    );
    window.history.pushState({}, '', '/');

    render(<RoomlyApp queryClient={createQueryClient()} />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Здравствуйте, Анна' })).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: 'Комнаты' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Все бронирования' })).not.toBeInTheDocument();
  });

  it('clears the password and takes the user home after login', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).endsWith('/auth/me')) return json({ message: 'Требуется вход' }, 401);
      expect(init?.method).toBe('POST');
      return json({
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        user: { email: 'employee@northstar.local', name: 'Анна', role: 'employee' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/login');
    const user = userEvent.setup();

    render(<RoomlyApp queryClient={createQueryClient()} />);

    await user.type(await screen.findByLabelText('Email'), ' employee@northstar.local ');
    const password = screen.getByLabelText('Пароль');
    await user.type(password, 'EmployeePass!2026');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Здравствуйте, Анна' })).toBeInTheDocument());
    expect(password).not.toBeInTheDocument();
  });
});

describe('rooms UI', () => {
  it('renders unavailable rooms in the catalogue without a booking action', async () => {
    render(<MemoryRouter><RoomSummaryCard room={{ id: 'room-cedar', name: 'Кедр', floor: 5, location: 'C', capacity: 16, description: null, status: 'unavailable', equipment: [], imageUrl: null }} /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Кедр' })).toBeInTheDocument();
    expect(screen.getByText('Недоступна')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Забронировать' })).not.toBeInTheDocument();
  });

  it('shows a foreign schedule entry only as a busy interval', () => {
    render(<Schedule schedule={{ bookingAllowed: true, date: '2026-09-18', entries: [{ startsAt: '12:00', endsAt: '13:00' }] }} />);
    expect(screen.getByText('12:00–13:00')).toBeInTheDocument();
    expect(screen.getByText('Занято')).toBeInTheDocument();
    expect(screen.queryByText('Секретная встреча')).not.toBeInTheDocument();
  });

  it('validates empty search fields, shows an empty search result and resets applied filters', async () => {
    const fetchMock = vi.fn(async () => json([]));
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={['/search']}><SearchPage /><LocationProbe /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Поиск свободной переговорной' });
    await user.click(await screen.findByRole('button', { name: 'Найти' }));
    expect(screen.getByText('Укажите время начала.')).toBeInTheDocument();
    expect(screen.getByText('Укажите время окончания.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Начало'), { target: { value: '10:00' } });
    fireEvent.change(screen.getByLabelText('Окончание'), { target: { value: '11:00' } });
    await user.click(screen.getByRole('button', { name: 'Найти' }));
    await screen.findByText('Нет подходящих свободных комнат.');
    expect(screen.getByTestId('location')).toHaveTextContent('start=10%3A00');
    await user.click(screen.getByRole('button', { name: 'Сбросить' }));
    expect(screen.getByLabelText('Начало')).toHaveValue('');
    expect(screen.getByLabelText('Окончание')).toHaveValue('');
    expect(screen.getByTestId('location')).toHaveTextContent('');
    expect(screen.queryByText('Нет подходящих свободных комнат.')).not.toBeInTheDocument();
  });
});
