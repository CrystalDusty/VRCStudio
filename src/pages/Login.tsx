import { useState, FormEvent, useEffect, useRef } from 'react';
import { Eye, EyeOff, Shield, Loader2, KeyRound, Mail, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';

export default function LoginPage() {
  const { login, verify2FA, isLoading, needs2FA, twoFactorMethod, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [tfaDigits, setTfaDigits] = useState<string[]>(['', '', '', '', '', '']);
  const digitRefs = useRef<(HTMLInputElement | null)[]>([]);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password.trim()) return;
    login(username.trim(), password);
  };

  const handleVerify = (e: FormEvent) => {
    e.preventDefault();
    const code = tfaDigits.join('');
    if (code.length < 6) return;
    verify2FA(code);
  };

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    const newDigits = [...tfaDigits];
    newDigits[index] = digit;
    setTfaDigits(newDigits);
    clearError();

    if (digit && index < 5) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !tfaDigits[index] && index > 0) {
      digitRefs.current[index - 1]?.focus();
    }
  };

  const handleDigitPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newDigits = [...tfaDigits];
    for (let i = 0; i < 6; i++) {
      newDigits[i] = pasted[i] || '';
    }
    setTfaDigits(newDigits);
    const focusIndex = Math.min(pasted.length, 5);
    digitRefs.current[focusIndex]?.focus();
  };

  useEffect(() => {
    if (needs2FA) {
      setTfaDigits(['', '', '', '', '', '']);
      setTimeout(() => digitRefs.current[0]?.focus(), 100);
    }
  }, [needs2FA]);

  // Auto-submit when all 6 digits are filled
  useEffect(() => {
    const code = tfaDigits.join('');
    if (code.length === 6 && !isLoading) {
      verify2FA(code);
    }
  }, [tfaDigits]);

  return (
    <div className="h-screen flex bg-surface-950 relative overflow-hidden">
      {/* Left decorative panel */}
      <div className="hidden lg:flex lg:w-[480px] xl:w-[560px] relative bg-gradient-to-br from-accent-900/40 via-surface-900 to-surface-950 border-r border-surface-800/50 flex-col items-center justify-center p-12">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-20 -left-20 w-80 h-80 bg-accent-600/8 rounded-full blur-3xl" />
          <div className="absolute bottom-20 -right-20 w-80 h-80 bg-blue-600/8 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-accent-500/3 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 text-center">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-accent-500 to-blue-600 mb-8 shadow-2xl shadow-accent-500/20">
            <Shield size={48} className="text-white" />
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">VRC Studio</h1>
          <p className="text-surface-400 text-lg leading-relaxed max-w-sm">
            Your professional companion for managing and monitoring your VRChat experience.
          </p>

          <div className="mt-12 space-y-4 text-left">
            {[
              'Real-time friend tracking & notifications',
              'World browser & instance management',
              'Game log analysis & session history',
              'Discord Rich Presence integration',
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-3 text-surface-300">
                <div className="w-1.5 h-1.5 rounded-full bg-accent-500 flex-shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-6 text-xs text-surface-600">
          v1.0.0
        </div>
      </div>

      {/* Right login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-500 to-blue-600 mb-4 shadow-xl shadow-accent-500/20">
              <Shield size={32} className="text-white" />
            </div>
            <h1 className="text-2xl font-bold text-white">VRC Studio</h1>
          </div>

          {!needs2FA ? (
            <>
              <div className="mb-8">
                <h2 className="text-xl font-semibold text-white">Sign in</h2>
                <p className="text-sm text-surface-400 mt-1">
                  Use your VRChat credentials to get started
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div>
                  <label className="block text-xs font-medium text-surface-300 mb-2 uppercase tracking-wider">
                    Username or Email
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); clearError(); }}
                    className="input-field h-11"
                    placeholder="Enter your username or email"
                    autoFocus
                    disabled={isLoading}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-surface-300 mb-2 uppercase tracking-wider">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearError(); }}
                      className="input-field h-11 pr-11"
                      placeholder="Enter your password"
                      disabled={isLoading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-500 hover:text-surface-300 transition-colors"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || !username.trim() || !password.trim()}
                  className="btn-primary w-full h-11 flex items-center justify-center gap-2 text-sm font-semibold"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    'Sign In'
                  )}
                </button>

                <p className="text-xs text-center text-surface-500 leading-relaxed">
                  Your credentials are sent directly to VRChat's servers.
                  <br />We never store your password.
                </p>
              </form>
            </>
          ) : (
            <>
              <button
                onClick={() => {
                  useAuthStore.getState().clearError();
                  useAuthStore.setState({ needs2FA: false });
                  setTfaDigits(['', '', '', '', '', '']);
                }}
                className="flex items-center gap-2 text-surface-400 hover:text-white transition-colors mb-6 text-sm"
              >
                <ArrowLeft size={16} />
                Back to sign in
              </button>

              <div className="mb-8">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    twoFactorMethod === 'totp'
                      ? 'bg-accent-500/15 text-accent-400'
                      : 'bg-blue-500/15 text-blue-400'
                  }`}>
                    {twoFactorMethod === 'totp' ? <KeyRound size={20} /> : <Mail size={20} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Verification</h2>
                    <p className="text-xs text-surface-400">
                      {twoFactorMethod === 'totp' ? 'Authenticator app' : 'Email verification'}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-surface-400">
                  {twoFactorMethod === 'totp'
                    ? 'Enter the 6-digit code from your authenticator app.'
                    : 'Enter the 6-digit code sent to your email address.'}
                </p>
              </div>

              <form onSubmit={handleVerify} className="space-y-6">
                <div className="flex gap-2.5 justify-center" onPaste={handleDigitPaste}>
                  {tfaDigits.map((digit, i) => (
                    <input
                      key={i}
                      ref={el => { digitRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={e => handleDigitChange(i, e.target.value)}
                      onKeyDown={e => handleDigitKeyDown(i, e)}
                      disabled={isLoading}
                      className="w-12 h-14 text-center text-xl font-semibold font-mono bg-surface-800 border border-surface-700 rounded-xl text-white
                        focus:outline-none focus:ring-2 focus:ring-accent-500/50 focus:border-accent-500
                        disabled:opacity-50 transition-all"
                    />
                  ))}
                </div>

                {error && (
                  <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 flex items-start gap-2">
                    <div className="w-1 h-1 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading || tfaDigits.join('').length < 6}
                  className="btn-primary w-full h-11 flex items-center justify-center gap-2 text-sm font-semibold"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Verifying...
                    </>
                  ) : (
                    'Verify & Sign In'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
