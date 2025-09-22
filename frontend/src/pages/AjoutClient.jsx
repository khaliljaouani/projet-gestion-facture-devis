// src/pages/AjoutClient.jsx
import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { api } from '../apiBase';
import './AjouteClient.css';

export default function AjoutClient() {
  const [form, setForm] = useState({
    civilite: '',
    nom: '',
    prenom: '',
    type: '',
    adresse: '',
    codePostal: '',
    ville: '',
    email: '',
    telephone: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const token = localStorage.getItem('token');
    if (!token) {
      toast.error("⚠️ Vous n'êtes pas connecté. Veuillez vous reconnecter.");
      return;
    }

    // ⇨ adapte ici si ton backend attend d’autres clés
    const payload = {
      civilite: form.civilite,
      nom: form.nom,
      prenom: form.prenom,
      type: form.type,                 // 'particulier' | 'professionnel'
      adresse: form.adresse,
      code_postal: form.codePostal,    // snake_case côté back
      ville: form.ville,
      email: form.email,
      telephone: form.telephone,
    };

    try {
      await api.post('/clients', payload); // le token est injecté par l’interceptor
      toast.success('✅ Client ajouté avec succès !');
      setForm({
        civilite: '',
        nom: '',
        prenom: '',
        type: '',
        adresse: '',
        codePostal: '',
        ville: '',
        email: '',
        telephone: '',
      });
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err.message;
      console.error('❌ Erreur ajout client :', err);
      toast.error(`❌ Erreur lors de l'ajout du client : ${msg}`);
    }
  };

  return (
    <div className="ajout-client-container">
      <div className="card-title">
        <h2>Ajouter un nouveau client</h2>
      </div>

      <div className="card-form">
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Civilité</label>
              <select
                name="civilite"
                value={form.civilite}
                onChange={handleChange}
                
              >
                <option value="">Sélectionner</option>
                <option value="M.">M.</option>
                <option value="Mme">Mme</option>
                <option value="Mlle">Mlle</option>
              </select>
            </div>

            <div className="form-group">
              <label>Type</label>
              <select
                name="type"
                value={form.type}
                onChange={handleChange}
                required
              >
                <option value="">Sélectionner</option>
                <option value="particulier">Particulier</option>
                <option value="professionnel">Professionnel</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Nom</label>
              <input
                type="text"
                name="nom"
                value={form.nom}
                onChange={handleChange}
                required
              />
            </div>
            <div className="form-group">
              <label>Prénom</label>
              <input
                type="text"
                name="prenom"
                value={form.prenom}
                onChange={handleChange}
                
              />
            </div>
          </div>

          <div className="form-group">
            <label>Adresse</label>
            <input
              type="text"
              name="adresse"
              value={form.adresse}
              onChange={handleChange}
              
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Code postal</label>
              <input
                type="text"
                name="codePostal"
                value={form.codePostal}
                onChange={handleChange}
                
              />
            </div>
            <div className="form-group">
              <label>Ville</label>
              <input
                type="text"
                name="ville"
                value={form.ville}
                onChange={handleChange}
                
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>E-mail</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                
              />
            </div>
            <div className="form-group">
              <label>Téléphone</label>
              <input
                type="tel"
                name="telephone"
                value={form.telephone}
                onChange={handleChange}
                
              />
            </div>
          </div>

          <button type="submit" className="btn-save-full">
            Enregistrer
          </button>
        </form>
      </div>
    </div>
  );
}
