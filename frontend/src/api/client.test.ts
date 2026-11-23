import { describe, expect, it } from 'vitest';
import { mockFetch } from '../test/helpers';
import { ApiError, apiGet, buildUrl } from './client';
import { getTransactionList } from './transactions';

describe('buildUrl', () => {
  it('값이 없는 파라미터(undefined, null, 빈 문자열)는 주소에 붙이지 않는다', () => {
    const url = new URL(buildUrl('/transactions', { page: 2, status: undefined, keyword: '', sort: null }));
    expect(url.origin).toBe('http://api.test');
    expect(url.pathname).toBe('/transactions');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.has('status')).toBe(false);
    expect(url.searchParams.has('keyword')).toBe(false);
    expect(url.searchParams.has('sort')).toBe(false);
  });

  it('한글 검색어도 안전하게 인코딩한다', () => {
    const url = buildUrl('/transactions', { keyword: '스타벅스' });
    expect(url).toContain('keyword=%EC%8A%A4%ED%83%80%EB%B2%85%EC%8A%A4');
  });
});

describe('getTransactionList', () => {
  it('page, status, keyword를 백엔드 파라미터 이름 그대로 전달하고, 검색어 공백은 제거한다', async () => {
    const fetchMock = mockFetch(() => ({
      body: { items: [], page: 2, size: 10, total_elements: 0, total_pages: 0, has_next: false },
    }));

    await getTransactionList({ page: 2, status: 'ACTIVE', keyword: '  스타벅스  ' });

    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe('/transactions');
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('status')).toBe('ACTIVE');
    expect(url.searchParams.get('keyword')).toBe('스타벅스');
  });
});

describe('apiGet 에러 처리', () => {
  it('백엔드가 보낸 detail 메시지를 그대로 에러 메시지로 쓴다', async () => {
    mockFetch(() => ({ status: 400, body: { detail: 'page는 1 이상이어야 합니다. (입력값: -1)' } }));

    await expect(apiGet('/transactions')).rejects.toMatchObject({
      name: 'ApiError',
      status: 400,
      message: 'page는 1 이상이어야 합니다. (입력값: -1)',
    });
  });

  it('JSON이 아닌 에러 응답은 기본 메시지를 쓴다', async () => {
    mockFetch(() => ({ status: 502, body: '<html>Bad Gateway</html>' }));

    await expect(apiGet('/transactions')).rejects.toMatchObject({
      status: 502,
      message: '요청에 실패했습니다. (HTTP 502)',
    });
  });

  it('서버에 연결하지 못하면 status 0인 ApiError로 바꿔서 안내한다', async () => {
    mockFetch(() => 'network-error');

    const error = await apiGet('/transactions').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).message).toContain('서버에 연결할 수 없습니다');
  });
});
