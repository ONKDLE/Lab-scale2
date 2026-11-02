import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 5173이 이미 사용 중이면 다른 포트로 몰래 바꾸지 않고 에러를 낸다.
    // (백엔드가 허용한 주소가 5173이라, 포트가 바뀌면 API 호출이 막히기 때문)
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    // 테스트에서 쓰는 가짜 API 주소 (실제 서버에는 접속하지 않는다)
    env: { VITE_API_BASE_URL: 'http://api.test' },
  },
});
