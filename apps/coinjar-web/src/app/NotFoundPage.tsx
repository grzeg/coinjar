import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link } from 'react-router';
import { messages } from './messages';

export function NotFoundPage() {
  return (
    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
      <Typography variant="h4" component="h1">
        {messages.notFound.title}
      </Typography>
      <Button component={Link} to="/" variant="contained">
        {messages.notFound.backHome}
      </Button>
    </Stack>
  );
}
