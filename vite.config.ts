import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Il build produce un unico dist/index.html autonomo, condivisibile con HR.
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
})
