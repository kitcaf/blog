import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/useAuthStore';
import { login, register } from '../api/auth';
import { Button } from '../components/ui/button';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setAuth = useAuthStore((state) => state.setAuth);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  
  // 如果已经登录，直接跳转到目标页面或首页
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, navigate, location]);
  
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // 登录
        const response = await login({
          username: formData.username,
          password: formData.password,
        });
        setAuth(response.access_token, response.refresh_token, response.user);
        
        // 跳转到之前访问的页面或首页
        const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
        navigate(from, { replace: true });
      } else {
        // 注册
        await register({
          username: formData.username,
          email: formData.email,
          password: formData.password,
        });
        // 注册成功后自动登录
        const loginResponse = await login({
          username: formData.username,
          password: formData.password,
        });
        setAuth(loginResponse.access_token, loginResponse.refresh_token, loginResponse.user);
        
        // 跳转到首页
        navigate('/', { replace: true });
      }
    } catch (err: unknown) {
      const errorMessage = (err as { message?: string })?.message || '操作失败，请重试';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-app-bg">
      <div className="w-full max-w-md px-6">
        {/* Logo / Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-app-fg-deeper mb-2">
            {isLogin ? '欢迎回来' : '创建账号'}
          </h1>
          <p className="text-app-fg-light">
            {isLogin ? '登录到你的工作空间' : '开始你的创作之旅'}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-app-fg-deep mb-2">
                用户名
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                value={formData.username}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-app-bg border border-border rounded-lg 
                         text-app-fg-deeper placeholder:text-app-fg-light
                         focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring
                         transition-colors"
                placeholder="输入用户名"
              />
            </div>

            {/* Email (仅注册时显示) */}
            {!isLogin && (
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-app-fg-deep mb-2">
                  邮箱
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-app-bg border border-border rounded-lg 
                           text-app-fg-deeper placeholder:text-app-fg-light
                           focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring
                           transition-colors"
                  placeholder="输入邮箱地址"
                />
              </div>
            )}

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-app-fg-deep mb-2">
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-app-bg border border-border rounded-lg 
                         text-app-fg-deeper placeholder:text-app-fg-light
                         focus:outline-none focus:ring-2 focus:ring-ring/50 focus:border-ring
                         transition-colors"
                placeholder={isLogin ? '输入密码' : '至少 6 个字符'}
                minLength={6}
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="px-4 py-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-lg font-medium
                       hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? '处理中...' : isLogin ? '登录' : '注册'}
            </Button>
          </form>

          {/* Toggle Login/Register */}
          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsLogin(!isLogin);
                setError('');
              }}
              className="text-sm text-app-fg hover:text-app-fg-deep transition-colors"
            >
              {isLogin ? (
                <>
                  还没有账号？<span className="font-medium underline underline-offset-2">立即注册</span>
                </>
              ) : (
                <>
                  已有账号？<span className="font-medium underline underline-offset-2">立即登录</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-8 text-center text-sm text-app-fg-light">
          登录即表示你同意我们的服务条款和隐私政策
        </p>
      </div>
    </div>
  );
}
