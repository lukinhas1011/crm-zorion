
import React, { useMemo } from 'react';
import { Deal, Activity } from '../types';
import { Building2, Pencil, CalendarClock, Package, AlertCircle, CheckCircle2 } from 'lucide-react';

interface DealCardProps {
  deal: Deal;
  activities: Activity[];
  onClick: (deal: Deal) => void;
  onDragStart: (e: React.DragEvent) => void;
  showCreator?: boolean;
  currencyMode?: 'BRL' | 'USD';
  exchangeRate?: number;
  onUpdate?: (deal: Deal) => void;
}

export const DealCard: React.FC<DealCardProps> = ({ 
  deal, activities, onClick, onDragStart, showCreator = false, currencyMode = 'BRL', exchangeRate = 1, onUpdate 
}) => {
  const hasProducts = deal.products && deal.products.length > 0;
  
  const rawTitle = (deal.title || '').trim();
  const lowerTitle = rawTitle.toLowerCase();
  
  const isGeneric = (s?: string) => {
      if (!s) return true;
      const lower = s.toLowerCase().trim();
      return lower === 'nova ocupação' || 
             lower === 'novo cliente' || 
             lower === 'nova oportunidade' || 
             lower === 'selecione a fazenda' || 
             lower === 'selecione o cliente' ||
             lower === 'cliente sem nome';
  };

  const isGenericTitle = isGeneric(rawTitle);

  // Se o título for genérico ou igual ao nome do cliente, não exibimos como título secundário
  let displayTitle = rawTitle;
  const clientNameLower = (deal.clientName || '').toLowerCase();
  
  if (isGenericTitle || (deal.clientName && lowerTitle === clientNameLower)) {
      displayTitle = '';
  }

  // Nome do Cliente Principal (Prioridade: clientName > farmName > Title > 'Cliente sem nome')
  let mainDisplayName = deal.clientName;
  if (isGeneric(mainDisplayName)) {
      mainDisplayName = deal.farmName;
      if (isGeneric(mainDisplayName)) {
          // Se ambos forem genéricos, tenta usar o título se ele NÃO for genérico
          mainDisplayName = !isGenericTitle ? rawTitle : 'Cliente sem nome';
      }
  }

  // Garante que se o título for igual ao nome da fazenda, também limpamos o título secundário
  if (deal.farmName && lowerTitle === deal.farmName.toLowerCase()) {
      displayTitle = '';
  }

  // Cálculos de Moeda
  const valUSD = deal.value / exchangeRate;

  // Próxima Atividade
  const nextActivity = useMemo(() => {
    if (!activities) return null;
    const pending = activities.filter(a => a.dealId === deal.id && !a.isDone);
    if (pending.length === 0) return null;
    return pending.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0];
  }, [activities, deal.id]);

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation(); 
    onClick(deal);
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (onUpdate) {
        onUpdate({ ...deal, expectedCloseDate: e.target.value });
    }
  };

  const isLate = nextActivity && new Date(nextActivity.dueDate) < new Date();

  return (
    <div 
      draggable
      onDragStart={onDragStart}
      onClick={() => onClick(deal)}
      className="bg-white p-5 rounded-[2rem] shadow-sm border border-slate-200 hover:shadow-xl hover:border-zorion-500/30 transition-all cursor-grab active:cursor-grabbing group animate-fade-in relative active:scale-[0.98] overflow-hidden"
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 transition-colors ${isLate ? 'bg-red-400' : 'bg-slate-100 group-hover:bg-zorion-500'}`}></div>

      <div className="flex flex-col gap-3">
        <div className="flex justify-between items-start">
          <div className="flex flex-col min-w-0 pr-2">
             {/* Título secundário (se não for genérico) */}
             {displayTitle && (
               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 truncate italic">
                 {displayTitle}
               </span>
             )}
             {/* Nome do Cliente */}
             <h5 className="font-black text-slate-800 text-sm leading-tight tracking-tight uppercase line-clamp-2 italic">
               {mainDisplayName}
             </h5>
          </div>
          <button 
            onClick={handleEditClick}
            className="p-1.5 text-slate-200 group-hover:text-zorion-600 transition-all hover:bg-slate-50 rounded-lg"
          >
             <Pencil size={12} />
          </button>
        </div>

        {/* Lista de Produtos (Tags) */}
        {hasProducts && (
            <div className="flex flex-wrap gap-1.5">
                {deal.products.slice(0, 3).map((prod, idx) => (
                    <span key={idx} className="text-[8px] font-black uppercase bg-emerald-50 text-emerald-700 px-2 py-1 rounded-lg border border-emerald-100 flex items-center gap-1 max-w-full truncate">
                        <Package size={8} /> {prod.name}
                    </span>
                ))}
                {deal.products.length > 3 && (
                    <span className="text-[8px] font-black text-slate-400 px-1 flex items-center">+ {deal.products.length - 3}</span>
                )}
            </div>
        )}

        <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
          <div className="h-6 w-6 bg-white rounded-lg flex items-center justify-center border border-slate-100 shrink-0 shadow-sm">
             <Building2 size={12} className="text-slate-400" />
          </div>
          <span className="text-[10px] font-black text-slate-600 truncate uppercase flex-1 italic">
            {deal.farmName}
          </span>
        </div>

        <div className="flex justify-between items-end pt-2 mt-1 border-t border-slate-50">
          <div className="flex flex-col">
             {nextActivity ? (
                 <div className={`flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest ${isLate ? 'text-red-500' : 'text-slate-400'}`}>
                    {isLate ? <AlertCircle size={10} /> : <CalendarClock size={10} />}
                    {new Date(nextActivity.dueDate).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}
                 </div>
             ) : (
                 <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest mb-1 flex items-center gap-1">
                    <CheckCircle2 size={10} /> Sem pendências
                 </p>
             )}
             
             <div className="font-black italic tracking-tighter leading-tight text-lg text-emerald-900 mt-0.5">
                $ {valUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
             </div>
          </div>
          
          <div className="text-right flex flex-col items-end relative z-30">
             <span className="text-[8px] text-slate-300 font-bold uppercase mb-0.5">Previsão</span>
             {/* Input de data com z-index alto e stopPropagation */}
             <input 
               type="date"
               className="text-[10px] font-black text-slate-500 italic bg-transparent outline-none text-right cursor-pointer w-20 p-0 border-none focus:ring-0 relative z-40 hover:text-zorion-600 transition-colors"
               value={deal.expectedCloseDate ? deal.expectedCloseDate.split('T')[0] : ''}
               onChange={handleDateChange}
               onClick={(e) => { e.stopPropagation(); }} 
               onMouseDown={(e) => { e.stopPropagation(); }}
             />
          </div>
        </div>
      </div>
    </div>
  );
};
