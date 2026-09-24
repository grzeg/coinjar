import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { routes } from './routes';

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

describe('routes', () => {
  beforeEach(() => {
    // Fake only Date: timers stay real so async rendering works.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 24));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('redirects / to the current month dashboard', async () => {
    const router = renderAt('/');

    expect(
      await screen.findByRole('heading', { name: 'Pulpit' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/month/2026-09');
  });

  it('keeps the month from the URL when navigating', async () => {
    const user = userEvent.setup();
    const router = renderAt('/month/2026-05');

    await user.click(await screen.findByRole('link', { name: 'Transakcje' }));

    expect(
      await screen.findByRole('heading', { name: 'Transakcje' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/month/2026-05/transactions');
    expect(screen.getByRole('link', { name: 'Rok' })).toHaveAttribute(
      'href',
      '/year/2026',
    );
  });

  it('marks the active link', async () => {
    renderAt('/month/2026-09/plan');

    expect(await screen.findByRole('link', { name: 'Plan' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Pulpit' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('shows a not found page for unknown paths', async () => {
    renderAt('/does-not-exist');

    expect(
      await screen.findByRole('heading', { name: 'Nie znaleziono strony' }),
    ).toBeInTheDocument();
  });
});
