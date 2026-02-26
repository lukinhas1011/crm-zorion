
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Deal, Stage, Pipeline, Activity, Client, User, CatalogItem, Visit, Attachment, DealProduct } from '../types';
import { 
  Plus, X, Building2, Trash2, ChevronDown, 
  Phone, Calendar, DollarSign, MessageSquare, Send, 
  Clock, History, Paperclip, Loader2, Trello,
  AlertTriangle, Beef, Package, Target, Coins, Camera, ImageIcon, Pencil, FileText, Search, UserPlus, Check, Video, ExternalLink,
  Archive, Trophy, ThumbsDown, Mic, ArrowRight, FlaskConical
} from 'lucide-react';
import { Button } from '../components/Button';
import { KanbanColumn } from '../components/KanbanColumn';
import { uploadVisitFile, deleteVisitPhoto } from '../services/storageService';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTIONS, prepareForSave } from '../services/dbSchema';

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
  { id: 'stg_1', pipelineId: FIXED_PIPELINE_ID, name: 'Cliente potencial', order: 1, probability: 25 },
  { id: 'stg_2', pipelineId: FIXED_PIPELINE_ID, name: 'Estabelecimento de oportunidade', order: 2, probability: 50 },
  { id: 'stg_3', pipelineId: FIXED_PIPELINE_ID, name: 'Validação de negociação', order: 3, probability: 75 },
  { id: 'stg_4', pipelineId: FIXED_PIPELINE_ID, name: 'Validação e negociação comercial', order: 4, probability: 100 }
];

