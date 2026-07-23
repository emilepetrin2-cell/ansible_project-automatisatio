import React, { useState, useEffect } from "react";

interface UserItem {
  id: number;
  username: string;
  role: string;
}

export const UserManagement: React.FC<{ backendUrl: string }> = ({ backendUrl }) => {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState("operator");
  
  const [editUser, setEditUser] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState("");

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // LA LECTURE DU TOKEN DANS LE LOCALSTORAGE A ETE SUPPRIMEE ICI

  const fetchUsers = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/v1/users`, {
        method: "GET",
        credentials: "include", // Demande au navigateur d'envoyer le Cookie HttpOnly
      });
      const data = await res.json();
      if (res.ok) {
        setUsers(data);
        setError(null);
      } else {
        setError(data.detail || "Erreur chargement utilisateurs.");
      }
    } catch (err: any) {
      setError("Erreur réseau ou serveur inaccessible.");
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/api/v1/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur de creation");

      setMessage(data.message);
      setNewUsername("");
      setNewPassword("");
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdatePassword = async (username: string) => {
    if (!editPassword) return;
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/api/v1/users/${username}/password`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ new_password: editPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur modification");

      setMessage(data.message);
      setEditUser(null);
      setEditPassword("");
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (username: string) => {
    if (!window.confirm(`Supprimer l'utilisateur ${username} ?`)) return;
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`${backendUrl}/api/v1/users/${username}`, {
        method: "DELETE",
        credentials: "include",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Erreur suppression");

      setMessage(data.message);
      fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-cyan-400 font-mono">👥 User & Access Control Management (RBAC)</h2>

      {message && <div className="p-3 bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 rounded text-xs font-mono">{message}</div>}
      {error && <div className="p-3 bg-red-950/80 border border-red-500/50 text-red-200 rounded text-xs font-mono">{error}</div>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* FORMULAIRE CREATION */}
        <form onSubmit={handleCreateUser} className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-xl">
          <h3 className="text-sm font-mono uppercase text-blue-400 border-b border-slate-800 pb-2">+ Add New User</h3>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Username</label>
            <input type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Password</label>
            <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200" />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Role</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-1.5 text-xs text-slate-200">
              <option value="admin">admin (Full Control)</option>
              <option value="operator">operator (Deploy Only)</option>
              <option value="auditor">auditor (Read-Only)</option>
            </select>
          </div>
          <button type="submit" className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2 rounded text-xs transition cursor-pointer">
            Create User Account
          </button>
        </form>

        {/* LISTE DES UTILISATEURS */}
        <div className="md:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl space-y-4">
          <h3 className="text-sm font-mono uppercase text-blue-400 border-b border-slate-800 pb-2">Active Accounts List</h3>
          
          <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950 text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-800/40 text-[11px] font-mono text-slate-400 border-b border-slate-800">
                  <th className="p-2.5 pl-4">Username</th>
                  <th className="p-2.5">Role</th>
                  <th className="p-2.5 text-right pr-4">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-900">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-900/40">
                    <td className="p-2.5 pl-4 font-mono font-bold text-slate-200">{u.username}</td>
                    <td className="p-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        u.role === "admin" ? "bg-red-950 border border-red-800 text-red-400" :
                        u.role === "operator" ? "bg-blue-950 border border-blue-800 text-blue-400" :
                        "bg-slate-800 text-slate-400"
                      }`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="p-2.5 text-right pr-4 space-x-2">
                      {editUser === u.username ? (
                        <div className="inline-flex gap-1 items-center">
                          <input type="password" placeholder="New Password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} className="bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white" />
                          <button onClick={() => handleUpdatePassword(u.username)} className="bg-emerald-600 text-white px-2 py-0.5 rounded text-[10px]">Save</button>
                          <button onClick={() => setEditUser(null)} className="text-slate-400 text-[10px]">Cancel</button>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => setEditUser(u.username)} className="text-cyan-400 hover:text-cyan-300 text-[11px] font-mono cursor-pointer">
                            ✏️ Password
                          </button>
                          {u.username !== "admin" && (
                            <button onClick={() => handleDeleteUser(u.username)} className="text-red-400 hover:text-red-300 text-[11px] font-mono cursor-pointer">
                              ✕ Delete
                            </button>
                          )}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};