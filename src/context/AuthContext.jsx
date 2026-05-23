import { createContext, useContext, useState, useEffect } from 'react';
import { loginUser } from '../services/api';

const AuthContext = createContext();

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load session from localStorage on app start
  useEffect(() => {
    const storedToken = localStorage.getItem('jwt_token');
    const storedUser = localStorage.getItem('user_data');

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    try {
      const response = await loginUser({ email, password });
      
      const loggedInUser = response.data.user;
      const jwtToken = response.token;

      // Save to state
      setUser(loggedInUser);
      setToken(jwtToken);

      // Persist to localStorage
      localStorage.setItem('jwt_token', jwtToken);
      localStorage.setItem('user_data', JSON.stringify(loggedInUser));

      return { success: true };
    } catch (error) {
      return { success: false, message: error.message };
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('jwt_token');
    localStorage.removeItem('user_data');
  };

  if (loading) {
    // Prevent rendering app until auth state is confirmed
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-brand-600"></div>
    </div>;
  }

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
