import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTIONS, prepareForSave } from '../services/dbSchema';
import { deleteVisitPhoto, uploadVisitFile } from '../services/storageService';
import { WhatsAppMessage, Client, User, Activity, Stage, Deal, Attachment } from '../types';
import { MessageSquare, UserPlus, Link as LinkIcon, CheckCircle, Trash2, X, Search, Filter, Calendar, Trello, ExternalLink, Briefcase, CheckSquare, Mic, FileText } from 'lucide-react';

interface WhatsAppInboxProps {
  clients: Client[];
  user: User;
  onNavigate: (page: string, extra?: any) => void;
  stages: Stage[];
  deals: Deal[];
}

export default function WhatsAppInbox({ clients = [], user, onNavigate, stages = [], deals = [] }: WhatsAppInboxProps) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'processed'>('all');
  
  const [selectedMessage, setSelectedMessage] = useState<WhatsAppMessage | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  
  const [modalMode, setModalMode] = useState<'activity' | 'deal' | 'task' | null>(null);
  const [selectedClient, setSelectedClient] = useState<string>('');

  const isAdmin = user && (
    (user.email || '').toLowerCase() === 'l.rigolim@zorionan.com' || 
    (user.email || '').toLowerCase() === 'l.rigolim@zorion.com' || 
    (user.email || '').toLowerCase() === 'lrosadamaia64@gmail.com' || 
    user.id === 'MkccVyRleBRnwnFvpLkkvzHYSC83' ||
    user.role === 'Admin'
  );

  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.WHATSAPP_MESSAGES),
      orderBy('receivedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let msgs = (snapshot.docs || []).map(doc => ({ ...doc.data(), id: doc.id } as WhatsAppMessage));
      
      // Se não for admin, filtra pelo telefone
      if (!isAdmin) {
        const userPhone = user.phone ? user.phone.replace(/\D/g, '') : '';
        if (userPhone) {
          msgs = msgs.filter(m => m.phone === userPhone);
        } else {
          msgs = []; // Se não tem telefone e não é admin, não vê nada (ou poderíamos mostrar nada)
        }
      }
      
      setMessages(msgs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.phone, isAdmin]);

  const handleMarkProcessed = async (id: string, isProcessed: boolean = true) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.WHATSAPP_MESSAGES, id), { status: isProcessed ? 'processed' : 'pending' });
    } catch (error) {
      console.error("Error updating message:", error);
    }
  };

  const handleCreateTaskDirectly = async (msg: WhatsAppMessage) => {
    try {
      const mediaText = msg.mediaUrl ? `\n\nMídia: ${msg.mediaUrl} (${msg.mediaType})` : '';
      const fullDescription = `${msg.text || ''}${mediaText}`;

      const newTodo = {
        id: `todo_${Date.now()}`,
        text: 'Tarefa via WhatsApp: ' + (msg.text || 'Sem texto'),
        description: fullDescription,
        isDone: false,
        userId: user.id,
        createdAt: new Date().toISOString(),
        dueDate: new Date().toISOString()
      };
      await addDoc(collection(db, COLLECTIONS.TODOS), newTodo);
      
      await updateDoc(doc(db, COLLECTIONS.WHATSAPP_MESSAGES, msg.id), { 
        status: 'processed'
      });
      
      onNavigate('dashboard'); // Dashboard contains "Minhas Tarefas"
    } catch (error) {
      console.error("Error creating task:", error);
      alert('Erro ao criar tarefa.');
    }
  };

  const [confirmAction, setConfirmAction] = useState<{type: 'delete' | 'unlink', id: string} | null>(null);

  const handleUnlink = async (id: string) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.WHATSAPP_MESSAGES, id), { 
        status: 'pending',
        linkedClientId: null,
        linkedActivityId: null
      });
      setConfirmAction(null);
    } catch (error) {
      console.error("Error unlinking message:", error);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const msg = messages.find(m => m.id === id);
      // SÓ apaga o arquivo físico do Storage se a mensagem NÃO estiver vinculada a nada (nem cliente, nem atividade)
      if (msg && !msg.linkedActivityId && !msg.linkedClientId) {
        if (msg.mediaUrls) {
          for (const m of msg.mediaUrls) {
            if (m.url) await deleteVisitPhoto(m.url);
          }
        } else if (msg.mediaUrl) {
          await deleteVisitPhoto(msg.mediaUrl);
        }
      }
      await deleteDoc(doc(db, COLLECTIONS.WHATSAPP_MESSAGES, id));
      setConfirmAction(null);
    } catch (error) {
      console.error("Error deleting message:", error);
    }
  };

  const checkIsNewContact = (phone: string) => {
    if (!phone) return false;
    const cleanPhone = phone.replace(/\D/g, '');
    return !(clients || []).some(c => {
      const clientPhone = (c.phone || '').replace(/\D/g, '');
      const clientContactsPhone = (c.contacts || []).some(cont => {
        const cp = (cont.phone || '').replace(/\D/g, '');
        return cp === cleanPhone || cp === cleanPhone.replace(/^55/, '') || `55${cp}` === cleanPhone;
      });
      
      return clientPhone === cleanPhone || 
             clientPhone === cleanPhone.replace(/^55/, '') || 
             `55${clientPhone}` === cleanPhone ||
             clientContactsPhone;
    });
  };

  // Função para garantir que a URL da mídia seja acessível
  const getAccessibleMediaUrl = (url: string) => {
    if (!url) return '';
    
    // Se já for uma URL relativa ou do próprio domínio, retorna direto
    if (url.startsWith('/') || url.startsWith('./') || url.includes(window.location.host)) return url;
    
    // URLs do Firebase Storage não precisam de proxy, elas já têm CORS configurado
    if (url.includes('firebasestorage.googleapis.com')) return url;
    
    // Para URLs externas temporárias (WhatsApp/Twilio/Z-API), usamos o proxy apenas se estivermos no ambiente que o suporta
    const isLocalOrPreview = window.location.hostname === 'localhost' || 
                             window.location.hostname.includes('ais-dev') || 
                             window.location.hostname.includes('ais-pre');
                             
    if (isLocalOrPreview) {
      return `/api/whatsapp/proxy-media?url=${encodeURIComponent(url)}`;
    }
    
    // Em produção (Firebase Hosting), se não for Firebase Storage, tentamos carregar direto
    return url;
  };

  const openModal = (msg: WhatsAppMessage, mode: 'activity' | 'deal' | 'task') => {
    setSelectedMessage(msg);
    setModalMode(mode);
    setSelectedClient('');
    setClientSearch('');
  };

  const handleConfirmAction = async () => {
    if (!selectedClient || !selectedMessage) {
      alert('Selecione um cliente primeiro.');
      return;
    }

    try {
      const mediaText = selectedMessage.mediaUrls ? `\n\n${selectedMessage.mediaUrls.length} Mídias anexadas` : (selectedMessage.mediaUrl ? `\n\nMídia: ${selectedMessage.mediaUrl} (${selectedMessage.mediaType})` : '');
      const fullDescription = `${selectedMessage.text || ''}${mediaText}`;

      if (modalMode === 'task') {
        const atts: Attachment[] = [];
        const actId = `act_${Date.now()}`;

        if (selectedMessage.mediaUrls) {
          for (let i = 0; i < selectedMessage.mediaUrls.length; i++) {
            const m = selectedMessage.mediaUrls[i];
            try {
              const accessibleUrl = getAccessibleMediaUrl(m.url);
              const response = await fetch(accessibleUrl);
              if (!response.ok) throw new Error('Failed to fetch media');
              const blob = await response.blob();
              const filename = m.type === 'image' ? `whatsapp_image_${i+1}.jpg` : `whatsapp_document_${i+1}.pdf`;
              const file = new File([blob], filename, { type: blob.type });
              
              const url = await uploadVisitFile(file, selectedClient, actId);
              atts.push({
                id: `att_${Date.now()}_wa_${i}`,
                url,
                name: filename,
                type: (m.type?.startsWith('image') ? 'image' : 'document') as any
              });
            } catch (error) {
              console.error('Error uploading WA media to Storage:', error);
              // Fallback to original URL if upload fails
              atts.push({
                id: `att_${Date.now()}_wa_${i}`,
                url: m.url,
                name: `WhatsApp ${m.type || 'Mídia'} ${i+1}`,
                type: (m.type?.startsWith('image') ? 'image' : 'document') as any
              });
            }
          }
        } else if (selectedMessage.mediaUrl) {
          try {
            const accessibleUrl = getAccessibleMediaUrl(selectedMessage.mediaUrl);
            const response = await fetch(accessibleUrl);
            if (!response.ok) throw new Error('Failed to fetch media');
            const blob = await response.blob();
            const filename = selectedMessage.mediaType === 'image' ? 'whatsapp_image.jpg' : 'whatsapp_document.pdf';
            const file = new File([blob], filename, { type: blob.type });
            
            const url = await uploadVisitFile(file, selectedClient, actId);
            atts.push({
              id: `att_${Date.now()}_wa`,
              url,
              name: filename,
              type: (selectedMessage.mediaType?.startsWith('image') ? 'image' : 'document') as any
            });
          } catch (error) {
            console.error('Error uploading WA media to Storage:', error);
            atts.push({
              id: `att_${Date.now()}_wa`,
              url: selectedMessage.mediaUrl,
              name: `WhatsApp ${selectedMessage.mediaType || 'Mídia'}`,
              type: (selectedMessage.mediaType?.startsWith('image') ? 'image' : 'document') as any
            });
          }
        }

        const newActivity: Activity = {
          id: actId,
          clientId: selectedClient,
          type: 'Task',
          title: 'Tarefa via WhatsApp',
          description: selectedMessage.text || '',
          dueDate: new Date().toISOString(),
          isDone: false,
          technicianId: user.id,
          createdAt: new Date().toISOString(),
          attachments: atts
        };
        const docRef = await addDoc(collection(db, COLLECTIONS.ACTIVITIES), prepareForSave(newActivity));
        
        await updateDoc(doc(db, COLLECTIONS.WHATSAPP_MESSAGES, selectedMessage.id), { 
          status: 'processed',
          linkedClientId: selectedClient,
          linkedActivityId: docRef.id
        });

        setModalMode(null);
        setSelectedMessage(null);
        onNavigate('dashboard');
        return;
      }

      // Para Cliente Ativo e Oportunidade, marcamos como processado e navegamos
      await updateDoc(doc(db, COLLECTIONS.WHATSAPP_MESSAGES, selectedMessage.id), { 
        status: 'processed',
        linkedClientId: selectedClient
      });

      setModalMode(null);
      setSelectedMessage(null);

      if (modalMode === 'activity') {
        // Find existing deal in production funnel (pip_capacidade)
        const existingDeal = deals.find(d => d.clientId === selectedClient && d.pipelineId === 'pip_capacidade');
        if (existingDeal) {
          onNavigate('production_funnel', { dealId: existingDeal.id, initialMessageData: selectedMessage });
        } else {
          onNavigate('production_funnel', { createFor: selectedClient, initialMessageData: selectedMessage });
        }
      } else if (modalMode === 'deal') {
        // Find existing deal in sales funnel (pip_principal)
        const existingDeal = deals.find(d => d.clientId === selectedClient && d.pipelineId === 'pip_principal');
        if (existingDeal) {
          onNavigate('sales', { dealId: existingDeal.id, initialMessageData: selectedMessage });
        } else {
          onNavigate('sales', { createFor: selectedClient, initialMessageData: selectedMessage });
        }
      }

    } catch (error) {
      console.error("Error saving action:", error);
      alert('Erro ao processar mensagem.');
    }
  };

  const filteredClients = (clients || []).filter(c => {
    const matchesSearch = (c.name || '').toLowerCase().includes(clientSearch.toLowerCase()) || 
                          c.farms?.some(f => f.name?.toLowerCase().includes(clientSearch.toLowerCase()));
    
    // Removido o filtro restritivo de hasCorrectDeal para evitar que clientes "sumam"
    // Agora mostramos todos os clientes que batem com a busca
    return matchesSearch;
  }).sort((a, b) => {
    // Priorizar clientes que já tem algum card no funil selecionado
    let aHasDeal = false;
    let bHasDeal = false;
    
    if (modalMode === 'activity') {
      aHasDeal = (deals || []).some(d => d.clientId === a.id && d.pipelineId === 'pip_capacidade');
      bHasDeal = (deals || []).some(d => d.clientId === b.id && d.pipelineId === 'pip_capacidade');
    } else if (modalMode === 'deal') {
      aHasDeal = (deals || []).some(d => d.clientId === a.id && d.pipelineId === 'pip_principal');
      bHasDeal = (deals || []).some(d => d.clientId === b.id && d.pipelineId === 'pip_principal');
    }
    
    if (aHasDeal && !bHasDeal) return -1;
    if (!aHasDeal && bHasDeal) return 1;
    return (a.name || '').localeCompare(b.name || '');
  });

  const displayedMessages = (messages || []).filter(m => filterStatus === 'all' || m.status === filterStatus);

  if (loading) {
    return <div className="p-8 text-center text-slate-500">Carregando mensagens...</div>;
  }

  const userPhone = user.phone ? user.phone.replace(/\D/g, '') : '';

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900 italic uppercase tracking-tighter flex items-center gap-2">
              <MessageSquare className="text-[#009b58]" />
              Caixa de Entrada WhatsApp
            </h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">
              Gerencie todas as mensagens recebidas
            </p>
          </div>
          
          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button 
              onClick={() => setFilterStatus('all')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-colors ${filterStatus === 'all' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              Todas ({(messages || []).length})
            </button>
            <button 
              onClick={() => setFilterStatus('pending')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-colors ${filterStatus === 'pending' ? 'bg-[#009b58] text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              Pendentes ({(messages || []).filter(m => m.status === 'pending').length})
            </button>
            <button 
              onClick={() => setFilterStatus('processed')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-colors ${filterStatus === 'processed' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              Processadas ({(messages || []).filter(m => m.status === 'processed').length})
            </button>
          </div>
        </div>

        {!userPhone && !isAdmin && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-start gap-3">
            <div className="p-2 bg-amber-100 text-amber-600 rounded-xl">
              <MessageSquare size={20} />
            </div>
            <div>
              <h3 className="font-black text-amber-900 text-sm">Telefone não configurado</h3>
              <p className="text-xs text-amber-700 mt-1">
                Você precisa configurar o seu número de telefone no seu perfil para receber as mensagens direcionadas a você.
              </p>
            </div>
          </div>
        )}

        {displayedMessages.length === 0 ? (
          <div className="bg-white rounded-[2rem] p-12 text-center border border-slate-200 shadow-sm">
            <MessageSquare size={48} className="mx-auto text-slate-200 mb-4" />
            <h3 className="text-lg font-black text-slate-800 uppercase italic">Nenhuma mensagem encontrada</h3>
            <p className="text-sm font-medium text-slate-500 mt-2">Não há mensagens para o filtro selecionado.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedMessages.map(msg => {
              const isNewContact = checkIsNewContact(msg.phone);
              const isProcessed = msg.status === 'processed';
              const linkedClient = msg.linkedClientId ? clients.find(c => c.id === msg.linkedClientId) : null;

              return (
                <div key={msg.id} className={`bg-white rounded-[2rem] p-6 border shadow-sm hover:shadow-md transition-shadow ${isProcessed ? 'border-slate-200 opacity-75' : 'border-[#009b58]/30'}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-black text-slate-800 uppercase italic">{msg.senderName || 'Desconhecido'}</h3>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-lg">{msg.phone}</span>
                        {isNewContact && !isProcessed && (
                          <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded-lg uppercase tracking-widest border border-blue-100">
                            Novo Contato
                          </span>
                        )}
                        {isProcessed && (
                          <span className="text-[10px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-lg uppercase tracking-widest border border-slate-200 flex items-center gap-1">
                            <CheckCircle size={10} /> Processado
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Recebido em {new Date(msg.receivedAt).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); setConfirmAction({type: 'delete', id: msg.id}); }} className="text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
                    {msg.mediaUrls && (msg.mediaUrls || []).length > 0 ? (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {(msg.mediaUrls || []).map((m, i) => (
                          <div key={i}>
                            {m.type === 'image' ? (
                              <img 
                                src={getAccessibleMediaUrl(m.url)} 
                                alt={`Mídia Recebida ${i+1}`} 
                                referrerPolicy="no-referrer" 
                                className="max-w-xs rounded-xl border border-slate-200" 
                              />
                            ) : (
                              <a href={getAccessibleMediaUrl(m.url)} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-sm font-bold underline">
                                Ver Anexo {i+1} ({m.type})
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : msg.mediaUrl && (
                      <div className="mb-3">
                        {msg.mediaType === 'image' ? (
                          <img 
                            src={getAccessibleMediaUrl(msg.mediaUrl)} 
                            alt="Mídia Recebida" 
                            referrerPolicy="no-referrer" 
                            className="max-w-xs rounded-xl border border-slate-200" 
                          />
                        ) : (
                          <a href={getAccessibleMediaUrl(msg.mediaUrl)} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-sm font-bold underline">
                            Ver Anexo ({msg.mediaType})
                          </a>
                        )}
                      </div>
                    )}
                    <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{msg.text || '[Sem texto]'}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {linkedClient ? (
                       <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 rounded-xl border border-slate-200">
                          <span className="text-xs font-bold text-slate-500 uppercase">Vinculado a:</span>
                          <button onClick={() => onNavigate('client_details', { clientId: linkedClient.id })} className="text-sm font-black text-blue-600 hover:underline flex items-center gap-1">
                             {linkedClient.name} <ExternalLink size={14} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); setConfirmAction({type: 'unlink', id: msg.id}); }} className="text-red-500 hover:text-red-700 ml-2">
                             <X size={14} />
                          </button>
                       </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        <button 
                          onClick={() => openModal(msg, 'activity')}
                          className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-xl text-xs font-black uppercase shadow-sm hover:bg-blue-200 transition-colors"
                        >
                          <Briefcase size={16} /> Cliente Ativo
                        </button>
                        <button 
                          onClick={() => openModal(msg, 'deal')}
                          className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-xs font-black uppercase shadow-sm hover:bg-emerald-200 transition-colors"
                        >
                          <Trello size={16} /> Oportunidade
                        </button>
                        <button 
                          onClick={() => handleCreateTaskDirectly(msg)}
                          className="flex items-center gap-2 px-4 py-2 bg-amber-100 text-amber-700 rounded-xl text-xs font-black uppercase shadow-sm hover:bg-amber-200 transition-colors"
                        >
                          <CheckSquare size={16} /> Tarefa
                        </button>
                      </div>
                    )}
                    
                    {!isProcessed ? (
                      <button 
                        onClick={() => handleMarkProcessed(msg.id, true)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-200 transition-colors"
                      >
                        <CheckCircle size={16} /> Marcar como Processado
                      </button>
                    ) : (
                      <button 
                        onClick={() => handleMarkProcessed(msg.id, false)}
                        className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-black uppercase hover:bg-slate-200 transition-colors"
                      >
                        <X size={16} /> Desfazer Processamento
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalMode && selectedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[2rem] w-full max-w-2xl p-6 md:p-8 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 italic tracking-tighter uppercase flex items-center gap-2">
                {modalMode === 'activity' && <><Briefcase className="text-blue-500" size={24} /> Registrar Cliente Ativo</>}
                {modalMode === 'deal' && <><Trello className="text-emerald-500" size={24} /> Criar Oportunidade</>}
                {modalMode === 'task' && <><CheckSquare className="text-amber-500" size={24} /> Criar Tarefa</>}
              </h3>
              <button onClick={() => setModalMode(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-2">Mensagem Original</p>
                {selectedMessage.mediaUrls && (selectedMessage.mediaUrls || []).length > 0 ? (
                  <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">{(selectedMessage.mediaUrls || []).length} Mídias em anexo</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(selectedMessage.mediaUrls || []).map((m, i) => (
                        <div key={i} className="relative group w-full sm:w-[calc(50%-0.5rem)]">
                          {m.type === 'image' ? (
                            <img 
                              src={getAccessibleMediaUrl(m.url)} 
                              alt={`Anexo ${i+1}`} 
                              className="max-h-48 w-full object-contain rounded-lg border border-slate-200 bg-white" 
                              onError={(e) => {
                                console.error("Erro ao carregar imagem:", m.url);
                                (e.target as HTMLImageElement).src = "https://placehold.co/600x400?text=Erro+ao+carregar+imagem";
                              }}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <a href={getAccessibleMediaUrl(m.url)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-100 hover:bg-slate-50 transition-colors">
                              <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                {m.type === 'audio' ? <Mic size={20} /> : <FileText size={20} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-slate-900 truncate">Arquivo {i+1} ({m.type})</p>
                                <p className="text-xs text-slate-500">Abrir em nova aba</p>
                              </div>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selectedMessage.mediaUrl && (
                  <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Mídia em anexo</span>
                      <a 
                        href={getAccessibleMediaUrl(selectedMessage.mediaUrl)} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        <ExternalLink size={12} />
                        Abrir em nova aba
                      </a>
                    </div>
                    
                    {selectedMessage.mediaType === 'image' ? (
                      <div className="relative group">
                        <img 
                          src={getAccessibleMediaUrl(selectedMessage.mediaUrl)} 
                          alt="Anexo" 
                          className="max-h-64 w-full object-contain rounded-lg border border-slate-200 bg-white" 
                          referrerPolicy="no-referrer"
                          onError={(e) => {
                            console.error("Erro ao carregar imagem:", selectedMessage.mediaUrl);
                            (e.target as HTMLImageElement).src = "https://placehold.co/600x400?text=Erro+ao+carregar+imagem";
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-slate-100">
                        <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                          {selectedMessage.mediaType === 'audio' ? <Mic size={20} /> : <FileText size={20} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">Arquivo de {selectedMessage.mediaType}</p>
                          <p className="text-xs text-slate-500">Clique em "Abrir em nova aba" para visualizar</p>
                        </div>
                      </div>
                    )}
                    
                    <div className="mt-2 pt-2 border-t border-slate-100">
                      <p className="text-[10px] text-slate-400 font-mono break-all leading-tight">
                        <span className="font-bold">URL:</span> {selectedMessage.mediaUrl}
                      </p>
                    </div>
                  </div>
                )}
                <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{selectedMessage.text}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Selecione o Cliente</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                  <input
                    type="text"
                    placeholder="Buscar cliente por nome ou fazenda..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
                  />
                </div>
                
                <div className="max-h-40 overflow-y-auto custom-scrollbar space-y-2 border border-slate-100 rounded-xl p-2 bg-slate-50">
                  {filteredClients.length === 0 ? (
                    <p className="text-center text-sm text-slate-500 py-4">Nenhum cliente encontrado.</p>
                  ) : (
                    filteredClients.map(client => (
                      <button
                        key={client.id}
                        onClick={() => setSelectedClient(client.id)}
                        className={`w-full text-left p-3 rounded-xl border transition-all flex justify-between items-center ${
                          selectedClient === client.id 
                            ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' 
                            : 'border-white bg-white hover:border-blue-300'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-slate-800 text-sm">{client.name}</p>
                          <p className="text-xs text-slate-500">{client.farmName || 'Sem fazenda'}</p>
                        </div>
                        {selectedClient === client.id && <CheckCircle size={16} className="text-blue-500" />}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-6 border-t border-slate-100 mt-6">
                <button
                  onClick={() => setModalMode(null)}
                  className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-100 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={!selectedClient}
                  className="px-6 py-3 bg-blue-600 text-white rounded-xl font-black uppercase shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirmar e Salvar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-black text-slate-800 mb-2">
              {confirmAction.type === 'delete' ? 'Excluir mensagem?' : 'Desvincular mensagem?'}
            </h3>
            <p className="text-sm text-slate-600 mb-6">
              {confirmAction.type === 'delete' 
                ? 'Esta ação não pode ser desfeita.' 
                : 'A mensagem voltará ao status pendente.'}
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setConfirmAction(null)}
                className="px-4 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button 
                onClick={() => confirmAction.type === 'delete' ? handleDelete(confirmAction.id) : handleUnlink(confirmAction.id)}
                className={`px-4 py-2 rounded-xl font-bold text-white ${confirmAction.type === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
