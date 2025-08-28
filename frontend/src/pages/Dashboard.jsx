import React, { useState } from 'react';
import axios from 'axios';

export default function Dashboard(){
  const [status, setStatus] = useState('Inconnu');

  const API_URL =
    (import.meta.env && import.meta.env.VITE_API_URL)
    || (import.meta.env && import.meta.env.DEV ? 'http://localhost:4001' : window.location.origin);

  const ping = async () => {
    try {
      const { data } = await axios.get(`${API_URL}/health`);
      setStatus(data.ok ? '✅ Backend OK' : '❌ Backend KO');
    } catch {
      setStatus('❌ Backend KO');
    }
  };

  return (
    <div className="container py-5">
      <h2>📊 Dashboard</h2>
      <button className="btn btn-primary" onClick={ping}>Tester le backend</button>
      <div className="mt-3">{status}</div>
    </div>
  );
}
