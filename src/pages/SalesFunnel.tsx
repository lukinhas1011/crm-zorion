import React, { useState, useMemo, useRef } from 'react';
import { Deal, Stage, Pipeline, Activity, Client, User, CatalogItem, Visit, Attachment, DealProduct } from '../types';
import { 
  Plus, X, Building2, Trash2, ChevronDown, 
  Phone, Calendar, DollarSign, MessageSquare, Send, 
  Clock, History, Paperclip, Loader2, Trello,
  AlertTriangle, Beef, Package, Target, Coins, Camera, ImageIcon, Pencil, FileText
} from 'lucide-react';
import { Button } from '../components/Button';
import { KanbanColumn } from '../components/KanbanColumn';
import { uploadVisitFile, deleteVisitPhoto } from '../services/storageService';

interface SalesFunnelProps {
  deals: Deal[];
  stages: Stage[];
  pipelines: Pipeline[];
  activities: Activity[];
  clients: Client[];
  catalog: CatalogItem[];
  user: User;
  onAddDeal: (deal: Deal) => void;
  onUpdateDeal: (deal: Deal) => void;
  onDeleteDeal?: (dealId: string) => void;
  onAddVisit?: (visit: Visit) => void;
  onSelectClient: (clientId: string) => void;
  onAddCatalogItem?: (item: CatalogItem) => void;
  pendingDealId?: string;
  createForClientId?: string;
  onAddActivity: (activity: Activity) => void;
  onUpdateActivity?: (activity: Activity) => void;
  onDeleteActivity?: (activityId: string) => void;
  currencyMode?: 'BRL' | 'USD';
  exchangeRate?: number;
}

const FIXED_PIPELINE_ID = 'pip_principal';
const FIXED_STAGES: Stage[] = [
  { id: 'stg_1', pipelineId: FIXED_PIPELINE_ID, name: 'Cliente potencial', order: 1, probability: 20 },
  { id: 'stg_2', pipelineId: FIXED_PIPELINE_ID, name: 'Estabelecimento de oportunidade', order: 2, probability: 40 },
  { id: 'stg_3', pipelineId: FIXED_PIPELINE_ID, name: 'Validação de negociação', order: 3, probability: 60 },
  { id: 'stg_4', pipelineId: FIXED_PIPELINE_ID, name: 'Validação', order: 4, probability: 80 },
  { id: 'stg_5', pipelineId: FIXED_PIPELINE_ID, name: 'Negociação comercial', order: 5, probability: 100 }
];

