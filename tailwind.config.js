/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        'heart-pop': {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '40%': { transform: 'scale(1.25)', opacity: '1' },
          '70%': { transform: 'scale(0.95)', opacity: '1' },
          '100%': { transform: 'scale(1)', opacity: '0' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        shake: {
          '0%, 100%': { transform: 'translateX(0)' },
          '25%': { transform: 'translateX(-8px)' },
          '75%': { transform: 'translateX(8px)' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 12s linear infinite',
        'heart-pop': 'heart-pop 0.8s ease-out forwards',
        'fade-in': 'fade-in 0.25s ease-out',
        shake: 'shake 0.35s ease-in-out',
      },
    },
  },
  plugins: [],
}
