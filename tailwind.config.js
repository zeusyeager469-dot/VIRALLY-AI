/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./main.tsx",
    "./App.tsx",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#FF3E00",
        dark: "#050505",
        light: "#E0E0E0",
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};
