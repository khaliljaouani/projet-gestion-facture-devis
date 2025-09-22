// frontend/src/apibase.js
import axios from "axios";

const RAW = import.meta.env.VITE_API_URL || "http://localhost:4001";
const base = RAW.replace(/^https:/, "http:").replace(/\/+$/, "");
export const baseURL = base.endsWith("/api") ? base : `${base}/api`;

export const api = axios.create({ baseURL });

// ✅ avant chaque requête, ajoute le token si présent
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ✅ si le serveur renvoie 401 = non autorisé → on redirige vers /login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("token");
      if (!location.hash.includes("#/login")) {
        location.hash = "#/login";
      }
    }
    return Promise.reject(err);
  }
);

// juste pour debug
if (typeof window !== "undefined") {
  console.log("API baseURL →", baseURL);
}
