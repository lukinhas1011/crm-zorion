import React, { useState } from 'react';
import { Beef, Sparkles, AlertCircle, Loader2 } from 'lucide-react';
import { geminiService } from '../services/geminiService';

const Nutrition = () => {
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState<string | null>(null);
  const [data, setData] = useState({
    lote: 'Lote 04 - Confinamento',
    pesoMedio: '450kg',
    dieta: 'Milho moído, Farelo de Soja, Núcleo Mineral',
    consumo: '2.5% PV'
  });

  const handleAnalyze = async () => {
    setLoading(true);
    try {
      const result = await geminiService.analyzeNutrition(data);
      setRecommendation(result);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Análise Nutricional</h1>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 bg-slate-100 px-3 py-1 rounded-full">
          <AlertCircle size={14} />
          Uso consciente de IA ativado
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Dados do Lote</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Identificação</label>
                <input 
                  type="text" 
                  value={data.lote} 
                  onChange={e => setData({...data, lote: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Peso Médio</label>
                <input 
                  type="text" 
                  value={data.pesoMedio} 
                  onChange={e => setData({...data, pesoMedio: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dieta Atual</label>
                <textarea 
                  value={data.dieta} 
                  onChange={e => setData({...data, dieta: e.target.value})}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500 h-24"
                />
              </div>
              <button 
                onClick={handleAnalyze}
                disabled={loading}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white p-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} className="text-amber-400" />}
                Gerar Recomendação IA
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white h-full rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Beef className="text-emerald-600" />
              Recomendações Técnicas
            </h2>
            
            <div className="flex-1 bg-slate-50 rounded-xl p-6 border border-slate-100 overflow-y-auto">
              {recommendation ? (
                <div className="prose prose-slate max-w-none">
                  <p className="whitespace-pre-wrap text-slate-700 leading-relaxed">
                    {recommendation}
                  </p>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40">
                  <Sparkles size={48} />
                  <p className="font-medium max-w-xs">
                    Clique no botão para gerar uma análise nutricional baseada nos dados do lote.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Nutrition;
