/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Inter"', "ui-sans-serif", "system-ui", "sans-serif"],
        display: ['"Outfit"', '"Inter"', "ui-sans-serif", "system-ui"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Electric Boutique accent (electric blue)
        brand: {
          50: "#eef3ff",
          100: "#d9e4ff",
          200: "#bcd0ff",
          300: "#8eb0ff",
          400: "#5a87ff",
          500: "#2f63ff",
          600: "#0052ff",
          700: "#0044db",
          800: "#0837ad",
          900: "#0d3288",
        },
        // gradient end for CTAs
        electric: "#4d7cff",
      },
      borderRadius: {
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
        "4xl": "2rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(15,23,42,0.04), 0 10px 30px -14px rgba(15,23,42,0.18)",
        glow: "0 8px 24px -8px rgba(0,82,255,0.45)",
        "glow-lg": "0 10px 40px -8px rgba(0,82,255,0.55)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "scale-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.97)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        shimmer: { "100%": { transform: "translateX(100%)" } },
        aurora: {
          "0%, 100%": { transform: "translate(0,0) scale(1)", opacity: "0.7" },
          "50%": { transform: "translate(3%,4%) scale(1.08)", opacity: "1" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.45", transform: "scale(0.75)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "scale-in": "scale-in 0.18s cubic-bezier(0.16,1,0.3,1)",
        "slide-in-right": "slide-in-right 0.22s cubic-bezier(0.16,1,0.3,1)",
        aurora: "aurora 14s ease-in-out infinite",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
