import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '@nayanam/core';
import { routeTree } from './routeTree.gen';
import { ToastProvider } from './components/Toast';
import { setRouter } from './lib/router';
import { showToast } from './lib/toast';
import './styles.css';

const router = createRouter({ routeTree });
// Register the router singleton so api.ts onUnauthenticated can navigate
// imperatively without hard-reloading the page.
setRouter(router);

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const queryClient = createQueryClient({
  onError: (error) => {
    // Show a toast for 5xx / network errors. 4xx (incl. 401) are filtered
    // inside createQueryClient so silent token-refresh failures stay quiet.
    const message =
      error instanceof Error
        ? error.message
        : 'A network error occurred. Please try again.';
    showToast(message, { tone: 'negative' });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
