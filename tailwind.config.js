/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-solid': 'var(--bg-solid)',
        surface: 'var(--surface)',
        'surface-hover': 'var(--surface-hover)',
        border: 'var(--border)',
        fg: 'var(--fg)',
        'fg-muted': 'var(--fg-muted)',
        'fg-faint': 'var(--fg-faint)',
        brand: 'var(--brand)',
        'brand-hover': 'var(--brand-hover)',
        ring: 'var(--ring)',
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        thinking: 'var(--thinking)'
      },
      borderRadius: {
        DEFAULT: 'var(--radius)',
        sm: 'var(--radius-sm)'
      },
      spacing: {
        gap: 'var(--gap)',
        pad: 'var(--pad)'
      },
      transitionTimingFunction: {
        app: 'var(--ease)'
      },
      transitionDuration: {
        fast: 'var(--dur-fast)',
        normal: 'var(--dur)',
        slow: 'var(--dur-slow)'
      },
      boxShadow: {
        app: 'var(--shadow)',
        glow: 'var(--glow-think)'
      }
    }
  },
  plugins: []
}
