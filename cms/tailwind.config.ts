import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f4ff', 100: '#dde6ff', 200: '#c3d0ff', 300: '#9eb3ff',
          400: '#7088ff', 500: '#4d64ff', 600: '#3344f5', 700: '#2a34e0',
          800: '#242cb5', 900: '#242c8f', 950: '#161855',
        },
      },
    },
  },
  plugins: [],
};

export default config;
