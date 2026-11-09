import { apiRequest } from './client';
import type { TokenResponse, User } from '../types/auth';

/** 로그인. 백엔드(OAuth2 방식)는 이메일을 username 칸으로 받는다. */
export function requestLogin(email: string, password: string): Promise<TokenResponse> {
  return apiRequest<TokenResponse>('POST', '/auth/login', {
    form: { username: email, password },
    skipAuthHandling: true,
  });
}

export function requestRegister(email: string, password: string): Promise<User> {
  return apiRequest<User>('POST', '/auth/register', { body: { email, password }, skipAuthHandling: true });
}

/** 지금 로그인한 사용자. (세션 복원용이라 401이어도 "만료 알림"을 띄우지 않는다) */
export function getMe(signal?: AbortSignal): Promise<User> {
  return apiRequest<User>('GET', '/auth/me', { signal, skipAuthHandling: true });
}
