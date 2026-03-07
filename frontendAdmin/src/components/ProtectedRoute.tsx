import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { getCurrentUser } from '../api/auth';

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accessToken = useAuthStore((state) => state.accessToken);
  const refreshToken = useAuthStore((state) => state.refreshToken);
  const location = useLocation();
  const [isValidating, setIsValidating] = useState(true);
  const [isValid, setIsValid] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const validateAuth = async () => {
      // 如果没有认证信息，直接跳转登录
      if (!isAuthenticated || !accessToken || !refreshToken) {
        if (isMounted) {
          setIsValidating(false);
          setIsValid(false);
        }
        return;
      }

      try {
        // 验证 token 有效性（调用 /auth/me）
        await getCurrentUser();
        if (isMounted) {
          setIsValid(true);
        }
      } catch {
        // Token 无效，会被 axios 拦截器自动刷新
        // 如果刷新失败，会自动跳转登录
        if (isMounted) {
          setIsValid(false);
        }
      } finally {
        if (isMounted) {
          setIsValidating(false);
        }
      }
    };

    validateAuth();

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, accessToken, refreshToken]);

  // 正在验证中，显示加载状态
  if (isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-app-bg">
        <div className="text-app-fg">验证登录状态...</div>
      </div>
    );
  }

  // 检查是否有有效的认证信息
  if (!isAuthenticated || !accessToken || !refreshToken || !isValid) {
    // 保存当前路径，登录后可以跳转回来
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}
