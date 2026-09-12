import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

function futureWorkDay(offset: number): string {
  const date = new Date(Date.now() + 3 * 60 * 60 * 1000);
  date.setUTCDate(date.getUTCDate() + offset);
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').focus();
  await expect(page.getByLabel('Email')).toBeFocused();
  await page.keyboard.type(email);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Пароль')).toBeFocused();
  await page.keyboard.type(password);
  const loginResponse = page.waitForResponse('**/api/v1/auth/login');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Войти' })).toBeFocused();
  await page.keyboard.press('Enter');
  expect((await loginResponse).status()).toBe(201);
  await expect(page.getByRole('heading', { name: /Здравствуйте/ })).toBeVisible();
  await expect(page).toHaveURL('/');
}

async function createBooking(page: Page, subject: string, date: string, start: string, end: string): Promise<void> {
  await page.getByRole('link', { name: 'Мои бронирования' }).click();
  await expect(page.getByRole('heading', { name: 'Мои бронирования' })).toBeVisible();
  await page.getByRole('link', { name: 'Новое бронирование' }).click();
  await expect(page.getByRole('heading', { name: 'Новое бронирование' })).toBeVisible();
  await page.getByRole('combobox', { name: 'Комната' }).click();
  await page.getByRole('option', { name: /Атлас/ }).click();
  await page.getByLabel('Тема').fill(subject);
  await page.getByLabel('Количество участников').fill('2');
  await page.getByLabel('Дата').fill(date);
  await page.getByLabel('Начало').fill(start);
  await page.getByLabel('Окончание').fill(end);
  await page.getByRole('button', { name: 'Создать бронирование' }).click();
  await expect(page.getByRole('heading', { name: subject })).toBeVisible();
}

test('FR-BOOKING-003 smoke: employee signs in and creates a booking', async ({ page }) => {
  await signIn(page, 'employee@northstar.local', 'EmployeePass!2026');
  await createBooking(page, 'Smoke booking create', futureWorkDay(28), '09:00', '10:00');
});

test('FR-EDIT-004 and FR-CANCEL-005 smoke: employee changes and cancels a booking', async ({ page }) => {
  await signIn(page, 'employee@northstar.local', 'EmployeePass!2026');
  await createBooking(page, 'Smoke booking change', futureWorkDay(29), '10:00', '11:00');
  await page.getByRole('link', { name: 'Изменить' }).click();
  await page.getByLabel('Тема').fill('Smoke booking changed');
  await page.getByRole('button', { name: 'Сохранить изменения' }).click();
  await expect(page.getByRole('heading', { name: 'Smoke booking changed' })).toBeVisible();
  await page.getByRole('button', { name: 'Отменить' }).click();
  const dialog = page.getByRole('dialog', { name: 'Отменить встречу?' });
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await dialog.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByText('Статус: Отменено')).toBeVisible();
});

test('FR-ADMIN-ROOM-001 and FR-CANCEL-002 smoke: administrator creates a room and cancels another owner booking', async ({ page }) => {
  const roomName = 'Smoke room';
  const bookingSubject = 'Smoke booking admin cancel';
  await signIn(page, 'admin@northstar.local', 'AdminPass!2026');
  await page.getByRole('link', { name: 'Комнаты' }).click();
  await page.getByRole('link', { name: 'Создать комнату' }).click();
  await page.getByLabel('Название').fill(roomName);
  await page.getByLabel('Этаж').fill('9');
  await page.getByLabel('Расположение').fill('Учебный стенд');
  await page.getByLabel('Вместимость').fill('6');
  await page.getByRole('button', { name: 'Сохранить' }).click();
  await expect(page.getByRole('heading', { name: roomName })).toBeVisible();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await signIn(page, 'employee@northstar.local', 'EmployeePass!2026');
  await createBooking(page, bookingSubject, futureWorkDay(30), '11:00', '12:00');
  await page.getByRole('button', { name: 'Выйти' }).click();
  await signIn(page, 'admin@northstar.local', 'AdminPass!2026');
  await page.getByRole('link', { name: 'Все бронирования' }).click();
  await page.getByRole('button', { name: 'Применить' }).click();
  await page.getByText(bookingSubject).click();
  await page.getByRole('button', { name: 'Отменить' }).click();
  const dialog = page.getByRole('dialog', { name: 'Отменить встречу?' });
  await dialog.getByLabel('Причина отмены').fill('Smoke-проверка администратора');
  await dialog.getByRole('button', { name: 'Подтвердить отмену' }).click();
  await expect(page.getByText(/Причина: Smoke-проверка администратора/)).toBeVisible();
});
