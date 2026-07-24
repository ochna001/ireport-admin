/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: [
    './src/renderer/**/*.{js,ts,jsx,tsx,html}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand primary (kept for backwards-compat with any direct references)
        primary: '#2563eb',

        // Agency identity colors — identity, NOT state.
        // Use these only to brand an agency, never to signal health/status.
        agency: {
          pnp: '#1d4ed8',   // blue-700
          bfp: '#dc2626',   // red-600
          mdrrmo: '#0891b2', // cyan-600
        },

        // Semantic surface/foreground/border tokens mapped to CSS variables in
        // globals.css. Each resolves light/dark automatically via the `.dark`
        // class on <html>. Reference as e.g. bg-surface, text-fg-muted,
        // border-border-default.
        surface: {
          DEFAULT: 'var(--surface)',
          subtle: 'var(--surface-subtle)',
          raised: 'var(--surface-raised)',
        },
        fg: {
          strong: 'var(--fg-strong)',
          DEFAULT: 'var(--fg-default)',
          muted: 'var(--fg-muted)',
          subtle: 'var(--fg-subtle)',
        },
        'border-token': {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          strong: 'var(--border-strong)',
        },
        state: {
          info: 'var(--state-info)',
          success: 'var(--state-success)',
          warning: 'var(--state-warning)',
          danger: 'var(--state-danger)',
          critical: 'var(--state-critical)',
        },
      },
    },
  },
  plugins: [],
};
