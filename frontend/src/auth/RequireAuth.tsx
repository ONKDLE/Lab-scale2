import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

/** 로그인해야 볼 수 있는 화면을 감싼다. 로그인이 안 돼 있으면 로그인 화면으로 보내고, 로그인 후 원래 화면으로 돌아온다. */
export default function RequireAuth() {
  const { status, explicitLogout } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <p role="status" className="page-loading">
        로그인 정보를 확인하는 중입니다…
      </p>
    );
  }
  if (status === 'anonymous') {
    // 직접 로그아웃한 경우에는 "돌아갈 화면"을 남기지 않는다. (다음에 로그인하는 사람이 이전 화면으로 가지 않게)
    const state = explicitLogout ? undefined : { from: location.pathname + location.search };
    return <Navigate to="/login" replace state={state} />;
  }
  return <Outlet />;
}
