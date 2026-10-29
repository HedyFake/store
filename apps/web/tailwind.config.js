/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#F9F9F8',
        surface: '#FFFFFF',
        'surface-low': '#F3F4F3',
        'surface-high': '#E8E8E7',
        ink: '#1A1C1C',
        'ink-muted': '#5D5E61',
        border: '#C5C6CA',
        primary: '#06080A',
        'primary-container': '#1E2022',
        accent: '#FECE57',
        'accent-soft': '#FFDF98',
        'accent-ink': '#735700',
        evergreen: '#15221E',
        'evergreen-soft': '#D6E6DF',
        success: '#187F58',
        danger: '#BA1A1A',
        'danger-soft': '#FFDAD6',
      },
      fontFamily: {
        serif: ['var(--font-serif)', 'Newsreader', 'Georgia', ' Cambria', 'Times New Roman', 'serif'],
        sans: [
          'var(--font-sans)',
          'Plus Jakarta Sans',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

