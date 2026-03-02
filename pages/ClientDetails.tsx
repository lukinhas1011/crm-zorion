
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Client, Visit, User, CatalogItem, Deal, Stage, Pipeline, Activity, Attachment, Lot } from '../types';
import { 
  ArrowLeft, Calendar, Mic, StopCircle, Loader2, Navigation, Pencil, Save, X, 
  Beef, Factory, Plus, Check, Sparkles, RotateCw, Truck, MessageSquare, ListChecks, 
  User as UserIcon, Clock, MapPin, DollarSign, History, TrendingUp, Info,
  Phone, ChevronRight, Trello, BarChart3, LayoutGrid, Mail, Send, Users,
  Paperclip, Video, ImageIcon, FileText, Camera, Package, Briefcase, CalendarCheck,
  Archive, Trash2, ExternalLink, AlertTriangle, Coins, MessageCircle
} from 'lucide-react';
import { Button } from '../components/Button';
import { summarizeVisitAudio } from '../services/geminiService';
import { uploadVisitFile, deleteVisitPhoto } from '../services/storageService';
import { LocationPicker } from '../components/LocationPicker';

interface ClientDetailsProps {
  client: Client;
  visits: Visit[];
  deals: Deal[];
  stages: Stage[];
  pipelines: Pipeline[];
  catalog: CatalogItem[];
  user: User;
  onBack: () => void;
  onAddVisit: (visit: Visit) => void;
  onUpdateVisit: (visit: Visit) => void;
  onUpdateClient: (client: Client) => void;
  onAddCatalogItem?: (item: CatalogItem) => void;
  onNavigate: (page: string, extra?: any) => void;
  activities?: Activity[];
  onAddActivity?: (activity: Activity) => void;
  onUpdateActivity?: (activity: Activity) => void;
  currencyMode?: 'BRL' | 'USD';
  exchangeRate?: number;
}

