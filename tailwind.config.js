/** @type {import('tailwindcss').Config} */

// ZivoHotels theme, taken from the logo: navy (#013A67) for structure and trust, red (#E7194A)
// for actions only (Search, Book, Pay, deal badges). Neutrals are tinted towards the navy.
const red = {
  50: '#fef1f4', 100: '#fde3e9', 200: '#fbc8d4', 300: '#f79bb0', 400: '#f15f82',
  500: '#ea3461', 600: '#e7194a', 700: '#c10f3c', 800: '#a01036', 900: '#861233', 950: '#4b0418',
};
const navy = {
  50: '#eef5fb', 100: '#d9e8f5', 200: '#b5d2ec', 300: '#84b3de', 400: '#4f8dcb',
  500: '#2a6db3', 600: '#1a5595', 700: '#134578', 800: '#013a67', 900: '#062c4d', 950: '#031b31',
};
const neutral = {
  50: '#f7f9fc', 100: '#eef2f7', 200: '#dce3ec', 300: '#c3cdd9', 400: '#8a97a8',
  500: '#5a6b80', 600: '#45556a', 700: '#334257', 800: '#1b2a3d', 900: '#0b1f33', 950: '#06121f',
};

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: red, // actions: buttons, deal badges, the logo's red
        navy,       // structure: headers, sidebars, selected states, links
        // Older screens use Tailwind's blue/indigo/sky and gray/slate: they follow the brand palette
        blue: navy,
        indigo: navy,
        sky: navy,
        gray: neutral,
        slate: neutral,
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        card: '12px',
      },
    },
  },
  plugins: [],
}
