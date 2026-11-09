import { Route, Routes } from 'react-router-dom';
import RequireAuth from './auth/RequireAuth';
import Layout from './components/Layout';
import CategoryDetailPage from './pages/CategoryDetailPage';
import CategoryListPage from './pages/CategoryListPage';
import LoginPage from './pages/LoginPage';
import NotFoundPage from './pages/NotFoundPage';
import RegisterPage from './pages/RegisterPage';
import TransactionListPage from './pages/TransactionListPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      {/* 아래는 모두 로그인해야 볼 수 있다 */}
      <Route element={<RequireAuth />}>
        <Route element={<Layout />}>
          <Route path="/" element={<TransactionListPage />} />
          <Route path="/categories" element={<CategoryListPage />} />
          <Route path="/categories/:categoryId" element={<CategoryDetailPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
