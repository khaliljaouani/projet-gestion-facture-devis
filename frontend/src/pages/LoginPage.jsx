import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api } from "../apiBase";   // ou "../apibase" si ton fichier est en minuscule
// ou "./apibase" selon le chemin
import 'bootstrap/dist/css/bootstrap.min.css';

const LoginPage = ({ setUser }) => {
  const [username, setUsername] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  // si tu utilises des routes protégées, on revient vers la page d'origine
  const redirectTo = location.state?.from?.pathname || '/app';

  const handleLogin = async (e) => {
    e.preventDefault();
    if (loading) return;

    try {
      setLoading(true);

      // ATTENDU côté backend: { token, user: {...} }
      const { data } = await api.post('/auth/login', {
        nom_utilisateur: username.trim(),
        mot_de_passe: motDePasse,
      });

      const token = data?.token;
      const user  = data?.user;

      if (!token) {
        toast.error("Réponse invalide du serveur (token manquant).");
        return;
      }

      // Stocke le JWT (l’interceptor axios lira dans localStorage)
      
      localStorage.setItem('token', token);
      if (user) localStorage.setItem('role', user.role || '');

      // Optionnel: mémoriser l'utilisateur dans ton state global
      setUser?.(user || null);

      toast.success("Connexion réussie !");
      navigate(redirectTo, { replace: true });
    } catch (err) {
      const code = err?.response?.status;
      if (code === 401) {
        toast.error("Identifiants incorrects.");
      } else {
        toast.error("Connexion impossible. Vérifie le serveur API.");
      }
      console.error('❌ Erreur de connexion :', err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
      <div className="card p-5 shadow" style={{ width: 420 }}>
        <h3 className="text-center mb-4">🔐 Connexion</h3>
        <form onSubmit={handleLogin}>
          <div className="form-group mb-3">
            <label htmlFor="username">Nom d'utilisateur</label>
            <input
              id="username"
              className="form-control"
              placeholder="ex: djamel_mechmache"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              disabled={loading}
            />
          </div>

          <div className="form-group mb-4">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              className="form-control"
              placeholder="••••••••"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              autoComplete="current-password"
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-primary w-100 mb-3" disabled={loading}>
            {loading ? 'Connexion…' : '✅ Se connecter'}
          </button>

          <div className="text-center">
            <small>
              Pas encore de compte ? <Link to="/register">Inscrivez-vous</Link>
            </small>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;
