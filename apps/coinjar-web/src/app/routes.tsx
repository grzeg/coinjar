import { CategoriesPage } from '@coinjar/budget-feature-categories';
import { DailyGridPage } from '@coinjar/budget-feature-daily-grid';
import { DashboardPage } from '@coinjar/budget-feature-dashboard';
import { PlanPage } from '@coinjar/budget-feature-plan';
import { TransactionsPage } from '@coinjar/budget-feature-transactions';
import { YearlyPage } from '@coinjar/budget-feature-yearly';
import { toMonthKey } from '@coinjar/shared-util';
import { redirect, type RouteObject } from 'react-router';
import { AppLayout } from './AppLayout';
import { NotFoundPage } from './NotFoundPage';

// Exported separately from the router instance so tests can mount the same
// route tree in a memory router.
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        // A loader redirect runs before rendering, so there is no flash of an
        // empty page (unlike rendering <Navigate /> in a component).
        loader: () => redirect(`/month/${toMonthKey(new Date())}`),
      },
      {
        path: 'month/:month',
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'grid', element: <DailyGridPage /> },
          { path: 'plan', element: <PlanPage /> },
        ],
      },
      { path: 'year/:year', element: <YearlyPage /> },
      { path: 'categories', element: <CategoriesPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
