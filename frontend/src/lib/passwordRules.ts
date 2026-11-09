// 회원가입 비밀번호 규칙. 백엔드(security.py)와 같은 규칙이다.
// 화면에서 먼저 알려주면 서버까지 가지 않고도 바로 안내할 수 있다. (최종 검사는 서버가 한다)
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_BYTES = 72;

export function passwordProblem(password: string): string | null {
  if (new TextEncoder().encode(password).length > MAX_PASSWORD_BYTES) {
    return `비밀번호는 ${MAX_PASSWORD_BYTES}바이트(영문 기준 ${MAX_PASSWORD_BYTES}자) 이하여야 합니다.`;
  }
  if (password.length < MIN_PASSWORD_LENGTH) return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return '비밀번호에는 영문과 숫자가 모두 들어 있어야 합니다.';
  return null;
}
