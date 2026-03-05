
import React, { useState, useMemo, useEffect } from 'react';
import { Client, Deal, Activity, Visit, User } from '../types';
import { Button } from '../components/Button';
import { LocationPicker } from '../components/LocationPicker';
import { 
  Search, MapPin, Phone, Plus, ChevronRight, Beef, Factory,
  MoreHorizontal, DollarSign, Pencil, Calendar,
  User as UserIcon, Building2, Filter, Mail, CheckCircle2, Clock, ChevronDown, Settings2,
  RotateCw, X, Tag, Star, DownloadCloud, Loader2, GitMerge, ArrowRightLeft, Users, Trash2, AlertTriangle
} from 'lucide-react';
import { collection, getDocs, writeBatch, doc, deleteDoc, updateDoc, query, orderBy } from 'firebase/firestore';
import { db, dbEstoque } from '../services/firebase';
import { COLLECTIONS } from '../services/dbSchema';

interface ClientsProps {
  clients: Client[];
  visits: Visit[];
  deals: Deal[];
  activities: Activity[];
  onAddClient: (client: Client) => void;
  onUpdateClient: (client: Client) => void;
  onSelectClient: (clientId: string) => void;
  onNavigate: (page: string, extra?: any) => void;
  user: User;
}

const Clients: React.FC<ClientsProps> = ({ 
  clients, visits, deals, activities, onAddClient, onUpdateClient, onSelectClient, onNavigate, user 
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Admin specific states
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [selectedTechnicianFilter, setSelectedTechnicianFilter] = useState('');
  const [clientToTransfer, setClientToTransfer] = useState<Client | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  
  // Delete State
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Deduplication State
  const [isDedupeModalOpen, setIsDedupeModalOpen] = useState(false);
  const [potentialDuplicates, setPotentialDuplicates] = useState<Client[][]>([]);
  const [selectedGroupIndex, setSelectedGroupIndex] = useState<number>(0);
  const [selectedMasterId, setSelectedMasterId] = useState<string>('');
  const [isMerging, setIsMerging] = useState(false);

  // Verifica se é o Super Usuário ou Admin (Case insensitive para segurança)
  const isAdmin = user && ((user.email || '').toLowerCase() === 'l.rigolin@zorionan.com' || user.role === 'Admin');

  const defaultClientState: Client = {
    id: '',
    type: 'Fazenda',
    name: '',
    phone: '',
    farmName: '',
    herdSize: 0,
    treatedHerdSize: 0,
    location: { lat: 0, lng: 0, address: '' },
    lots: [],
    tags: [],
    status: 'Ativo',
    createdAt: '',
    updatedAt: ''
  };

  const [clientForm, setClientForm] = useState<Client>(defaultClientState);
  const [tagInput, setTagInput] = useState('');

  // Fetch Users for Admin (SOMENTE BANCO ATUAL)
  useEffect(() => {
    if (isAdmin) {
        const fetchUsers = async () => {
            try {
                // Busca na coleção 'users' do banco de dados atual (db)
                const usersCollection = collection(db, COLLECTIONS.USERS);
                const snap = await getDocs(usersCollection);
                
                let usersList = snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
                
                // Ordenação Alfabética
                usersList.sort((a, b) => {
                    const nameA = (a.name || a.email || '').toLowerCase();
                    const nameB = (b.name || b.email || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                });

                setAllUsers(usersList);
            } catch (error) {
                console.error("Erro ao buscar usuários do sistema:", error);
            }
        };
        fetchUsers();
    }
  }, [isAdmin]);

  // Helper seguro para strings
  const safeString = (val: any) => {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  };

  // --- LÓGICA DE SINCRONIZAÇÃO APRIMORADA ---
  const handleSyncEstoque = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      console.log("Iniciando sincronização inteligente com Estoque Zorion...");
      
      const localClientsSnap = await getDocs(collection(db, COLLECTIONS.CLIENTS));
      const localClients = localClientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client));

      let querySnapshot = await getDocs(collection(dbEstoque, "clients"));
      let collectionSource = "clients";

      if (querySnapshot.empty) {
        querySnapshot = await getDocs(collection(dbEstoque, "clientes"));
        collectionSource = "clientes";
      }
      
      if (querySnapshot.empty) {
        querySnapshot = await getDocs(collection(dbEstoque, "users"));
        collectionSource = "users";
      }

      if (querySnapshot.empty) {
        alert("Não encontramos nenhum registro nas coleções do banco de dados do Estoque.");
        setIsSyncing(false);
        return;
      }

      const batch = writeBatch(db);
      let count = 0;
      let duplicatesFound = 0;

      querySnapshot.forEach((docSnap) => {
         const remoteData = docSnap.data();
         
         const mappedName = safeString(remoteData.name || remoteData.nome || remoteData.responsavel || remoteData.fullName || 'Sem Nome');
         const mappedFarmName = safeString(remoteData.farmName || remoteData.nomeFazenda || remoteData.empresa || remoteData.razaoSocial || remoteData.property || 'Fazenda Importada');
         const mappedPhone = safeString(remoteData.phone || remoteData.telefone || remoteData.celular || remoteData.whatsapp);
         const mappedEmail = safeString(remoteData.email);
         const mappedType = (remoteData.type === 'Fábrica' || remoteData.tipo === 'Fábrica' || remoteData.role === 'industry') ? 'Fábrica' : 'Fazenda';
         
         let mappedLocation = { lat: 0, lng: 0, address: '' };
         if (remoteData.location) mappedLocation = remoteData.location;
         else if (remoteData.endereco) mappedLocation.address = safeString(remoteData.endereco);
         else if (remoteData.address) mappedLocation.address = safeString(remoteData.address);

         let existingClient = localClients.find(c => c.id === docSnap.id);
         
         if (!existingClient) {
            existingClient = localClients.find(c => 
                (safeString(c.farmName).toLowerCase() === mappedFarmName.toLowerCase()) ||
                (safeString(c.name).toLowerCase() === mappedName.toLowerCase())
            );
         }

         const remoteId = safeString(docSnap.id);
         const targetId = existingClient ? existingClient.id : `imported_${remoteId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
         
         if (existingClient) duplicatesFound++;

         const clientRef = doc(db, COLLECTIONS.CLIENTS, targetId);
         
         const clientPayload = {
           id: targetId,
           name: mappedName,
           farmName: mappedFarmName,
           phone: mappedPhone,
           email: mappedEmail,
           type: mappedType,
           location: mappedLocation,
           lots: Array.isArray(remoteData.lots) ? remoteData.lots : [],
           herdSize: Number(remoteData.herdSize || 0),
           treatedHerdSize: Number(remoteData.treatedHerdSize || 0),
           updatedAt: new Date().toISOString(),
           originSystem: 'estoque_zorion',
           originCollection: collectionSource,
           assignedTechnicianId: existingClient?.assignedTechnicianId || user.id,
           assignedTechnicianIds: existingClient?.assignedTechnicianIds || [existingClient?.assignedTechnicianId || user.id]
         };

         batch.set(clientRef, clientPayload, { merge: true });
         count++;
      });

      await batch.commit();
      alert(`Sincronização realizada com sucesso!\n\nRegistros processados: ${count}\nAtualizados: ${duplicatesFound}\nNovos salvos localmente: ${count - duplicatesFound}\n\nAgora você pode editar livremente.`);

    } catch (error: any) {
      console.error("Erro ao sincronizar:", error);
      alert(`Falha na conexão: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- DELETE LOGIC ---
  const handleConfirmDelete = async () => {
    if (!clientToDelete) return;
    setIsDeleting(true);
    try {
        await deleteDoc(doc(db, COLLECTIONS.CLIENTS, clientToDelete.id));
        setClientToDelete(null);
    } catch (error) {
        console.error("Erro ao excluir cliente:", error);
        alert("Erro ao excluir o cliente. Verifique sua conexão.");
    } finally {
        setIsDeleting(false);
    }
  };

  // --- DEDUPLICATION LOGIC ---
  const findDuplicates = () => {
    const duplicates: Client[][] = [];
    const processed = new Set<string>();

    const isSimilar = (str1: string, str2: string) => {
        const s1 = safeString(str1).toLowerCase().replace(/\s+/g, '');
        const s2 = safeString(str2).toLowerCase().replace(/\s+/g, '');
        return s1.includes(s2) || s2.includes(s1) || (s1.length > 4 && s2.length > 4 && s1.slice(0, 4) === s2.slice(0, 4));
    };

    clients.forEach((c1) => {
        if (processed.has(c1.id)) return;
        
        const group = clients.filter(c2 => {
            if (c1.id === c2.id) return true;
            if (processed.has(c2.id)) return false;
            
            const nameMatch = isSimilar(c1.name, c2.name);
            const farmMatch = isSimilar(c1.farmName, c2.farmName);
            
            return nameMatch && farmMatch;
        });

        if (group.length > 1) {
            duplicates.push(group);
            group.forEach(g => processed.add(g.id));
        }
    });

    if (duplicates.length === 0) {
        alert("Nenhuma duplicidade óbvia encontrada.");
        return;
    }

    setPotentialDuplicates(duplicates);
    setSelectedGroupIndex(0);
    setSelectedMasterId(duplicates[0][0].id);
    setIsDedupeModalOpen(true);
  };

  const handleMerge = async () => {
    if (!selectedMasterId) return;
    setIsMerging(true);
    
    const group = potentialDuplicates[selectedGroupIndex];
    const masterClient = group.find(c => c.id === selectedMasterId);
    const duplicates = group.filter(c => c.id !== selectedMasterId);

    if (!masterClient) return;

    try {
        const batch = writeBatch(db);

        const dealsToUpdate = deals.filter(d => duplicates.some(dup => dup.id === d.clientId));
        dealsToUpdate.forEach(deal => {
            const ref = doc(db, COLLECTIONS.DEALS, deal.id);
            batch.update(ref, { 
                clientId: masterClient.id, 
                clientName: masterClient.name,
                farmName: masterClient.farmName 
            });
        });

        const visitsToUpdate = visits.filter(v => duplicates.some(dup => dup.id === v.clientId));
        visitsToUpdate.forEach(visit => {
            const ref = doc(db, COLLECTIONS.VISITS, visit.id);
            batch.update(ref, { clientId: masterClient.id });
        });

        const activitiesToUpdate = activities.filter(a => duplicates.some(dup => dup.id === a.clientId));
        activitiesToUpdate.forEach(act => {
            const ref = doc(db, COLLECTIONS.ACTIVITIES, act.id);
            batch.update(ref, { clientId: masterClient.id });
        });

        duplicates.forEach(dup => {
            const ref = doc(db, COLLECTIONS.CLIENTS, dup.id);
            batch.delete(ref);
        });

        await batch.commit();
        
        alert("Mesclagem concluída com sucesso!");
        
        const nextDuplicates = [...potentialDuplicates];
        nextDuplicates.splice(selectedGroupIndex, 1);
        
        if (nextDuplicates.length > 0) {
            setPotentialDuplicates(nextDuplicates);
            setSelectedGroupIndex(0); 
            setSelectedMasterId(nextDuplicates[0][0].id);
        } else {
            setIsDedupeModalOpen(false);
        }

    } catch (error) {
        console.error("Merge error:", error);
        alert("Erro ao mesclar clientes.");
    } finally {
        setIsMerging(false);
    }
  };

  // --- MULTI-ASSIGNMENT LOGIC (ADMIN) ---
  
  const handleOpenTransferModal = (e: React.MouseEvent, client: Client) => {
    e.stopPropagation();
    setClientToTransfer(client);
    const currentIds = client.assignedTechnicianIds || (client.assignedTechnicianId ? [client.assignedTechnicianId] : []);
    setSelectedUserIds(currentIds);
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => {
        if (prev.includes(userId)) {
            return prev.filter(id => id !== userId);
        } else {
            return [...prev, userId];
        }
    });
  };

  const handleSaveTransfer = async () => {
    if (!clientToTransfer) return;
    
    try {
        const primaryId = selectedUserIds.length > 0 ? selectedUserIds[0] : null;
        
        await updateDoc(doc(db, COLLECTIONS.CLIENTS, clientToTransfer.id), {
            assignedTechnicianIds: selectedUserIds,
            assignedTechnicianId: primaryId, 
            updatedAt: new Date().toISOString()
        });
        setClientToTransfer(null);
    } catch (error) {
        console.error("Erro ao transferir cliente:", error);
        alert("Erro ao salvar permissões.");
    }
  };

  const getTechnicianDisplay = (client: Client) => {
    const ids = client.assignedTechnicianIds || (client.assignedTechnicianId ? [client.assignedTechnicianId] : []);
    if (ids.length === 0) return 'Sem Gestor';
    
    if (ids.length === 1) {
        const tech = allUsers.find(u => u.id === ids[0]);
        // Se não encontrar o técnico pelo ID, mostra o ID ou "Desconhecido"
        return tech ? tech.name : 'Desconhecido';
    }

    return `${ids.length} Técnicos`;
  };

  const handleNewClient = () => {
    setClientForm({
        ...defaultClientState,
        id: `cli_${Date.now()}`,
        assignedTechnicianId: user.id,
        assignedTechnicianIds: [user.id],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
    setIsEditing(false);
    setIsModalOpen(true);
  };

  const handleEditClient = (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    setClientForm({ 
        ...client, 
        name: safeString(client.name),
        farmName: safeString(client.farmName),
        phone: safeString(client.phone),
        tags: client.tags || [] 
    });
    setIsEditing(true);
    setIsModalOpen(true);
  };

  const handleAddTag = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && tagInput.trim()) {
        e.preventDefault();
        if (!clientForm.tags?.includes(tagInput.trim())) {
            setClientForm(prev => ({ ...prev, tags: [...(prev.tags || []), tagInput.trim()] }));
        }
        setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setClientForm(prev => ({ ...prev, tags: prev.tags?.filter(t => t !== tagToRemove) }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientForm.farmName) {
        alert("O nome da unidade/fazenda é obrigatório.");
        return;
    }

    const finalClientData = {
        ...clientForm,
        name: safeString(clientForm.name),
        farmName: safeString(clientForm.farmName),
        updatedAt: new Date().toISOString()
    };

    if (isEditing) {
        onUpdateClient(finalClientData);
    } else {
        onAddClient(finalClientData);
    }
    
    setIsModalOpen(false);
  };

  const filteredClients = clients.filter(c => {
    const cName = safeString(c.name).toLowerCase();
    const cFarm = safeString(c.farmName).toLowerCase();
    const search = safeString(searchTerm).toLowerCase();
    const matchesSearch = cName.includes(search) || cFarm.includes(search);
    
    const matchesTech = !selectedTechnicianFilter || 
        c.assignedTechnicianId === selectedTechnicianFilter || 
        (c.assignedTechnicianIds && c.assignedTechnicianIds.includes(selectedTechnicianFilter));

    return matchesSearch && matchesTech;
  });

  const getClientMetrics = (clientId: string) => {
    const clientDeals = deals.filter(d => d.clientId === clientId);
    const openDeals = clientDeals.filter(d => d.status === 'Open').length;
    const clientActivities = activities.filter(a => a.clientId === clientId && !a.isDone);
    const nextActivity = clientActivities.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
    return { openDeals, nextActivity };
  };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] md:h-screen bg-white font-sans overflow-hidden">
      <div className="flex-none border-b border-slate-200 px-6 py-4 flex items-center justify-between bg-white z-20">
        <div className="flex items-center gap-4">
          
          <div className="flex bg-[#004d2c] rounded-lg overflow-hidden shadow-sm">
            <button onClick={handleNewClient} className="px-4 py-2.5 text-white font-bold text-xs flex items-center gap-2 hover:bg-[#003d22] transition-colors border-r border-white/10">
              <Plus size={16} strokeWidth={3} /> Novo Cliente
            </button>
            <button className="px-2 py-2.5 text-white hover:bg-[#003d22] transition-colors">
              <ChevronDown size={16} />
            </button>
          </div>

          {isAdmin && (
            <>
                <div className="h-8 w-px bg-slate-200 mx-2"></div>
                
                {/* Admin Filter Dropdown */}
                <div className="relative">
                    <select 
                        value={selectedTechnicianFilter} 
                        onChange={e => setSelectedTechnicianFilter(e.target.value)} 
                        className="pl-3 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 outline-none hover:bg-slate-100 transition-colors cursor-pointer appearance-none"
                    >
                        <option value="">Filtrar por Técnico (Todos)</option>
                        {allUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name || u.email || 'Usuário sem nome'}</option>
                        ))}
                    </select>
                    <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>

                <button 
                onClick={handleSyncEstoque}
                disabled={isSyncing}
                className="px-4 py-2.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-bold text-xs flex items-center gap-2 transition-all border border-blue-100 shadow-sm disabled:opacity-50 ml-2"
                title="Importar e Duplicar clientes do Sistema de Estoque"
                >
                {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
                {isSyncing ? 'Importando...' : 'Importar Estoque'}
                </button>

                <button 
                onClick={findDuplicates}
                className="px-4 py-2.5 bg-purple-50 text-purple-700 hover:bg-purple-100 rounded-lg font-bold text-xs flex items-center gap-2 transition-all border border-purple-100 shadow-sm"
                title="Encontrar clientes duplicados"
                >
                <GitMerge size={16} /> IA Deduplication
                </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-6">
           <div className="flex items-center gap-2 text-slate-400 text-[11px] font-bold uppercase">
              <RotateCw size={14} className={isSyncing ? "animate-spin text-blue-500" : "animate-spin-slow"} />
              <span>{filteredClients.length} Unidades</span>
           </div>
        </div>
      </div>

      <div className="flex-none bg-slate-50/50 border-b border-slate-200 px-6 py-3 flex items-center gap-4">
          <div className="relative flex-1 max-w-xl">
             <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300" size={16} />
             <input type="text" placeholder="Pesquisar por nome ou unidade..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium outline-none focus:border-zorion-500 transition-all shadow-sm" />
          </div>
      </div>

      <div className="flex-1 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse min-w-[1200px]">
          <thead className="sticky top-0 bg-white z-10 shadow-sm">
            <tr className="border-b border-slate-200">
              <th className="px-4 py-3 w-10"></th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100">Tipo</th>
              {/* ADMIN: Nome do Usuário que criou/pertence o cliente */}
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100">
                  {isAdmin ? "Técnico(s) Responsável(is)" : "Unidade / Fazenda"}
              </th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100">
                  {isAdmin ? "Unidade / Contato" : "Responsável"}
              </th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest border-r border-slate-100 text-center">Negócios</th>
              <th className="px-4 py-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Próxima Atividade</th>
              <th className="px-4 py-3 w-28 text-center">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredClients.map(client => {
              const { openDeals, nextActivity } = getClientMetrics(client.id);
              const isSynced = (client as any).originSystem === 'estoque_zorion';

              return (
                <tr key={client.id} onClick={() => onNavigate('client-details', { clientId: client.id, initialTab: 'deals' })} className="group hover:bg-blue-50/40 cursor-pointer transition-colors">
                  <td className="px-4 py-3 text-center">
                    {client.type === 'Fábrica' ? <Factory size={16} className="text-blue-600" /> : <Beef size={16} className="text-emerald-600" />}
                  </td>
                  <td className="px-4 py-3 border-r border-slate-50">
                    <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${client.type === 'Fábrica' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>{client.type || 'Fazenda'}</span>
                  </td>
                  
                  {/* ADMIN: Exibe Técnico(s) clicável no lugar da Unidade */}
                  {isAdmin ? (
                      <td className="px-4 py-3 border-r border-slate-50">
                          <button 
                            onClick={(e) => handleOpenTransferModal(e, client)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-100 text-sm font-bold text-blue-600 transition-colors border border-transparent hover:border-slate-200"
                            title="Gerenciar Gestores do Cliente"
                          >
                             <ArrowRightLeft size={14} />
                             {getTechnicianDisplay(client)}
                          </button>
                      </td>
                  ) : (
                      <td className="px-4 py-3 border-r border-slate-50 text-sm font-bold text-slate-600 flex items-center gap-2">
                          {client.farmName}
                          {isSynced && <span title="Importado" className="flex h-1.5 w-1.5 bg-blue-500 rounded-full"></span>}
                      </td>
                  )}

                  {/* ADMIN: Exibe Unidade e Responsável juntos para não perder info */}
                  {isAdmin ? (
                      <td className="px-4 py-3 border-r border-slate-50">
                          <p className="text-sm font-bold text-slate-700">{client.farmName}</p>
                          <p className="text-[10px] text-slate-400 font-medium">{client.name}</p>
                      </td>
                  ) : (
                      <td className="px-4 py-3 border-r border-slate-50 text-sm font-bold text-slate-700">{client.name}</td>
                  )}

                  <td className="px-4 py-3 border-r border-slate-50 text-center font-bold text-slate-700 text-xs">{openDeals}</td>
                  <td className="px-4 py-3 text-center text-xs font-bold text-slate-500">{nextActivity ? new Date(nextActivity.dueDate).toLocaleDateString() : '-'}</td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-1">
                        <button 
                            onClick={(e) => handleEditClient(client, e)}
                            className="p-2 text-slate-400 hover:text-zorion-600 hover:bg-slate-100 rounded-lg transition-all"
                            title="Editar"
                        >
                            <Pencil size={16} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); setClientToDelete(client); }}
                            className="p-2 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                            title="Excluir Cliente"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl relative border border-slate-100 animate-fade-in max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter">
                   {isEditing ? 'Editar Unidade' : 'Novo Cadastro'}
               </h3>
               <button onClick={() => setIsModalOpen(false)} className="p-3 bg-slate-100 text-slate-400 hover:text-red-500 hover:bg-slate-200 rounded-full transition-all"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo de Unidade</label>
                    <div className="flex gap-2">
                        <button type="button" onClick={() => setClientForm({...clientForm, type: 'Fazenda'})} className={`flex-1 py-3 rounded-2xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all ${clientForm.type === 'Fazenda' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}>
                            <Beef size={16} /> FAZENDA
                        </button>
                        <button type="button" onClick={() => setClientForm({...clientForm, type: 'Fábrica'})} className={`flex-1 py-3 rounded-2xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all ${clientForm.type === 'Fábrica' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}>
                            <Factory size={16} /> FÁBRICA
                        </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone</label>
                    <input className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" placeholder="(00) 0000-0000" value={clientForm.phone} onChange={e => setClientForm({...clientForm, phone: e.target.value})} />
                  </div>
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Responsável</label>
                <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" value={clientForm.name} onChange={e => setClientForm({...clientForm, name: e.target.value})} placeholder="Ex: Fernando Barra" />
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Unidade</label>
                <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" value={clientForm.farmName} onChange={e => setClientForm({...clientForm, farmName: e.target.value})} placeholder="Ex: BioRação Industrial" />
              </div>
              
              <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{clientForm.type === 'Fábrica' ? 'Capacidade (Ton)' : 'Rebanho'}</label>
                  <input type="number" className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" value={clientForm.herdSize} onChange={e => setClientForm({...clientForm, herdSize: Number(e.target.value)})} />
              </div>

              <div className="space-y-1 pt-2">
                 <LocationPicker 
                   value={clientForm.location} 
                   onChange={(loc) => setClientForm({...clientForm, location: loc})} 
                   label="Localização da Unidade"
                 />
              </div>

              <div className="space-y-2 pt-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tags de Segmentação</label>
                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100 flex-wrap">
                    {clientForm.tags?.map((tag, idx) => (
                        <span key={idx} className="px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-bold text-slate-600 flex items-center gap-1">
                            {tag} <button type="button" onClick={() => removeTag(tag)} className="hover:text-red-500"><X size={12} /></button>
                        </span>
                    ))}
                    <input 
                        className="flex-1 min-w-[100px] bg-transparent outline-none text-xs font-medium" 
                        placeholder="Digite e enter..." 
                        value={tagInput}
                        onChange={e => setTagInput(e.target.value)}
                        onKeyDown={handleAddTag}
                    />
                </div>
              </div>

              <div className="flex gap-3 pt-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-xs font-black uppercase text-slate-500 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-200">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-[#004d2c] text-white rounded-2xl text-xs font-black uppercase shadow-xl hover:bg-[#003d22] transition-all">{isEditing ? 'Salvar Alterações' : 'Criar Unidade'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {clientToDelete && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative border border-slate-100 flex flex-col items-center text-center">
                <div className="h-20 w-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6 border border-red-100 animate-pulse">
                    <AlertTriangle size={40} />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2 italic tracking-tighter">Excluir Unidade?</h3>
                <p className="text-sm text-slate-500 mb-2 font-medium">
                    Você está prestes a excluir <strong>{clientToDelete.farmName}</strong> permanentemente.
                </p>
                <p className="text-xs text-slate-400 mb-8 font-bold uppercase bg-slate-50 p-2 rounded-lg w-full">
                    Ação irreversível
                </p>
                <div className="flex gap-3 w-full">
                    <button 
                        onClick={() => setClientToDelete(null)} 
                        disabled={isDeleting}
                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        onClick={handleConfirmDelete} 
                        disabled={isDeleting}
                        className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-red-700 transition-colors shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isDeleting ? <Loader2 size={16} className="animate-spin" /> : 'Excluir'}
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL DE GERENCIAMENTO DE GESTORES (MULTI-SELECT - ADMIN) */}
      {clientToTransfer && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[2500] flex items-center justify-center p-4">
            <div className="bg-white rounded-[2rem] w-full max-w-md p-8 shadow-2xl relative border border-slate-100 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 italic tracking-tighter">Gerenciar Permissões</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{clientToTransfer.farmName}</p>
                    </div>
                    <button onClick={() => setClientToTransfer(null)} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"><X size={20} /></button>
                </div>
                
                <p className="text-sm font-medium text-slate-600 mb-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                    Selecione quais usuários podem visualizar e gerenciar este cliente. O cliente aparecerá na conta de todos os selecionados.
                </p>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 mb-4">
                    {allUsers.length > 0 ? allUsers.map(u => {
                        const isSelected = selectedUserIds.includes(u.id);
                        // FIX: Fallback para mostrar e-mail se o nome estiver vazio (caso de novos cadastros incompletos)
                        const displayName = u.name && u.name.trim() !== '' ? u.name : (u.email || 'Usuário Sem Nome');
                        
                        return (
                            <div
                                key={u.id}
                                onClick={() => toggleUserSelection(u.id)}
                                className={`w-full p-4 rounded-xl border-2 flex items-center justify-between cursor-pointer transition-all ${isSelected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 bg-white hover:border-slate-300'}`}
                            >
                                <div className="flex items-center gap-3 w-full overflow-hidden">
                                    <div className={`h-5 w-5 rounded border flex items-center justify-center shrink-0 ${isSelected ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 bg-white'}`}>
                                        {isSelected && <CheckCircle2 size={14} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <span className={`font-bold text-sm block truncate ${isSelected ? 'text-emerald-900' : 'text-slate-700'}`}>{displayName}</span>
                                        <span className="text-[10px] text-slate-400 font-medium block truncate">
                                            {u.role} {u.email ? `• ${u.email}` : ''}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        );
                    }) : (
                        <div className="py-8 text-center text-slate-400 text-xs font-bold uppercase">Carregando usuários...</div>
                    )}
                </div>

                <div className="flex gap-3 pt-2 border-t border-slate-100">
                    <button onClick={() => setClientToTransfer(null)} className="flex-1 py-3 bg-slate-100 text-slate-600 rounded-xl font-black text-xs uppercase hover:bg-slate-200 transition-all">
                        Cancelar
                    </button>
                    <button onClick={handleSaveTransfer} className="flex-[2] py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase hover:bg-emerald-700 transition-all shadow-lg flex items-center justify-center gap-2">
                        Salvar Acessos ({selectedUserIds.length})
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* MODAL DE DEDUPLICAÇÃO */}
      {isDedupeModalOpen && potentialDuplicates.length > 0 && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-8 shadow-2xl relative border border-slate-100 max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 italic tracking-tighter">Mesclagem Inteligente</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Grupo {selectedGroupIndex + 1} de {potentialDuplicates.length} Encontrados</p>
                    </div>
                    <button onClick={() => setIsDedupeModalOpen(false)} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"><X size={20} /></button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-1">
                    <p className="text-sm font-medium text-slate-600 mb-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                        Selecione qual registro será o <strong>PRINCIPAL (Master)</strong>. Todos os negócios, visitas e atividades dos outros registros serão movidos para ele, e os duplicados serão excluídos.
                    </p>

                    <div className="space-y-3">
                        {potentialDuplicates[selectedGroupIndex].map(dup => (
                            <label 
                                key={dup.id} 
                                className={`flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all ${selectedMasterId === dup.id ? 'border-emerald-500 bg-emerald-50' : 'border-slate-100 hover:border-slate-300'}`}
                            >
                                <input 
                                    type="radio" 
                                    name="masterSelection" 
                                    className="w-5 h-5 accent-emerald-600"
                                    checked={selectedMasterId === dup.id}
                                    onChange={() => setSelectedMasterId(dup.id)}
                                />
                                <div className="flex-1">
                                    <h4 className="font-black text-slate-900">{dup.farmName}</h4>
                                    <p className="text-xs text-slate-500">{dup.name} • ID: ...{dup.id.slice(-6)}</p>
                                    <div className="flex gap-2 mt-1">
                                        <span className="text-[9px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200">Rebanho: {dup.herdSize}</span>
                                        <span className="text-[9px] font-bold bg-white px-2 py-0.5 rounded border border-slate-200">{new Date(dup.updatedAt!).toLocaleDateString()}</span>
                                    </div>
                                </div>
                                {selectedMasterId === dup.id && <span className="text-[10px] font-black uppercase text-emerald-600 bg-white px-2 py-1 rounded">Principal</span>}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="pt-6 mt-4 border-t border-slate-100 flex gap-3 shrink-0">
                    <button 
                        onClick={() => {
                            const nextIndex = selectedGroupIndex + 1;
                            if (nextIndex < potentialDuplicates.length) {
                                setSelectedGroupIndex(nextIndex);
                                setSelectedMasterId(potentialDuplicates[nextIndex][0].id);
                            } else {
                                alert("Fim da lista de duplicidades.");
                                setIsDedupeModalOpen(false);
                            }
                        }}
                        className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase hover:bg-slate-200 transition-all"
                    >
                        Pular este Grupo
                    </button>
                    <button 
                        onClick={handleMerge}
                        disabled={isMerging}
                        className="flex-[2] py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase hover:bg-emerald-700 transition-all shadow-lg flex justify-center items-center gap-2"
                    >
                        {isMerging ? <Loader2 className="animate-spin" size={16} /> : <GitMerge size={16} />}
                        Mesclar e Salvar
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Clients;
