/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        brand: {
          DEFAULT: '#159447',
          50: '#F4FBF7',
          100: '#EAF7EF',
          200: '#CBECD8',
          300: '#9DDBB6',
          400: '#5EC287',
          500: '#159447',
          600: '#0F7F3C',
          700: '#087443',
          800: '#075C34',
          900: '#054726',
        },
        surface: {
          bg: '#F8FAF9',
          card: '#FFFFFF',
          hover: '#F1F5F3',
          border: '#E5EAE7',
          divider: '#EEF2EF',
        },
        ink: {
          DEFAULT: '#122019',
          muted: '#66736C',
          faint: '#8A9690',
        },
        // Dark tokens
        dark: {
          bg: '#0F1512',
          panel: '#131A16',
          card: '#151D19',
          hover: '#1B241F',
          border: '#232C27',
          divider: '#1E2621',
          text: '#F2F7F4',
          muted: '#9AA8A0',
          faint: '#6C7C74',
        },
        state: {
          danger: '#B23B3B',
          'danger-soft': '#FDECEC',
          warning: '#B8791F',
          'warning-soft': '#FDF3E1',
        },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(18, 32, 25, 0.04)',
        pop: '0 12px 40px -12px rgba(18, 32, 25, 0.18), 0 4px 12px -4px rgba(18, 32, 25, 0.08)',
        toast: '0 8px 24px -8px rgba(18, 32, 25, 0.24)',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-500px 0' },
          '100%': { backgroundPosition: '500px 0' },
        },
      },
      animation: {
        'fade-in': 'fade-in 120ms ease-out',
        'slide-up': 'slide-up 160ms cubic-bezier(0.22, 1, 0.36, 1)',
        'scale-in': 'scale-in 140ms cubic-bezier(0.22, 1, 0.36, 1)',
        shimmer: 'shimmer 1.4s infinite linear',
      },
    },
  },
  plugins: [],
};
