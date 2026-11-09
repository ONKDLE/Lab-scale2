import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../auth/AuthContext';
import { setToken } from '../auth/tokenStorage';
import { ToastProvider } from '../components/Toast';
import { LocationProbe } from './helpers';

interface Options {
  /** 이미 로그인한 상태로 시작하려면 토큰을 넣는다. (없으면 로그인 전) */
  token?: string | null;
}

/** 앱 전체(로그인, 알림, 화면 이동 포함)를 실제 구성 그대로 그린다. */
export function renderApp(entry: string | { pathname: string; state: unknown } = '/', { token = null }: Options = {}) {
  if (token) setToken(token);
  return render(
    <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AuthProvider>
          <App />
          <LocationProbe />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}
