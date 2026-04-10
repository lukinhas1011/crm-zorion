
import React, { useMemo } from 'react';
import { Deal, Activity } from '../types';
import { Building2, Pencil, CalendarClock, Package, AlertCircle, CheckCircle2, User, History } from 'lucide-react';

interface DealCardProps {
  deal: Deal;
  activities: Activity[];
  onClick: (deal: Deal) => void;
  onDragStart: (e: React.DragEvent) => void;
  showCreator?: boolean;
  currencyMode?: 'BRL' | 'USD';
  exchangeRate?: number;
  onUpdate?: (deal: Deal) => void;
  onWon?: (deal: Deal) => void;
  onLost?: (deal: Deal) => void;
  onRevert?: (deal: Deal) => void;
}

export const DealCard: React.FC<DealCardProps> = ({ 
  deal, activities, onClick, onDragStart, showCreator = false, currencyMode = 'BRL', exchangeRate = 1, onUpdate, onWon, onLost, onRevert
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

  // Lógica de nomes: Empresa/Cooperativa grande (main), Título/Fazenda pequeno (secondary)
  let mainDisplayName = deal.clientName || deal.farmName || 'Cliente sem nome';
  let secondaryDisplayName = '';

  if (!isGenericTitle && rawTitle !== mainDisplayName) {
      secondaryDisplayName = rawTitle;
  } else if (deal.farmName && deal.farmName !== mainDisplayName) {
      secondaryDisplayName = deal.farmName;
  }

  // Cálculos de Moeda
  const valUSD = deal.value / exchangeRate;

  // Próxima Atividade
  const nextActivity = useMemo(() => {
    if (!activities) return null;
    const pending = (activities || []).filter(a => a.dealId === deal.id && !a.isDone);
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
      className="bg-white p-3 md:p-5 rounded-xl md:rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:border-zorion-500/30 transition-all cursor-grab active:cursor-grabbing group animate-fade-in relative active:scale-[0.98] overflow-hidden"
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 md:w-1.5 transition-colors ${isLate ? 'bg-red-400' : 'bg-slate-100 group-hover:bg-zorion-500'}`}></div>

      <div className="flex flex-col gap-2 md:gap-3 pl-1 md:pl-0">
        <div className="flex justify-between items-start">
          <div className="flex flex-col min-w-0 pr-1 md:pr-2">
             {/* Nome Secundário (Menor, Cinza) */}
             {secondaryDisplayName && (
               <span className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5 md:mb-1 truncate">
                 {secondaryDisplayName}
               </span>
             )}
             {/* Nome Principal (Maior, Escuro) */}
             <h5 className="font-black text-slate-800 text-xs md:text-sm leading-tight tracking-tight uppercase line-clamp-2">
               {mainDisplayName}
             </h5>
          </div>
          <button 
            onClick={handleEditClick}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 md:p-1.5 text-slate-200 group-hover:text-zorion-600 transition-all hover:bg-slate-50 rounded-lg"
          >
             <Pencil size={12} className="w-3 h-3 md:w-auto md:h-auto" />
          </button>
        </div>

        {/* Lista de Produtos (Tags) */}
        {hasProducts && (
            <div className="flex flex-wrap gap-1 md:gap-1.5">
                {(deal.products || []).slice(0, 3).map((prod, idx) => (
                    <span key={idx} className="text-[7px] md:text-[8px] font-black uppercase bg-emerald-50 text-emerald-700 px-1.5 md:px-2 py-0.5 md:py-1 rounded-md md:rounded-lg border border-emerald-100 flex items-center gap-1 max-w-full truncate">
                        <Package size={8} className="shrink-0" /> {prod.name}
                    </span>
                ))}
                {(deal.products || []).length > 3 && (
                    <span className="text-[7px] md:text-[8px] font-black text-slate-400 px-1 flex items-center">+ {(deal.products || []).length - 3}</span>
                )}
            </div>
        )}

        <div className="flex items-center gap-1.5 md:gap-2 bg-slate-50 p-2 md:p-2.5 rounded-lg md:rounded-xl border border-slate-100">
          <div className="h-5 w-5 md:h-6 md:w-6 bg-white rounded-md md:rounded-lg flex items-center justify-center border border-slate-100 shrink-0 shadow-sm">
             <User size={10} className="text-slate-400 md:w-3 md:h-3" />
          </div>
          <div className="flex flex-col flex-1 min-w-0">
            <span className="text-[9px] md:text-[10px] font-black text-slate-600 truncate uppercase">
              {deal.contactNames && (deal.contactNames || []).length > 0 ? (deal.contactNames || []).join(', ') : 'Sem responsável'}
            </span>
            {deal.farmName && (
              <span className="text-[7px] md:text-[8px] font-bold text-slate-400 truncate uppercase">
                {deal.farmName}
              </span>
            )}
          </div>
        </div>

        <div className="flex justify-between items-end pt-2 mt-1 border-t border-slate-50">
          <div className="flex flex-col">
             {nextActivity ? (
                 <div className={`flex items-center gap-1 text-[8px] md:text-[9px] font-bold uppercase tracking-widest ${isLate ? 'text-red-500' : 'text-slate-400'}`}>
                    {isLate ? <AlertCircle size={10} /> : <CalendarClock size={10} />}
                    {new Date(nextActivity.dueDate).toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'})}
                 </div>
             ) : (
                 <p className="text-[8px] md:text-[9px] font-black text-slate-300 uppercase tracking-widest mb-0.5 md:mb-1 flex items-center gap-1">
                    <CheckCircle2 size={10} /> Sem pendências
                 </p>
             )}
             
             <div className="font-black tracking-tighter leading-tight text-xs md:text-sm text-emerald-900 mt-0.5 whitespace-nowrap">
                $ {valUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
             </div>
          </div>
          
          <div className="text-right flex flex-col items-end relative z-30">
             <span className="text-[7px] md:text-[8px] text-slate-300 font-bold uppercase mb-0.5">Previsão</span>
             {/* Input de data com z-index alto e stopPropagation */}
             <input 
               type="date"
               className="text-[9px] md:text-[10px] font-black text-slate-500 bg-transparent outline-none text-right cursor-pointer w-16 md:w-20 p-0 border-none focus:ring-0 relative z-40 hover:text-zorion-600 transition-colors"
               value={deal.expectedCloseDate ? deal.expectedCloseDate.split('T')[0] : ''}
               onChange={handleDateChange}
               onClick={(e) => { e.stopPropagation(); }} 
               onMouseDown={(e) => { e.stopPropagation(); }}
             />
          </div>
        </div>

        {/* Botões de Ganho/Perda (Apenas se as funções forem passadas) */}
        {(onWon || onLost || (onRevert && deal.customAttributes?.transferredFromSales)) && (
          <div 
            className="flex gap-1.5 md:gap-2 pt-2 border-t border-slate-50 mt-1 relative z-[100]"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            {onWon && (
              <button 
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onWon(deal); 
                }}
                className="flex-1 py-2 md:py-2.5 bg-emerald-600 text-white rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer border-none"
              >
                <CheckCircle2 size={10} className="md:w-3 md:h-3" /> Ganhei
              </button>
            )}
            {onLost && (
              <button 
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onLost(deal); 
                }}
                className="flex-1 py-2 md:py-2.5 bg-red-600 text-white rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase hover:bg-red-700 active:scale-95 transition-all flex items-center justify-center gap-1 shadow-sm cursor-pointer border-none"
              >
                <AlertCircle size={10} className="md:w-3 md:h-3" /> Perdi
              </button>
            )}
            {onRevert && deal.customAttributes?.transferredFromSales && (
              <button 
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { 
                  e.stopPropagation(); 
                  onRevert(deal); 
                }}
                className="flex items-center gap-1 text-[7px] md:text-[8px] font-black text-slate-300 uppercase tracking-widest hover:text-blue-600 transition-colors cursor-pointer border-none bg-transparent py-1"
              >
                <History size={10} /> Reverter
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
