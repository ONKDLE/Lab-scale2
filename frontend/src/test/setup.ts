import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { clearToken } from '../auth/tokenStorage';

afterEach(() => {
  clearToken(); // 테스트끼리 로그인 상태가 섞이지 않게
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
