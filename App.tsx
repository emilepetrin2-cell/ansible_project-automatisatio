// App.tsx
import { useState } from "react";
import SwitchPage from "./components/Switch-CiscoPage";
import RouterPage from "./components/Router-CiscoPage";

const BACKEND_URL = "http://192.168.48.131:8000"; 

export default function App() {
  const [deviceType, setDeviceType] = useState("switch");
  const [vendor, setVendor] = useState("cisco");

  // Liste des vendors disponibles selon l'appareil sélectionné
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

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased pb-12">
      
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur px-8 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="h-3 w-3 bg-blue-500 rounded-full animate-pulse" />
          <h1 className="text-xl font-bold tracking-wider bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent m-0">
            ANSIBLE AUTOMATION TOOL
          </h1>
        </div>
        <div className="text-xs text-slate-500 font-mono">PRO MODE</div>
      </header>

      <main className="max-w-6xl mx-auto mt-8 px-4 space-y-8">
        
        {/* SÉLECTEUR SÉQUENTIEL (DEVICE TYPE -> VENDOR) */}
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

        {/* RENDU PERMANENT MAIS MASQUÉ SI NON SÉLECTIONNÉ */}
        {/* Cela préserve l'état et toutes les données saisies dans les formulaires */}
        <div className={deviceType === "switch" && vendor === "cisco" ? "block" : "hidden"}>
          <SwitchPage backendUrl={BACKEND_URL} />
        </div>

        <div className={deviceType === "router" && vendor === "cisco" ? "block" : "hidden"}>
          <RouterPage backendUrl={BACKEND_URL} />
        </div>

        {vendor !== "cisco" && (
          <div className="p-8 bg-slate-900 border border-slate-800 rounded-xl text-center text-slate-400 text-sm">
            ⚠️ Les playbooks Ansible pour <strong>{vendor.toUpperCase()} ({deviceType.toUpperCase()})</strong> ne sont pas encore intégrés.
          </div>
        )}

      </main>
    </div>
  );
}