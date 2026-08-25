import React, { useState } from 'react';
import './Login.css';

const Login = () => {
  const [userType, setUserType] = useState('customer'); // 'customer' or 'owner'
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
        console.log(formData.email);
      const endpoint = userType === 'customer' 
        ? `${import.meta.env.VITE_BACKEND_URL}/api/customers/login`
        : `${import.meta.env.VITE_BACKEND_URL}/api/owners/login`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          customer_email: formData.email,
          customer_password: formData.password,
          ...(userType === 'owner' && {
            shop_email: formData.email,
            shop_password: formData.password
          })
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Store tokens
        localStorage.setItem('access_token', data.data.access_token);
        localStorage.setItem('refresh_token', data.data.refresh_token);
        localStorage.setItem('user_type', userType);
        localStorage.setItem('user_data', JSON.stringify(data.data.customer || data.data.shop));
        
        // Redirect based on user type
        window.location.href = userType === 'customer' ? '/customer/dashboard' : '/shop/dashboard';
      } else {
        setError(data.message || 'Login failed. Please try again.');
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleUserType = () => {
    setUserType(userType === 'customer' ? 'owner' : 'customer');
    setFormData({ email: '', password: '' });
    setError('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>ShopMate</h1>
          <p>Welcome back! Please login to continue.</p>
        </div>

        <div className="toggle-container">
          <button
            className={`toggle-btn ${userType === 'customer' ? 'active' : ''}`}
            onClick={() => setUserType('customer')}
          >
            Customer
          </button>
          <button
            className={`toggle-btn ${userType === 'owner' ? 'active' : ''}`}
            onClick={() => setUserType('owner')}
          >
            Shop Owner
          </button>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="email">
              {userType === 'customer' ? 'Customer Email' : 'Shop Email'}
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder={`Enter your ${userType === 'customer' ? 'customer' : 'shop'} email`}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Logging in...' : `Login as ${userType === 'customer' ? 'Customer' : 'Shop Owner'}`}
          </button>
        </form>

        <div className="login-footer">
          <p>
            {userType === 'customer' 
              ? "Don't have an account?" 
              : "Don't have a shop account?"}
            <a href={userType === 'customer' ? '/register/customer' : '/register/owner'}>
              {userType === 'customer' ? ' Register as Customer' : ' Register your Shop'}
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Login;

