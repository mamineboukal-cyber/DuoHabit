/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Every colour used by the UI lives here; components never use raw hex
      // values or Tailwind's default palette classes.
      colors: {
        canvas: "#0b1020",
        surface: {
          DEFAULT: "#151b2e",
          raised: "#1b2338",
        },
        line: {
          DEFAULT: "#273149",
          strong: "#3a4766",
        },
        content: {
          DEFAULT: "#e2e8f0",
          muted: "#94a3b8",
          subtle: "#64748b",
        },
        accent: {
          DEFAULT: "#6366f1",
          hover: "#818cf8",
        },
        "on-accent": "#ffffff",
        danger: {
          DEFAULT: "#fb7185",
          soft: "#4c1d2f",
          foreground: "#fecdd3",
        },
        success: {
          DEFAULT: "#34d399",
          soft: "#12352c",
          foreground: "#a7f3d0",
        },
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        control: "0.75rem",
        card: "1rem",
        pill: "9999px",
      },
      minHeight: {
        tap: "2.75rem",
      },
      maxWidth: {
        content: "1100px",
      },
      keyframes: {
        confetti: {
          "0%": { opacity: "0", transform: "translateY(-10vh) rotate(0deg)" },
          "10%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translateY(110vh) rotate(720deg)" },
        },
        "xp-float": {
          "0%": { opacity: "0", transform: "translateY(0.25rem)" },
          "20%": { opacity: "1" },
          "100%": { opacity: "0", transform: "translateY(-1.5rem)" },
        },
      },
      animation: {
        confetti: "confetti 1.8s ease-in forwards",
        "xp-float": "xp-float 1.2s ease-out forwards",
      },
    },
  },
  plugins: [],
};
