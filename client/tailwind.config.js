/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#090A0D',
        dock: '#0E1014',
        card: {
          base: '#121418',
          elevated: '#181B22',
          subtle: '#15171D',
        },
        border: {
          default: '#1E222B',
          subtle: '#181B22',
          focus: '#10B981',
        },
        accent: {
          emerald: '#10B981',
          mint: '#05DF72',
          tangerine: '#EA580C',
          amber: '#F59E0B',
          coral: '#EF4444',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      }
    },
  },
  plugins: [],
}
