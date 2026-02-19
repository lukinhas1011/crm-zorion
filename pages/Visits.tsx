
import React, { useState, useEffect, useMemo } from 'react';
import { Visit, Client, Attachment, Activity, User } from '../types';
import { 
  Calendar, MapPin, User as UserIcon, ChevronRight, Search, Pencil, X, 
  ImageIcon, Video, Mic, FileText, Sparkles, Loader2, 
  Clock, Download, Share2, Beef, Package, Trash2, AlertTriangle,
  ExternalLink, Save, Undo, MessageSquare, Phone
} from 'lucide-react';
import { summarizeVisitAudio } from '../services/geminiService';
import { Button } from '../components/Button';
import { deleteVisitPhoto } from '../services/storageService';

interface VisitsProps {
  visits: Visit[];
  activities?: Activity[];
  clients: Client[];
  onSelectClient: (clientId: string) => void;
  onEditVisit?: (visit: Visit) => void;
  onDeleteVisit?: (visitId: string) => Promise<void>;
  onUpdateVisit?: (visit: Visit) => Promise<void>;
  user?: User;
}

const Visits: React.FC<VisitsProps> = ({ visits, activities = [], clients, onSelectClient, onEditVisit, onDeleteVisit, onUpdateVisit, user }) => {
  const [filter, setFilter] = useState<'Todas' | 'Agendada' | 'Concluída'>('Todas');
  const [searchTerm, setSearchTerm] = useState('');
  
  // State do Modal de Detalhes
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  
  // State de Edição Inline
  const [isEditingMode, setIsEditingMode] = useState(false);
  const [editFormData, setEditFormData] = useState<Visit | null>(null);
  
  // Confirmação de Exclusão de Visita
  const [isDeleteVisitConfirmOpen, setIsDeleteVisitConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Confirmação de Exclusão de Anexo
  const [attachmentToDelete, setAttachmentToDelete] = useState<{visit: Visit, attId: string} | null>(null);
  const [isDeletingAttachment, setIsDeletingAttachment] = useState(false);

  // Resetar modo de edição ao fechar ou trocar de visita
  useEffect(() => {
    setIsEditingMode(false);
    setEditFormData(null);
  }, [selectedVisit?.id]);

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'Concluída': return 'bg-emerald-100 text-emerald-700';
      case 'Agendada': return 'bg-blue-100 text-blue-700';
      case 'Cancelada': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  const getFileIcon = (type: string) => {
    switch (type) {
        case 'image': return <ImageIcon size={20} className="text-purple-500" />;
        case 'video': return <Video size={20} className="text-blue-500" />;
        case 'audio': return <Mic size={20} className="text-amber-500" />;
        default: return <FileText size={20} className="text-slate-500" />;
    }
  };

  const handleGenerateAISummary = async () => {
    if (!selectedVisit || !selectedVisit.transcript) return;
    setIsProcessingAI(true);
    try {
        const summary = await summarizeVisitAudio(selectedVisit.transcript, selectedVisit.lot, selectedVisit.product);
        const updatedVisit = { ...selectedVisit, aiSummary: summary };
        setSelectedVisit(updatedVisit);
        if (onUpdateVisit) await onUpdateVisit(updatedVisit);
    } catch (error) {
        console.error(error);
        alert("Erro ao gerar resumo.");
    } finally {
        setIsProcessingAI(false);
    }
  };

  const handleDeleteVisit = async () => {
    if (selectedVisit && onDeleteVisit) {
        setIsDeleting(true);
        try {
            await onDeleteVisit(selectedVisit.id);
            setIsDeleteVisitConfirmOpen(false);
            setSelectedVisit(null);
        } catch (error) {
            console.error("Falha ao excluir", error);
            alert("Erro ao excluir registro.");
        } finally {
            setIsDeleting(false);
        }
    }
  };

  const handleConfirmDeleteAttachment = async () => {
    if (!attachmentToDelete || !onUpdateVisit) return;
    setIsDeletingAttachment(true);
    try {
        const { visit, attId } = attachmentToDelete;
        const att = (visit.attachments || []).find(a => a.id === attId);
        
        if (att?.url) {
            try {
                await deleteVisitPhoto(att.url);
            } catch (error) {
                console.warn("Arquivo já removido ou inacessível no storage");
            }
        }
        
        const updatedAttachments = (visit.attachments || []).filter(a => a.id !== attId);
        const updatedVisit = { ...visit, attachments: updatedAttachments };
        await onUpdateVisit(updatedVisit);
        
        // Atualiza a visualização local se ainda estiver aberta a mesma visita
        if (selectedVisit && selectedVisit.id === visit.id) {
            setSelectedVisit(updatedVisit);
        }
        setAttachmentToDelete(null);
    } catch (error) {
        console.error("Erro ao deletar anexo:", error);
        alert("Erro ao remover anexo. Tente novamente.");
    } finally {
        setIsDeletingAttachment(false);
    }
  };

  const handleStartEdit = () => {
    if (selectedVisit) {
        setEditFormData({ ...selectedVisit });
        setIsEditingMode(true);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingMode(false);
    setEditFormData(null);
  };

  const handleSaveEdit = async () => {
    if (editFormData && onUpdateVisit) {
        try {
            await onUpdateVisit(editFormData);
            setSelectedVisit(editFormData);
            setIsEditingMode(false);
        } catch (error) {
            console.error("Erro ao salvar:", error);
            alert("Erro ao salvar alterações.");
        }
    }
  };

  const formatForInput = (isoString: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  };

  // --- UNIFICAÇÃO DE ATIVIDADES COMO VISITAS ---
  const unifiedHistory = useMemo(() => {
    const visitsAsVisits = visits.map(v => ({ ...v, recordType: 'visit' }));
    
    const activitiesAsVisits = activities.map(a => {
        // Mapeia Activity para Visit para exibição unificada
        return {
            id: a.id,
            clientId: a.clientId,
            date: a.dueDate,
            technicianId: a.technicianId,
            technicianName: a.technicianId === user?.id ? (user?.name || 'Eu') : 'Equipe',
            purpose: a.type as any, // Cast forçado para exibir tipo
            status: a.isDone ? 'Concluída' : 'Agendada',
            transcript: a.description,
            aiSummary: '',
            product: '',
            lot: '',
            attachments: a.attachments,
            recordType: 'activity' // Tag para diferenciar visualmente se necessário
        } as unknown as (Visit & { recordType: string });
    });

    return [...visitsAsVisits, ...activitiesAsVisits].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [visits, activities, user]);

  const filteredVisits = unifiedHistory
    .filter(v => filter === 'Todas' || v.status === filter)
    .filter(v => {
      const client = clients.find(c => c.id === v.clientId);
      const search = searchTerm.toLowerCase();
      return (
        v.purpose.toLowerCase().includes(search) ||
        (v.product && v.product.toLowerCase().includes(search)) ||
        (client?.farmName || '').toLowerCase().includes(search) ||
        (client?.name || '').toLowerCase().includes(search)
      );
    });

  const getAllAttachments = (visit: Visit) => {
      const legacy = (visit.photos || []).map(url => ({
          id: url,
          url,
          type: 'image',
          name: 'Arquivo Legado'
      } as Attachment));
      const modern = visit.attachments || [];
      return [...legacy, ...modern];
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div>
        <h2 className="text-2xl font-black text-slate-900 italic tracking-tighter">Histórico de Visitas</h2>
        <p className="text-slate-500 font-medium text-sm">Acompanhe todos os atendimentos realizados no campo.</p>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
          <input 
            type="text"
            placeholder="Buscar por cliente, fazenda ou produto..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 rounded-2xl bg-white border border-slate-100 shadow-sm focus:ring-2 focus:ring-zorion-900/20 outline-none text-sm font-bold"
          />
        </div>

        <div className="flex bg-slate-200/50 p-1 rounded-xl border border-slate-200 self-start">
          {(['Todas', 'Agendada', 'Concluída'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`
                px-5 py-2 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all
                ${filter === s 
                  ? 'bg-white text-zorion-900 shadow-sm' 
                  : 'text-slate-500 hover:text-slate-700'}
              `}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 overflow-hidden">
        <div className="divide-y divide-slate-50">
          {filteredVisits.length > 0 ? (
            filteredVisits.map((visit: any) => {
              const client = clients.find(c => c.id === visit.clientId);
              const isActivity = visit.recordType === 'activity';
              
              return (
                <div 
                  key={visit.id} 
                  onClick={() => !isActivity && setSelectedVisit(visit)} // Por enquanto, abre modal apenas para visitas reais
                  className={`p-5 md:p-6 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row items-start sm:items-center gap-4 group cursor-pointer active:scale-[0.99] ${isActivity ? 'opacity-90' : ''}`}
                >
                  <div className={`flex-shrink-0 w-14 h-14 border rounded-2xl flex flex-col items-center justify-center text-center shadow-sm group-hover:bg-white transition-colors ${isActivity ? 'bg-blue-50 border-blue-100' : 'bg-slate-50 border-slate-100'}`}>
                    <span className={`text-[9px] font-black uppercase tracking-tighter ${isActivity ? 'text-blue-400' : 'text-slate-400'}`}>{new Date(visit.date).toLocaleString('pt-BR', { month: 'short' })}</span>
                    <span className={`text-xl font-black italic -mt-1 ${isActivity ? 'text-blue-800' : 'text-slate-800'}`}>{new Date(visit.date).getDate()}</span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-black text-slate-900 truncate italic tracking-tight group-hover:text-zorion-900 transition-colors">
                      {client?.name || 'Cliente Não Identificado'}
                    </h3>
                    
                    <div className="flex flex-wrap items-center gap-2 mt-1 mb-2">
                      <span className={`px-2 py-0.5 rounded text-[7px] font-black uppercase tracking-widest ${getStatusColor(visit.status)}`}>
                        {visit.status}
                      </span>
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter flex items-center gap-1">
                        {client?.farmName || 'Sem Unidade'} • 
                        {isActivity && (visit.purpose === 'Whatsapp' ? <MessageSquare size={10} className="text-green-500 ml-1"/> : visit.purpose === 'Call' ? <Phone size={10} className="text-blue-500 ml-1"/> : null)}
                        {visit.purpose}
                      </span>
                      {visit.product && (
                        <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded text-[8px] font-black uppercase border border-blue-100 flex items-center gap-1">
                          <Package size={10} /> {visit.product}
                        </span>
                      )}
                      <span className="h-1 w-1 bg-slate-300 rounded-full mx-1"></span>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter flex items-center gap-1">
                        <UserIcon size={10} /> {visit.technicianName}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                      <span className="flex items-center gap-1">
                        <MapPin size={12} className="text-slate-300" /> {client?.location?.address || 'Sem endereço'}
                      </span>
                      {visit.lot && (
                        <span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg border border-emerald-100 flex items-center gap-1">
                          <Beef size={10} /> {visit.lot}
                        </span>
                      )}
                      {isActivity && (
                          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg border border-purple-100">CRM</span>
                      )}
                    </div>
                  </div>

                  {!isActivity && (
                    <div className="hidden sm:flex items-center justify-center h-10 w-10 bg-slate-50 rounded-full text-slate-300 group-hover:bg-zorion-900 group-hover:text-white transition-all">
                        <ChevronRight size={20} />
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-20 text-center text-slate-300 font-black italic uppercase tracking-[0.2em] flex flex-col items-center">
              <Calendar className="h-14 w-14 mb-4 opacity-10" />
              <p className="text-sm">Nenhum registro encontrado</p>
            </div>
          )}
        </div>
      </div>

      {selectedVisit && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-hidden">
            <div className="bg-white md:rounded-[2rem] w-full max-w-4xl shadow-2xl relative flex flex-col h-full md:h-[90vh] overflow-hidden border border-slate-200">
                
                <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-start bg-white shrink-0">
                    <div className="flex gap-5 items-center w-full">
                        <div className="h-16 w-16 bg-zorion-900 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg shrink-0">
                            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">{new Date(selectedVisit.date).toLocaleString('pt-BR', { month: 'short' })}</span>
                            <span className="text-3xl font-black italic leading-none">{new Date(selectedVisit.date).getDate()}</span>
                        </div>
                        
                        <div className="flex-1">
                            {isEditingMode && editFormData ? (
                                <div className="space-y-3">
                                    <div className="flex gap-2">
                                        <select 
                                            className="bg-slate-50 border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-700 rounded-lg py-1.5 px-2 outline-none focus:border-zorion-500"
                                            value={editFormData.status}
                                            onChange={e => setEditFormData({...editFormData, status: e.target.value as any})}
                                        >
                                            <option value="Concluída">Concluída</option>
                                            <option value="Agendada">Agendada</option>
                                            <option value="Cancelada">Cancelada</option>
                                        </select>
                                        
                                        <input 
                                            type="datetime-local"
                                            className="bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-700 rounded-lg py-1.5 px-2 outline-none focus:border-zorion-500"
                                            value={formatForInput(editFormData.date)}
                                            onChange={e => setEditFormData({...editFormData, date: new Date(e.target.value).toISOString()})}
                                        />
                                    </div>
                                    <select
                                        className="text-xl font-black text-slate-900 italic tracking-tighter leading-none bg-transparent outline-none w-full border-b border-slate-200 py-1"
                                        value={editFormData.purpose}
                                        onChange={e => setEditFormData({...editFormData, purpose: e.target.value as any})}
                                    >
                                        {['Nutrição', 'Sanitário', 'Reprodutivo', 'Geral', 'Entrega de Ração', 'Manutenção Industrial'].map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${getStatusColor(selectedVisit.status)}`}>
                                            {selectedVisit.status}
                                        </span>
                                        <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1 uppercase">
                                            <Clock size={12} /> {new Date(selectedVisit.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                    <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter leading-none">
                                        {clients.find(c => c.id === selectedVisit.clientId)?.name}
                                    </h3>
                                    <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                                        {selectedVisit.purpose} • {clients.find(c => c.id === selectedVisit.clientId)?.farmName}
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                    <button onClick={() => setSelectedVisit(null)} className="p-2 text-slate-300 hover:text-slate-500 hover:bg-slate-50 rounded-full transition-all"><X size={24}/></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-8 bg-slate-50/50">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><UserIcon size={10} /> Técnico</p>
                            <p className="text-xs font-bold text-slate-800 truncate">{selectedVisit.technicianName}</p>
                        </div>
                        
                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Beef size={10} /> Lote / Setor</p>
                            {isEditingMode && editFormData ? (
                                <input 
                                    className="w-full text-xs font-bold text-slate-800 border-b border-slate-200 outline-none py-0.5 bg-transparent focus:border-zorion-500"
                                    value={editFormData.lot || ''}
                                    onChange={e => setEditFormData({...editFormData, lot: e.target.value})}
                                    placeholder="Nome do Lote"
                                />
                            ) : (
                                <p className="text-xs font-bold text-slate-800 truncate">{selectedVisit.lot || '-'}</p>
                            )}
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><Package size={10} /> Produto</p>
                            {isEditingMode && editFormData ? (
                                <input 
                                    className="w-full text-xs font-bold text-slate-800 border-b border-slate-200 outline-none py-0.5 bg-transparent focus:border-zorion-500"
                                    value={editFormData.product || ''}
                                    onChange={e => setEditFormData({...editFormData, product: e.target.value})}
                                    placeholder="Produto utilizado"
                                />
                            ) : (
                                <p className="text-xs font-bold text-slate-800 truncate">{selectedVisit.product || '-'}</p>
                            )}
                        </div>

                        <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><MapPin size={10} /> Unidade / Fazenda</p>
                            {isEditingMode && editFormData ? (
                                <select 
                                    className="w-full text-xs font-bold text-blue-600 bg-transparent outline-none border-b border-slate-200 focus:border-zorion-500"
                                    value={editFormData.clientId}
                                    onChange={e => setEditFormData({...editFormData, clientId: e.target.value})}
                                >
                                    {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.farmName})</option>)}
                                </select>
                            ) : (
                                <button onClick={() => onSelectClient(selectedVisit.clientId)} className="text-xs font-bold text-blue-600 truncate underline decoration-blue-200">
                                    {clients.find(c => c.id === selectedVisit.clientId)?.farmName || 'Ver Ficha'}
                                </button>
                            )}
                        </div>
                    </div>

                    {!isEditingMode && (
                        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-sm overflow-hidden relative">
                            <div className="absolute top-0 left-0 w-1.5 h-full bg-zorion-500"></div>
                            <div className="p-6 md:p-8">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest flex items-center gap-2">
                                        <Sparkles className="text-zorion-500" size={18} /> Resumo Inteligente
                                    </h4>
                                    <button 
                                        onClick={handleGenerateAISummary}
                                        disabled={isProcessingAI || !selectedVisit.transcript}
                                        className="text-[10px] font-black uppercase text-zorion-600 bg-zorion-50 hover:bg-zorion-100 px-3 py-1.5 rounded-lg transition-all flex items-center gap-2 disabled:opacity-50"
                                    >
                                        {isProcessingAI ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                                        {selectedVisit.aiSummary ? 'Regenerar Análise' : 'Gerar Análise'}
                                    </button>
                                </div>
                                
                                {selectedVisit.aiSummary ? (
                                    <div className="bg-zorion-50/50 p-6 rounded-2xl border border-zorion-100/50">
                                        <p className="text-sm font-medium text-zorion-900 leading-relaxed whitespace-pre-line">
                                            {selectedVisit.aiSummary}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                                        <p className="text-xs text-slate-400 font-bold italic">Nenhum resumo gerado pela IA ainda.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">
                                {isEditingMode ? 'Editar Relato Técnico' : 'Relato Técnico Original'}
                            </h4>
                            <div className={`bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm ${isEditingMode ? 'h-auto' : 'h-64 overflow-y-auto custom-scrollbar'}`}>
                                {isEditingMode && editFormData ? (
                                    <textarea 
                                        className="w-full h-64 text-xs font-medium text-slate-600 leading-loose outline-none resize-none bg-transparent"
                                        value={editFormData.transcript || ''}
                                        onChange={e => setEditFormData({...editFormData, transcript: e.target.value})}
                                        placeholder="Descreva o que foi realizado na visita..."
                                    />
                                ) : (
                                    <p className="text-xs font-medium text-slate-600 leading-loose">
                                        {selectedVisit.transcript || "Nenhuma anotação registrada."}
                                    </p>
                                )}
                            </div>
                        </div>

                        {!isEditingMode && (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center px-1">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Galeria de Mídia</h4>
                                    <span className="text-[10px] font-bold text-slate-300">{getAllAttachments(selectedVisit).length} Arquivos</span>
                                </div>
                                
                                {getAllAttachments(selectedVisit).length > 0 ? (
                                    <div className="grid grid-cols-3 gap-2">
                                        {getAllAttachments(selectedVisit).map((att, idx) => (
                                            <div 
                                                key={idx} 
                                                className="aspect-square bg-white rounded-xl border border-slate-100 flex flex-col items-center justify-center hover:border-zorion-500 hover:shadow-md transition-all group relative overflow-hidden"
                                            >
                                                {att.type === 'image' ? (
                                                    <img src={att.url} className="absolute inset-0 w-full h-full object-cover" alt="Anexo" />
                                                ) : (
                                                    <div className="flex flex-col items-center gap-1">
                                                        {getFileIcon(att.type)}
                                                        <span className="text-[8px] font-bold text-slate-400 mt-1 uppercase max-w-[90%] truncate px-1">{att.name || 'Arquivo'}</span>
                                                    </div>
                                                )}
                                                
                                                <div className="absolute inset-0 bg-slate-900/60 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <a 
                                                        href={att.url} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="p-2 bg-white text-slate-800 rounded-lg hover:bg-emerald-500 hover:text-white transition-all shadow-lg"
                                                    >
                                                        <ExternalLink size={16} />
                                                    </a>
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setAttachmentToDelete({ visit: selectedVisit, attId: att.id });
                                                        }}
                                                        className="p-2 bg-white text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-lg"
                                                    >
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="h-64 bg-white rounded-[2rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-300 gap-2">
                                        <ImageIcon size={24} className="opacity-20" />
                                        <span className="text-[10px] font-black uppercase tracking-widest">Sem anexos</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="px-8 py-5 border-t border-slate-100 bg-white flex justify-between items-center shrink-0">
                    {!isEditingMode ? (
                        <button 
                            onClick={() => setIsDeleteVisitConfirmOpen(true)}
                            className="flex items-center gap-2 text-red-500 hover:bg-red-50 px-4 py-2 rounded-xl transition-colors font-bold text-xs uppercase tracking-widest"
                        >
                            <Trash2 size={16} /> Excluir Registro
                        </button>
                    ) : (
                        <div></div>
                    )}
                    
                    <div className="flex gap-3">
                        {isEditingMode ? (
                            <>
                                <Button variant="outline" onClick={handleCancelEdit} className="px-8 py-3 rounded-2xl text-xs font-black uppercase flex items-center gap-2">
                                    <Undo size={14} /> Cancelar
                                </Button>
                                <Button onClick={handleSaveEdit} className="px-8 py-3 rounded-2xl text-xs font-black uppercase flex items-center gap-2">
                                    <Save size={14} /> Salvar Alterações
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="outline" onClick={() => setSelectedVisit(null)} className="px-8 py-3 rounded-2xl text-xs font-black uppercase">
                                    Fechar
                                </Button>
                                {onUpdateVisit && (
                                    <Button 
                                        onClick={handleStartEdit}
                                        className="px-8 py-3 rounded-2xl text-xs font-black uppercase flex items-center gap-2"
                                    >
                                        <Pencil size={14} /> Editar
                                    </Button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
      )}

      {isDeleteVisitConfirmOpen && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative border border-slate-100 flex flex-col items-center text-center">
                <div className="h-20 w-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6 border border-red-100">
                    <Trash2 size={40} />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2 italic tracking-tighter">Apagar este registro?</h3>
                <p className="text-sm text-slate-500 mb-8 font-medium">
                    Esta ação é permanente e não poderá ser desfeita. Todo o histórico dessa visita será removido.
                </p>
                <div className="flex gap-3 w-full">
                    <button 
                        onClick={() => setIsDeleteVisitConfirmOpen(false)} 
                        disabled={isDeleting}
                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleDeleteVisit} 
                        disabled={isDeleting}
                        className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isDeleting ? <Loader2 size={16} className="animate-spin" /> : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {attachmentToDelete && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-md animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative border border-slate-100 flex flex-col items-center text-center">
                <div className="h-20 w-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-6 border border-amber-100">
                    <AlertTriangle size={40} />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2 italic tracking-tighter">Remover anexo?</h3>
                <p className="text-sm text-slate-500 mb-8 font-medium">
                    Você está prestes a apagar este arquivo definitivamente. Deseja continuar?
                </p>
                <div className="flex gap-3 w-full">
                    <button 
                        onClick={() => setAttachmentToDelete(null)} 
                        disabled={isDeletingAttachment}
                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleConfirmDeleteAttachment} 
                        disabled={isDeletingAttachment}
                        className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isDeletingAttachment ? <Loader2 size={16} className="animate-spin" /> : 'Apagar'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Visits;