const SalesFunnel: React.FC<SalesFunnelProps> = ({ 
  deals, stages, pipelines, activities, clients, catalog, user, 
  onAddDeal, onUpdateDeal, onDeleteDeal, onAddVisit, onSelectClient, onAddCatalogItem, pendingDealId, createForClientId, onAddActivity, onUpdateActivity, onDeleteActivity,
  currencyMode = 'USD', exchangeRate = 1
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editDealData, setEditDealData] = useState<Deal | null>(null);
  
  const [itemToDelete, setItemToDelete] = useState<{type: 'attachment' | 'activity' | 'deal', data: any} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [quickNote, setQuickNote] = useState('');
  const [interactionType, setInteractionType] = useState<'Call' | 'Email' | 'Whatsapp' | 'Meeting'>('Call');
  const [quickFiles, setQuickFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editActFiles, setEditActFiles] = useState<File[]>([]);
  const [isSavingEditAct, setIsSavingEditAct] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const editActFileInputRef = useRef<HTMLInputElement>(null);

  const handleNewDeal = () => {
    const newDeal: Deal = {
        id: `deal_${Date.now()}`,
        title: 'Nova Oportunidade',
        clientId: createForClientId || (clients.length > 0 ? clients[0].id : ''),
        clientName: '',
        farmName: createForClientId ? (clients.find(c => c.id === createForClientId)?.farmName || 'Selecione o Cliente') : 'Selecione o Cliente',
        pipelineId: FIXED_PIPELINE_ID,
        stageId: FIXED_STAGES[0].id,
        value: 0,
        currency: 'USD',
        status: 'Open',
        creatorId: user.id,
        creatorName: user.name,
        products: [],
        lastStageChangeDate: new Date().toISOString(),
        ownerName: user.name,
        visibility: 'Team',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    setEditDealData(newDeal);
    setQuickFiles([]);
    setIsEditModalOpen(true);
  };

  const handleSaveDeal = () => {
    if (!editDealData) return;
    const isNew = !deals.some(d => d.id === editDealData.id);
    if (isNew) onAddDeal(editDealData);
    else onUpdateDeal(editDealData);
    setIsEditModalOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      setQuickFiles(prev => [...prev, ...selected]);
      e.target.value = '';
    }
  };

  const updateProduct = (idx: number, updates: Partial<DealProduct>) => {
    if (!editDealData) return;
    const newProducts = [...(editDealData.products || [])];
    newProducts[idx] = { ...newProducts[idx], ...updates };
    const newValue = newProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
    setEditDealData({ ...editDealData, products: newProducts, value: newValue });
  };

  const removeProduct = (idx: number) => {
    if (!editDealData) return;
    const newProducts = editDealData.products.filter((_, i) => i !== idx);
    const newValue = newProducts.reduce((sum, p) => sum + (p.price * p.quantity), 0);
    setEditDealData({ ...editDealData, products: newProducts, value: newValue });
  };

  const handleQuickAddProduct = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'NEW_PRODUCT') {
        const name = prompt("Nome do novo produto:");
        if (name && onAddCatalogItem) {
            const newItem: CatalogItem = {
                id: `prod_${Date.now()}`,
                name: name.trim(),
                type: 'product',
                active: true,
                properties: {},
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            onAddCatalogItem(newItem);
            if (editDealData) {
                const newProd = { productId: newItem.id, name: newItem.name, quantity: 1, price: 0, taxPercent: 0 };
                setEditDealData({ ...editDealData, products: [...(editDealData.products || []), newProd] });
            }
        }
        e.target.value = "";
    } else if (val && editDealData) {
        const prod = catalog.find(p => p.id === val);
        if (prod) {
            const newProd = { productId: prod.id, name: prod.name, quantity: 1, price: 0, taxPercent: 0 };
            setEditDealData({ ...editDealData, products: [...(editDealData.products || []), newProd] });
        }
        e.target.value = "";
    }
  };

  const handleRegisterInteraction = async () => {
    if (!editDealData || (!quickNote && quickFiles.length === 0)) return;
    setIsUploading(true);
    try {
        const actId = `act_${Date.now()}`;
        const atts: Attachment[] = [];
        for (const file of quickFiles) {
            const url = await uploadVisitFile(file, editDealData.clientId, actId);
            atts.push({ 
                id: `att_${Math.random().toString(36).substr(2, 9)}`, 
                url, 
                name: file.name, 
                type: file.type.startsWith('image/') ? 'image' : 'document' 
            });
        }
        onAddActivity({
          id: actId, clientId: editDealData.clientId, dealId: editDealData.id,
          type: interactionType as any, title: `${interactionType} Registrada`,
          description: quickNote, dueDate: new Date().toISOString(), isDone: true,
          technicianId: user.id, attachments: atts, createdAt: new Date().toISOString()
        });
        setQuickNote(''); setQuickFiles([]);
    } catch (e) {
        alert("Erro ao salvar interação.");
    } finally {
        setIsUploading(false);
    }
  };

  const handleUpdateActivityDetails = async () => {
    if (!editingActivity || !onUpdateActivity) return;
    setIsSavingEditAct(true);
    try {
        const atts = [...(editingActivity.attachments || [])];
        for (const file of editActFiles) {
            const url = await uploadVisitFile(file, editingActivity.clientId, editingActivity.id);
            atts.push({ 
                id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, 
                url, 
                name: file.name, 
                type: file.type.startsWith('image/') ? 'image' : 'document' 
            });
        }
        const { itemType, sortDate, ...cleanActivity } = editingActivity as any;
        const updatedActivity = { 
          ...cleanActivity, 
          attachments: atts,
          title: `${cleanActivity.type} Registrada`
        };
        await onUpdateActivity(updatedActivity);
        setEditingActivity(null);
        setEditActFiles([]);
    } catch (e) {
        console.error("Erro ao atualizar atividade:", e);
        alert("Erro ao atualizar interação.");
    } finally {
        setIsSavingEditAct(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      if (itemToDelete.type === 'attachment' && onUpdateActivity) {
        const { activity, attId } = itemToDelete.data;
        const att = (activity.attachments || []).find((a: Attachment) => a.id === attId);
        if (att?.url) { try { await deleteVisitPhoto(att.url); } catch (e) {} }
        const updatedAttachments = (activity.attachments || []).filter((a: Attachment) => a.id !== attId);
        const updatedAct = { ...activity, attachments: updatedAttachments };
        await onUpdateActivity(updatedAct);
        if (editingActivity && editingActivity.id === activity.id) {
          setEditingActivity(updatedAct);
        }
      } else if (itemToDelete.type === 'activity' && onDeleteActivity) {
        await onDeleteActivity(itemToDelete.data.id);
      } else if (itemToDelete.type === 'deal' && onDeleteDeal) {
        await onDeleteDeal(itemToDelete.data.id);
        setIsEditModalOpen(false);
      }
      setItemToDelete(null);
    } catch (error) {
      alert("Erro ao excluir item.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      const isFromSalesPipeline = FIXED_STAGES.some(s => s.id === d.stageId);
      const matchesSearch = d.title.toLowerCase().includes(searchTerm.toLowerCase()) || d.farmName.toLowerCase().includes(searchTerm.toLowerCase());
      return d.status === 'Open' && matchesSearch && isFromSalesPipeline;
    });
  }, [deals, searchTerm]);

  const dealTimeline = useMemo(() => {
    if (!editDealData) return [];
    return activities.filter(a => a.dealId === editDealData.id).sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  }, [editDealData, activities]);

  const isNewDeal = editDealData && !deals.some(d => d.id === editDealData.id);

  const formatDateTimeLocal = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const z = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] md:h-screen bg-[#f4f7f9] overflow-hidden">
      <div className="hidden md:flex flex-none bg-white border-b px-6 py-4 justify-between items-center z-20">
         <div className="flex items-center gap-3">
             <Trello size={18} className="text-zorion-900" />
             <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 italic">Oportunidades</h3>
             <input type="text" placeholder="Filtrar..." className="ml-4 px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
         </div>
         <Button onClick={handleNewDeal} className="bg-zorion-900 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase shadow-lg">Nova Oportunidade</Button>
      </div>

      <div className="flex-1 flex overflow-x-auto p-4 gap-4">
        {FIXED_STAGES.map((stage, idx) => (
           <KanbanColumn 
             key={stage.id} stage={stage} index={idx} 
             deals={filteredDeals.filter(d => d.stageId === stage.id)} 
             activities={activities}
             onDealClick={(d) => { setEditDealData(d); setQuickFiles([]); setIsEditModalOpen(true); }}
             onMoveDeal={(id, sid) => onUpdateDeal({...deals.find(d => d.id === id)!, stageId: sid})}
           />
        ))}
      </div>

      {isEditModalOpen && editDealData && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-0 md:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-hidden">
          <div className="bg-white md:rounded-[2.5rem] w-full max-w-7xl shadow-2xl relative flex flex-col h-full md:h-[94vh] border border-slate-100 overflow-hidden">
             
             <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4 flex-1">
                    <div className="h-14 w-14 bg-[#009b58] rounded-2xl flex items-center justify-center text-white shadow-lg shrink-0">
                        <DollarSign size={28} />
                    </div>
                    <div className="w-full max-w-md">
                        <div className="flex items-center gap-2 mb-1">
                            <select 
                                className="bg-slate-50 border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-700 rounded-lg py-1 px-2 outline-none focus:border-zorion-500 w-full"
                                value={editDealData.clientId}
                                onChange={(e) => {
                                    const c = clients.find(cl => cl.id === e.target.value);
                                    if(c) setEditDealData({...editDealData, clientId: c.id, farmName: c.farmName, clientName: c.name});
                                }}
                            >
                                <option value="" disabled>Selecione o Cliente</option>
                                {clients.map(c => <option key={c.id} value={c.id}>{c.name} - {c.farmName}</option>)}
                            </select>
                            <span className="bg-[#e7f6f0] text-[#009b58] px-2 py-0.5 rounded text-[9px] font-black uppercase border border-[#c9ebd9] whitespace-nowrap">
                                {isNewDeal ? 'Novo' : 'Oportunidade'}
                            </span>
                        </div>
                        <input 
                            className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase leading-none bg-transparent outline-none w-full placeholder-slate-300"
                            value={editDealData.title}
                            onChange={(e) => setEditDealData({...editDealData, title: e.target.value})}
                            placeholder="Nome da Negociação..."
                        />
                    </div>
                </div>
                
                <div className="flex items-center gap-8">
                    <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Valor Total (Deal)</p>
                        <div className="flex items-baseline justify-end gap-1">
                            <span className="text-2xl font-black text-[#009b58] italic leading-none">$</span>
                            <input 
                                type="number"
                                className="text-2xl font-black text-[#009b58] italic bg-transparent outline-none w-48 text-right placeholder-emerald-200 py-1"
                                value={editDealData.value}
                                onChange={(e) => setEditDealData({...editDealData, value: Number(e.target.value)})}
                                placeholder="0,00"
                            />
                        </div>
                    </div>
                    <button onClick={() => setIsEditModalOpen(false)} className="p-2 text-slate-300 hover:text-slate-600 transition-colors"><X size={32}/></button>
                </div>
             </div>

             <div className="flex px-8 py-4 bg-slate-50/50 border-b border-slate-100 shrink-0 gap-1 overflow-x-auto">
                {FIXED_STAGES.map((s, i) => {
                    const isCurrent = editDealData.stageId === s.id;
                    const isPast = FIXED_STAGES.findIndex(fs => fs.id === editDealData.stageId) > i;
                    return (
                        <button 
                            key={s.id} 
                            onClick={() => setEditDealData({...editDealData, stageId: s.id})}
                            className={`flex-1 h-8 flex items-center justify-center text-[9px] font-black uppercase tracking-tighter clip-path-arrow px-4 transition-all min-w-[120px] ${isCurrent ? 'bg-[#009b58] text-white shadow-lg z-10' : isPast ? 'bg-[#c9ebd9] text-[#009b58] hover:bg-[#b0e2c9]' : 'bg-[#e2e8f0] text-[#94a3b8] hover:bg-slate-200'}`}
                        >
                            {s.name}
                        </button>
                    );
                })}
             </div>

             <div className="flex-1 flex overflow-hidden flex-col md:flex-row">
                <div className="w-full md:w-[340px] border-r border-slate-100 p-8 space-y-6 overflow-y-auto bg-slate-50/30">
                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                        <h4 className="text-xs font-black uppercase text-slate-800 mb-4 flex items-center gap-2"><MessageSquare size={14} className="text-blue-600" /> Registrar Interação</h4>
                        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-3">
                            {(['Call', 'Whatsapp', 'Email', 'Meeting'] as const).map(t => (
                                <button key={t} onClick={() => setInteractionType(t)} className={`flex-1 py-2 text-[9px] font-black uppercase rounded-lg transition-all ${interactionType === t ? 'bg-white text-zorion-900 shadow-sm' : 'text-slate-400'}`}>{t}</button>
                            ))}
                        </div>
                        <textarea value={quickNote} onChange={e => setQuickNote(e.target.value)} className="w-full h-32 p-4 bg-white border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-zorion-500 transition-all shadow-inner" placeholder={`Detalhes da ${interactionType}...`} />
                        
                        {quickFiles.length > 0 && (
                          <div className="mt-4 space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                             <p className="text-[9px] font-black uppercase text-slate-400 px-1">Anexos prontos ({quickFiles.length}):</p>
                             {quickFiles.map((f, i) => (
                               <div key={i} className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100 group/file">
                                  <div className="flex items-center gap-2 overflow-hidden">
                                     {f.type.startsWith('image/') ? <ImageIcon size={12} className="text-purple-500 shrink-0" /> : <Paperclip size={12} className="text-slate-400 shrink-0" />}
                                     <span className="text-[10px] font-bold text-slate-600 truncate">{f.name}</span>
                                  </div>
                                  <button type="button" onClick={() => setQuickFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 p-1 transition-colors"><Trash2 size={14} /></button>
                               </div>
                             ))}
                          </div>
                        )}

                        <div className="flex justify-between items-center gap-2 mt-4">
                            <button type="button" onClick={() => cameraInputRef.current?.click()} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-purple-600 shadow-sm active:scale-95 transition-all"><Camera size={18} /></button>
                            <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-zorion-600 shadow-sm active:scale-95 transition-all"><Paperclip size={18} /></button>
                            
                            <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                            <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileChange} />
                            
                            <Button onClick={handleRegisterInteraction} isLoading={isUploading} className="flex-1 py-3 rounded-xl text-[10px] font-black uppercase bg-[#83a697] hover:bg-[#6c8a7c] text-white shadow-md flex items-center justify-center gap-2"><Send size={14}/> Registrar</Button>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-[2rem] border border-slate-100 shadow-sm">
                        <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Probabilidade</h4>
                        <div className="flex items-center gap-4">
                            <input type="range" className="flex-1 accent-[#009b58]" value={editDealData.probability || 20} onChange={(e) => setEditDealData({...editDealData, probability: Number(e.target.value)})} />
                            <span className="text-lg font-black text-[#009b58] italic">{editDealData.probability || 20}%</span>
                        </div>
                    </div>
                </div>

                <div className="flex-1 p-8 overflow-y-auto space-y-8 bg-white">
                    <div className="bg-white rounded-[2rem] border-2 border-slate-100 p-6">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="text-[11px] font-black uppercase text-slate-900 flex items-center gap-2"><Package size={16} className="text-[#009b58]"/> Produtos e Serviços</h4>
                            <span className="text-[10px] font-bold text-slate-400">{editDealData.products?.length || 0} ITENS</span>
                        </div>
                        {editDealData.products?.length > 0 ? (
                            editDealData.products.map((prod, idx) => (
                                <div key={idx} className="bg-slate-50 p-4 rounded-xl flex items-center gap-4 border border-slate-100 mb-2 group/prod">
                                    <div className="h-10 w-10 bg-white rounded-lg border border-slate-200 flex items-center justify-center shadow-sm shrink-0"><Beef size={20} className="text-slate-400"/></div>
                                    <div className="flex-1 min-w-0">
                                        <input 
                                          type="text" 
                                          className="w-full bg-transparent border-none text-sm font-bold text-slate-700 outline-none p-0" 
                                          value={prod.name} 
                                          onChange={(e) => updateProduct(idx, { name: e.target.value })}
                                        />
                                    </div>
                                    <div className="flex items-center gap-4 text-sm font-bold shrink-0">
                                        <div className="flex flex-col items-center">
                                          <span className="text-[8px] text-slate-400 uppercase">Qtd</span>
                                          <input 
                                            type="number" 
                                            className="w-12 bg-white border border-slate-200 rounded px-1 py-0.5 text-center text-xs font-bold outline-none" 
                                            value={prod.quantity} 
                                            onChange={(e) => updateProduct(idx, { quantity: Number(e.target.value) })}
                                          />
                                        </div>
                                        <div className="flex flex-col items-end">
                                          <span className="text-[8px] text-slate-400 uppercase">Unitário R$</span>
                                          <input 
                                            type="number" 
                                            className="w-24 bg-white border border-slate-200 rounded px-2 py-0.5 text-right text-xs font-bold outline-none text-[#009b58]" 
                                            value={prod.price} 
                                            onChange={(e) => updateProduct(idx, { price: Number(e.target.value) })}
                                          />
                                        </div>
                                        <button 
                                          onClick={() => removeProduct(idx)}
                                          className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                          title="Remover produto"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="text-center py-6 text-slate-300 text-xs italic font-bold">Nenhum produto selecionado</div>
                        )}
                        
                        <div className="mt-4 flex gap-2">
                            <select 
                                className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-600 outline-none"
                                onChange={handleQuickAddProduct}
                            >
                                <option value="">+ Adicionar Produto do Catálogo</option>
                                {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                <option value="NEW_PRODUCT" className="text-zorion-600 font-black">+ CADASTRAR NOVO PRODUTO</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1"><History size={16} /> Histórico de Ações</h4>
                        {dealTimeline.length > 0 ? (
                            dealTimeline.map(act => (
                                <div key={act.id} className="flex gap-4 relative group/item">
                                    <div className="absolute left-5 top-10 bottom-0 w-px bg-slate-100"></div>
                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm ${act.type === 'Whatsapp' ? 'bg-[#e7f6f0] text-[#009b58]' : 'bg-blue-50 text-blue-600'}`}>
                                        {act.type === 'Whatsapp' ? <MessageSquare size={16}/> : <Phone size={16}/>}
                                    </div>
                                    <div className="flex-1 bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative">
                                        <div className="flex justify-between mb-1">
                                            <span className="text-[10px] font-black uppercase text-slate-800">{act.type}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold text-slate-400">{new Date(act.dueDate).toLocaleDateString('pt-BR')}</span>
                                                <button onClick={() => { setEditingActivity(act); setEditActFiles([]); }} className="p-1 text-slate-300 hover:text-blue-500 transition-colors"><Pencil size={12} /></button>
                                                <button onClick={() => setItemToDelete({ type: 'activity', data: act })} className="text-red-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                                            </div>
                                        </div>
                                        <p className="text-xs font-medium text-slate-600 leading-relaxed">{act.description}</p>
                                        {act.attachments && act.attachments.map(att => (
                                            <div key={att.id} className="mt-3 flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-100 group/att">
                                                <a href={att.url} target="_blank" className="text-[10px] font-bold text-blue-600 flex items-center gap-2 hover:underline"><Paperclip size={12}/> {att.name}</a>
                                                <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setItemToDelete({ type: 'attachment', data: { activity: act, attId: att.id } }); }} className="text-red-400 hover:text-red-600 transition-colors opacity-100 p-1 cursor-pointer"><Trash2 size={14}/></button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="py-12 text-center text-slate-300 font-black italic uppercase text-[10px] tracking-widest">Nenhuma atividade registrada</div>
                        )}
                    </div>
                </div>
             </div>

             <div className="px-8 py-5 border-t border-slate-100 flex justify-between items-center shrink-0 bg-white">
                <button onClick={() => setItemToDelete({ type: 'deal', data: editDealData })} className="text-red-500 font-black text-[11px] uppercase flex items-center gap-2 px-4 py-2 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16} /> Excluir</button>
                <div className="flex gap-3">
                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all">Fechar</button>
                    <button type="button" onClick={handleSaveDeal} className="px-12 py-3 bg-[#009b58] text-white rounded-xl text-[10px] font-black uppercase shadow-xl shadow-[#009b58]/20 hover:bg-[#007e47] transition-all">Salvar Alterações</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Editing Activity Modal */}
      {editingActivity && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl relative border border-slate-100 flex flex-col max-h-[90vh]">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-xl font-black text-slate-900 italic tracking-tighter uppercase">Editar Interação</h3>
                 <button onClick={() => setEditingActivity(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
              </div>
              <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1">
                 <div>
                   <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Tipo</label>
                   <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mt-1">
                       {(['Call', 'Meeting', 'Whatsapp', 'Email'] as const).map(t => (
                           <button key={t} onClick={() => setEditingActivity({...editingActivity, type: t as any})} className={`flex-1 py-2 text-[9px] font-black uppercase rounded-lg transition-all ${editingActivity.type === t ? 'bg-white text-zorion-900 shadow-sm' : 'text-slate-400'}`}>{t}</button>
                       ))}
                   </div>
                 </div>
                 <div>
                   <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Data e Hora</label>
                   <input 
                     type="datetime-local" 
                     className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold mt-1 outline-none focus:border-zorion-500"
                     value={formatDateTimeLocal(editingActivity.dueDate)}
                     onChange={(e) => setEditingActivity({...editingActivity, dueDate: new Date(e.target.value).toISOString()})}
                   />
                 </div>
                 <div>
                   <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Descrição</label>
                   <textarea 
                     className="w-full h-32 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold mt-1 outline-none focus:border-zorion-500" 
                     value={editingActivity.description} 
                     onChange={e => setEditingActivity({...editingActivity, description: e.target.value})}
                   />
                 </div>

                 {editingActivity.attachments && editingActivity.attachments.length > 0 && (
                   <div className="space-y-2">
                     <p className="text-[9px] font-black uppercase text-slate-400 px-1">Anexos Atuais:</p>
                     {editingActivity.attachments.map((att) => (
                       <div key={att.id} className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
                          <div className="flex items-center gap-2 overflow-hidden">
                             {att.type === 'image' ? <ImageIcon size={12} className="text-purple-500" /> : <Paperclip size={12} className="text-slate-400" />}
                             <span className="text-[10px] font-bold text-slate-600 truncate">{att.name}</span>
                          </div>
                          <button type="button" onClick={() => setItemToDelete({ type: 'attachment', data: { activity: editingActivity, attId: att.id } })} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                       </div>
                     ))}
                   </div>
                 )}

                 {editActFiles.length > 0 && (
                   <div className="space-y-2">
                     <p className="text-[9px] font-black uppercase text-slate-400 px-1 text-emerald-600">Novos para Upload:</p>
                     {editActFiles.map((f, i) => (
                       <div key={i} className="flex items-center justify-between bg-emerald-50/50 p-2 rounded-xl border border-emerald-100">
                          <div className="flex items-center gap-2 overflow-hidden">
                             <Paperclip size={12} className="text-emerald-500" />
                             <span className="text-[10px] font-bold text-emerald-700 truncate">{f.name}</span>
                          </div>
                          <button type="button" onClick={() => setEditActFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                       </div>
                     ))}
                   </div>
                 )}

                 <div className="flex gap-2 pt-2">
                    <button type="button" onClick={() => editActFileInputRef.current?.click()} className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-zorion-600 shadow-sm active:scale-95 transition-all"><Paperclip size={24} /></button>
                    <input type="file" multiple className="hidden" ref={editActFileInputRef} onChange={(e) => e.target.files && setEditActFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
                    <Button onClick={handleUpdateActivityDetails} isLoading={isSavingEditAct} className="flex-1 py-4 rounded-2xl font-black uppercase text-xs shadow-lg">SALVAR ALTERAÇÕES</Button>
                 </div>
              </div>
           </div>
        </div>
      )}

      {itemToDelete && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative border border-slate-100 flex flex-col items-center text-center">
                <div className="h-20 w-20 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mb-6 border border-amber-100"><AlertTriangle size={40} /></div>
                <h3 className="text-xl font-black text-slate-900 mb-2 italic tracking-tighter uppercase">{itemToDelete.type === 'attachment' ? 'Remover anexo?' : itemToDelete.type === 'activity' ? 'Apagar interação?' : 'Excluir Oportunidade?'}</h3>
                <p className="text-sm text-slate-500 mb-8 font-medium px-4 leading-relaxed">{itemToDelete.type === 'deal' ? 'Você está prestes a apagar todo o card desta oportunidade. Isso é irreversível.' : 'Você está prestes a apagar este item definitivamente. Deseja continuar?'}</p>
                <div className="flex gap-3 w-full">
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setItemToDelete(null); }} disabled={isDeleting} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors">CANCELAR</button>
                    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDeleteConfirm(); }} disabled={isDeleting} className="flex-1 py-4 bg-[#e53935] text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-red-700 transition-colors">{isDeleting ? <Loader2 size={16} className="animate-spin" /> : 'APAGAR'}</button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default SalesFunnel;