import axios from "axios";
import { secureStorage } from "@/utils/secureStorage";
import { getLoginFallbackUrl } from "@/utils/programInternalRedirect";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:5103/api",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = secureStorage.getItem("auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const fallbackUrl = getLoginFallbackUrl();
      secureStorage.removeItem("auth_token");
      secureStorage.removeItem("user_name");
      secureStorage.removeItem("user_role");
      window.location.href = fallbackUrl;
    }
    return Promise.reject(err);
  }
);

export default api;
