import { defineConfig } from "vite";
export default defineConfig({
  // Deep icon imports bypass Vite's package entrypoint optimizer. Explicitly
  // dedupe React so those small icon modules still share the app's hooks
  // runtime in development and production.
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: [
            "three",
            "three/addons/controls/OrbitControls.js",
            "three/addons/loaders/GLTFLoader.js",
          ],
          react: ["react", "react-dom/client"],
        },
      },
    },
  },
});
