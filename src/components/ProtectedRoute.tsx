import { Navigate } from "react-router-dom";

interface Props {
  children: JSX.Element;
}

export const ProtectedRoute = ({ children }: Props) => {
  // Ambil token langsung dari localStorage
  const token = localStorage.getItem("auth_token");

  console.log("ProtectedRoute token:", token); // debugging

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};
