import AppBar from '@mui/material/AppBar';
import Button from '@mui/material/Button';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import { toMonthKey } from '@coinjar/shared-util';
import { NavLink, Outlet, useParams } from 'react-router';
import { messages } from './messages';

export function AppLayout() {
  // The selected month lives in the URL (CLAUDE.md section 7), not in a store.
  // Views without a month (year, categories) fall back to the current one.
  const { month = toMonthKey(new Date()) } = useParams();
  const year = month.slice(0, 4);

  const links = [
    { to: `/month/${month}`, label: messages.nav.dashboard, end: true },
    { to: `/month/${month}/transactions`, label: messages.nav.transactions },
    { to: `/month/${month}/grid`, label: messages.nav.grid },
    { to: `/month/${month}/plan`, label: messages.nav.plan },
    { to: `/year/${year}`, label: messages.nav.year },
    { to: '/categories', label: messages.nav.categories },
  ];

  return (
    <>
      <AppBar position="static">
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap' }}>
          <Typography variant="h6" component="span">
            {messages.appName}
          </Typography>
          <Stack
            component="nav"
            aria-label={messages.navLabel}
            direction="row"
            spacing={1}
            sx={{ flexWrap: 'wrap' }}
          >
            {links.map((link) => (
              <Button
                key={link.to}
                component={NavLink}
                to={link.to}
                end={link.end}
                color="inherit"
                sx={{
                  '&[aria-current="page"]': { textDecoration: 'underline' },
                }}
              >
                {link.label}
              </Button>
            ))}
          </Stack>
        </Toolbar>
      </AppBar>
      <Container component="main" sx={{ py: 3 }}>
        <Outlet />
      </Container>
    </>
  );
}
