// 모든 API 호출이 지나가는 공통 클라이언트.
// - 주소는 .env 파일(VITE_API_BASE_URL)에서만 읽는다.
// - 로그인 토큰이 있으면 모든 요청에 자동으로 붙인다.
// - 에러 처리와 "로그인이 풀렸을 때(401)" 처리를 여기서 한 번만 한다.
import { getToken } from '../auth/tokenStorage';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    'VITE_API_BASE_URL이 설정되지 않았습니다. frontend/.env.development 파일을 확인하세요.',
  );
}

/** status가 0이면 서버에 연결하지 못한 경우(서버 꺼짐, 주소 오류, CORS 등)다. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type QueryValue = string | number | undefined | null;
type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface RequestOptions {
  query?: Record<string, QueryValue>;
  /** JSON으로 보낼 내용 */
  body?: unknown;
  /** 폼 형식(application/x-www-form-urlencoded)으로 보낼 내용 (로그인용) */
  form?: Record<string, string>;
  signal?: AbortSignal;
  /** true면 401이 와도 "로그인이 풀렸다"로 처리하지 않는다 (로그인 요청 자체의 401은 그냥 에러) */
  skipAuthHandling?: boolean;
}

// 401을 받았을 때 호출할 함수. 로그인 상태를 관리하는 곳(AuthProvider)이 등록한다.
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

/** 값이 없는(undefined, null, 빈 문자열) 파라미터는 주소에 붙이지 않는다. */
export function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(path, API_BASE_URL);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function isAbortError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: string }).name === 'AbortError';
}

export async function apiRequest<T>(
  method: Method,
  path: string,
  { query, body, form, signal, skipAuthHandling = false }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let payload: string | undefined;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    payload = new URLSearchParams(form).toString();
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), { method, headers, body: payload, signal });
  } catch (error) {
    // 화면을 벗어나거나 새 요청으로 바뀌어 일부러 취소한 경우는 에러로 취급하지 않는다.
    if (isAbortError(error)) throw error;
    throw new ApiError(0, '서버에 연결할 수 없습니다. 백엔드(FastAPI)가 켜져 있는지 확인해 주세요.');
  }

  if (!response.ok) {
    let message = `요청에 실패했습니다. (HTTP ${response.status})`;
    try {
      const data = await response.json();
      // 백엔드는 에러를 {"detail": "메시지"} 형태로 내려준다.
      if (typeof data?.detail === 'string') message = data.detail;
    } catch {
      // 본문이 JSON이 아니면 기본 메시지를 쓴다.
    }
    if (response.status === 401 && !skipAuthHandling) unauthorizedHandler?.();
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export function apiGet<T>(
  path: string,
  query?: Record<string, QueryValue>,
  signal?: AbortSignal,
): Promise<T> {
  return apiRequest<T>('GET', path, { query, signal });
}
