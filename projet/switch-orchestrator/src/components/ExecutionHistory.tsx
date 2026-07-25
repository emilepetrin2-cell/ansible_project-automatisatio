import React, { useState, useEffect } from 'react';

interface HistoryLog {
  id: number;
  task_id: string;
  username: string;
  action_type: string;
  target_host: string;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface LogDetail extends HistoryLog {
  stdout: string | null;
  stderr: string | null;
}

export const ExecutionHistory: React.FC = () => {
  const [logs, setLogs] = useState<HistoryLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLog, setSelectedLog] = useState<LogDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/history?limit=50', {
        headers: {
          'Content-Type': 'application/json',
        },
      });
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch (error) {
      console.error("Erreur lors de la recuperation de l'historique :", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogDetail = async (logId: number) => {
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/v1/history/${logId}`);
      if (response.ok) {
        const data = await response.json();
        setSelectedLog(data);
      }
    } catch (error) {
      console.error("Erreur lors de la recuperation des details :", error);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return <span className="px-2 py-1 bg-green-900 text-green-300 rounded text-xs font-semibold">SUCCESS</span>;
      case 'FAILED':
        return <span className="px-2 py-1 bg-red-900 text-red-300 rounded text-xs font-semibold">FAILED</span>;
      case 'RUNNING':
        return <span className="px-2 py-1 bg-blue-900 text-blue-300 rounded text-xs font-semibold animate-pulse">RUNNING</span>;
      default:
        return <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs font-semibold">PENDING</span>;
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto text-gray-200">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">Historique des deploiements (Audit Logs)</h2>
        <button
          onClick={fetchHistory}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded text-sm transition"
        >
          Rafraichir
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10">Chargement de l'historique...</div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden shadow">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-800 text-slate-400 border-b border-slate-700">
                <th className="p-3">ID</th>
                <th className="p-3">Utilisateur</th>
                <th className="p-3">Action</th>
                <th className="p-3">Cible</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-slate-800 hover:bg-slate-800/50 transition">
                  <td className="p-3 font-mono text-slate-400">#{log.id}</td>
                  <td className="p-3 font-semibold">{log.username}</td>
                  <td className="p-3 font-mono text-blue-400">{log.action_type}</td>
                  <td className="p-3 font-mono">{log.target_host}</td>
                  <td className="p-3">{getStatusBadge(log.status)}</td>
                  <td className="p-3 text-slate-400 text-xs">
                    {new Date(log.created_at.endsWith('Z') ? log.created_at : log.created_at + 'Z').toLocaleString()}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => fetchLogDetail(log.id)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium"
                    >
                      Voir les logs
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedLog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-4xl max-h-[80vh] flex flex-col shadow-xl">
            <div className="p-4 border-b border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-lg">
                  Detail du Log #{selectedLog.id} - {selectedLog.action_type}
                </h3>
                <p className="text-xs text-slate-400 font-mono">Cible: {selectedLog.target_host} | Execute par: {selectedLog.username}</p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-slate-400 hover:text-white font-bold text-xl"
              >
                &times;
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 font-mono text-xs bg-slate-950">
              {detailLoading ? (
                <div>Chargement de la sortie Ansible...</div>
              ) : (
                <>
                  {selectedLog.stdout && (
                    <div className="mb-4">
                      <div className="text-green-400 font-bold mb-1">=== STDOUT (Ansible Output) ===</div>
                      <pre className="p-3 bg-black/50 rounded border border-slate-800 text-slate-300 whitespace-pre-wrap overflow-x-auto">
                        {selectedLog.stdout}
                      </pre>
                    </div>
                  )}

                  {selectedLog.stderr && (
                    <div>
                      <div className="text-red-400 font-bold mb-1">=== STDERR (Errors) ===</div>
                      <pre className="p-3 bg-red-950/30 rounded border border-red-900 text-red-300 whitespace-pre-wrap overflow-x-auto">
                        {selectedLog.stderr}
                      </pre>
                    </div>
                  )}

                  {!selectedLog.stdout && !selectedLog.stderr && (
                    <div className="text-slate-500 italic">Aucune sortie enregistree pour le moment.</div>
                  )}
                </>
              )}
            </div>

            <div className="p-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded text-sm"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};