import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px'
      }
    },
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))'
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))'
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))'
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))'
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))'
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))'
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))'
        },
        sidebar: {
          DEFAULT: 'hsl(var(--sidebar-background))',
          foreground: 'hsl(var(--sidebar-foreground))',
          primary: 'hsl(var(--sidebar-primary))',
          'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
          accent: 'hsl(var(--sidebar-accent))',
          'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
          border: 'hsl(var(--sidebar-border))',
          ring: 'hsl(var(--sidebar-ring))'
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))'
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))'
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))'
        }
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        xl: 'calc(var(--radius) + 4px)',
        '2xl': 'calc(var(--radius) + 8px)'
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' }
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' }
        },
        // Gen X Soft Club - Floaty animations
        'float': {
          '0%, 100%': { transform: 'translateY(0) rotate(0deg)' },
          '25%': { transform: 'translateY(-8px) rotate(1deg)' },
          '75%': { transform: 'translateY(-4px) rotate(-1deg)' }
        },
        'drift': {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '25%': { transform: 'translate(5px, -5px)' },
          '50%': { transform: 'translate(0, -10px)' },
          '75%': { transform: 'translate(-5px, -5px)' }
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.02)' }
        },
        'shimmer-flow': {
          '0%': { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' }
        },
        'bubble-rise': {
          '0%': { transform: 'translateY(100%) scale(0.8)', opacity: '0' },
          '20%': { opacity: '0.6' },
          '80%': { opacity: '0.4' },
          '100%': { transform: 'translateY(-100%) scale(1)', opacity: '0' }
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        'fade-in-scale': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to: { opacity: '1', transform: 'scale(1)' }
        },
        'slide-in-bottom': {
          from: { transform: 'translateY(100%)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' }
        },
        'glow-pulse': {
          '0%, 100%': { boxShadow: '0 0 20px hsl(185 55% 50% / 0.3)' },
          '50%': { boxShadow: '0 0 40px hsl(185 55% 50% / 0.5)' }
        },
        'iridescent': {
          '0%, 100%': { filter: 'hue-rotate(0deg)', opacity: '0.7' },
          '50%': { filter: 'hue-rotate(15deg)', opacity: '1' }
        },
        'water-ripple': {
          '0%': { transform: 'scale(0)', opacity: '0.8' },
          '100%': { transform: 'scale(4)', opacity: '0' }
        }
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        // Gen X Soft Club animations - slower, dreamier
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 8s ease-in-out infinite',
        'float-delayed': 'float 6s ease-in-out infinite 2s',
        'drift': 'drift 10s ease-in-out infinite',
        'pulse-soft': 'pulse-soft 4s ease-in-out infinite',
        'shimmer': 'shimmer-flow 3s ease-in-out infinite',
        'bubble': 'bubble-rise 4s ease-in-out infinite',
        'fade-in': 'fade-in 0.5s ease-out',
        'fade-in-up': 'fade-in-up 0.6s ease-out',
        'fade-in-scale': 'fade-in-scale 0.4s ease-out',
        'slide-in-bottom': 'slide-in-bottom 0.5s ease-out',
        'glow-pulse': 'glow-pulse 3s ease-in-out infinite',
        'iridescent': 'iridescent 4s ease-in-out infinite',
        'water-ripple': 'water-ripple 1s ease-out forwards'
      },
      boxShadow: {
        'soft-sm': '0 1px 3px 0 hsl(195 30% 50% / 0.08)',
        'soft': '0 4px 12px -2px hsl(195 30% 50% / 0.12)',
        'soft-md': '0 8px 24px -4px hsl(195 30% 50% / 0.15)',
        'soft-lg': '0 16px 40px -8px hsl(195 30% 50% / 0.18)',
        'soft-xl': '0 24px 60px -12px hsl(195 30% 50% / 0.22)',
        'glow-aqua': '0 0 30px hsl(185 55% 50% / 0.35)',
        'glow-chrome': '0 0 25px hsl(200 20% 75% / 0.4)',
        'inner-glow': 'inset 0 0 20px hsl(195 50% 80% / 0.2)'
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif']
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-dreamy': 'linear-gradient(135deg, hsl(190 50% 95%) 0%, hsl(200 40% 90%) 50%, hsl(195 35% 95%) 100%)',
        'gradient-chrome': 'linear-gradient(135deg, hsl(200 15% 85%) 0%, hsl(195 20% 92%) 50%, hsl(200 15% 80%) 100%)',
        'gradient-sky': 'linear-gradient(180deg, hsl(195 40% 97%) 0%, hsl(200 35% 92%) 100%)',
        'dot-pattern': 'radial-gradient(circle, hsl(185 40% 70% / 0.15) 1px, transparent 1px)'
      },
      backdropBlur: {
        'xs': '2px',
        'glass': '20px'
      },
      transitionTimingFunction: {
        'bounce-soft': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'ease-dreamy': 'cubic-bezier(0.4, 0, 0.2, 1)'
      },
      transitionDuration: {
        '400': '400ms',
        '600': '600ms'
      }
    }
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
