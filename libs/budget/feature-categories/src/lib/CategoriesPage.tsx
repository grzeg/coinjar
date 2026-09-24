import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { messages } from './messages';

export function CategoriesPage() {
  return (
    <Stack spacing={1}>
      <Typography variant="h4" component="h1">
        {messages.title}
      </Typography>
      <Typography color="text.secondary">{messages.comingSoon}</Typography>
    </Stack>
  );
}
