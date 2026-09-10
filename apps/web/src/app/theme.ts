import { createTheme } from '@mui/material/styles';

export const roomlyTheme = createTheme({
  palette: {
    background: {
      default: '#f8fafc',
      paper: '#ffffff',
    },
    primary: {
      main: '#4338ca',
    },
    secondary: {
      main: '#0f766e',
    },
  },
  shape: {
    borderRadius: 12,
  },
  typography: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    h1: {
      fontSize: 'clamp(2rem, 7vw, 4.5rem)',
      fontWeight: 800,
      letterSpacing: '-0.04em',
    },
    h2: {
      fontWeight: 700,
    },
  },
});
