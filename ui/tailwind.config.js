/** @type {import('tailwindcss').Config} */
// Design tokens ported from the Moodeng Credit app so the demo matches the real
// request board exactly (colors, spacing, radii, shadows, type scale).
export default {
   content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
   theme: {
      extend: {
         fontFamily: {
            sans: ['SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif']
         },
         colors: {
            md: {
               primary: {
                  100: '#f1e9fd',
                  300: '#d6bcfa',
                  400: '#c8a6f8',
                  500: '#914cf2',
                  800: '#914cf2',
                  900: '#8336f0',
                  1100: '#8336F0',
                  1200: '#6010d2',
                  1500: '#470b9a',
                  2000: '#1c053d'
               },
               heading: '#040033',
               neutral: {
                  50: '#fdfbfd',
                  100: '#fdfcfd',
                  200: '#f9f8fa',
                  300: '#f2f0f5',
                  400: '#f0f0f0',
                  500: '#c0b9c8',
                  600: '#b5acbe',
                  700: '#6d6d6d',
                  800: '#9e92aa',
                  1000: '#877897',
                  1200: '#70617f',
                  1400: '#594d65',
                  1500: '#4d4359'
               },
               green: { 100: '#d6f8e6', 600: '#008624', 700: '#1aa45b', 800: '#16884b', 900: '#116b3c' },
               blue: { 500: '#1a8dff', 600: '#0076eb', 700: '#155dfc' },
               yellow: { 100: '#fff8e1', 700: '#d3aa00' },
               red: { 100: '#fed7da', 300: '#fb3748', 400: '#ff0420', 500: '#dd0417', 600: '#d92121', 800: '#b60413' }
            }
         },
         spacing: {
            'md-0': '4px',
            'md-1': '8px',
            'md-2': '12px',
            'md-3': '16px',
            'md-4': '20px',
            'md-5': '24px'
         },
         borderRadius: {
            'md-xs': '10px',
            'md-sm': '4px',
            'md-sm-md': '14px',
            'md-md': '8px',
            'md-lg': '16px',
            'md-xl': '20px',
            'md-pill': '500px',
            'md-input': '12px'
         },
         boxShadow: {
            'md-card': '0px 2px 4px 0px rgba(27, 28, 29, 0.04)',
            'md-nav': '0px 4px 40.8px 0px rgba(0, 0, 0, 0.08)'
         },
         fontSize: {
            'md-display': ['34px', { lineHeight: '1.2', letterSpacing: '-0.04em', fontWeight: '590' }],
            'md-h3': ['28px', { lineHeight: '1.2', letterSpacing: '-0.04em', fontWeight: '590' }],
            'md-h4': ['24px', { lineHeight: '1.2', letterSpacing: '-0.04em', fontWeight: '590' }],
            'md-h5': ['18px', { lineHeight: '1.2', letterSpacing: '-0.04em', fontWeight: '590' }],
            'md-h6': ['20px', { lineHeight: '1.2', letterSpacing: '-0.04em', fontWeight: '590' }],
            'md-b1': ['16px', { lineHeight: '24px', letterSpacing: '-0.02em' }],
            'md-b2': ['14px', { lineHeight: '21px', letterSpacing: '-0.02em' }],
            'md-b3': ['12px', { lineHeight: '18px', letterSpacing: '-0.02em' }],
            'md-b4': ['10px', { lineHeight: '15px', letterSpacing: '-0.02em' }]
         }
      }
   },
   plugins: []
};
