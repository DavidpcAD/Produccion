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
        // Design System: Green Primary
        brand: {
          DEFAULT: "#ADD010",
          100: "#ADD010",
          200: "#88A024",
          light: "#D4F04A",
          dark:  "#6a8019",
        },
        // Design System: Grays
        "ds-gray": {
          100: "#EBEBEB",
          200: "#D9D9D9",
          300: "#AAAFB6",
          400: "#747B86",
          500: "#5D636C",
        },
        // Design System: Red/Danger
        "ds-red": {
          DEFAULT: "#C96C6C",
          100: "#C96C6C",
          200: "#BB4A4A",
        },
        // Design System: Yellow/Warning
        "ds-yellow": "#F0C802",
        // App background
        "ds-bg":   "#F3F3F3",
      },
      fontFamily: {
        sans: ["Roboto", "system-ui", "sans-serif"],
      },
      fontSize: {
        "body-sm":   ["12px", { lineHeight: "16px", letterSpacing: "0" }],
        "label":     ["14px", { lineHeight: "20px", letterSpacing: "0" }],
        "body":      ["16px", { lineHeight: "24px", letterSpacing: "0" }],
        "sub-sm":    ["20px", { lineHeight: "24px", letterSpacing: "0.4px" }],
        "sub":       ["24px", { lineHeight: "24px", letterSpacing: "0.4px" }],
        "heading":   ["32px", { lineHeight: "40px", letterSpacing: "0.4px" }],
      },
      borderRadius: {
        "ds-sm": "4px",
        "ds":    "8px",
        "ds-lg": "16px",
        "ds-xl": "32px",
      },
      boxShadow: {
        "ds-01": "0px 4px 8px 0px rgba(170, 175, 182, 0.25)",
        "ds-02": "0px 6px 0px 0px rgba(0, 0, 0, 0.16)",
        "ds-03": "0px 6px 0px 0px rgba(0, 0, 0, 0.16), 0px 2px 4px 0px rgba(0, 0, 0, 0.16)",
      },
    },
  },
  plugins: [],
};

export default config;
