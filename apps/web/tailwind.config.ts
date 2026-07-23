import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // やわらかい多層の影。カードの浮遊感と、CTAの持ち上がりを分けて定義。
      boxShadow: {
        soft: '0 1px 2px rgba(15,23,42,0.04), 0 10px 30px -14px rgba(15,23,42,0.12)',
        lift: '0 1px 2px rgba(15,23,42,0.05), 0 22px 48px -20px rgba(79,70,229,0.35)',
      },
      // 出現時のふわっとした立ち上がり（過剰な演出はしない）。
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
};

export default config;
