import React, { useEffect, useState } from 'react';
import { db } from '../services/firebase';
import { collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';

interface UsageLog {
  id: string;
  model: string;
  functionality: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: string;
}

export const GeminiUsageDashboard: React.FC = () => {
  const [logs, setLogs] = useState<UsageLog[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'gemini_usage_logs'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const newLogs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as UsageLog));
      setLogs(newLogs);
    });
    return () => unsubscribe();
  }, []);

  const totalTokens = logs.reduce((sum, log) => sum + log.totalTokens, 0);

  return (
    <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200">
      <h2 className="text-lg font-bold mb-4">Uso da API Gemini</h2>
      <p className="text-sm text-slate-600 mb-4">Total de tokens (últimos 50 logs): {totalTokens}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left p-2">Funcionalidade</th>
              <th className="text-left p-2">Tokens</th>
              <th className="text-left p-2">Data</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b border-slate-100">
                <td className="p-2">{log.functionality}</td>
                <td className="p-2">{log.totalTokens}</td>
                <td className="p-2">{new Date(log.timestamp).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
