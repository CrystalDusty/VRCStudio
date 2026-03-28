import { useState, FormEvent } from 'react';
import { Eye, EyeOff, Shield, Loader2 } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const { login, verify2FA, isLoading, needs2FA, twoFactorMethod, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tfaCode, setTfaCode] = useState('');

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    login(username.trim(), password);
  };

  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    if (!tfaCode.trim()) return;
    verify2FA(tfaCode.trim());
  };

  return (
    <div className="h-screen flex items-center justify-center bg-surface-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-accent-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-blue-600 mb-4">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gradient">VRC Studio</h1>
          <p className="text-sm text-surface-400 mt-1">Your VRChat Companion</p>
        </div>

        {!needs2FA ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">
                Username or Email
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => { setUsername(e.target.value); clearError(); }}
                className="input-field"
                placeholder="Enter your username"
                autoFocus
                disabled={isLoading}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-surface-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); clearError(); }}
                  className="input-field pr-10"
                  placeholder="Enter your password"
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 p-1"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Signing in...
                </>
              ) : (
                'Sign In'
              )}
            </button>

            <p className="text-xs text-center text-surface-500">
              Uses VRChat credentials. We never store your password.
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div className="text-center mb-2">
              <h2 className="text-lg font-semibold">Two-Factor Authentication</h2>
              <p className="text-sm text-surface-400 mt-1">
                {twoFactorMethod === 'totp'
                  ? 'Enter the code from your authenticator app'
                  : 'Enter the code sent to your email'}
              </p>
            </div>

            <div>
              <input
                type="text"
                value={tfaCode}
                onChange={(e) => { setTfaCode(e.target.value.replace(/\D/g, '').slice(0, 6)); clearError(); }}
                className="input-field text-center text-xl tracking-[0.3em] font-mono"
                placeholder="000000"
                maxLength={6}
                autoFocus
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button type="submit" disabled={isLoading || tfaCode.length < 6} className="btn-primary w-full flex items-center justify-center gap-2">
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
