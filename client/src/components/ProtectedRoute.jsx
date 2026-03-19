import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Protected Route Component
 * @param {Object} props
 * @param {React.ReactNode} props.children - Child components to render if authorized
 * @param {boolean} props.requireAdmin - Whether admin role is required
 */
export default function ProtectedRoute({ children, requireAdmin = false }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner"></div>
        <style>{`
          .loading-container {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 200px;
          }
          .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid #f3f3f3;
            border-top: 3px solid #667eea;
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  // Not logged in
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Admin required but user is not admin
  if (requireAdmin && !isAdmin) {
    return (
      <div className="access-denied">
        <h2>访问被拒绝</h2>
        <p>您没有权限访问此页面，需要管理员权限。</p>
        <style>{`
          .access-denied {
            text-align: center;
            padding: 60px 20px;
          }
          .access-denied h2 {
            color: #e74c3c;
            margin-bottom: 10px;
          }
          .access-denied p {
            color: #666;
          }
        `}</style>
      </div>
    );
  }

  return children;
}
