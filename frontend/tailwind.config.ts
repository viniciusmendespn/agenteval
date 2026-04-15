import type { Config } from "tailwindcss"

const santanderRed = {
  50: "#fff1f1",
  100: "#ffe0e0",
  200: "#ffc7c7",
  300: "#ff9f9f",
  400: "#ff5f5f",
  500: "#ff2020",
  600: "#ec0000",
  700: "#c60000",
  800: "#9f0000",
  900: "#730000",
  950: "#390000",
}

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        blue: santanderRed,
        indigo: santanderRed,
        red: santanderRed,
        gray: {
          50: "#f7f8fa",
          100: "#eef0f2",
          200: "#dde1e6",
          300: "#c7cdd4",
          400: "#8f99a3",
          500: "#66707a",
          600: "#4b5560",
          700: "#323a43",
          800: "#1f252b",
          900: "#111820",
          950: "#06090d",
        },
      },
      fontFamily: {
        sans: [
          "Santander Micro Text",
          "Santander Text",
          "Arial",
          "Helvetica",
          "sans-serif",
        ],
      },
      boxShadow: {
        santander: "0 10px 30px rgba(17, 24, 32, 0.08)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
}
export default config
