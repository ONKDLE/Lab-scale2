import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { passwordProblem } from '../lib/passwordRules';

export default function RegisterPage() {
  const { status, register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (status === 'authenticated') return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setError(null);

    // 서버까지 가기 전에 화면에서 먼저 알려준다. (최종 검사는 서버가 한다)
    if (!email.trim()) return setError('이메일을 입력해 주세요.');
    const problem = passwordProblem(password);
    if (problem) return setError(problem);
    if (password !== confirm) return setError('비밀번호 확인이 일치하지 않습니다.');

    setSubmitting(true);
    try {
      await register(email.trim(), password); // 가입 후 바로 로그인된다
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '회원가입에 실패했습니다.');
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <form className="auth-card" onSubmit={handleSubmit} noValidate>
        <h1 className="auth-title">마이핀</h1>
        <p className="auth-subtitle">회원가입</p>

        <div className="field">
          <label htmlFor="register-email">이메일</label>
          <input
            id="register-email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="register-password">비밀번호</label>
          <input
            id="register-password"
            aria-describedby="register-password-hint"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <span id="register-password-hint" className="field-hint">8자 이상, 영문과 숫자를 모두 포함해 주세요.</span>
        </div>

        <div className="field">
          <label htmlFor="register-confirm">비밀번호 확인</label>
          <input
            id="register-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
          />
        </div>

        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}

        <button type="submit" className="primary-button primary-button--block" disabled={submitting}>
          {submitting ? '가입 중…' : '가입하기'}
        </button>

        <p className="auth-switch">
          이미 계정이 있나요? <Link to="/login">로그인</Link>
        </p>
      </form>
    </main>
  );
}
