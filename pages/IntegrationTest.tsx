import React, { useState, useEffect } from 'react';
import { Button } from '../components/Button';
import { MessageSquare, RefreshCw, Send, AlertTriangle, CheckCircle2, XCircle, Clock } from 'lucide-react';

interface Log {
  id: string;
  receivedAt: { seconds: number; nanoseconds: number } | string;
  status: 'received' | 'success' | 'ignored' | 'error';
  payload: any;
  aiAnalysis?: any;
  error?: string;
  reason?: string;
}

const IntegrationTest: React.FC = () => {
  const [logs, setLogs] = useState<Log[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testPhone, setTestPhone] = useState('5544998561614');
  const [testMessage, setTestMessage] = useState('Visita na Fazenda Teste. Tudo certo.');
  const [isSending, setIsSending] = useState(false);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/whatsapp/logs');
      if (!res.ok) throw new Error('Falha ao buscar logs');
      const data = await res.json();
      setLogs(data);
    } catch (error) {
      console.error("Erro ao buscar logs:", error);
      // Não alertar para não spammar o usuário, apenas logar
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 5000); // Auto refresh a cada 5s
    return () => clearInterval(interval);
  }, []);

  const handleSimulateMessage = async () => {
    setIsSending(true);
    try {
      const payload = {
        From: `whatsapp:+${testPhone}`, // Formato Twilio
        Body: testMessage,
        // Simulando outros campos do Twilio
        To: 'whatsapp:+14155238886',
        NumMedia: '0',
        SmsMessageSid: `SM${Date.now()}`,
        WaId: testPhone
      };

      const res = await fetch('/api/whatsapp/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert('Mensagem simulada enviada com sucesso! Verifique os logs abaixo.');
        setTimeout(fetchLogs, 1000);
      } else {
        alert('Erro ao enviar mensagem simulada.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro de conexão.');
    } finally {
      setIsSending(false);
    }
  };

  const formatDate = (dateVal: any) => {
    if (!dateVal) return '-';
    // Firebase Timestamp
    if (dateVal.seconds) return new Date(dateVal.seconds * 1000).toLocaleString();
    // String ISO
    return new Date(dateVal).toLocaleString();
  };

  return (
    <div className="max-w-4xl mx-auto pb-20">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 italic tracking-tighter uppercase mb-2 flex items-center gap-3">
          <MessageSquare className="text-green-500" size={32} /> Diagnóstico WhatsApp
        </h1>
        <p className="text-slate-500 font-medium">Teste a integração e visualize os logs de recebimento em tempo real.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Painel de Simulação */}
        <div className="md:col-span-1 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl h-fit">
          <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
            <Send size={16} /> Simular Mensagem
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Seu Telefone (Cadastrado)</label>
              <input 
                value={testPhone} 
                onChange={e => setTestPhone(e.target.value)} 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
              />
            </div>
            <div>
              <label className="text-[10px] font-bold text-slate-400 uppercase">Mensagem</label>
              <textarea 
                value={testMessage} 
                onChange={e => setTestMessage(e.target.value)} 
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium h-24 resize-none"
              />
            </div>
            <Button onClick={handleSimulateMessage} isLoading={isSending} className="w-full py-3 rounded-xl font-black uppercase text-[10px]">
              Enviar Teste
            </Button>
            <p className="text-[10px] text-slate-400 leading-tight">
              * Isso envia uma mensagem direta para o servidor, ignorando o Twilio. Útil para testar se a IA e o Banco de Dados estão funcionando.
            </p>
          </div>
        </div>

        {/* Lista de Logs */}
        <div className="md:col-span-2 bg-white p-6 rounded-[2rem] border border-slate-100 shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
              <Clock size={16} /> Logs de Recebimento
            </h3>
            <button onClick={fetchLogs} className="p-2 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors">
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            </button>
          </div>

          <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar pr-2">
            {logs.length === 0 ? (
              <div className="text-center py-10 text-slate-400">
                <p className="text-xs font-bold">Nenhum log encontrado.</p>
              </div>
            ) : (
              logs.map(log => (
                <div key={log.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-xs">
                  <div className="flex justify-between items-start mb-2">
                    <span className="font-bold text-slate-500">{formatDate(log.receivedAt)}</span>
                    <span className={`px-2 py-1 rounded-lg font-black uppercase text-[9px] ${
                      log.status === 'success' ? 'bg-green-100 text-green-600' :
                      log.status === 'error' ? 'bg-red-100 text-red-600' :
                      log.status === 'ignored' ? 'bg-amber-100 text-amber-600' :
                      'bg-blue-100 text-blue-600'
                    }`}>
                      {log.status}
                    </span>
                  </div>
                  
                  <div className="mb-2">
                    <p className="font-bold text-slate-700 mb-1">Payload (Resumo):</p>
                    <pre className="bg-white p-2 rounded-lg border border-slate-200 overflow-x-auto text-[10px] text-slate-500">
                      {JSON.stringify({
                        From: log.payload?.From || log.payload?.phone,
                        Body: log.payload?.Body || log.payload?.text?.message,
                        ...log.payload
                      }, null, 2)}
                    </pre>
                  </div>

                  {log.aiAnalysis && (
                    <div className="mb-2">
                      <p className="font-bold text-purple-700 mb-1 flex items-center gap-1"><CheckCircle2 size={12} /> Análise IA:</p>
                      <div className="bg-purple-50 p-2 rounded-lg border border-purple-100 text-purple-800">
                        <p><strong>Ação:</strong> {log.aiAnalysis.action}</p>
                        <p><strong>Cliente ID:</strong> {log.aiAnalysis.clientId || 'Não identificado'}</p>
                        <p><strong>Resumo:</strong> {log.aiAnalysis.summary}</p>
                      </div>
                    </div>
                  )}

                  {log.error && (
                    <div className="bg-red-50 p-2 rounded-lg border border-red-100 text-red-600 font-bold flex items-center gap-2">
                      <XCircle size={14} /> {log.error}
                    </div>
                  )}
                   {log.reason && (
                    <div className="bg-amber-50 p-2 rounded-lg border border-amber-100 text-amber-600 font-bold flex items-center gap-2">
                      <AlertTriangle size={14} /> {log.reason}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IntegrationTest;
