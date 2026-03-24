/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--bg)",
        panel: "var(--surface)",
        ink: "var(--text-h)",
        muted: "var(--text)",
        line: "var(--border)",
        brand: "var(--accent)",
        successBg: "color-mix(in srgb, var(--success) 12%, white)",
        successFg: "var(--success)",
        warningBg: "color-mix(in srgb, var(--accent) 12%, white)",
        warningFg: "var(--accent-dim)"
      },
      boxShadow: {
        panel: "var(--shadow)"
      }
    },
  },
  plugins: [],
};
