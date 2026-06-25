/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f5fa',
          100: '#e1ebf5',
          200: '#c3d7eb',
          300: '#a5c3e1',
          400: '#699cd1',
          500: '#2d75c1',
          600: '#2869ad',
          700: '#003580', // Deep Blue - Primary Brand
          800: '#002a66',
          900: '#001a3d',
        },
        surface: '#f9f9ff',
        borderLight: '#d3daef'
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        'ROUND_FOUR': '4px',
        DEFAULT: '4px',
      }
    },
  },
  plugins: [],
}
