/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          200: '#BFDBFE',
          300: '#93C5FD',
          700: '#1E40AF',
          400: '#60A5FA',
          500: '#2563EB',
          600: '#1D4ED8',
        },
        zinc: {
          800: '#27272A',
          850: '#1F1F23',
          900: '#18181B',
          950: '#09090B',
        },
      },
      fontFamily: {
        display: ['"Syne"', 'sans-serif'],
        body: ['"DM Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
