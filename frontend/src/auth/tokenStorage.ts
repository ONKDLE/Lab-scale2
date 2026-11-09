// 로그인 토큰을 브라우저에 보관한다. (새로고침해도 로그인이 유지되도록)
// 브라우저가 저장소 사용을 막은 경우(시크릿 모드 설정 등)에도 이번 방문 동안은 동작하게 메모리에도 둔다.
const KEY = 'mypin.accessToken';
let memoryToken: string | null = null;

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  memoryToken = token;
  try {
    window.localStorage.setItem(KEY, token);
  } catch {
    // 저장소를 못 쓰면 메모리에만 둔다.
  }
}

export function clearToken(): void {
  memoryToken = null;
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // 무시
  }
}
