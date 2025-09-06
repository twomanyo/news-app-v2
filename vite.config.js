import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages 배포 시 경로 설정
export default defineConfig({
  plugins: [react()],
  base: '/' // 레포 이름과 동일하게
});