const ClientDetails: React.FC<ClientDetailsProps> = ({ 
  client, visits, deals, stages, pipelines, catalog, user, onBack, onAddVisit, onUpdateVisit, onUpdateClient, onAddCatalogItem, onNavigate,
  activities = [], onAddActivity, onUpdateActivity, currencyMode = 'USD', exchangeRate = 1
}) => {
  const isFactory = client.type === 'Fábrica';
  const [activeTab, setActiveTab] = useState<'timeline' | 'deals' | 'herd'>('timeline');
  const [isEditingClient, setIsEditingClient] = useState(false);
  const [clientEditData, setClientEditData] = useState<Client>({ ...client });
  const [isInteractionModalOpen, setIsInteractionModalOpen] = useState(false);
  
  const isAdmin = user && (user.email === 'l.rigolin@zorionan.com' || user.role === 'Admin');

  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [editActFiles, setEditActFiles] = useState<File[]>([]);
  const [isSavingEditAct, setIsSavingEditAct] = useState(false);
  const editActFileInputRef = useRef<HTMLInputElement>(null);

  const [itemToDelete, setItemToDelete] = useState<{type: 'attachment' | 'activity' | 'deal', data: any} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [interactionType, setInteractionType] = useState<'Call' | 'Email' | 'Whatsapp' | 'Meeting'>('Call');
  const [interactionNote, setInteractionNote] = useState('');
  const [isUploadingInteraction, setIsUploadingInteraction] = useState(false);
  const [interactionFiles, setInteractionFiles] = useState<File[]>([]);
  const interactionFileInputRef = useRef<HTMLInputElement>(null);

  const [transcript, setTranscript] = useState('');
  const [product, setProduct] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [quickVisitDate, setQuickVisitDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setClientEditData({ ...client }); }, [client]);

  const clientDeals = useMemo(() => deals.filter(d => d.clientId === client.id), [deals, client.id]);
  const activePotentialUSD = useMemo(() => clientDeals.filter(d => d.status === 'Open').reduce((acc, d) => acc + d.value, 0), [clientDeals]);

  const timelineItems = useMemo(() => {
    const visitItems = visits.map(v => ({ ...v, itemType: 'visit', sortDate: v.date }));
    const activityItems = activities.map(a => ({ ...a, itemType: 'activity', sortDate: a.dueDate }));
    return [...visitItems, ...activityItems].sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());
  }, [visits, activities]);

  const handleProductChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
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
        setProduct(newItem.name);
      }
    } else {
      setProduct(val);
    }
  };

  const handleSaveQuickVisit = async () => {
    if (!transcript && selectedFiles.length === 0) return;
    setIsUploading(true);
    try {
        const visitId = `vis_quick_${Date.now()}`;
        const newAttachments: Attachment[] = [];

        for (const file of selectedFiles) {
            const url = await uploadVisitFile(file, client.id, visitId);
            newAttachments.push({
                id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                url: url,
                name: file.name,
                type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document',
                size: file.size
            });
        }
        
        onAddVisit({
          id: visitId, clientId: client.id, 
          date: new Date(quickVisitDate).toISOString(),
          technicianId: user.id, technicianName: user.name,
          purpose: isFactory ? 'Geral' : 'Nutrição', 
          product: product,
          status: 'Concluída',
          transcript, attachments: newAttachments,
          createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        });
        
        setTranscript(''); setProduct(''); setSelectedFiles([]);
    } catch (error) {
        alert("Erro ao salvar.");
    } finally {
        setIsUploading(false);
    }
  };

  const handleSaveInteraction = async () => {
    if (!onAddActivity || !interactionNote) return;
    setIsUploadingInteraction(true);
    try {
        const actId = `act_${Date.now()}`;
        const atts: Attachment[] = [];

        for (const file of interactionFiles) {
            const url = await uploadVisitFile(file, client.id, actId);
            atts.push({ id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, url, name: file.name, type: 'document' });
        }

        onAddActivity({
          id: actId, clientId: client.id,
          type: interactionType as any, title: `${interactionType} Registrada`,
          description: interactionNote, dueDate: new Date().toISOString(), isDone: true,
          technicianId: user.id, attachments: atts, createdAt: new Date().toISOString()
        });
        setIsInteractionModalOpen(false);
        setInteractionNote('');
        setInteractionFiles([]);
    } catch (e) {
        alert("Erro ao registrar interação.");
    } finally {
        setIsUploadingInteraction(false);
    }
  };

  const handleSaveClientChanges = () => {
    onUpdateClient(clientEditData);
    setIsEditingClient(false);
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
        const finalActivity = { 
          ...cleanActivity, 
          attachments: atts,
          title: `${cleanActivity.type} Registrada`
        };
        await onUpdateActivity(finalActivity);
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
      if (itemToDelete.type === 'attachment') {
        const { item, type, attId } = itemToDelete.data;
        // item: Visit | Activity, type: 'visit' | 'activity', attId: string
        
        const att = (item.attachments || []).find((a: Attachment) => a.id === attId);
        
        if (att?.url) { 
             try { await deleteVisitPhoto(att.url); } catch (e) { console.warn("Erro ao deletar arquivo fisico", e); } 
        }

        const updatedAttachments = (item.attachments || []).filter((a: Attachment) => a.id !== attId);
        const updatedItem = { ...item, attachments: updatedAttachments };

        if (type === 'visit') {
            onUpdateVisit(updatedItem as Visit);
        } else if (type === 'activity' && onUpdateActivity) {
             await onUpdateActivity(updatedItem as Activity);
        }
        
        if (editingActivity && editingActivity.id === item.id) {
             setEditingActivity(updatedItem as Activity);
        }
      }
      setItemToDelete(null);
    } catch (error) {
       console.error("Erro na exclusão:", error);
       alert("Erro ao excluir item.");
    } finally {
       setIsDeleting(false);
    }
  };

  const formatDateTimeLocal = (dateStr: string) => {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const z = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-white border border-slate-100 rounded-2xl text-slate-400 shadow-sm hover:text-zorion-900"><ArrowLeft size={20} /></button>
          <div>
            <h2 className="text-2xl font-black text-slate-900 italic tracking-tighter leading-none">{client.farmName}</h2>
            <p className="text-[10px] font-black text-slate-400 uppercase mt-1">{isFactory ? 'Industrial' : 'Pecuária'}</p>
          </div>
        </div>
        <Button onClick={() => onNavigate('sales', { createFor: client.id })} className="bg-emerald-600 text-white px-5 py-3 rounded-2xl font-black text-[10px] uppercase"><DollarSign size={16} className="mr-2" /> Nova Oportunidade</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-8">
                <div className="flex justify-between items-start mb-6">
                  <div className={`h-16 w-16 text-white rounded-[1.8rem] flex items-center justify-center ${isFactory ? 'bg-blue-600' : 'bg-zorion-900'}`}>{isFactory ? <Factory size={32} /> : <Beef size={32} />}</div>
                  <button onClick={() => setIsEditingClient(true)} className="p-3 bg-slate-50 rounded-2xl border border-slate-100 hover:text-blue-600 transition-colors"><Pencil size={18} /></button>
                </div>
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 italic leading-none">{client.farmName}</h3>
                    <p className="text-[11px] font-bold text-slate-400 mt-1 uppercase flex items-center gap-2"><UserIcon size={12} /> {client.name}</p>
                  </div>
                  <div className="p-5 bg-emerald-50 rounded-[2rem] border border-emerald-100 shadow-inner">
                      <p className="text-[9px] font-black uppercase text-emerald-600 mb-1 flex items-center gap-1"><Coins size={10} /> Potencial Ativo</p>
                      <div className="flex flex-col">
                        <p className="font-black italic tracking-tighter text-2xl text-blue-900 mt-1.5 flex items-center gap-2">$ {activePotentialUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[8px] opacity-60 uppercase bg-blue-100 px-1.5 rounded">USD</span></p>
                      </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Rebanho</p>
                      <p className="text-lg font-black text-slate-800 italic leading-none">{client.herdSize}</p>
                    </div>
                    <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                      <p className="text-[9px] font-black text-emerald-600 uppercase mb-1">Nutrição</p>
                      <p className="text-lg font-black text-slate-800 italic leading-none">{client.treatedHerdSize || 0}</p>
                    </div>
                  </div>
                </div>
          </div>
        </aside>

        <div className="lg:col-span-8">
           <div className="flex bg-slate-200/50 p-1.5 rounded-[2.2rem] border border-slate-200 mb-6">
              {[{id:'timeline', label:'Histórico', icon:History}, {id:'deals', label:'Comercial', icon:DollarSign}].map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex-1 flex items-center justify-center gap-2 py-4 text-[10px] font-black uppercase rounded-[1.8rem] transition-all ${activeTab === tab.id ? 'bg-white text-zorion-900 shadow-lg' : 'text-slate-500'}`}><tab.icon size={16} /> {tab.label}</button>
              ))}
           </div>

           {activeTab === 'timeline' && (
                <div className="space-y-6">
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-lg">
                     <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2"><Sparkles className="text-zorion-600 h-5 w-5" /><h4 className="text-[11px] font-black uppercase italic">Relato IA</h4></div>
                        <button onClick={() => setIsInteractionModalOpen(true)} className="text-[10px] font-black uppercase text-blue-600 bg-blue-50 px-3 py-2 rounded-xl">+ Registro CRM</button>
                     </div>
                     
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                        <div>
                          <label className="text-[9px] text-slate-400 font-black uppercase tracking-widest ml-1 mb-1 block">Data da Ocorrência</label>
                          <input 
                            type="datetime-local" 
                            value={quickVisitDate}
                            onChange={(e) => setQuickVisitDate(e.target.value)}
                            className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-zorion-900/10 rounded-xl text-xs font-bold text-slate-700 outline-none transition-colors"
                          />
                        </div>
                        <div>
                          <label className="text-[9px] text-slate-400 font-black uppercase tracking-widest ml-1 mb-1 block">Produto</label>
                          <select 
                            value={product}
                            onChange={handleProductChange}
                            className="w-full p-3 bg-slate-50 border-2 border-transparent focus:border-zorion-900/10 rounded-xl text-xs font-bold text-slate-700 outline-none transition-colors bg-white"
                          >
                            <option value="">Nenhum Produto</option>
                            {catalog.filter(c => c.type === 'product').map(c => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                            <option value="NEW_PRODUCT" className="text-zorion-600 font-black">+ CADASTRAR NOVO PRODUTO</option>
                          </select>
                        </div>
                     </div>

                     <textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Dite ou escreva observações..." className="w-full h-32 p-6 bg-slate-50 rounded-[2rem] text-sm font-bold border-2 border-transparent focus:border-zorion-900/10 outline-none resize-none" />
                     <div className="flex gap-2 mt-4">
                        <button type="button" onClick={() => cameraInputRef.current?.click()} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-500 shadow-sm active:scale-95"><Camera size={18} /></button>
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="p-3 bg-white border border-slate-200 rounded-xl text-slate-500 shadow-sm active:scale-95"><Paperclip size={18} /></button>
                        <input type="file" multiple className="hidden" ref={fileInputRef} onChange={e => {if(e.target.files) setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value='';}} />
                        <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={e => {if(e.target.files) setSelectedFiles(prev => [...prev, ...Array.from(e.target.files!)]); e.target.value='';}} />
                        {selectedFiles.length > 0 && <span className="text-[9px] font-black text-zorion-600 self-center ml-2 uppercase">{selectedFiles.length} selecionados</span>}
                     </div>
                     <div className="flex justify-end mt-6">
                        <Button onClick={handleSaveQuickVisit} disabled={(!transcript && selectedFiles.length === 0) || isUploading} isLoading={isUploading} className="px-10 py-3 rounded-xl font-black text-[10px] uppercase">Salvar Registro</Button>
                     </div>
                  </div>

                  <div className="space-y-4">
                    {timelineItems.map((item: any) => {
                        let borderColor = 'bg-blue-500';
                        if (item.itemType === 'visit') borderColor = 'bg-emerald-500';
                        if (item.type === 'Whatsapp') borderColor = 'bg-green-500';

                        return (
                        <div key={item.id} className="bg-white p-6 rounded-[2.5rem] border border-slate-100 flex gap-6 relative group overflow-hidden">
                            <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${borderColor}`}></div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-2">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            {item.type === 'Whatsapp' && <MessageCircle size={16} className="text-green-500" />}
                                            <h4 className="font-black text-slate-800 text-lg italic leading-tight">{item.itemType === 'visit' ? item.purpose : item.title}</h4>
                                        </div>
                                        {item.product && (
                                            <span className="text-[10px] font-black text-zorion-600 uppercase tracking-widest mt-1 flex items-center gap-1">
                                                <Package size={10} /> {item.product}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-[9px] font-bold text-slate-400">{new Date(item.sortDate).toLocaleDateString()}</span>
                                        {item.itemType === 'activity' && (
                                          <button onClick={(e) => { e.stopPropagation(); setEditingActivity(item); setEditActFiles([]); }} className="p-1 text-slate-300 hover:text-blue-500 transition-colors"><Pencil size={12} /></button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-wrap">{item.transcript || item.description}</p>
                                {item.attachments?.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {item.attachments.map((att: Attachment) => (
                                            <div key={att.id} className="relative group/att">
                                                <a href={att.url} target="_blank" className="flex items-center gap-2 px-3 py-2 bg-slate-50 border rounded-xl hover:bg-slate-100">
                                                    {att.type === 'image' ? <ImageIcon size={14} /> : <FileText size={14} />}
                                                    <span className="text-[10px] font-bold truncate max-w-[120px]">{att.name}</span>
                                                </a>
                                                <button onClick={(e) => { e.stopPropagation(); setItemToDelete({ type: 'attachment', data: { item: item, type: item.itemType === 'visit' ? 'visit' : 'activity', attId: att.id } }); }} className="absolute -top-2 -right-2 h-6 w-6 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/att:opacity-100 shadow-md"><Trash2 size={12} /></button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )})}
                  </div>
                </div>
           )}
        </div>
      </div>

      {isEditingClient && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto custom-scrollbar">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter">Editar Cliente</h3>
                    <button onClick={() => setIsEditingClient(false)} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"><X size={20} /></button>
                </div>
                
                <div className="space-y-5">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Unidade</label>
                        <input className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" value={clientEditData.farmName} onChange={e => setClientEditData({...clientEditData, farmName: e.target.value})} />
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsável</label>
                        <input className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" value={clientEditData.name} onChange={e => setClientEditData({...clientEditData, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone</label>
                            <input className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" value={clientEditData.phone} onChange={e => setClientEditData({...clientEditData, phone: e.target.value})} />
                         </div>
                         <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{isFactory ? 'Capacidade' : 'Rebanho'}</label>
                            <input type="number" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" value={clientEditData.herdSize} onChange={e => setClientEditData({...clientEditData, herdSize: Number(e.target.value)})} />
                         </div>
                    </div>
                    <div className="space-y-1">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nutrição / Tratados</label>
                         <input type="number" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" value={clientEditData.treatedHerdSize} onChange={e => setClientEditData({...clientEditData, treatedHerdSize: Number(e.target.value)})} />
                    </div>
                    
                    <div className="space-y-1 pt-2">
                         <LocationPicker value={clientEditData.location} onChange={(loc) => setClientEditData({...clientEditData, location: loc})} />
                    </div>

                    <div className="flex gap-3 pt-6">
                        <Button onClick={() => setIsEditingClient(false)} variant="outline" className="flex-1 rounded-2xl text-xs font-black uppercase">Cancelar</Button>
                        <Button onClick={handleSaveClientChanges} className="flex-1 rounded-2xl text-xs font-black uppercase">Salvar</Button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {isInteractionModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative border border-slate-100">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-black text-slate-900 italic tracking-tighter uppercase">Registrar Interação</h3>
                    <button onClick={() => { setIsInteractionModalOpen(false); setInteractionFiles([]); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                </div>
                <div className="space-y-4">
                    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
                        {(['Call', 'Meeting', 'Whatsapp', 'Email'] as const).map(t => (
                            <button key={t} onClick={() => setInteractionType(t)} className={`flex-1 py-2 text-[9px] font-black uppercase rounded-lg transition-all ${interactionType === t ? 'bg-white text-zorion-900 shadow-sm' : 'text-slate-400'}`}>{t}</button>
                        ))}
                    </div>
                    <textarea value={interactionNote} onChange={e => setInteractionNote(e.target.value)} className="w-full h-32 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-zorion-500 transition-all shadow-inner" placeholder={`Detalhes da ${interactionType}...`} />
                    
                    {interactionFiles.length > 0 && (
                      <div className="space-y-2 max-h-40 overflow-y-auto custom-scrollbar pr-1">
                         <p className="text-[9px] font-black uppercase text-slate-400 px-1">Anexos prontos:</p>
                         {interactionFiles.map((f, i) => (
                           <div key={i} className="flex items-center justify-between bg-slate-50 p-2 rounded-xl border border-slate-100">
                              <div className="flex items-center gap-2 overflow-hidden">
                                 <Paperclip size={12} className="text-slate-400 shrink-0" />
                                 <span className="text-[10px] font-bold text-slate-600 truncate">{f.name}</span>
                              </div>
                              <button type="button" onClick={() => setInteractionFiles(prev => prev.filter((_, idx) => idx !== i))} className="text-red-300 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                           </div>
                         ))}
                      </div>
                    )}

                    <div className="flex justify-between items-center gap-3 pt-2">
                        <button type="button" onClick={() => interactionFileInputRef.current?.click()} className="p-4 bg-white border-2 border-slate-100 rounded-2xl text-slate-400 hover:text-zorion-600 shadow-sm active:scale-95 transition-all"><Paperclip size={24} /></button>
                        <input 
                          type="file" multiple className="hidden" ref={interactionFileInputRef} 
                          onChange={e => {
                            if(e.target.files && e.target.files.length > 0) {
                              setInteractionFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                              e.target.value = '';
                            }
                          }} 
                        />
                        <Button onClick={handleSaveInteraction} isLoading={isUploadingInteraction} className="flex-1 py-4 rounded-2xl font-black uppercase text-xs shadow-lg flex items-center gap-2"><Send size={16} /> REGISTRAR</Button>
                    </div>
                </div>
            </div>
        </div>
      )}

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
                          <button type="button" onClick={() => setItemToDelete({ type: 'attachment', data: { item: editingActivity, type: 'activity', attId: att.id } })} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
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

export default ClientDetails;
