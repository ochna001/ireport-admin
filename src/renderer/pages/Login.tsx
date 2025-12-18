import { Lock, Shield, Mail, KeyRound, Flame, Waves, ArrowLeft } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

type Role = 'admin' | 'chief' | 'officer';

function Login({ onLogin }: { onLogin: () => void }) {
  const [view, setView] = useState<'selection' | 'login'>('selection');
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  const emailInputRef = useRef<HTMLInputElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const navigate = useNavigate();

  useEffect(() => {
    window.api.focusWindow?.().catch(() => {});
  }, [view, selectedRole]);

  const handleRoleSelect = (role: Role) => {
    setSelectedRole(role);
    setView('login');
    setErrorMessage('');
    setEmail('');
    setPassword('');
    setPin('');
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    
    if (selectedRole === 'admin') {
      // Admin: PIN only (default 1234)
      if (!pin) {
        setErrorMessage('Please enter your PIN');
        return;
      }
      if (pin.length < 4) {
        setErrorMessage('PIN must be at least 4 digits');
        return;
      }

      const storedPin = localStorage.getItem('ireport_admin_pin') || '1234';
      if (pin !== storedPin) {
        setErrorMessage('Invalid PIN. Please try again.');
        setPin('');
        return;
      }

      // Clear backend caches to avoid stale scoped data
      window.api.logout?.().catch(() => {});

      localStorage.setItem('ireport_admin_auth', 'true');
      localStorage.setItem('ireport_admin_current_user', JSON.stringify({ role: 'Admin' }));
      onLogin();
      navigate('/dashboard');
      return;
    }

    // Chief & Officer: Supabase auth (email + password)
    if (!email.trim()) {
      setErrorMessage('Please enter your email');
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password');
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();
    const loginMethod = selectedRole === 'chief' ? window.api.loginChief : window.api.loginOfficer;
    loginMethod({ email: normalizedEmail, password })
      .then((profile) => {
        // Clear backend caches to avoid stale scoped data
        window.api.logout?.().catch(() => {});

        localStorage.setItem('ireport_admin_auth', 'true');
        localStorage.setItem('ireport_admin_current_user', JSON.stringify(profile));
        onLogin();
        navigate('/dashboard');
      })
      .catch((err: any) => {
        console.error('Login failed:', err);
        // Clean up error message
        let msg = err?.message || 'Login failed. Please check your credentials.';
        if (msg.includes('Error invoking remote method')) {
          const parts = msg.split('Error:');
          msg = parts.length > 1 ? parts[parts.length - 1].trim() : msg;
        }
        setErrorMessage(msg);
      });
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow only numbers
    if (val === '' || /^\d+$/.test(val)) {
      setPin(val);
      setErrorMessage('');
    }
  };

  // Render Role Selection Screen
  if (view === 'selection') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
          {/* Header */}
          <div className="bg-blue-600 p-8 text-center">
            <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="text-white w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-white">iReport Management</h1>
            <p className="text-blue-100 mt-2">Camarines Norte LGU</p>
          </div>

          {/* Body */}
          <div className="p-8">
            <p className="text-center text-gray-600 mb-6">Select your role to continue</p>
            
            <div className="space-y-3">
              <button
                onClick={() => handleRoleSelect('admin')}
                className="w-full flex items-center p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
              >
                <div className="w-10 h-10 bg-gray-900 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Lock className="text-white w-5 h-5" />
                </div>
                <div className="ml-4 text-left">
                  <h3 className="font-semibold text-gray-900">System Admin</h3>
                  <p className="text-xs text-gray-500">Full system access with PIN</p>
                </div>
              </button>

              <button
                onClick={() => handleRoleSelect('chief')}
                className="w-full flex items-center p-4 border border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all group"
              >
                <div className="w-10 h-10 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Shield className="text-white w-5 h-5" />
                </div>
                <div className="ml-4 text-left">
                  <h3 className="font-semibold text-gray-900">Agency Chief</h3>
                  <p className="text-xs text-gray-500">Agency management access</p>
                </div>
              </button>

              <button
                onClick={() => handleRoleSelect('officer')}
                className="w-full flex items-center p-4 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group"
              >
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Mail className="text-white w-5 h-5" />
                </div>
                <div className="ml-4 text-left">
                  <h3 className="font-semibold text-gray-900">Desk Officer</h3>
                  <p className="text-xs text-gray-500">Incident handling access</p>
                </div>
              </button>
            </div>

            <div className="mt-8 text-center">
              <p className="text-xs text-gray-400">
                Authorized personnel only. All access is logged.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Login Form Screen
  const getRoleTitle = () => {
    switch (selectedRole) {
      case 'admin': return 'System Admin Login';
      case 'chief': return 'Agency Chief Login';
      case 'officer': return 'Desk Officer Login';
      default: return 'Login';
    }
  };

  const getRoleSubtitle = () => {
    switch (selectedRole) {
      case 'admin': return 'Full System Access';
      case 'chief': return 'Agency Management Access';
      case 'officer': return 'Incident Handling Access';
      default: return 'Secure Access';
    }
  };

  const isEmailLogin = selectedRole === 'chief' || selectedRole === 'officer';

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-blue-600 p-8 text-center">
          <div className="flex justify-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Shield className="text-white w-5 h-5" />
            </div>
            <div className="w-10 h-10 bg-red-500 rounded-lg flex items-center justify-center">
              <Flame className="text-white w-5 h-5" />
            </div>
            <div className="w-10 h-10 bg-teal-500 rounded-lg flex items-center justify-center">
              <Waves className="text-white w-5 h-5" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white">{getRoleTitle()}</h1>
          <p className="text-blue-100 mt-2">{getRoleSubtitle()}</p>
        </div>

        {/* Body */}
        <div className="p-8">
          <form onSubmit={handleLogin}>
            {isEmailLogin ? (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                    <input
                      ref={emailInputRef}
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setErrorMessage('');
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      autoFocus
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                        errorMessage 
                          ? 'border-red-300 focus:ring-red-200 focus:border-red-500' 
                          : 'border-gray-200 focus:ring-blue-200 focus:border-blue-500'
                      }`}
                      placeholder={selectedRole === 'chief' ? "chief@agency.gov.ph" : "officer@agency.gov.ph"}
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setErrorMessage('');
                      }}
                      onFocus={(e) => e.currentTarget.select()}
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                        errorMessage 
                          ? 'border-red-300 focus:ring-red-200 focus:border-red-500' 
                          : 'border-gray-200 focus:ring-blue-200 focus:border-blue-500'
                      }`}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </>
            ) : (
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Enter Access PIN
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 pointer-events-none" />
                  <input
                    ref={pinInputRef}
                    type="password"
                    value={pin}
                    onChange={handlePinChange}
                    onFocus={(e) => e.currentTarget.select()}
                    autoFocus
                    maxLength={6}
                    className="w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-colors border-gray-200 focus:ring-blue-200 focus:border-blue-500"
                    placeholder="••••"
                  />
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-red-600 text-sm">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Sign In
            </button>
          </form>

          <div className="mt-6 flex flex-col items-center gap-4">
            <div className="text-sm text-gray-500">
               {/* Quick role switchers */}
               {selectedRole !== 'chief' && (
                 <button onClick={() => handleRoleSelect('chief')} className="text-blue-600 hover:underline mx-2">Chief Login</button>
               )}
               {selectedRole !== 'admin' && (
                 <button onClick={() => handleRoleSelect('admin')} className="text-blue-600 hover:underline mx-2">Admin Login</button>
               )}
               {selectedRole !== 'officer' && (
                 <button onClick={() => handleRoleSelect('officer')} className="text-blue-600 hover:underline mx-2">Officer Login</button>
               )}
            </div>

            <button
              onClick={() => setView('selection')}
              className="flex items-center text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back to role selection
            </button>
            
            <p className="text-xs text-gray-400 mt-2">
              Use your agency credentials to sign in.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
