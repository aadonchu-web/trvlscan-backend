import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: "#0038d1",
        "primary-container": "#1b4fff",
        "on-primary": "#ffffff",
        "on-primary-container": "#dfe2ff",
        secondary: "#006d36",
        "secondary-container": "#79fca0",
        "on-secondary": "#ffffff",
        "on-secondary-container": "#00743a",
        tertiary: "#3d4e6a",
        "tertiary-fixed": "#d5e3ff",
        "tertiary-fixed-dim": "#b6c7e8",
        "on-tertiary": "#ffffff",
        "on-tertiary-fixed-variant": "#374762",
        surface: "#f9f9ff",
        "surface-container-lowest": "#ffffff",
        "surface-container-low": "#f0f3ff",
        "surface-container": "#e7eeff",
        "surface-container-high": "#dee8ff",
        "surface-container-highest": "#d5e3ff",
        "on-surface": "#091c35",
        "on-surface-variant": "#434656",
        outline: "#747688",
        "outline-variant": "#c4c5d9",
        error: "#ba1a1a",
        "on-error": "#ffffff",
      },
      fontFamily: {
        headline: ["Plus Jakarta Sans", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
