import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { api } from "../apiBase"; // ou "./apibase" selon le chemin

const RegisterPage = () => {
  const [prenom, setPrenom] = useState('');
  const [nom, setNom] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const norm = (s = '') =>
    s.toString().trim()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '');

  const makeUsername = (p, n) => `${norm(p)}_${norm(n)}`.replace(/^_+|_+$/g, '');
  const usernamePreview = makeUsername(prenom, nom);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    if (!prenom || !nom) return toast.error('Prénom et Nom requis');
    if (!motDePasse || motDePasse.length < 2) return toast.error('Mot de passe trop court');
    if (motDePasse !== confirm) return toast.error('Les mots de passe ne correspondent pas');

    try {
      setLoading(true);

      // ⚠️ le backend attend nom_utilisateur + mot_de_passe
      const payload = {
        nom_utilisateur: usernamePreview,
        mot_de_passe: motDePasse,
        // facultatif si ton contrôleur les accepte :
        prenom,
        nom,
        role: 'admin', // ou 'manager' / 'user' selon ton besoin
      };

      const { data } = await api.post('/auth/register', payload);

      const createdUsername =
        data?.user?.username ??
        data?.user?.nom_utilisateur ??
        usernamePreview;

      // si le backend renvoie déjà un token, on peut le stocker, sinon on redirige vers /login
      if (data?.token) localStorage.setItem('token', data.token);

      toast.success(`Compte créé : ${createdUsername}. Vous pouvez vous connecter.`);
      navigate('/login', { replace: true });
    } catch (err) {
      const msg = err?.response?.data?.error || 'Erreur lors de la création du compte';
      toast.error(msg);
      console.error('❌ Erreur inscription :', err?.response?.data || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="d-flex justify-content-center align-items-center vh-100 bg-light">
      <div className="card p-5 shadow" style={{ width: 480 }}>
        <h3 className="text-center mb-4">📝 Inscription</h3>
        <form onSubmit={handleSubmit}>
          <div className="row">
            <div className="col-md-6 mb-3">
              <label>Prénom</label>
              <input
                className="form-control"
                value={prenom}
                onChange={(e) => setPrenom(e.target.value)}
                required
                disabled={loading}
              />
            </div>
            <div className="col-md-6 mb-3">
              <label>Nom</label>
              <input
                className="form-control"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
                required
                disabled={loading}
              />
            </div>
          </div>

          <div className="mb-2">
            <small className="text-muted">
              Le nom d’utilisateur sera : <strong>{usernamePreview || 'prenom_nom'}</strong>
            </small>
          </div>

          <div className="mb-3">
            <label>Mot de passe</label>
            <input
              type="password"
              className="form-control"
              value={motDePasse}
              onChange={(e) => setMotDePasse(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="mb-4">
            <label>Confirmer le mot de passe</label>
            <input
              type="password"
              className="form-control"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <button className="btn btn-success w-100 mb-3" disabled={loading}>
            {loading ? 'Création…' : 'Créer le compte'}
          </button>

          <div className="text-center">
            <small>
              Déjà un compte ? <Link to="/login">Se connecter</Link>
            </small>
          </div>
        </form>
      </div>
    </div>
  );
};

export default RegisterPage;
