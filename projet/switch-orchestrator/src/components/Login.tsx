import React, { useState } from 'react';

interface LoginProps {
  // Adaptation : suppression du paramtre token si tu utilises uniquement des cookies HTTP-Only
  onLoginSuccess: (role: string, username: string) => void;
  backendUrl?: string; // Utile pour le dev local (ex: "http://localhost:8000")
}

export const Login: React.FC<LoginProps> = ({ 
  onLoginSuccess, 
  backendUrl = "" // Par dfaut vide pour passer par le reverse proxy Nginx
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    try {
      // Si backendUrl = "", la requte est envoye vers /api/v1/auth/login
      const response = await fetch(`${backendUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include', // Ncessaire pour recevoir et renvoyer le cookie HttpOnly
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('Trop de tentatives. Veuillez attendre 1 minute.');
        }
        throw new Error('Identifiants invalides');
      }

      const data = await response.json();
      
      localStorage.setItem('role', data.role);
      localStorage.setItem('username', data.username);

      onLoginSuccess(data.role, data.username);
    } catch (err: any) {
      setError(err.message || 'Erreur de connexion');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
      <form onSubmit={handleSubmit} className="p-8 bg-gray-800 rounded-xl shadow-lg w-96 space-y-4 border border-gray-700">
        <h2 className="text-2xl font-bold text-center mb-6">Connexion Network Automation</h2>
        {error && <div className="p-2 bg-red-500/20 border border-red-500 text-red-300 rounded text-sm text-center">{error}</div>}
        <div>
          <label className="block text-sm mb-1 text-gray-300">Nom d'utilisateur</label>
          <input
            type="text"
            className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-blue-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-gray-300">Mot de passe</label>
          <input
            type="password"
            className="w-full p-2 rounded bg-gray-700 text-white border border-gray-600 focus:outline-none focus:border-blue-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="w-full py-2 bg-blue-600 hover:bg-blue-700 transition rounded font-semibold text-white mt-4"
        >
          Se connecter
        </button>
      </form>
    </div>
  );
};