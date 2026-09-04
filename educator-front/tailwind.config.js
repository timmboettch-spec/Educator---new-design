/** @type {import('tailwindcss').Config} */
export default {
  darkMode: false,
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      spacing: {
        'auth-y': '60px',
        'auth-x': '48px',
        'auth-mobile-x': '16px',
        'form-gap': '24px',
        15: '60px',
      },
      colors: {
        primary: {
          50: 'rgba(var(--color-primary-50-rgb), <alpha-value>)',
          100: 'rgba(var(--color-primary-100-rgb), <alpha-value>)',
          200: 'rgba(var(--color-primary-200-rgb), <alpha-value>)',
          300: 'rgba(var(--color-primary-300-rgb), <alpha-value>)',
          400: 'rgba(var(--color-primary-400-rgb), <alpha-value>)',
          500: 'rgba(var(--color-primary-500-rgb), <alpha-value>)',
          600: 'rgba(var(--color-primary-600-rgb), <alpha-value>)',
          700: 'rgba(var(--color-primary-700-rgb), <alpha-value>)',
          800: 'rgba(var(--color-primary-800-rgb), <alpha-value>)',
          900: 'rgba(var(--color-primary-900-rgb), <alpha-value>)',
          DEFAULT: 'rgba(var(--color-primary-500-rgb), <alpha-value>)',
        },
        neutral: {
          50: 'rgba(249, 250, 251, <alpha-value>)',
          100: 'rgba(245, 245, 245, <alpha-value>)',
          200: 'rgba(220, 224, 229, <alpha-value>)',
          300: 'rgba(212, 212, 212, <alpha-value>)',
          400: 'rgba(173, 173, 173, <alpha-value>)',
          500: 'rgba(115, 115, 115, <alpha-value>)',
          600: 'rgba(82, 82, 82, <alpha-value>)',
          700: 'rgba(64, 64, 64, <alpha-value>)',
          800: 'rgba(23, 25, 28, <alpha-value>)',
        },
        text: {
          primary: 'rgba(34, 34, 34, <alpha-value>)',
          secondary: 'rgba(82, 82, 82, <alpha-value>)',
          muted: 'rgba(115, 115, 115, <alpha-value>)',
          placeholder: 'rgba(173, 173, 173, <alpha-value>)',
        },
        feedback: {
          error: 'rgba(244, 68, 53, <alpha-value>)', // Re-standardized to rgba(244, 68, 53, 1)
          success: 'rgba(22, 163, 74, <alpha-value>)', // Re-standardized to rgba(22, 163, 74, 1)
          info: 'rgba(49, 130, 206, <alpha-value>)',
          warning: 'rgba(214, 158, 46, <alpha-value>)',
        },
        background: {
          primary: 'rgba(255, 249, 246, 1)', // #FFF9F6
          secondary: 'rgba(255, 253, 251, 1)', // #FFFDFB
          pagination: 'rgba(249, 250, 251, 0.3)', // gray-50/30
          white: '#FFFFFF',
          hero: '#F9FAFB',
        },
        border: {
          table: 'rgba(222, 223, 227, 1)',
          light: 'rgba(242, 244, 247, 1)',
        },
      },
      backgroundImage: {
        // Realityworks AI brand gradient — golden (#E0942F) → brand (#DB8833) → burnt (#C4692A),
        // sampled from the logo lockup. `gradient-brand` is the canonical token.
        'gradient-brand': 'linear-gradient(135deg, #E0942F 0%, #DB8833 45%, #C4692A 100%)',
        'gradient-btn': 'linear-gradient(90deg, #E0942F 0%, #C4692A 100%)',
        'gradient-dashboard':
          'linear-gradient(0deg, rgba(224, 148, 47, 0.4) 0%, rgba(196, 105, 42, 0.4) 100%)',
        'gradient-avatar':
          'linear-gradient(135deg, rgba(var(--color-primary-400-rgb), 1), rgba(var(--color-primary-600-rgb), 1))',
      },
      fontSize: {
        'display-1': ['64px', { lineHeight: '1.1', fontWeight: '700' }],
        'display-2': ['48px', { lineHeight: '1.1', fontWeight: '700' }],
        h1: ['42px', { lineHeight: '1.2', fontWeight: '700' }],
        h2: ['36px', { lineHeight: '1.2', fontWeight: '700' }],
        h3: ['32px', { lineHeight: '1.2', fontWeight: '700' }],
        h4: ['28px', { lineHeight: '1.2', fontWeight: '700' }],
        h5: ['24px', { lineHeight: '1.2', fontWeight: '700' }],
        h6: ['20px', { lineHeight: '1.2', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-base': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '1.5', fontWeight: '400' }],
        xs: ['10px', { lineHeight: '1.5', fontWeight: '400' }],
      },
      fontFamily: {
        // Realityworks AI brand type. Neulis Sans (brand) → Apotos (approved
        // alternate) → Montserrat (loaded fallback) → system. Add the Neulis
        // Sans / Apotos font files via @font-face for these to render.
        sans: ["'Neulis Sans'", "'Apotos'", "'Montserrat'", 'sans-serif'],
      },
      boxShadow: {
        card: '0 4px 16px rgba(0,0,0,0.06)',
        modal: '0 8px 32px rgba(0,0,0,0.12)',
        'hero-auth': '9px 0px 17px 0px rgba(242, 138, 38, 0.2)',
        'form-container': '0px 0px 45px 0px rgba(254, 119, 55, 0.2)',
      },
      gridTemplateColumns: {
        layout: 'auto 1fr',
        metrics: 'repeat(5, minmax(0, 1fr))',
        content: 'repeat(3, minmax(0, 1fr))',
        'auto-fit-cards': 'repeat(auto-fit, minmax(300px, 1fr))',
        auth: '1fr 1fr',
        'filter-bar': '1fr auto auto',
        'form-2-col': 'repeat(2, 1fr)',
        'table-header': 'auto 1fr minmax(300px, 400px) auto auto',
        'table-grid-6': '1fr 1.5fr 1.5fr 1fr 0.8fr 0.4fr',
        'page-header': '1fr auto',
      },
      gridTemplateRows: {
        layout: 'auto 1fr',
        'auth-mobile': 'auto 1fr',
      },
      maxWidth: {
        'auth-card': '475px',
        'auth-container': '605px',
        'auth-inner': '550px',
        'hero-content': '600px',
      },
      height: {
        'auth-input': '56px',
        'auth-social': '48px',
        'otp-input': '84px',
        'logo-standard': '50px',
        header: '80px',
      },
      width: {
        'otp-input': '84px',
        'logo-standard': '50px',
        'sidebar-full': '288px',
        'sidebar-collapsed': '80px',
      },
      minHeight: {
        'auth-form': '616px',
      },
      borderRadius: {
        xl: '12px',
        '2xl': '16px',
        '3xl': '30px',
        'auth-social': '48px',
      },
    },
  },
  plugins: [],
};
