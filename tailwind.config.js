/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563eb',
        pnp: '#1e40af',
        bfp: '#dc2626',
        pdrrmo: '#0891b2',
      },
    },
  },
  plugins: [],
};
