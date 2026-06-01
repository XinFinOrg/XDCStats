/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        success: '#29b348',
        warning: '#f5b225',
        danger: '#ec536c',
        info: '#44a2d2',
        muted: '#a1a7cc',
        orange: '#ffb86c',
        primary: '#242c6d',
        dark: '#2d3b48',
        light: '#eff3f6',
      },
      fontFamily: {
        sans: ['"Source Sans Pro"', 'sans-serif'],
      },
    },
  },
  plugins: [],
  safelist: [
    'text-success',
    'text-warning',
    'text-danger',
    'text-info',
    'text-muted',
    'text-orange',
    'text-primary',
    'text-dark',
    'text-gray-400',
    'bg-success',
    'bg-warning',
    'bg-danger',
    'bg-info',
    'bg-orange',
  ],
};
