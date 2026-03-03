
import React, { useState } from 'react';
import { Send, Phone, MessageSquare, AlertCircle, CheckCircle } from 'lucide-react';

export default function WhatsAppSimulator() {
  const [phone, setPhone] = useState('5544998561614');
  const [message, setMessage] = useState('Visita realizada na fazenda Rancho São Fabiano. O gado está com bom ganho de peso. Recomendo manter a dieta.');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [response, setResponse] = useState<any>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus('loading');
    setResponse(null);

    try {
      const res = await fetch('/api/test/whatsapp-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message })
      });

      const data = await res.json();
      
      if (!res.ok) throw new Error(data.error || 'Erro na requisição');

      setResponse(data);
      setStatus('success');
    } catch (err: any) {
      setResponse({ error: err.message });
      setStatus('error');
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-3">
          <MessageSquare className="w-8 h-8 text-green-600" />
          Simulador de WhatsApp
        </h1>
        <p className="text-gray-500">
          Teste o fluxo de mensagens e IA sem depender do Twilio ou bloqueios de rede.
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Phone className="w-4 h-4" /> Telefone do Remetente (Técnico)
            </label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all"
              placeholder="5544998561614"
            />
            <p className="text-xs text-gray-400">Deve ser um número cadastrado no sistema.</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Mensagem
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none transition-all resize-none"
              placeholder="Digite a mensagem simulando o técnico..."
            />
          </div>

          <button
            type="submit"
            disabled={status === 'loading'}
            className={`w-full py-3 px-6 rounded-xl font-medium text-white transition-all flex items-center justify-center gap-2
              ${status === 'loading' ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20'}
            `}
          >
            {status === 'loading' ? 'Enviando...' : (
              <>
                <Send className="w-5 h-5" /> Enviar Mensagem Simulada
              </>
            )}
          </button>
        </form>
      </div>

      {status === 'success' && (
        <div className="bg-green-50 border border-green-100 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
          <CheckCircle className="w-5 h-5 text-green-600 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-medium text-green-900">Sucesso!</h3>
            <p className="text-sm text-green-700">
              A mensagem foi enviada para o backend. Verifique os logs para ver o processamento da IA.
            </p>
            <pre className="mt-2 text-xs bg-white/50 p-2 rounded border border-green-100 overflow-x-auto">
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {status === 'error' && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3 animate-in fade-in slide-in-from-bottom-4">
          <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div className="space-y-1">
            <h3 className="font-medium text-red-900">Erro no Envio</h3>
            <p className="text-sm text-red-700">
              Não foi possível enviar a mensagem simulada.
            </p>
            <pre className="mt-2 text-xs bg-white/50 p-2 rounded border border-red-100 overflow-x-auto">
              {JSON.stringify(response, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
