import React, { useState } from 'react';
import { generateNutritionPlan } from '../services/geminiService';
import { DietRequirement, Ingredient, DietRecommendation } from '../types';
import { Button } from '../components/Button';
import { Plus, Trash2, ChevronRight, BrainCircuit, Leaf } from 'lucide-react';

const DEFAULT_INGREDIENTS: Ingredient[] = [
  { id: '1', name: 'Milho Grão Moído', dryMatter: 88, protein: 8.5, energy: 3.2, costPerKg: 1.20 },
  { id: '2', name: 'Farelo de Soja', dryMatter: 89, protein: 46, energy: 2.8, costPerKg: 2.80 },
  { id: '3', name: 'Silagem de Milho', dryMatter: 35, protein: 7.5, energy: 2.4, costPerKg: 0.25 },
  { id: '4', name: 'Sal Mineral', dryMatter: 98, protein: 0, energy: 0, costPerKg: 4.50 },
];

const Nutrition: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [requirements, setRequirements] = useState<DietRequirement>({
    animalWeight: 450,
    targetGain: 1.5,
    breed: 'Nelore',
  });
  
  const [availableIngredients, setAvailableIngredients] = useState<Ingredient[]>(DEFAULT_INGREDIENTS);
  const [result, setResult] = useState<DietRecommendation | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const plan = await generateNutritionPlan(requirements, availableIngredients);
      setResult(plan);
    } catch (error) {
      alert("Ocorreu um erro ao gerar a dieta. Verifique sua chave de API.");
    } finally {
      setLoading(false);
    }
  };

  const removeIngredient = (id: string) => {
    setAvailableIngredients(prev => prev.filter(i => i.id !== id));
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <BrainCircuit className="text-emerald-600" />
            Nutrição Inteligente
          </h2>
          <p className="text-slate-500">Utilize IA para formular dietas de custo mínimo e máximo desempenho.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Input Column */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Animal Parameters */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <span className="bg-emerald-100 text-emerald-800 w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
              Parâmetros do Animal
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Peso Vivo (kg)</label>
                <input 
                  type="number" 
                  value={requirements.animalWeight}
                  onChange={(e) => setRequirements({...requirements, animalWeight: Number(e.target.value)})}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 border p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Meta de Ganho (kg/dia)</label>
                <input 
                  type="number" 
                  step="0.1"
                  value={requirements.targetGain}
                  onChange={(e) => setRequirements({...requirements, targetGain: Number(e.target.value)})}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 border p-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Raça / Cruzamento</label>
                <select 
                  value={requirements.breed}
                  onChange={(e) => setRequirements({...requirements, breed: e.target.value})}
                  className="w-full rounded-md border-slate-300 shadow-sm focus:border-emerald-500 focus:ring-emerald-500 border p-2 bg-white"
                >
                  <option value="Nelore">Nelore</option>
                  <option value="Angus">Angus</option>
                  <option value="Cruzado F1">Cruzado Ind/Tau (F1)</option>
                  <option value="Holandês">Holandês (Confinamento)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ingredients */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <span className="bg-emerald-100 text-emerald-800 w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                Ingredientes Disponíveis
              </h3>
              <button className="text-xs font-medium text-emerald-600 hover:text-emerald-700 flex items-center gap-1">
                <Plus size={14} /> Adicionar
              </button>
            </div>
            
            <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
              {availableIngredients.map((ing) => (
                <div key={ing.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100 group">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{ing.name}</p>
                    <p className="text-xs text-slate-500">R$ {ing.costPerKg.toFixed(2)}/kg • PB: {ing.protein}%</p>
                  </div>
                  <button 
                    onClick={() => removeIngredient(ing.id)}
                    className="text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <Button 
            onClick={handleGenerate} 
            isLoading={loading}
            className="w-full py-4 text-lg shadow-emerald-200 shadow-lg"
          >
            Gerar Dieta Otimizada
          </Button>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-7">
          {result ? (
            <div className="bg-white rounded-xl shadow-lg border border-emerald-100 overflow-hidden">
              <div className="bg-emerald-600 p-6 text-white">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Leaf className="h-6 w-6" /> Recomendação da IA
                </h3>
                <p className="text-emerald-100 mt-2 text-sm">{result.summary}</p>
              </div>

              <div className="p-6">
                <div className="mb-6">
                  <h4 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">Composição da Dieta</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="bg-slate-50 text-slate-500 font-medium">
                        <tr>
                          <th className="px-4 py-3 rounded-l-lg">Ingrediente</th>
                          <th className="px-4 py-3 text-right">Kg / Dia (MN)</th>
                          <th className="px-4 py-3 text-right rounded-r-lg">Custo Diário</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {result.ingredients.map((item, idx) => (
                          <tr key={idx}>
                            <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
                            <td className="px-4 py-3 text-right">{item.amountKg.toFixed(2)} kg</td>
                            <td className="px-4 py-3 text-right text-slate-600">R$ {item.cost.toFixed(2)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-bold">
                          <td className="px-4 py-3 text-slate-900">Total</td>
                          <td className="px-4 py-3 text-right">
                            {result.ingredients.reduce((acc, curr) => acc + curr.amountKg, 0).toFixed(2)} kg
                          </td>
                          <td className="px-4 py-3 text-right text-emerald-700">
                            R$ {result.totalCost.toFixed(2)} / dia
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-600 font-bold uppercase mb-1">Proteína</p>
                    <p className="text-sm text-slate-700">{result.nutritionalAnalysis.protein}</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <p className="text-xs text-amber-600 font-bold uppercase mb-1">Energia</p>
                    <p className="text-sm text-slate-700">{result.nutritionalAnalysis.energy}</p>
                  </div>
                  <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-100">
                    <p className="text-xs text-emerald-600 font-bold uppercase mb-1">Fibra</p>
                    <p className="text-sm text-slate-700">{result.nutritionalAnalysis.fiber}</p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center bg-slate-50 rounded-xl border border-dashed border-slate-300 p-12 text-center text-slate-400">
              <BrainCircuit className="h-16 w-16 mb-4 opacity-50" />
              <h3 className="text-lg font-medium text-slate-600">Aguardando Parâmetros</h3>
              <p className="max-w-md mx-auto mt-2">
                Configure os dados do animal e os ingredientes disponíveis ao lado para gerar uma dieta personalizada.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Nutrition;