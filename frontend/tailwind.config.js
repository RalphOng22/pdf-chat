/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // Ensure Tailwind scans all components and pages
    "./public/index.html",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
