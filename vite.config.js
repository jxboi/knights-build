import { defineConfig } from "vite";
export default defineConfig({
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
