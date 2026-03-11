/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fde8ea',
          100: '#f7c6cb',
          200: '#f2a0a8',
          300: '#ea707b',
          400: '#dd3d4e',
          500: '#c1121f',
          600: '#a90f1a',
          700: '#910c16',
          800: '#770911',
          900: '#5e060c'
        },
        signal: {
          success: '#7a7a7a',
          warning: '#7a7a7a',
          danger: '#c1121f'
        }
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'sans-serif'],
        display: ['"Space Grotesk"', 'sans-serif']
      },
      boxShadow: {
        panel: '0 16px 36px rgba(0, 0, 0, 0.45)'
      }
    }
  },
  plugins: []
};
