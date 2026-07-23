// App.tsx
import { useState } from "react";
import SwitchPage from "./components/Switch-CiscoPage";
import RouterPage from "./components/Router-CiscoPage";
import { UserManagement } from "./components/UserManagement";
import { Login } from "./components/Login";


const BACKEND_URL = "";

export default function App() {
  const [role, setRole] = useState<string | null>(localStorage.getItem("role"));
  const [username, setUsername] = useState<string | null>(localStorage.getItem("username"));

  const [activeTab, setActiveTab] = useState<"provision" | "users">("provision");
  const [deviceType, setDeviceType] = useState("switch");
  const [vendor, setVendor] = useState("cisco");

  const vendorsByDevice: Record<string, string[]> = {
    switch: ["cisco", "juniper", "arista"],
    router: ["cisco", "fortinet", "vyos"]
  };

  const handleDeviceTypeChange = (type: string) => {
    setDeviceType(type);
    const available = vendorsByDevice[type] || ["cisco"];
    if (!available.includes(vendor)) {
      setVendor(available[0]);
    }
  };

  const handleLoginSuccess = (newRole: string, newUsername: string) => {
    setRole(newRole);
    setUsername(newUsername);
  };

  const handleLogout = async () => {
    try {
      await fetch(`${BACKEND_URL}/api/v1/auth/logout`, {
        method: "POST",
        credentials: "include"
      });
    } catch (e) {}
    localStorage.removeItem("role");
    localStorage.removeItem("username");
    setRole(null);
    setUsername(null);
  };

  if (!role) {
    return <Login onLoginSuccess={handleLoginSuccess} backendUrl={BACKEND_URL} />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased pb-12">
      
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <div className="flex items-center space-x-3">
            <div className="h-3 w-3 bg-blue-500 rounded-full animate-pulse" />
            <h1 className="text-xl font-bold tracking-wider bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent m-0">
              ANSIBLE AUTOMATION TOOL
            </h1>
          </div>

          {/* MENUS NAV */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("provision")}
              className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                activeTab === "provision" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
              }`}
            >
              ⚙️ Provisioning
            </button>
            {role === "admin" && (
              <button
                onClick={() => setActiveTab("users")}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold transition ${
                  activeTab === "users" ? "bg-blue-600 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                👥 User Management
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4 font-mono text-xs">
          <span className="text-slate-400">
            User: <strong className="text-cyan-400">{username}</strong> ({role?.toUpperCase()})
          </span>
          <button
            onClick={handleLogout}
            className="px-3 py-1 bg-red-600/80 hover:bg-red-600 rounded transition text-white cursor-pointer"
          >
            Deconnexion
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-8 px-4 space-y-8">
        
        {activeTab === "users" && role === "admin" ? (
          <UserManagement backendUrl={BACKEND_URL} />
        ) : (
          <>
            {/* SELECTEUR SEQUENTIEL */}
            <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-cyan-400 mb-3">
                  1. Device Type
                </label>
                <div className="flex gap-2">
                  {["switch", "router"].map((type) => (
                    <button
                      key={type}
                      onClick={() => handleDeviceTypeChange(type)}
                      className={`px-6 py-2.5 text-sm font-semibold rounded-lg border transition-all cursor-pointer capitalize ${
                        deviceType === type 
                          ? "bg-blue-600/20 border-blue-500 text-blue-400 shadow-lg shadow-blue-500/10" 
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase tracking-wider text-cyan-400 mb-3">
                  2. Vendor ({deviceType.toUpperCase()})
                </label>
                <div className="flex gap-2">
                  {(vendorsByDevice[deviceType] || []).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVendor(v.toLowerCase())}
                      className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all cursor-pointer capitalize ${
                        vendor === v.toLowerCase() 
                          ? "bg-cyan-600/20 border-cyan-500 text-cyan-400 shadow-md shadow-cyan-500/10" 
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* RENDU DES COMPOSANTS */}
            <div className={deviceType === "switch" && vendor === "cisco" ? "block" : "hidden"}>
              <SwitchPage backendUrl={BACKEND_URL} userRole={role} />
            </div>

            <div className={deviceType === "router" && vendor === "cisco" ? "block" : "hidden"}>
              <RouterPage backendUrl={BACKEND_URL} userRole={role} />
            </div>

            {vendor !== "cisco" && (
              <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center text-slate-400 text-sm">
                ⚠️ Les playbooks Ansible pour <strong>{vendor.toUpperCase()} ({deviceType.toUpperCase()})</strong> ne sont pas encore integres.
              </div>
            )}
          </>
        )}

      </main>
    </div>
  );
}