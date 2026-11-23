import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const linkClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'nav-link nav-link--active' : 'nav-link');

/** 로그인한 뒤의 공통 틀: 위쪽 메뉴 + 로그인한 계정 + 로그아웃 */
export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <>
      <header className="navbar">
        <div className="navbar-inner">
          <NavLink to="/" className="brand">
            가계부
          </NavLink>
          <nav className="nav-links" aria-label="주요 메뉴">
            <NavLink to="/" end className={linkClass}>
              거래 내역
            </NavLink>
            <NavLink to="/categories" className={linkClass}>
              카테고리
            </NavLink>
            <NavLink to="/import" className={linkClass}>
              파일 불러오기
            </NavLink>
            <NavLink to="/stats" className={linkClass}>
              월별 통계
            </NavLink>
          </nav>
          <div className="nav-user">
            <span className="nav-email">{user?.email}</span>
            <button type="button" className="link-button" onClick={logout}>
              로그아웃
            </button>
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
