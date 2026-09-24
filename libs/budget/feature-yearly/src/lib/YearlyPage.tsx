import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useParams } from 'react-router';
import { messages } from './messages';

export function YearlyPage() {
  const { year } = useParams();

  return (
    <Stack spacing={1}>
      <Typography variant="h4" component="h1">
        {messages.title}
      </Typography>
      <Typography color="text.secondary">
        {[year, messages.comingSoon].filter(Boolean).join(' · ')}
      </Typography>
    </Stack>
  );
}
