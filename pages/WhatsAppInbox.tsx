import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTIONS, prepareForSave } from '../services/dbSchema';
import { WhatsAppMessage, Client, User, Activity } from '../types';
import { MessageSquare, UserPlus, Link as LinkIcon, CheckCircle, Trash2, X, Search, Filter, Calendar, Trello, ExternalLink } from 'lucide-react';

interface WhatsAppInboxProps {
  clients: Client[];
  user: User;
  onNavigate: (page: string, extra?: any) => void;
}

export default function WhatsAppInbox({ clients, user, onNavigate }: WhatsAppInboxProps) {
  const [messages, setMessages] = useState<WhatsAppMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'processed'>('all');
  
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false);
  const [selectedMessage, setSelectedMessage] = useState<WhatsAppMessage | null>(null);
  const [clientSearch, setClientSearch] = useState('');
  const [linkAction, setLinkAction] = useState<'activity' | 'deal' | 'just_link'>('activity');

  useEffect(() => {
    const q = query(
      collection(db, COLLECTIONS.WHATSAPP_MESSAGES),
      orderBy('receivedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      let msgs = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as WhatsAppMessage));
      
      // Filter messages by user's phone number
      const userPhone = user.phone ? user.phone.replace(/\D/g, '') : '';
      if (userPhone) {
        msgs = msgs.filter(m => m.receiverPhone === userPhone);
      } else {
        // Se o usuário não tem telefone configurado, não vê mensagens (ou vê todas se for admin? O pedido foi estrito: "cada conta vai receber as mesagens que estao cadastradas com seu numero e pronto")
        msgs = [];
      }
      
      setMessages(msgs);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user.phone]);

  const handleMarkProcessed = async (id: string, isProcessed: boolean = true) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.WHATSAPP_MESSAGES, id), { status: isProcessed ? 'processed' : 'pending' });
    } catch (error) {
      console.error("Error updating message:", error);
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Tem certeza que deseja excluir esta mensagem?')) {
      try {
        await deleteDoc(doc(db, COLLECTIONS.WHATSAPP_MESSAGES, id));
      } catch (error) {
        console.error("Error deleting message:", error);
      }
    }
  };

  const checkIsNewContact = (phone: string) => {
    return !clients.some(c => c.phone.replace(/\D/g, '') === phone || c.contacts.some(cont => cont.phone?.replace(/\D/g, '') === phone));
  };

  const handleOpenLinkModal = (msg: WhatsAppMessage) => {
    setSelectedMessage(msg);
    setIsLinkModalOpen(true);
    setClientSearch('');
    setLinkAction('activity');
  };

  const handleLinkToClient = async (clientId: string) => {
    if (!selectedMessage) return;
    
    try {
      let activityId = undefined;

      if (linkAction === 'activity') {
        const newActivity: Activity = {
          id: `act_${Date.now()}`,
          clientId,
          type: 'Whatsapp',
          title: `Mensagem WhatsApp: ${selectedMessage.senderName || selectedMessage.phone}`,
          description: `${selectedMessage.text}\n\n${selectedMessage.mediaUrl ? `Mídia: ${selectedMessage.mediaUrl}` : ''}`,
          dueDate: new Date().toISOString(),
          isDone: true,
          technicianId: user.id,
          createdAt: new Date().toISOString()
        };
        const docRef = await addDoc(collection(db, COLLECTIONS.ACTIVITIES), prepareForSave(newActivity));
        activityId = docRef.id;
      } else if (linkAction === 'deal') {
         // Navigate to sales funnel to create a deal for this client
         onNavigate('sales', { createFor: clientId, initialNotes: selectedMessage.text });
         await updateDoc(doc(db, COLLECTIONS.WHATSAPP_MESSAGES, selectedMessage.id), { status: 'processed', linkedClientId: clientId });
         setIsLinkModalOpen(false);
         setSelectedMessage(null);
         return;
      }

      await updateDoc(doc(db, COLLECTIONS.WHATSAPP_MESSAGES, selectedMessage.id), { 
        status: 'processed',
        linkedClientId: clientId,
        linkedActivityId: activityId
      });
      
      setIsLinkModalOpen(false);
      setSelectedMessage(null);
      alert('Mensagem vinculada com sucesso!');
    } catch (error) {
      console.error("Error linking message:", error);
      alert('Erro ao vincular mensagem.');
    }
  };

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) || 
    c.farmName?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const displayedMessages = messages.filter(m => filterStatus === 'all' || m.status === filterStatus);

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
              Todas ({messages.length})
            </button>
            <button 
              onClick={() => setFilterStatus('pending')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-colors ${filterStatus === 'pending' ? 'bg-[#009b58] text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              Pendentes ({messages.filter(m => m.status === 'pending').length})
            </button>
            <button 
              onClick={() => setFilterStatus('processed')}
              className={`px-4 py-2 rounded-lg text-xs font-black uppercase transition-colors ${filterStatus === 'processed' ? 'bg-blue-600 text-white' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              Processadas ({messages.filter(m => m.status === 'processed').length})
            </button>
          </div>
        </div>

        {!userPhone && (
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
                    <button onClick={() => handleDelete(msg.id)} className="text-red-400 hover:text-red-600 p-2 rounded-full hover:bg-red-50 transition-colors">
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 mb-6">
                    {msg.mediaUrl && (
                      <div className="mb-3">
                        {msg.mediaType === 'image' ? (
                          <img src={msg.mediaUrl} alt="Mídia Recebida" className="max-w-xs rounded-xl border border-slate-200" />
                        ) : (
                          <a href={msg.mediaUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 text-sm font-bold underline">
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
                       </div>
                    ) : (
                      <>
                        {isNewContact ? (
                          <button 
                            onClick={() => onNavigate('clients', { newClientPhone: msg.phone, newClientName: msg.senderName })}
                            className="flex items-center gap-2 px-4 py-2 bg-[#009b58] text-white rounded-xl text-xs font-black uppercase shadow-lg hover:bg-[#00824a] transition-colors"
                          >
                            <UserPlus size={16} /> Criar Novo Cliente
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleOpenLinkModal(msg)}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-black uppercase shadow-lg hover:bg-blue-700 transition-colors"
                          >
                            <LinkIcon size={16} /> Vincular a Cliente
                          </button>
                        )}
                      </>
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

      {isLinkModalOpen && selectedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-[2rem] w-full max-w-md p-6 shadow-2xl relative border border-slate-100 flex flex-col max-h-[90vh]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black text-slate-900 italic tracking-tighter uppercase flex items-center gap-2">
                <LinkIcon className="text-blue-500" size={24} /> Vincular Mensagem
              </h3>
              <button onClick={() => setIsLinkModalOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
            </div>

            <div className="mb-6 space-y-2">
              <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">O que deseja fazer?</p>
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => setLinkAction('activity')}
                  className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${linkAction === 'activity' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:border-blue-300'}`}
                >
                  <Calendar size={18} className={linkAction === 'activity' ? 'text-blue-500' : 'text-slate-400'} />
                  <div>
                    <p className="font-bold text-sm">Criar Atividade</p>
                    <p className="text-[10px] opacity-70">Salva a mensagem como uma atividade no histórico do cliente.</p>
                  </div>
                </button>
                <button 
                  onClick={() => setLinkAction('deal')}
                  className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${linkAction === 'deal' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-emerald-300'}`}
                >
                  <Trello size={18} className={linkAction === 'deal' ? 'text-emerald-500' : 'text-slate-400'} />
                  <div>
                    <p className="font-bold text-sm">Criar Oportunidade</p>
                    <p className="text-[10px] opacity-70">Abre o funil de vendas para criar um novo negócio.</p>
                  </div>
                </button>
                <button 
                  onClick={() => setLinkAction('just_link')}
                  className={`p-3 rounded-xl border text-left flex items-center gap-3 transition-all ${linkAction === 'just_link' ? 'border-slate-800 bg-slate-100 text-slate-800' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <LinkIcon size={18} className={linkAction === 'just_link' ? 'text-slate-800' : 'text-slate-400'} />
                  <div>
                    <p className="font-bold text-sm">Apenas Vincular</p>
                    <p className="text-[10px] opacity-70">Apenas associa a mensagem ao cliente sem criar registros extras.</p>
                  </div>
                </button>
              </div>
            </div>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input
                type="text"
                placeholder="Buscar cliente por nome ou fazenda..."
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all"
              />
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2">
              {filteredClients.length === 0 ? (
                <p className="text-center text-sm text-slate-500 py-4">Nenhum cliente encontrado.</p>
              ) : (
                filteredClients.map(client => (
                  <button
                    key={client.id}
                    onClick={() => handleLinkToClient(client.id)}
                    className="w-full text-left p-3 rounded-xl border border-slate-100 hover:border-blue-300 hover:bg-blue-50 transition-all flex justify-between items-center group"
                  >
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{client.name}</p>
                      <p className="text-xs text-slate-500">{client.farmName || 'Sem fazenda'}</p>
                    </div>
                    <LinkIcon size={16} className="text-slate-300 group-hover:text-blue-500" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
