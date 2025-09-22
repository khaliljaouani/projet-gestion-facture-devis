import { Navigate } from 'react-router-dom';

const PrivateRoute = ({ user, children }) => {
  const token = localStorage.getItem('token');
  if (!token || !user) return <Navigate to="/login" replace />;
  return children;
};

export default PrivateRoute;
