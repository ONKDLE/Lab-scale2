import { afterEach, describe, expect, it, vi } from 'vitest';
import { setToken } from '../auth/tokenStorage';
import { mockFetch } from '../test/helpers';
import { ApiError, apiRequest, setUnauthorizedHandler } from './client';

afterEach(() => setUnauthorizedHandler(null));

function lastRequest(fetchMock: ReturnType<typeof mockFetch>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url: new URL(url), init, headers: new Headers(init.headers) };
}

describe('apiRequest: 로그인 토큰', () => {
  it('토큰이 있으면 모든 요청에 Authorization 헤더를 붙인다', async () => {
    setToken('my-token');
    const fetchMock = mockFetch(() => ({ body: {} }));
    await apiRequest('GET', '/categories');
    expect(lastRequest(fetchMock).headers.get('Authorization')).toBe('Bearer my-token');
  });

  it('토큰이 없으면 Authorization 헤더를 붙이지 않는다', async () => {
    const fetchMock = mockFetch(() => ({ body: {} }));
    await apiRequest('GET', '/categories');
    expect(lastRequest(fetchMock).headers.has('Authorization')).toBe(false);
  });
});

describe('apiRequest: 보내는 방식', () => {
  it('body가 없는 PATCH에는 Content-Type을 붙이지 않는다', async () => {
    const fetchMock = mockFetch(() => ({ body: {} }));
    await apiRequest('PATCH', '/transactions/1/cancel');
    const { init, headers } = lastRequest(fetchMock);
    expect(init.method).toBe('PATCH');
    expect(init.body).toBeUndefined();
    expect(headers.has('Content-Type')).toBe(false);
  });

  it('JSON body는 Content-Type: application/json 으로 보낸다', async () => {
    const fetchMock = mockFetch(() => ({ body: {} }));
    await apiRequest('POST', '/auth/register', { body: { email: 'a@b.com', password: 'pw1' } });
    const { init, headers } = lastRequest(fetchMock);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ email: 'a@b.com', password: 'pw1' });
  });

  it('폼 값은 x-www-form-urlencoded 로 보낸다 (로그인)', async () => {
    const fetchMock = mockFetch(() => ({ body: {} }));
    await apiRequest('POST', '/auth/login', { form: { username: 'a@b.com', password: 'p w&1' } });
    const { init, headers } = lastRequest(fetchMock);
    expect(headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(new URLSearchParams(init.body as string).get('password')).toBe('p w&1');
  });

  it('204(내용 없음) 응답은 undefined 로 돌려준다', async () => {
    mockFetch(() => ({ status: 204, body: null }));
    await expect(apiRequest('DELETE', '/categories/1')).resolves.toBeUndefined();
  });
});

describe('apiRequest: 401 (로그인이 풀림) 처리', () => {
  it('401을 받으면 등록된 처리 함수를 부르고 ApiError를 던진다', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(() => ({ status: 401, body: { detail: '로그인이 만료되었거나 올바르지 않습니다.' } }));

    const error = await apiRequest('GET', '/categories').catch((e: unknown) => e);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });

  it('skipAuthHandling 이면 401이어도 처리 함수를 부르지 않는다 (로그인 실패 등)', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    mockFetch(() => ({ status: 401, body: { detail: '이메일 또는 비밀번호가 올바르지 않습니다.' } }));

    await expect(apiRequest('POST', '/auth/login', { skipAuthHandling: true })).rejects.toMatchObject({ status: 401 });
    expect(handler).not.toHaveBeenCalled();
  });

  it('401이 아닌 에러(403, 404, 409)는 처리 함수를 부르지 않는다', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    for (const status of [403, 404, 409, 500]) {
      mockFetch(() => ({ status, body: { detail: 'x' } }));
      await apiRequest('GET', '/x').catch(() => undefined);
    }
    expect(handler).not.toHaveBeenCalled();
  });
});
