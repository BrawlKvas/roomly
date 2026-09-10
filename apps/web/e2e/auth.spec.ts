import { expect, test, type Page } from '@playwright/test';

const session = {
  expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  user: {
    email: 'employee@northstar.local',
    name: 'Анна Соколова',
    role: 'employee',
  },
};

async function mockAuthenticatedSession(page: Page): Promise<void> {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ contentType: 'application/json', json: session }),
  );
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 204 }));
}

test('FR-AUTH-006: logout hides protected content in both open tabs', async ({ context }) => {
  const first = await context.newPage();
  const second = await context.newPage();
  await Promise.all([mockAuthenticatedSession(first), mockAuthenticatedSession(second)]);

  await Promise.all([first.goto('/'), second.goto('/')]);
  await expect(first.getByRole('heading', { name: 'Здравствуйте, Анна Соколова' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Здравствуйте, Анна Соколова' })).toBeVisible();

  await first.getByRole('button', { name: 'Выйти' }).click();

  await expect(first.getByRole('heading', { name: 'Вход в Roomly' })).toBeVisible();
  await expect(second.getByRole('heading', { name: 'Вход в Roomly' })).toBeVisible();
});
