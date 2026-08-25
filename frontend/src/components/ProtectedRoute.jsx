import React from 'react';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, allowedUserTypes }) => {
  const accessToken = localStorage.getItem('access_token');
  const userType = localStorage.getItem('user_type');

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  if (allowedUserTypes && !allowedUserTypes.includes(userType)) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;

