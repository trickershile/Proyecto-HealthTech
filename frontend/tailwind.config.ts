import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      transitionTimingFunction: {
        'elastic-out': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
      animation: {
        // Ondas que reaccionan RÁPIDO y se desvanecen LENTO
        'ripple-organic': 'ripple-organic 2.5s cubic-bezier(0.19, 1, 0.22, 1) infinite',
        // Respiración del núcleo (no lineal)
        'breathe': 'breathe 4s ease-in-out infinite',
        // Giro errático del horizonte de eventos
        'spin-erratic': 'spin 10s cubic-bezier(0.68, -0.55, 0.27, 1.55) infinite',
        'spin-slow': 'spin 15s linear infinite',
        // Animación rápida y elástica para cada letra
        'atom-fade-in': 'atom-fade-in 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
      },
      keyframes: {
        'ripple-organic': {
          '0%': { transform: 'scale(0.7) rotate(0deg)', opacity: '0', borderWidth: '6px' },
          '10%': { opacity: '1', borderWidth: '8px' }, // Pulso inicial fuerte
          '100%': { transform: 'scale(4.5) rotate(15deg)', opacity: '0', borderWidth: '1px' },
        },
        'breathe': {
          '0%, 100%': { transform: 'scale(1)', boxShadow: '0 0 20px rgba(0,255,255,0.2)' },
          '50%': { transform: 'scale(1.05)', boxShadow: '0 0 40px rgba(0,255,255,0.5)' },
        },
        'atom-fade-in': {
          // Empieza pequeño, transparente y girado
          '0%': { opacity: '0', transform: 'scale(0.3) translateY(10px) rotate(-5deg)' },
          // Termina en su lugar original
          '100%': { opacity: '1', transform: 'scale(1) translateY(0px) rotate(0deg)' },
        },
      },
    },
  },
  plugins: [],
};
export default config;
