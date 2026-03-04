import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Deal, Stage, Activity, Client, User, CatalogItem, Visit, Attachment, DealProduct } from '../types';
import { 
  Plus, X, BarChart3, Trash2, Beef, Package, 
  Phone, Calendar, DollarSign, User as UserIcon, 
  Clock, History, Paperclip, Loader2, 
  MessageSquare, Send, AlertTriangle, Building2,
  FileText, Camera, ImageIcon, Pencil, Search, UserPlus, Check, Video, ExternalLink, FlaskConical
} from 'lucide-react';
import { Button } from '../components/Button';
import { KanbanColumn } from '../components/KanbanColumn';
import { uploadVisitFile, deleteVisitPhoto } from '../services/storageService';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTIONS, prepareForSave } from '../services/dbSchema';

interface ProductionFunnelProps {
  deals: Deal[];
  activities: Activity[];
  clients: Client[];
  visits?: Visit[];
  catalog: CatalogItem[];
  user: User;
  onAddDeal: (deal: Deal) => void;
  onUpdateDeal: (deal: Deal) => void;
  onDeleteDeal?: (dealId: string) => void;
  onSelectClient: (clientId: string) => void;
  onAddVisit?: (visit: Visit) => void;
  onUpdateClient?: (client: Client) => void;
  onAddCatalogItem?: (item: CatalogItem) => void; 
  pendingDealId?: string;
  createForClientId?: string;
  onAddActivity: (activity: Activity) => void;
  onUpdateActivity?: (activity: Activity) => void;
  onDeleteActivity?: (activityId: string) => void;
  currencyMode?: 'BRL' | 'USD';
  exchangeRate?: number;
}

const PRODUCTION_PIPELINE_ID = 'pip_capacidade';
const CAPACITY_STAGES: Stage[] = [
  { id: 'cap_1', pipelineId: PRODUCTION_PIPELINE_ID, name: 'Até 5%', order: 1, probability: 5 },
  { id: 'cap_2', pipelineId: PRODUCTION_PIPELINE_ID, name: 'De 5 a 15%', order: 2, probability: 15 },
  { id: 'cap_3', pipelineId: PRODUCTION_PIPELINE_ID, name: 'De 15 a 30%', order: 3, probability: 30 },
  { id: 'cap_4', pipelineId: PRODUCTION_PIPELINE_ID, name: 'De 30 a 60%', order: 4, probability: 60 },
  { id: 'cap_5', pipelineId: PRODUCTION_PIPELINE_ID, name: 'Mais de 60%', order: 5, probability: 100 }
];

