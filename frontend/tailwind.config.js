/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // 60% Midnight Black Palette (ADR-001)
        midnight: {
          DEFAULT: '#090A10',
          card: '#121420',
          elevated: '#171A29',
          border: '#1E2235',
          muted: '#9BA3B8',
          text: '#F3F5FA',
        },
        // 30% Electric Blue Palette (ADR-001)
        electric: {
          DEFAULT: '#2F6BFF',
          hover: '#2457DB',
          light: '#5A8BFF',
        },
        // 10% Sunset Orange Palette (ADR-001)
        sunset: {
          DEFAULT: '#FF7A1A',
          hover: '#E6680C',
          light: '#FF984D',
        },
      },
      fontFamily: {
        sans: [
          '"Sarabun"',
          '"IBM Plex Sans Thai"',
          '"Noto Sans Thai"',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