const SalesFunnel: React.FC<SalesFunnelProps> = ({ 
  deals, stages, pipelines, activities, clients, catalog, user, 
  onAddDeal, onUpdateDeal, onDeleteDeal, onAddVisit, onSelectClient, onAddCatalogItem, pendingDealId, createForClientId, onAddActivity, onUpdateActivity, onDeleteActivity,
  currencyMode = 'USD', exchangeRate = 1
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
  const [interactionType, setInteractionType] = useState<'Call' | 'Email' | 'Whatsapp' | 'Meeting'>('Call');
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

  // States para Ganho/Perda/Reversão
  const [isLossModalOpen, setIsLossModalOpen] = useState(false);
  const [isWonModalOpen, setIsWonModalOpen] = useState(false);
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false);
  const [dealToMarkAsLost, setDealToMarkAsLost] = useState<Deal | null>(null);
  const [dealToMarkAsWon, setDealToMarkAsWon] = useState<Deal | null>(null);
  const [dealToReopen, setDealToReopen] = useState<Deal | null>(null);
  const [lossReason, setLossReason] = useState('');
  const [lossFiles, setLossFiles] = useState<File[]>([]);
  const [isSavingLoss, setIsSavingLoss] = useState(false);

  const [view, setView] = useState<'funnel' | 'archive'>('funnel');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const lossFileInputRef = useRef<HTMLInputElement>(null);
  const lossCameraInputRef = useRef<HTMLInputElement>(null);
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

        // Salvar diretamente no Firebase
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
        id: `deal_${Date.now()}`,
        title: 'Nova Oportunidade',
        clientId: client.id,
        clientName: client.name,
        farmName: client.farmName,
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
    // Reset date to current when opening
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    setInteractionDate(now.toISOString().slice(0, 16));
    setIsEditModalOpen(true);
  };

  const handleSaveDeal = () => {
    if (!editDealData) return;
    const isNew = !deals.some(d => d.id === editDealData.id);
    if (isNew) onAddDeal(editDealData);
    else onUpdateDeal(editDealData);
    setIsEditModalOpen(false);
  };

  const handleWonDeal = useCallback((deal: Deal) => {
    setDealToMarkAsWon(deal);
    setIsWonModalOpen(true);
  }, []);

  const handleConfirmWonDeal = useCallback(() => {
    if (!dealToMarkAsWon) return;
    onUpdateDeal({ 
        ...dealToMarkAsWon, 
        status: 'Won', 
        updatedAt: new Date().toISOString(),
        customAttributes: { ...(dealToMarkAsWon.customAttributes || {}), wonDate: new Date().toISOString() }
    });
    setIsWonModalOpen(false);
    setDealToMarkAsWon(null);
  }, [dealToMarkAsWon, onUpdateDeal]);

  const handleTransferToProduction = useCallback(() => {
    if (!dealToMarkAsWon) return;
    // Mover para o funil de produção (pip_capacidade) na primeira etapa (cap_1)
    onUpdateDeal({ 
        ...dealToMarkAsWon, 
        status: 'Open', 
        pipelineId: 'pip_capacidade',
        stageId: 'cap_1',
        updatedAt: new Date().toISOString(),
        customAttributes: { 
            ...(dealToMarkAsWon.customAttributes || {}), 
            wonDate: new Date().toISOString(),
            transferredFromSales: true 
        }
    });
    setIsWonModalOpen(false);
    setDealToMarkAsWon(null);
  }, [dealToMarkAsWon, onUpdateDeal]);

  const handleLostDealClick = useCallback((deal: Deal) => {
    const dealTitle = deal.title || deal.farmName || 'esta oportunidade';
    if (window.confirm(`Tem certeza que deseja marcar a oportunidade "${dealTitle}" como PERDIDA?`)) {
        setDealToMarkAsLost(deal);
        setLossReason('');
        setLossFiles([]);
        setIsLossModalOpen(true);
    }
  }, []);

  const handleReopenDeal = useCallback((deal: Deal) => {
    setDealToReopen(deal);
    setIsReopenModalOpen(true);
  }, []);

  const handleConfirmReopenDeal = useCallback(() => {
    if (!dealToReopen) return;
    // Ao reverter, garantimos que ele volte para o funil de vendas (pip_principal) 
    // e status Open, caso tenha sido transferido para produção
    onUpdateDeal({ 
        ...dealToReopen, 
        status: 'Open', 
        pipelineId: 'pip_principal',
        stageId: dealToReopen.stageId.startsWith('stg_') ? dealToReopen.stageId : 'stg_1',
        updatedAt: new Date().toISOString() 
    });
    setIsReopenModalOpen(false);
    setDealToReopen(null);
  }, [dealToReopen, onUpdateDeal]);

  const handleConfirmLostDeal = useCallback(async () => {
    if (!dealToMarkAsLost || !lossReason.trim()) return;
    setIsSavingLoss(true);
    try {
        const actId = `act_loss_${Date.now()}`;
        const atts: Attachment[] = [];
        for (const file of lossFiles) {
            const url = await uploadVisitFile(file, dealToMarkAsLost.clientId, actId);
            atts.push({ 
                id: `att_${Math.random().toString(36).substr(2, 9)}`, 
                url, 
                name: file.name, 
                type: file.type.startsWith('image/') ? 'image' : 
                      file.type.startsWith('video/') ? 'video' : 
                      file.type.startsWith('audio/') ? 'audio' : 'document' 
            });
        }

        // Registrar como uma atividade de fechamento
        onAddActivity({
            id: actId, 
            clientId: dealToMarkAsLost.clientId, 
            dealId: dealToMarkAsLost.id,
            type: 'Task', 
            title: `Oportunidade Perdida: ${lossReason.substring(0, 30)}...`,
            description: `MOTIVO DA PERDA: ${lossReason}`, 
            dueDate: new Date().toISOString(),
            isDone: true,
            technicianId: user.id, 
            attachments: atts, 
            createdAt: new Date().toISOString()
        });

        onUpdateDeal({ 
            ...dealToMarkAsLost, 
            status: 'Lost', 
            customAttributes: { 
                ...dealToMarkAsLost.customAttributes, 
                lossReason: lossReason.trim(),
                lostDate: new Date().toISOString()
            },
            updatedAt: new Date().toISOString() 
        });
        setIsLossModalOpen(false);
        setDealToMarkAsLost(null);
    } catch (e) {
        alert("Erro ao salvar motivo da perda.");
    } finally {
        setIsSavingLoss(false);
    }
  }, [dealToMarkAsLost, lossReason, lossFiles, onAddActivity, onUpdateDeal, user.id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files);
      setQuickFiles(prev => [...prev, ...selected]);
      e.target.value = '';
    }
  };

  const handleQuickAddProduct = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val === 'NEW_PRODUCT') {
        setIsNewProductModalOpen(true);
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
        if (editDealData) {
            const newProd = { productId: newItem.id, name: newItem.name, quantity: 1, price: 0, taxPercent: 0 };
            setEditDealData({ ...editDealData, products: [...(editDealData.products || []), newProd] });
        }
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
          description: quickNote, 
          dueDate: new Date(interactionDate).toISOString(), // Usar a data selecionada
          isDone: true,
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
        if (att?.url) { try { await deleteVisitPhoto(att.url); } catch (e) { console.warn("Foto já deletada ou inacessível"); } }
        
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
      console.error("Erro na exclusão:", error);
      alert("Erro ao realizar a exclusão. Tente novamente.");
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

  const archivedDeals = useMemo(() => {
    return deals.filter(d => {
      const matchesSearch = d.title.toLowerCase().includes(searchTerm.toLowerCase()) || d.farmName.toLowerCase().includes(searchTerm.toLowerCase());
      // Negócios ganhos/perdidos OU negócios que foram transferidos para produção
      const isArchived = d.status !== 'Open' || d.customAttributes?.transferredFromSales === true;
      return isArchived && matchesSearch;
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
             
             <div className="flex bg-slate-100 p-1 rounded-xl ml-4">
                <button 
                  onClick={() => setView('funnel')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${view === 'funnel' ? 'bg-white text-zorion-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Trello size={12} /> Funil Ativo
                </button>
                <button 
                  onClick={() => setView('archive')}
                  className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all flex items-center gap-2 ${view === 'archive' ? 'bg-white text-zorion-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  <Archive size={12} /> Arquivados
                </button>
             </div>

             <input type="text" placeholder="Filtrar..." className="ml-4 px-4 py-2 bg-slate-50 border rounded-xl text-xs font-bold outline-none" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
         </div>
         <Button onClick={handleStartNewDeal} className="bg-zorion-900 text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase shadow-lg">Nova Oportunidade</Button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {view === 'funnel' ? (
          <div className="flex-1 flex overflow-x-auto p-4 gap-4">
            {FIXED_STAGES.map((stage, idx) => (
               <KanbanColumn 
                 key={stage.id} stage={stage} index={idx} 
                 deals={filteredDeals.filter(d => d.stageId === stage.id)} 
                 activities={activities}
                 onDealClick={(d) => { setEditDealData(d); setQuickFiles([]); setIsEditModalOpen(true); }}
                 onMoveDeal={(id, sid) => onUpdateDeal({...deals.find(d => d.id === id)!, stageId: sid})}
                 onDealUpdate={onUpdateDeal}
                 onWon={handleWonDeal}
                 onLost={handleLostDealClick}
               />
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30">
             <div className="max-w-6xl mx-auto">
                <div className="flex justify-between items-end mb-8">
                   <div>
                      <h2 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter">Negócios Fechados</h2>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Histórico de sucessos e aprendizados</p>
                   </div>
                   <div className="flex gap-4 text-xs font-black uppercase italic">
                      <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100">
                         <Trophy size={14} /> {archivedDeals.filter(d => d.status === 'Won').length} Ganhos
                      </div>
                      <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-xl border border-red-100">
                         <ThumbsDown size={14} /> {archivedDeals.filter(d => d.status === 'Lost').length} Perdidos
                      </div>
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {archivedDeals.map(deal => (
                      <div 
                        key={deal.id}
                        onClick={() => { setEditDealData(deal); setQuickFiles([]); setIsEditModalOpen(true); }}
                        className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm hover:shadow-xl transition-all cursor-pointer group relative overflow-hidden"
                      >
                         <div className={`absolute top-0 left-0 right-0 h-1.5 ${
                            deal.customAttributes?.transferredFromSales ? 'bg-blue-500' :
                            deal.status === 'Won' ? 'bg-emerald-500' : 'bg-red-500'
                         }`} />
                         
                         <div className="flex justify-between items-start mb-4">
                            <div>
                               <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest italic">{deal.title}</span>
                               <h4 className="text-lg font-black text-slate-800 uppercase italic leading-tight">{deal.farmName}</h4>
                            </div>
                            <div className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                               deal.customAttributes?.transferredFromSales ? 'bg-blue-50 text-blue-600 border border-blue-100' :
                               deal.status === 'Won' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                               'bg-red-50 text-red-600 border border-red-100'
                            }`}>
                               {deal.customAttributes?.transferredFromSales ? 'Em Produção' : deal.status === 'Won' ? 'Ganho' : 'Perdido'}
                            </div>
                         </div>

                         <div className="space-y-3 mb-6">
                            <div className="flex items-center gap-2 text-slate-500">
                               <Calendar size={12} />
                               <span className="text-[10px] font-bold uppercase">Início: {new Date(deal.createdAt || '').toLocaleDateString('pt-BR')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-500">
                               <Clock size={12} />
                               <span className="text-[10px] font-bold uppercase">Fim: {new Date(deal.status === 'Won' ? (deal.customAttributes?.wonDate || deal.updatedAt) : (deal.customAttributes?.lostDate || deal.updatedAt)).toLocaleDateString('pt-BR')}</span>
                            </div>
                         </div>

                         <div className="flex justify-between items-center pt-4 border-t border-slate-50">
                            <div className="text-sm font-black text-slate-900 italic">$ {deal.value.toLocaleString('en-US', { minimumFractionDigits: 2 })}</div>
                            <div className="flex items-center gap-3">
                               <button 
                                 onClick={(e) => { e.stopPropagation(); handleReopenDeal(deal); }}
                                 className="text-[9px] font-black text-blue-600 uppercase tracking-widest hover:text-blue-800 transition-colors flex items-center gap-1"
                               >
                                 <History size={10} /> Reverter
                               </button>
                               <div className="text-[9px] font-black text-zorion-600 uppercase tracking-widest group-hover:translate-x-1 transition-transform flex items-center gap-1">Ver Histórico <ArrowRight size={10} /></div>
                            </div>
                         </div>
                      </div>
                   ))}
                   {archivedDeals.length === 0 && (
                      <div className="col-span-full py-20 text-center bg-white rounded-[3rem] border-2 border-dashed border-slate-100">
                         <Archive size={48} className="mx-auto text-slate-200 mb-4" />
                         <p className="text-sm font-black text-slate-300 uppercase italic tracking-widest">Nenhum negócio arquivado encontrado</p>
                      </div>
                   )}
                </div>
             </div>
          </div>
        )}
      </div>

      {/* MODAL DE SELEÇÃO DE CLIENTE (Gatekeeper) */}
      {isSelectionModalOpen && (
        <div className="fixed inset-0 z-[550] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            {/* ... Conteúdo mantido ... */}
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
             
             {/* Header do Modal */}
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
                                <h4 className="text-xs font-black uppercase text-slate-800 mb-4 flex items-center gap-2"><MessageSquare size={14} className="text-blue-600" /> Registrar Interação</h4>
                                
                                {/* Seletor de Data e Tipo */}
                                <div className="flex flex-col gap-2 mb-3">
                                    <input 
                                        type="datetime-local" 
                                        className="w-full p-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-zorion-500"
                                        value={interactionDate}
                                        onChange={(e) => setInteractionDate(e.target.value)}
                                    />
                                    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                                        {(['Call', 'Whatsapp', 'Email', 'Meeting'] as const).map(t => (
                                            <button key={t} onClick={() => setInteractionType(t)} className={`flex-1 py-2 text-[9px] font-black uppercase rounded-lg transition-all ${interactionType === t ? 'bg-white text-zorion-900 shadow-sm' : 'text-slate-400'}`}>{t}</button>
                                        ))}
                                    </div>
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
                            </>
                        ) : (
                            <>
                                <h4 className="text-xs font-black uppercase text-slate-800 mb-4 flex items-center gap-2"><FlaskConical size={14} className="text-emerald-600" /> Fórmula da Ração</h4>
                                <p className="text-[10px] font-bold text-slate-400 uppercase mb-4 tracking-widest leading-tight">
                                    Defina a composição da ração exclusiva para este cliente.
                                </p>
                                <textarea 
                                    value={editDealData.feedFormula || ''} 
                                    onChange={e => setEditDealData({...editDealData, feedFormula: e.target.value})} 
                                    className="w-full h-64 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-emerald-500 transition-all shadow-inner resize-none" 
                                    placeholder="Ex: 60% Milho, 20% Farelo de Soja, 15% Núcleo, 5% Calcário..." 
                                />
                                <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                                    <p className="text-[9px] font-black text-emerald-700 uppercase leading-relaxed">
                                        As alterações na fórmula são salvas automaticamente ao salvar a negociação.
                                    </p>
                                </div>
                            </>
                        )}
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
                                <option value="NEW_PRODUCT" className="text-zorion-600 font-black bg-emerald-50">+ CADASTRAR NOVO PRODUTO</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2 px-1"><History size={16} /> Histórico de Visitas e Ações</h4>
                        {dealTimeline.length > 0 ? (
                            dealTimeline.map(act => (
                                <div key={act.id} className="flex gap-4 relative group/item">
                                    <div className="absolute left-5 top-10 bottom-0 w-px bg-slate-100"></div>
                                    <div className={`h-10 w-10 rounded-full flex items-center justify-center shrink-0 border-4 border-white shadow-sm z-10 ${act.type === 'Whatsapp' ? 'bg-[#e7f6f0] text-[#009b58]' : 'bg-blue-50 text-blue-600'}`}>
                                        {act.type === 'Whatsapp' ? <MessageSquare size={16}/> : <Phone size={16}/>}
                                    </div>
                                    <div className="flex-1 bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-sm hover:shadow-md transition-shadow relative">
                                        <div className="flex justify-between mb-2 pb-2 border-b border-slate-50">
                                            <span className="text-[10px] font-black uppercase text-slate-800 tracking-wide flex items-center gap-1.5">
                                              {act.type} 
                                              {act.attachments?.length > 0 && <Paperclip size={10} className="text-slate-400" />}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg">{new Date(act.dueDate).toLocaleDateString('pt-BR')}</span>
                                                <button onClick={(e) => { e.stopPropagation(); setEditingActivity(act); setEditActFiles([]); }} className="p-2 text-slate-300 hover:text-blue-500 hover:bg-blue-50 rounded-full transition-all"><Pencil size={14} /></button>
                                                <button onClick={() => setItemToDelete({ type: 'activity', data: act })} className="text-red-300 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity"><Trash2 size={12} /></button>
                                            </div>
                                        </div>
                                        <p className="text-xs font-medium text-slate-600 leading-relaxed">{act.description}</p>
                                        
                                        {/* Visualização rica de anexos - Estilo Cartão de Visita */}
                                        {act.attachments && act.attachments.length > 0 && (
                                            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-2">
                                                {act.attachments.map(att => (
                                                    <div key={att.id} className="relative group/att bg-slate-50 rounded-xl overflow-hidden border border-slate-100 aspect-square flex items-center justify-center">
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
                            <div className="py-12 text-center text-slate-300 font-black italic uppercase text-[10px] tracking-widest">Nenhuma atividade registrada</div>
                        )}
                    </div>
                </div>
             </div>

             <div className="px-8 py-5 border-t border-slate-100 flex justify-between items-center shrink-0 bg-white">
                <div className="flex gap-2">
                    <button onClick={() => setItemToDelete({ type: 'deal', data: editDealData })} className="text-red-500 font-black text-[11px] uppercase flex items-center gap-2 px-4 py-2 hover:bg-red-50 rounded-xl transition-colors"><Trash2 size={16} /> Excluir</button>
                    {editDealData.status !== 'Open' && (
                        <button 
                            onClick={() => { handleReopenDeal(editDealData); setIsEditModalOpen(false); }} 
                            className="text-blue-600 font-black text-[11px] uppercase flex items-center gap-2 px-4 py-2 hover:bg-blue-50 rounded-xl transition-colors"
                        >
                            <History size={16} /> Reverter para Aberto
                        </button>
                    )}
                </div>
                <div className="flex gap-3">
                    <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-8 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase hover:bg-slate-50 transition-all">Fechar</button>
                    <button type="button" onClick={handleSaveDeal} className="px-12 py-3 bg-[#009b58] text-white rounded-xl text-[10px] font-black uppercase shadow-xl shadow-[#009b58]/20 hover:bg-[#007e47] transition-all">Salvar Alterações</button>
                </div>
             </div>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Ganho */}
      {isWonModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl relative border border-slate-100 text-center">
                <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-emerald-100">
                    <Trophy size={40} className="text-emerald-600" />
                </div>
                
                <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase mb-2">Parabéns!</h3>
                <p className="text-sm font-bold text-slate-500 mb-8 uppercase tracking-widest leading-relaxed">
                    A oportunidade <span className="text-slate-900 italic">"{dealToMarkAsWon?.title || dealToMarkAsWon?.farmName}"</span> foi <span className="text-emerald-600">GANHA</span>! <br/>
                    O que deseja fazer agora?
                </p>

                <div className="flex flex-col gap-3">
                    <button 
                        onClick={handleTransferToProduction}
                        className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                    >
                        <Beef size={16} /> Transferir para Clientes Ativos
                    </button>
                    <button 
                        onClick={handleConfirmWonDeal}
                        className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-colors flex items-center justify-center gap-2"
                    >
                        <Archive size={16} /> Apenas Arquivar Oportunidade
                    </button>
                    <button 
                        onClick={() => setIsWonModalOpen(false)}
                        className="w-full py-3 text-slate-400 font-bold text-[10px] uppercase hover:text-slate-600 transition-colors"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Modal de Confirmação de Reabertura (Reverter) */}
      {isReopenModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl relative border border-slate-100 text-center">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-blue-100">
                    <History size={40} className="text-blue-600" />
                </div>
                
                <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase mb-2">Reabrir Negócio</h3>
                <p className="text-sm font-bold text-slate-500 mb-8 uppercase tracking-widest leading-relaxed">
                    Deseja reabrir a oportunidade <br/>
                    <span className="text-slate-900 italic">"{dealToReopen?.title || dealToReopen?.farmName}"</span> <br/>
                    e movê-la de volta para o <span className="text-blue-600">FUNIL ATIVO</span>?
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
                        <Check size={16} /> Confirmar Reabertura
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Modal de Motivo da Perda */}
      {isLossModalOpen && (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl relative border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black text-slate-900 italic tracking-tighter uppercase">Motivo da Perda</h3>
                    <button onClick={() => setIsLossModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                </div>
                
                <p className="text-xs font-bold text-slate-500 mb-4 uppercase tracking-widest">
                    Por que a oportunidade "{dealToMarkAsLost?.title}" foi perdida?
                </p>

                <textarea 
                    className="w-full h-32 p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold outline-none focus:border-red-500 transition-all shadow-inner mb-4"
                    placeholder="Descreva o motivo..."
                    value={lossReason}
                    onChange={(e) => setLossReason(e.target.value)}
                    autoFocus
                />

                {lossFiles.length > 0 && (
                    <div className="mb-4 space-y-2 max-h-32 overflow-y-auto custom-scrollbar">
                        {lossFiles.map((f, i) => (
                            <div key={i} className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-600 truncate">{f.name}</span>
                                <button onClick={() => setLossFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex gap-2 mb-6">
                    <button onClick={() => lossCameraInputRef.current?.click()} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-red-600 transition-colors"><Camera size={18} /></button>
                    <button onClick={() => lossFileInputRef.current?.click()} className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-400 hover:text-red-600 transition-colors"><Paperclip size={18} /></button>
                    <input type="file" multiple className="hidden" ref={lossFileInputRef} onChange={(e) => e.target.files && setLossFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
                    <input type="file" accept="image/*" capture="environment" className="hidden" ref={lossCameraInputRef} onChange={(e) => e.target.files && setLossFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
                </div>

                <div className="flex gap-3">
                    <button 
                        onClick={() => setIsLossModalOpen(false)}
                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-colors"
                        disabled={isSavingLoss}
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleConfirmLostDeal}
                        disabled={!lossReason.trim() || isSavingLoss}
                        className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase shadow-lg hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isSavingLoss ? <Loader2 size={16} className="animate-spin" /> : <ThumbsDown size={16} />}
                        Confirmar Perda
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Modal para Novo Produto (CORREÇÃO: Agora renderizado explicitamente) */}
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
