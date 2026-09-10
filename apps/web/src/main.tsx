import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { RoomlyApp } from './App';
import { createQueryClient } from './app/query-client';

const root = document.querySelector<HTMLDivElement>('#root');

if (!root) {
  throw new Error('Root element was not found');
}

createRoot(root).render(
  <StrictMode>
    <RoomlyApp queryClient={createQueryClient()} />
  </StrictMode>,
);