const ProductionFunnel: React.FC<ProductionFunnelProps> = ({ 
  deals, activities, clients, visits = [], catalog, user, 
  onAddDeal, onUpdateDeal, onDeleteDeal, onSelectClient, onAddVisit, onUpdateClient, onAddCatalogItem, pendingDealId,
  createForClientId, onAddActivity, onUpdateActivity, onDeleteActivity, currencyMode = 'USD', exchangeRate = 1
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editDealData, setEditDealData] = useState<Deal | null>(null);
  const [activeTab, setActiveTab] = useState<'interaction' | 'formula'>('interaction');

  // States para o Modal de Seleção de Cliente
  const [isSelectionModalOpen, setIsSelectionModalOpen] = useState(false);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [clientSearch, setClientSearch] = useState('');
  const [newClientData, setNewClientData] = useState({ name: '', farmName: '' });
  const [isSavingClient, setIsSavingClient] = useState(false);

  // States para Novo Produto (Modal)
  const [isNewProductModalOpen, setIsNewProductModalOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');

  const [itemToDelete, setItemToDelete] = useState<{type: 'attachment' | 'activity' | 'deal', data: any} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [quickNote, setQuickNote] = useState('');
  const [interactionType, setInteractionType] = useState<'Call' | 'Email' | 'Whatsapp' | 'Meeting' | 'Task'>('Call');
  const [interactionProduct, setInteractionProduct] = useState(''); // Produto específico da visita
  const [interactionDate, setInteractionDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  const [quickFiles, setQuickFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);

  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editActFiles, setEditActFiles] = useState<File[]>([]);
  const [isSavingEditAct, setIsSavingEditAct] = useState(false);

  // States para Reversão (Reabrir no Funil de Vendas)
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [dealToReopen, setDealToReopen] = useState<Deal | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const editActFileInputRef = useRef<HTMLInputElement>(null);

  // Abre o modal de seleção antes do modal de Deal
  const handleStartNewDeal = () => {
    setIsSelectionModalOpen(true);
    setIsCreatingClient(false);
    setClientSearch('');
    setNewClientData({ name: '', farmName: '' });
  };

  const handleSelectExistingClient = (client: Client) => {
    setIsSelectionModalOpen(false);
    openDealModalForClient(client);
  };

  const handleReopenDeal = useCallback((deal: Deal) => {
    setDealToReopen(deal);
    setIsReopenModalOpen(true);
  }, []);

  const handleConfirmReopenDeal = useCallback(() => {
    if (!dealToReopen) return;
    // Mover de volta para o funil de vendas (pip_principal)
    onUpdateDeal({ 
        ...dealToReopen, 
        status: 'Open', 
        pipelineId: 'pip_principal',
        stageId: 'stg_1', // Volta para a primeira etapa de vendas ou mantém se tiver stg_
        updatedAt: new Date().toISOString(),
        customAttributes: {
            ...(dealToReopen.customAttributes || {}),
            transferredFromSales: false // Remove a flag de transferência
        }
    });
    setIsReopenModalOpen(false);
    setDealToReopen(null);
  }, [dealToReopen, onUpdateDeal]);

  const handleCreateAndSelectClient = async () => {
    if (!newClientData.name || !newClientData.farmName) return;
    setIsSavingClient(true);
    try {
        const newClientId = `cli_${Date.now()}`;
        const newClient: Client = {
            id: newClientId,
            type: 'Fazenda',
            name: newClientData.name,
            farmName: newClientData.farmName,
            phone: '',
            email: '',
            location: { lat: 0, lng: 0, address: '' },
            herdSize: 0,
            treatedHerdSize: 0,
            lots: [],
            tags: [],
            status: 'Ativo',
            assignedTechnicianId: user.id,
            assignedTechnicianIds: [user.id],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, COLLECTIONS.CLIENTS, newClientId), prepareForSave(newClient, true));
        
        setIsSelectionModalOpen(false);
        openDealModalForClient(newClient);
    } catch (error) {
        console.error("Erro ao criar cliente rápido:", error);
        alert("Erro ao criar cliente.");
    } finally {
        setIsSavingClient(false);
    }
  };

  const openDealModalForClient = (client: Client) => {
    const newDeal: Deal = {
        id: `deal_prod_${Date.now()}`,
        title: client.name, // Nome do cliente como título
        clientId: client.id,
        clientName: client.name,
        farmName: client.farmName,
        pipelineId: PRODUCTION_PIPELINE_ID,
        stageId: CAPACITY_STAGES[0].id,
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
    
    onAddDeal(newDeal);

    setEditDealData(newDeal);
    setQuickFiles([]);
    setInteractionProduct('');
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setInteractionDate(now.toISOString().slice(0, 16));
    setIsEditModalOpen(true);
  };

  const handleEditDealClick = (d: Deal) => {
    let dealToEdit = { ...d };
    if (dealToEdit.title && dealToEdit.title.toLowerCase() === 'nova ocupação') {
        dealToEdit.title = dealToEdit.clientName || 'Novo Cliente';
    }
    setEditDealData(dealToEdit);
    setQuickFiles([]);
    setInteractionProduct('');
    setIsEditModalOpen(true);
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
        
        const finalDescription = interactionProduct 
            ? `[Produto: ${interactionProduct}]\n\n${quickNote}` 
            : quickNote;

        onAddActivity({
          id: actId, clientId: editDealData.clientId, dealId: editDealData.id,
          type: interactionType as any, title: `${interactionType} Registrada`,
          description: finalDescription, 
          dueDate: new Date(interactionDate).toISOString(), 
          isDone: true,
          technicianId: user.id, attachments: atts, createdAt: new Date().toISOString()
        });
        setQuickNote(''); setQuickFiles([]); setInteractionProduct('');
    } catch (e) {
        alert("Erro ao salvar relato.");
    } finally {
        setIsUploading(false);
    }
  };

  const handleSaveDeal = async () => {
    if (!editDealData) return;
    
    if (quickNote.trim() || quickFiles.length > 0) {
        await handleRegisterInteraction();
    }

    onUpdateDeal(editDealData);
    setIsEditModalOpen(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      setQuickFiles(prev => [...prev, ...selected]);
      e.target.value = '';
    }
  };

  const handleQuickAddProductToDeal = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'NEW_PRODUCT') {
        setIsNewProductModalOpen(true);
    } else if (val && editDealData) {
        const prod = catalog.find(p => p.id === val);
        if (prod) {
            const newProd = { productId: prod.id, name: prod.name, quantity: 1, price: 0, taxPercent: 0 };
            setEditDealData({ ...editDealData, products: [...(editDealData.products || []), newProd] });
        }
    }
  };

  const handleInteractionProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'NEW_PRODUCT') {
        setIsNewProductModalOpen(true);
    } else {
        setInteractionProduct(val);
    }
  };

  const handleConfirmNewProduct = () => {
    if (newProductName && onAddCatalogItem) {
        const newItem: CatalogItem = {
            id: `prod_${Date.now()}`,
            name: newProductName.trim(),
            type: 'product',
            active: true,
            properties: {},
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        onAddCatalogItem(newItem);
        setIsNewProductModalOpen(false);
        setNewProductName("");
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
        console.error("Erro ao atualizar registro técnico:", e);
        alert("Erro ao atualizar registro.");
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
        if (att?.url) { try { await deleteVisitPhoto(att.url); } catch (e) { console.warn("Foto inacessível"); } }
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
      console.error("Erro exclusão:", error);
      alert("Erro ao excluir item.");
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredDeals = useMemo(() => {
    return deals.filter(d => {
      const isFromCapacityPipeline = CAPACITY_STAGES.some(s => s.id === d.stageId);
      const matchesSearch = d.title.toLowerCase().includes(searchTerm.toLowerCase()) || d.farmName.toLowerCase().includes(searchTerm.toLowerCase());
      return d.status === 'Open' && matchesSearch && isFromCapacityPipeline;
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
             <BarChart3 size={18} className="text-zorion-900" />
             <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 italic">Clientes Ativos</h3>
             <input type="text" placeholder="Filtrar..." className="ml-4 px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
         </div>
         <Button onClick={handleStartNewDeal} className="bg-zorion-900 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase shadow-lg">Novo cliente</Button>
      </div>

      <div className="flex-1 flex overflow-x-auto p-2 md:p-4 gap-2 md:gap-4 snap-x snap-mandatory md:snap-none">
        {CAPACITY_STAGES.map((stage, idx) => (
           <div key={stage.id} className="snap-center h-full">
               <KanbanColumn 
                 stage={stage} index={idx} 
                 deals={filteredDeals.filter(d => d.stageId === stage.id)} 
                 activities={activities}
                 onDealClick={handleEditDealClick}
                 onMoveDeal={(id, sid) => onUpdateDeal({...deals.find(d => d.id === id)!, stageId: sid})}
                 onDealUpdate={onUpdateDeal}
                 onRevert={handleReopenDeal}
               />
           </div>
        ))}
      </div>

      {/* MODAL DE SELEÇÃO DE CLIENTE */}
      {isSelectionModalOpen && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative border border-slate-100 flex flex-col max-h-[85vh]">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black text-slate-900 italic tracking-tighter uppercase">
                        {isCreatingClient ? 'Novo Cliente' : 'Selecionar Cliente'}
                    </h3>
                    <button onClick={() => setIsSelectionModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                </div>

                {!isCreatingClient ? (
                    <div className="flex flex-col gap-4">
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input 
                                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-zorion-500" 
                                placeholder="Buscar cliente existente..."
                                value={clientSearch}
                                onChange={(e) => setClientSearch(e.target.value)}
                                autoFocus
                            />
                        </div>
                        
                        <div className="flex-1 overflow-y-auto max-h-60 custom-scrollbar space-y-2">
                            {clients.filter(c => 
                                c.name.toLowerCase().includes(clientSearch.toLowerCase()) || 
                                c.farmName.toLowerCase().includes(clientSearch.toLowerCase())
                            ).map(c => (
                                <button 
                                    key={c.id} 
                                    onClick={() => handleSelectExistingClient(c)}
                                    className="w-full p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between hover:border-zorion-500 hover:shadow-md transition-all text-left group"
                                >
                                    <div>
                                        <h4 className="font-black text-slate-800 text-sm">{c.farmName}</h4>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">{c.name}</p>
                                    </div>
                                    <div className="h-8 w-8 bg-slate-50 rounded-full flex items-center justify-center text-slate-300 group-hover:bg-zorion-900 group-hover:text-white transition-colors">
                                        <Check size={14} />
                                    </div>
                                </button>
                            ))}
                            {clientSearch && clients.filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase())).length === 0 && (
                                <p className="text-center text-slate-400 text-xs font-bold py-4">Nenhum cliente encontrado</p>
                            )}
                        </div>

                        <div className="border-t border-slate-100 pt-4 mt-2">
                            <button 
                                onClick={() => setIsCreatingClient(true)}
                                className="w-full py-4 bg-emerald-50 text-emerald-700 rounded-2xl font-black text-xs uppercase flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors"
                            >
                                <UserPlus size={16} /> Cadastrar Novo Cliente Agora
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Unidade/Fazenda</label>
                            <input 
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500 mt-1"
                                placeholder="Ex: Fazenda Santa Fé"
                                value={newClientData.farmName}
                                onChange={e => setNewClientData({...newClientData, farmName: e.target.value})}
                                autoFocus
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Responsável</label>
                            <input 
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500 mt-1"
                                placeholder="Ex: João da Silva"
                                value={newClientData.name}
                                onChange={e => setNewClientData({...newClientData, name: e.target.value})}
                            />
                        </div>
                        
                        <div className="flex gap-3 mt-4">
                            <button 
                                onClick={() => setIsCreatingClient(false)}
                                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-colors"
                            >
                                Voltar
                            </button>
                            <button 
                                onClick={handleCreateAndSelectClient}
                                disabled={isSavingClient || !newClientData.name || !newClientData.farmName}
                                className="flex-1 py-4 bg-zorion-900 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-zorion-800 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {isSavingClient ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                Salvar e Continuar
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      )}

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
                                Ativo
                            </span>
                        </div>
                        
                        <input 
                            className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase leading-none bg-transparent outline-none w-full placeholder-slate-300"
                            value={editDealData.title}
                            onChange={(e) => setEditDealData({...editDealData, title: e.target.value})}
                            placeholder="Título da Ocupação"
                        />
                    </div>
                </div>
                <div className="flex items-center gap-8">
                    <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reserva Ativa (Total)</p>
                        <div className="flex items-baseline justify-end gap-1">
                            <span className="text-2xl font-black text-[#009b58] italic leading-none">$</span>
                            <input 
                                type="number"
                                className="text-2xl font-black text-[#009b58] italic leading-none bg-transparent outline-none w-32 text-right placeholder-emerald-200"
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
                {CAPACITY_STAGES.map((s, i) => {
                    const isCurrent = editDealData.stageId === s.id;
                    const isPast = CAPACITY_STAGES.findIndex(fs => fs.id === editDealData.stageId) > i;
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

             <div className="flex-1 flex overflow-hidden flex-col md:flex-row bg-[#f8fafc]">
                {/* COLUNA ESQUERDA: REGISTRO DE CAMPO (Aumentada e Melhorada UX) */}
                <div className="w-full md:w-[400px] border-r border-slate-200 p-6 flex flex-col bg-white z-10 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
                    <div className="flex gap-2 mb-6 border-b border-slate-50 pb-4">
                        <button 
                            onClick={() => setActiveTab('interaction')}
                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'interaction' ? 'bg-blue-50 text-blue-600 border border-blue-100' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <MessageSquare size={14} /> Interação
                        </button>
                        <button 
                            onClick={() => setActiveTab('formula')}
                            className={`flex-1 py-2 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center justify-center gap-2 ${activeTab === 'formula' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            <FlaskConical size={14} /> Fórmula
                        </button>
                    </div>

                    {activeTab === 'interaction' ? (
                        <>
                            <h4 className="text-xs font-black uppercase text-slate-800 mb-4 flex items-center gap-2">
                                <MessageSquare size={16} className="text-blue-600" /> Registro de Campo
                            </h4>
                            
                            {/* Metadados: Data e Tipo */}
                            <div className="flex flex-col gap-2 mb-4">
                                <input 
                                    type="datetime-local" 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-zorion-500 transition-colors"
                                    value={interactionDate}
                                    onChange={(e) => setInteractionDate(e.target.value)}
                                />
                                <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                                    {(['Task', 'Call', 'Meeting', 'Whatsapp'] as const).map(t => (
                                        <button key={t} onClick={() => setInteractionType(t)} className={`flex-1 py-2 text-[9px] font-black uppercase rounded-lg transition-all ${interactionType === t ? 'bg-white text-zorion-900 shadow-sm scale-105' : 'text-slate-400 hover:text-slate-600'}`}>{t}</button>
                                    ))}
                                </div>
                            </div>

                            {/* Novo Campo: Produto Específico da Visita (Solicitado pelo Usuário) */}
                            <div className="mb-4">
                                <select 
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 outline-none focus:border-zorion-500 transition-colors"
                                    value={interactionProduct}
                                    onChange={handleInteractionProductChange}
                                >
                                    <option value="">Produto Utilizado (Opcional)</option>
                                    {catalog.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                                    <option value="NEW_PRODUCT" className="text-zorion-600 font-black">+ CADASTRAR NOVO PRODUTO</option>
                                </select>
                            </div>

                            {/* Área de Texto Expandida e Limpa */}
                            <textarea 
                                value={quickNote} 
                                onChange={e => setQuickNote(e.target.value)} 
                                className="w-full flex-1 min-h-[140px] p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:border-zorion-500 focus:bg-white transition-all shadow-inner resize-none mb-4" 
                                placeholder={`Descreva o que foi observado ou acordado...`} 
                            />
                            
                            {/* Lista de Arquivos Selecionados */}
                            {quickFiles.length > 0 && (
                              <div className="mb-4 space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1 bg-slate-50 p-2 rounded-xl border border-slate-100">
                                 <p className="text-[9px] font-black uppercase text-slate-400 px-1 mb-1">Anexos prontos:</p>
                                 {quickFiles.map((f, i) => (
                                   <div key={i} className="flex items-center justify-between bg-white p-2 rounded-xl border border-slate-100 shadow-sm">
                                      <div className="flex items-center gap-2 overflow-hidden">
                                         {f.type.startsWith('image/') ? <ImageIcon size={14} className="text-purple-500 shrink-0" /> : <Paperclip size={14} className="text-slate-400 shrink-0" />}
                                         <span className="text-[10px] font-bold text-slate-600 truncate">{f.name}</span>
                                      </div>
                                      <button type="button" onClick={() => setQuickFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-300 hover:text-red-500 p-1 transition-colors"><Trash2 size={14} /></button>
                                   </div>
                                 ))}
                              </div>
                            )}

                            {/* Botões Grandes de Mídia */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 hover:text-purple-600 hover:bg-purple-50 hover:border-purple-100 transition-all active:scale-95 group">
                                    <Camera size={24} className="mb-1 group-hover:scale-110 transition-transform"/>
                                    <span className="text-[10px] font-black uppercase tracking-widest">Câmera</span>
                                </button>
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center p-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-500 hover:text-zorion-600 hover:bg-emerald-50 hover:border-emerald-100 transition-all active:scale-95 group">
                                    <Paperclip size={24} className="mb-1 group-hover:scale-110 transition-transform"/>
                                    <span className="text-[10px] font-black uppercase tracking-widest">Galeria</span>
                                </button>
                                
                                <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                                <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileChange} />
                            </div>

                            <Button onClick={handleRegisterInteraction} isLoading={isUploading} className="w-full py-4 rounded-xl text-xs font-black uppercase bg-[#83a697] hover:bg-[#6c8a7c] text-white shadow-lg flex items-center justify-center gap-2 transform active:scale-[0.98] transition-all">
                                <Send size={16}/> REGISTRAR ATIVIDADE
                            </Button>
                        </>
                    ) : (
                        <>
                            <h4 className="text-xs font-black uppercase text-slate-800 mb-4 flex items-center gap-2">
                                <FlaskConical size={16} className="text-emerald-600" /> Fórmula da Ração
                            </h4>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-widest leading-tight">
                                Defina a composição da ração exclusiva para este cliente ativo.
                            </p>
                            <textarea 
                                value={editDealData.feedFormula || ''} 
                                onChange={e => setEditDealData({...editDealData, feedFormula: e.target.value})} 
                                className="w-full flex-1 min-h-[300px] p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner resize-none mb-4" 
                                placeholder="Ex: 60% Milho, 20% Farelo de Soja, 15% Núcleo, 5% Calcário..." 
                            />
                            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-100">
                                <p className="text-[10px] font-black text-emerald-700 uppercase leading-relaxed">
                                    A fórmula é salva automaticamente ao salvar as alterações do cliente.
                                </p>
                            </div>
                        </>
                    )}
                </div>

                {/* COLUNA DIREITA: PRODUTOS E HISTÓRICO (Agora tudo rola junto) */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-4 bg-[#f8fafc]">
                    
                    {/* Seção de Produtos - NÃO MAIS FIXA, agora rola junto com o histórico */}
                    <div className="mb-6">
                        <div className="bg-white rounded-[1.5rem] border border-slate-200 p-5 shadow-sm">
                            <div className="flex justify-between items-center mb-3">
                                <h4 className="text-[10px] font-black uppercase text-slate-900 flex items-center gap-2"><Package size={14} className="text-[#009b58]"/> Suplementação Ativa (Global)</h4>
                                <span className="bg-slate-100 text-slate-500 px-2 py-0.5 rounded text-[9px] font-bold">{editDealData.products?.length || 0}</span>
                            </div>
                            
                            {editDealData.products?.length > 0 ? (
                                <div className="space-y-2">
                                    {editDealData.products.map((prod, idx) => (
                                        <div key={idx} className="bg-slate-50 p-2 px-3 rounded-lg flex items-center gap-3 border border-slate-100 group/prod">
                                            <div className="h-6 w-6 bg-white rounded border border-slate-200 flex items-center justify-center shrink-0"><Beef size={12} className="text-slate-400"/></div>
                                            <div className="flex-1 min-w-0">
                                                <input 
                                                  type="text" 
                                                  className="w-full bg-transparent border-none text-xs font-bold text-slate-700 outline-none p-0" 
                                                  value={prod.name} 
                                                  onChange={(e) => updateProduct(idx, { name: e.target.value })}
                                                />
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <input type="number" className="w-20 bg-white border border-slate-200 rounded px-1 py-0.5 text-center text-[10px] font-bold outline-none" value={prod.quantity} onChange={(e) => updateProduct(idx, { quantity: Number(e.target.value) })} />
                                                <input type="number" className="w-32 bg-white border border-slate-200 rounded px-1 py-0.5 text-right text-[10px] font-bold outline-none text-[#009b58]" value={prod.price} onChange={(e) => updateProduct(idx, { price: Number(e.target.value) })} />
                                                <button onClick={() => removeProduct(idx)} className="text-red-300 hover:text-red-500"><Trash2 size={12} /></button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-2 text-slate-300 text-[10px] italic font-bold">Nenhum produto global configurado</div>
                            )}
                            
                            <div className="mt-3">
                                <select 
                                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-600 outline-none hover:border-zorion-500 transition-colors"
                                    onChange={handleQuickAddProductToDeal}
                                    value=""
                                >
                                    <option value="">+ Configurar Produto na Ocupação</option>
                                    {catalog.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    <option value="NEW_PRODUCT" className="text-zorion-600 font-black bg-emerald-50">+ CADASTRAR NOVO PRODUTO</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Seção de Histórico */}
                    <div>
                        <h4 className="text-[11px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2 px-1 mb-4">
                            <History size={16} /> Histórico Técnico & Visitas
                        </h4>
                        
                        <div className="space-y-4 pb-10">
                            {dealTimeline.length > 0 ? (
                                dealTimeline.map(act => (
                                    <div key={act.id} className="flex gap-4 relative group/item">
                                        {/* Linha do Tempo */}
                                        <div className="absolute left-5 top-10 bottom-0 w-px bg-slate-200 group-last:hidden"></div>
                                        
                                        {/* Ícone */}
                                        <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 border-4 border-[#f8fafc] shadow-sm z-10 ${act.type === 'Whatsapp' ? 'bg-[#e7f6f0] text-[#009b58]' : 'bg-white text-blue-600 border-blue-50'}`}>
                                            {act.type === 'Whatsapp' ? <MessageSquare size={16}/> : <FileText size={16}/>}
                                        </div>
                                        
                                        {/* Card do Item */}
                                        <div className="flex-1 bg-white p-5 rounded-[1.5rem] border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-200 transition-all relative">
                                            <div className="flex justify-between mb-3 border-b border-slate-50 pb-2">
                                                <span className="text-[10px] font-black uppercase text-slate-800 tracking-wide flex items-center gap-1.5">
                                                  {act.type} 
                                                  {act.attachments?.length > 0 && <Paperclip size={10} className="text-slate-400" />}
                                                </span>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">{new Date(act.dueDate).toLocaleDateString('pt-BR')}</span>
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingActivity(act); setEditActFiles([]); }} className="p-1.5 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"><Pencil size={14} /></button>
                                                    <button onClick={() => setItemToDelete({ type: 'activity', data: act })} className="text-red-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                                                </div>
                                            </div>
                                            
                                            <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{act.description}</p>
                                            
                                            {/* Anexos */}
                                            {act.attachments && act.attachments.length > 0 && (
                                                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                                                    {act.attachments.map(att => (
                                                        <div key={att.id} className="relative group/att bg-slate-50 rounded-xl overflow-hidden border border-slate-100 aspect-square flex items-center justify-center hover:border-blue-200 transition-colors">
                                                            {att.type === 'image' ? (
                                                                <img src={att.url} alt={att.name} className="absolute inset-0 w-full h-full object-cover" />
                                                            ) : att.type === 'video' ? (
                                                                <div className="flex flex-col items-center gap-1 text-slate-400">
                                                                    <Video size={24} />
                                                                    <span className="text-[8px] font-bold uppercase">Vídeo</span>
                                                                </div>
                                                            ) : (
                                                                <div className="flex flex-col items-center gap-1 text-slate-400">
                                                                    <FileText size={24} />
                                                                    <span className="text-[8px] font-bold uppercase truncate max-w-[80px]">{att.name}</span>
                                                                </div>
                                                            )}
                                                            
                                                            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover/att:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                                <a href={att.url} target="_blank" rel="noreferrer" className="p-1.5 bg-white rounded-lg text-slate-800 hover:bg-emerald-500 hover:text-white transition-colors"><ExternalLink size={14} /></a>
                                                                <button 
                                                                    type="button" 
                                                                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setItemToDelete({ type: 'attachment', data: { activity: act, attId: att.id } }); }} 
                                                                    className="p-1.5 bg-white rounded-lg text-red-500 hover:bg-red-500 hover:text-white transition-colors"
                                                                >
                                                                    <Trash2 size={14}/>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="py-12 text-center flex flex-col items-center justify-center opacity-50">
                                    <History size={32} className="text-slate-300 mb-2"/>
                                    <p className="text-slate-400 font-black italic uppercase text-[10px] tracking-widest">Nenhum histórico registrado</p>
                                </div>
                            )}
                        </div>
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

      {/* Modal para Novo Produto */}
      {isNewProductModalOpen && (
        <div className="fixed inset-0 z-[700] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2rem] w-full max-w-sm p-8 shadow-2xl relative border border-slate-100">
                <h3 className="text-lg font-black text-slate-900 mb-4 italic uppercase">Cadastrar Novo Produto</h3>
                <input 
                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500 mb-4"
                    placeholder="Nome do Produto..."
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    autoFocus
                />
                <div className="flex gap-2">
                    <button 
                        onClick={() => { setIsNewProductModalOpen(false); setNewProductName(''); }}
                        className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-xs uppercase hover:bg-slate-200"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleConfirmNewProduct}
                        className="flex-1 py-3 bg-zorion-900 text-white rounded-xl font-black text-xs uppercase hover:bg-zorion-800"
                    >
                        Confirmar
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Editing Activity Modal */}
      {editingActivity && (
        <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
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
                     onChange={(e) => e.target.value && setEditingActivity({...editingActivity, dueDate: new Date(e.target.value).toISOString()})}
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

      {/* Modal de Confirmação de Reabertura (Reverter para Vendas) */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl relative border border-slate-100 text-center">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-100">
                    <History size={40} className="text-blue-600" />
                </div>
                
                <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase mb-2">Reverter Oportunidade</h3>
                <p className="text-sm font-bold text-slate-500 mb-8 uppercase tracking-widest leading-relaxed">
                    Deseja reverter este cliente para o <br/>
                    <span className="text-blue-600">FUNIL DE VENDAS</span>? <br/>
                    <span className="text-[10px] text-slate-400 mt-2 block">(Isso o removerá deste funil técnico e o tornará uma oportunidade ativa novamente)</span>
                </p>

                <div className="flex gap-3">
                    <button 
                        onClick={() => setIsReopenModalOpen(false)}
                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleConfirmReopenDeal}
                        className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                    >
                        <Check size={16} /> Confirmar Reversão
                    </button>
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

export default ProductionFunnel;