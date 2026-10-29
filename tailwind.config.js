/** Colours read the CSS variables generated in styles/tokens.css (see styles/tokens.json). */
const token = (name) => `hsl(var(--${name}) / <alpha-value>)`
const pair = (name) => ({ DEFAULT: token(name), foreground: token(`${name}-foreground`) })

module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./features/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        border: token("border"),
        input: token("input"),
        ring: token("ring"),
        background: token("background"),
        foreground: token("foreground"),
        primary: pair("primary"),
        secondary: pair("secondary"),
        muted: pair("muted"),
        accent: pair("accent"),
        popover: pair("popover"),
        card: pair("card"),
        destructive: { ...pair("destructive"), subtle: token("destructive-subtle"), text: token("destructive-text") },
        success: { DEFAULT: token("success"), subtle: token("success-subtle") },
        warning: { DEFAULT: token("warning"), subtle: token("warning-subtle") },
        info: { DEFAULT: token("info"), subtle: token("info-subtle") },
        sidebar: {
          DEFAULT: token("sidebar"),
          foreground: token("sidebar-foreground"),
          muted: token("sidebar-muted"),
          accent: token("sidebar-accent"),
          border: token("sidebar-border"),
        },
        chart: {
          1: token("chart-1"),
          2: token("chart-2"),
          3: token("chart-3"),
          4: token("chart-4"),
          5: token("chart-5"),
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 10px)",
      },
      boxShadow: {
        card: "0 1px 2px hsl(226 43% 12% / 0.04), 0 4px 16px hsl(226 43% 12% / 0.04)",
        pop: "0 8px 30px hsl(226 43% 12% / 0.14)",
      },
      keyframes: {
        "accordion-down": { from: { height: 0 }, to: { height: "var(--radix-accordion-content-height)" } },
        "accordion-up": { from: { height: "var(--radix-accordion-content-height)" }, to: { height: 0 } },
        "fade-up": { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "translateY(0)" } },
        shimmer: { "100%": { transform: "translateX(100%)" } },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.25s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
