import { Lock, Shield } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

function Login({ onLogin }: { onLogin: () => void }) {
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const navigate = useNavigate();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Empty check
    if (!pin) {
      setErrorMessage('Please enter your PIN');
      return;
    }
    
    // Length validation
    if (pin.length < 4) {
      setErrorMessage('PIN must be at least 4 digits');
      return;
    }

    // Check stored PIN or use default
    const storedPin = localStorage.getItem('ireport_admin_pin') || '1234';
    
    if (pin === storedPin) {
      localStorage.setItem('ireport_admin_auth', 'true');
      onLogin();
      navigate('/dashboard');
    } else {
      setErrorMessage('Invalid PIN. Please try again.');
      setPin('');
    }
  };

  const handlePinChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow only numbers
    if (val === '' || /^\d+$/.test(val)) {
      setPin(val);
      setErrorMessage('');
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="bg-blue-600 p-8 text-center">
          <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white">iReport Admin</h1>
          <p className="text-blue-100 mt-2">Secure Access Portal</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleLogin}>
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Enter Access PIN
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="password"
                  value={pin}
                  onChange={handlePinChange}
                  maxLength={6}
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:outline-none focus:ring-2 transition-colors ${
                    errorMessage
                      ? 'border-red-300 focus:ring-red-200 bg-red-50'
                      : 'border-gray-200 focus:ring-blue-200 focus:border-blue-500'
                  }`}
                  placeholder="••••"
                  autoFocus
                />
              </div>
              {errorMessage && (
                <p className="text-red-500 text-sm mt-2">
                  {errorMessage}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors"
            >
              Access Dashboard
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400">
              Authorized personnel only. All access is logged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
