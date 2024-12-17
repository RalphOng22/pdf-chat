import { useAuth } from '../context/AuthContext.jsx'
import { Navigate } from 'react-router-dom'

export const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return <div>Loading...</div>
  }

  if (!user) {
    return <Navigate to="/login" />
  }

  return children
}
