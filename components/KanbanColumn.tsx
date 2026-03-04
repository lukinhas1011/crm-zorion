
import React from 'react';
import { Stage, Deal, Activity } from '../types';
import { DealCard } from './DealCard';
import { ArrowRight, LayoutGrid } from 'lucide-react';

interface KanbanColumnProps {
  stage: Stage;
  deals: Deal[];
  activities: Activity[];
  index: number;
  onMoveDeal: (dealId: string, stageId: string) => void;
  onDealClick: (deal: Deal) => void;
  showCreator?: boolean;
  onDealUpdate?: (deal: Deal) => void;
  onWon?: (deal: Deal) => void;
  onLost?: (deal: Deal) => void;
  onRevert?: (deal: Deal) => void;
}

const COLORS = ['bg-zorion-600', 'bg-blue-600', 'bg-indigo-600', 'bg-emerald-600', 'bg-amber-600'];

export const KanbanColumn: React.FC<KanbanColumnProps> = ({ 
  stage, deals, activities, index, onMoveDeal, onDealClick, showCreator = false, onDealUpdate, onWon, onLost, onRevert
}) => {
  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
  const colorClass = COLORS[index % COLORS.length];

  return (
    <div 
      className="flex flex-col w-[85vw] md:w-[300px] md:min-w-[300px] h-full max-h-full md:border-r border-slate-200 bg-transparent md:bg-slate-100/30 flex-shrink-0 animate-fade-in"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const id = e.dataTransfer.getData('dealId');
        onMoveDeal(id, stage.id);
      }}
    >
      {/* Header Estilo Pipedrive (Visível apenas em Desktop ou como Resumo no Mobile) */}
      <div className="hidden md:flex flex-none p-5 bg-white border-b border-slate-200 relative min-h-[110px] flex-col justify-center shadow-sm">
        <h4 className="font-black text-slate-800 text-[11px] leading-tight uppercase tracking-tight mb-1.5">
          {stage.name}
        </h4>
        <div className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">
          R$ {totalValue.toLocaleString('pt-BR')} • {deals.length} {deals.length === 1 ? 'NEGÓCIO' : 'NEGÓCIOS'}
        </div>
        <div className={`h-1.5 w-full absolute top-0 left-0 ${colorClass}`} />
      </div>

      {/* Resumo Mobile (Opcional, já que temos as abas, mas bom para contexto se necessário) */}
      <div className="md:hidden px-3 py-2 flex justify-between items-center bg-slate-50 border-b border-slate-200 mb-2 rounded-xl mx-2 mt-2">
         <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${colorClass}`}></div>
            <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{stage.name}</span>
         </div>
         <span className="text-[9px] font-bold text-slate-400">{deals.length}</span>
      </div>

      {/* Área de Cards */}
      <div className="flex-1 overflow-y-auto p-2 md:p-4 space-y-2 md:space-y-4 custom-scrollbar pb-32 md:pb-32">
        {deals.length > 0 ? (
          deals.map(deal => (
            <DealCard 
              key={deal.id} 
              deal={deal} 
              activities={activities} 
              onClick={onDealClick}
              onDragStart={(e) => e.dataTransfer.setData('dealId', deal.id)}
              showCreator={showCreator}
              onUpdate={onDealUpdate}
              onWon={onWon}
              onLost={onLost}
              onRevert={onRevert}
            />
          ))
        ) : (
          <div className="h-60 md:h-40 border-2 border-dashed border-slate-200 rounded-[2rem] flex flex-col items-center justify-center text-slate-300 opacity-60 md:opacity-40 group hover:opacity-100 hover:border-zorion-500/30 transition-all bg-slate-50/50 md:bg-transparent mx-2 md:mx-0">
            <LayoutGrid size={32} className="mb-3 text-slate-300" />
            <span className="text-[10px] font-black uppercase tracking-widest text-center px-4 leading-tight">Nenhuma oportunidade nesta etapa</span>
          </div>
        )}
      </div>
    </div>
  );
};
