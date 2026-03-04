
import React, { useState, useEffect, useRef } from 'react';
import { 
  LayoutDashboard, 
  Map as MapIcon, 
  Users, 
  Beef, 
  LogOut,
  PlusCircle,
  Grid,
  ExternalLink,
  X,
  Wheat,
  Package,
  History,
  Plus,
  Trello,
  BarChart3,
  ArrowLeft,
  Menu,
  RotateCw,
  CheckCircle2,
  BrainCircuit,
  FileSpreadsheet,
  Coins,
  Stethoscope,
  Dna,
  Database,
  FileDown,
  ShieldCheck,
  Bug,
  MessageSquareWarning,
  Camera,
  Paperclip,
  Send,
  Trash2,
  ImageIcon,
  MessageSquare
} from 'lucide-react';
import { User, Client, Translator, Feedback, Attachment } from '../types';
import { collection, getDocs, writeBatch, doc, getDoc, setDoc } from 'firebase/firestore';
import { db, dbEstoque } from '../services/firebase';
import { COLLECTIONS, prepareForSave } from '../services/dbSchema';
import { generateSystemBackup, generateHumanReport } from '../services/backupService';
import { uploadFeedbackFile } from '../services/storageService';
import { Button } from './Button';

interface LayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
  user: User;
  onLogout: () => void;
  currencyMode?: 'BRL' | 'USD';
  onToggleCurrency?: () => void;
  t?: Translator;
  showPriceTable?: boolean; // Mantido para compatibilidade, mas não usado para ocultar
}

const Layout: React.FC<LayoutProps> = ({ children, activePage, onNavigate, user, onLogout, currencyMode, onToggleCurrency, t = (k) => k, showPriceTable = true }) => {
  const [isAppsModalOpen, setIsAppsModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);

  // States para Feedback
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<'Bug' | 'Melhoria'>('Melhoria');
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackFiles, setFeedbackFiles] = useState<File[]>([]);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const feedbackFileInputRef = useRef<HTMLInputElement>(null);

  // Admin Geral do Sistema
  const isAdmin = user && ((user.email || '').toLowerCase() === 'l.rigolin@zorionan.com' || user.role === 'Admin');
  
  // Permissão específica para visualizar Feedback (l.rigolin e lucas.maia)
  const canManageFeedback = user && (
    (user.email || '').toLowerCase() === 'l.rigolin@zorionan.com' || 
    (user.email || '').toLowerCase().includes('lucas.maia')
  );

  const isFullWidthPage = ['sales', 'production_funnel', 'map', 'price_table'].includes(activePage);

  const mobileNavItems = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard },
    { id: 'production_funnel', label: t('nav.production'), icon: BarChart3 },
    { id: 'new_visit', label: t('nav.new_visit'), icon: Plus, isAction: true },
    { id: 'clients', label: t('nav.clients'), icon: Users },
    { id: 'apps_menu', label: 'Menu', icon: Menu, isApps: true },
  ];

  const desktopNavItemsRaw = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, requiresAdmin: false },
    { id: 'production_funnel', label: t('nav.production'), icon: BarChart3, requiresAdmin: false },
    { id: 'sales', label: t('nav.sales'), icon: Trello, requiresAdmin: false },
    { id: 'clients', label: t('nav.clients'), icon: Users, requiresAdmin: false },
    { id: 'map', label: t('nav.map'), icon: MapIcon, requiresAdmin: false },
    // Agora visível para todos (hidden removido)
    { id: 'price_table', label: t('nav.prices'), icon: FileSpreadsheet, requiresAdmin: false },
    { id: 'apps_menu', label: t('nav.apps'), icon: Grid, isApps: true, requiresAdmin: false },
  ];

  const desktopNavItems = desktopNavItemsRaw.filter(item => (!item.requiresAdmin || isAdmin));

  const handleNavigation = (id: string, isApps?: boolean) => {
    if (isApps) {
      setIsAppsModalOpen(true);
    } else {
      onNavigate(id);
    }
  };

  const handleMobileMenuNavigation = (id: string) => {
    onNavigate(id);
    setIsAppsModalOpen(false);
  };

  const safeString = (val: any): string => {
    if (val === null || val === undefined) return '';
    return String(val).trim();
  };

  const handleBackup = async (type: 'system' | 'human') => {
    if(isBackingUp) return;
    setIsBackingUp(true);
    try {
      if(type === 'system') {
        await generateSystemBackup();
        alert("Backup do Sistema (JSON) gerado. Guarde este arquivo em local seguro.");
      } else {
        await generateHumanReport();
        alert("Relatórios (Excel/CSV) gerados. Verifique sua pasta de Downloads.");
      }
    } catch (e) {
      console.error(e);
      alert("Erro ao gerar backup.");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleSyncEstoque = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const localClientsSnap = await getDocs(collection(db, COLLECTIONS.CLIENTS));
      const localClients = localClientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
      let querySnapshot = await getDocs(collection(dbEstoque, "clients"));
      let collectionSource = "clients";
      if (querySnapshot.empty) { querySnapshot = await getDocs(collection(dbEstoque, "clientes")); collectionSource = "clientes"; }
      if (querySnapshot.empty) { querySnapshot = await getDocs(collection(dbEstoque, "users")); collectionSource = "users"; }
      if (querySnapshot.empty) { alert("Nenhum cliente encontrado no Estoque."); setIsSyncing(false); return; }

      const batch = writeBatch(db);
      let count = 0;
      let duplicatesFound = 0;

      querySnapshot.forEach((docSnap) => {
         const remoteData = docSnap.data();
         const mappedName = safeString(remoteData.name || remoteData.nome || remoteData.responsavel || 'Sem Nome');
         const mappedFarmName = safeString(remoteData.farmName || remoteData.nomeFazenda || remoteData.empresa || 'Fazenda Importada');
         let existingClient = localClients.find(c => c.id === docSnap.id);
         if (!existingClient) { existingClient = localClients.find(c => (safeString(c.farmName).toLowerCase() === mappedFarmName.toLowerCase()) || (safeString(c.name).toLowerCase() === mappedName.toLowerCase())); }
         const remoteId = safeString(docSnap.id);
         const targetId = existingClient ? existingClient.id : `imported_${remoteId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`;
         if (existingClient) duplicatesFound++;
         const clientRef = doc(db, COLLECTIONS.CLIENTS, targetId);
         const clientPayload = {
           id: targetId, name: mappedName, farmName: mappedFarmName, phone: safeString(remoteData.phone || remoteData.telefone), email: safeString(remoteData.email), location: remoteData.location || { lat: 0, lng: 0, address: safeString(remoteData.endereco || remoteData.address) }, lots: Array.isArray(remoteData.lots) ? remoteData.lots : [], herdSize: Number(remoteData.herdSize || 0), treatedHerdSize: Number(remoteData.treatedHerdSize || 0), type: remoteData.type || 'Fazenda', updatedAt: new Date().toISOString(), originSystem: 'estoque_zorion', originCollection: collectionSource, assignedTechnicianId: existingClient?.assignedTechnicianId || user.id
         };
         batch.set(clientRef, clientPayload, { merge: true });
         count++;
      });
      await batch.commit();
      alert(`Sincronização concluída! ${count} registros.`);
      setIsAppsModalOpen(false);
    } catch (error) { console.error(error); alert("Erro ao sincronizar."); } finally { setIsSyncing(false); }
  };

  const handleFeedbackSubmit = async () => {
    if (!feedbackText && feedbackFiles.length === 0) {
        alert("Por favor, descreva o item ou anexe um print.");
        return;
    }
    setIsSubmittingFeedback(true);
    try {
        const feedbackId = `feed_${Date.now()}`;
        const attachments: Attachment[] = [];

        for (const file of feedbackFiles) {
            const url = await uploadFeedbackFile(file);
            attachments.push({
                id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                url,
                name: file.name,
                type: 'image',
                size: file.size
            });
        }

        const newFeedback: Feedback = {
            id: feedbackId,
            type: feedbackType,
            description: feedbackText,
            userId: user.id,
            userName: user.name,
            userEmail: user.email || '',
            attachments,
            status: 'Pendente',
            pageContext: activePage,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, COLLECTIONS.FEEDBACK, feedbackId), prepareForSave(newFeedback, true));
        
        alert("Obrigado! Seu relato foi enviado para a equipe de desenvolvimento.");
        setFeedbackText('');
        setFeedbackFiles([]);
        setIsFeedbackModalOpen(false);
    } catch (error) {
        console.error("Erro feedback:", error);
        alert("Erro ao enviar feedback. Tente novamente.");
    } finally {
        setIsSubmittingFeedback(false);
    }
  };

  const hideMobileNav = activePage === 'new_visit';
  const isDashboard = activePage === 'dashboard';

  if (!user) return null; // Proteção adicional

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans">
      <aside className="hidden md:flex flex-col w-72 bg-slate-950 text-slate-100 h-screen sticky top-0 border-r border-zorion-900/20 z-20">
        <button onClick={() => onNavigate('dashboard')} className="h-40 w-full border-b border-white/5 bg-gradient-to-b from-zorion-950 to-slate-950 flex items-center justify-center p-6 group focus:outline-none transition-all hover:bg-slate-900/50 relative overflow-hidden">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 bg-zorion-500/20 rounded-full blur-3xl opacity-40 group-hover:opacity-80 transition-opacity duration-700"></div>
           <img src="logo.png" alt="Zorion" className="w-full max-w-[200px] max-h-[100px] object-contain relative z-10 drop-shadow-2xl group-hover:scale-105 transition-transform duration-500 brightness-0 invert opacity-90" />
        </button>

        <div className="p-6">
          <button onClick={() => onNavigate('new_visit')} className="w-full bg-zorion-900 hover:bg-zorion-800 text-white font-bold py-4 px-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-zorion-950/40 transition-all transform active:scale-95 border border-zorion-800">
            <PlusCircle size={20} /> {t('nav.new_visit')}
          </button>
        </div>

        <nav className="flex-1 px-4 pb-4 space-y-2 overflow-y-auto custom-scrollbar">
          {desktopNavItems.map((item) => (
            <button key={item.id} onClick={() => handleNavigation(item.id, item.isApps)} className={`w-full flex items-center justify-between px-5 py-3.5 rounded-xl transition-all duration-300 group ${activePage === item.id ? 'bg-zorion-900/20 text-zorion-300 border border-zorion-900/30' : 'text-slate-500 hover:bg-white/5 hover:text-white'}`}>
              <div className="flex items-center gap-4">
                <item.icon className={`h-5 w-5 ${activePage === item.id ? 'text-zorion-400' : 'text-slate-600 group-hover:text-zorion-400'}`} />
                <span className="font-bold text-sm tracking-tight">{item.label}</span>
              </div>
            </button>
          ))}
          
          {/* Botão de Enviar Feedback (Todos) */}
          <button 
            onClick={() => setIsFeedbackModalOpen(true)} 
            className="w-full flex items-center justify-between px-5 py-3.5 rounded-xl transition-all duration-300 group text-amber-500 hover:bg-amber-950/20 hover:text-amber-400 mt-4 border border-transparent hover:border-amber-900/30"
          >
              <div className="flex items-center gap-4">
                <Bug className="h-5 w-5" />
                <span className="font-bold text-sm tracking-tight">Reportar Bug / Melhoria</span>
              </div>
          </button>

          {/* Botão de Gestão de Feedback (Restrito) */}
          {canManageFeedback && (
            <button 
              onClick={() => onNavigate('feedback_list')} 
              className={`w-full flex items-center justify-between px-5 py-3.5 rounded-xl transition-all duration-300 group mt-1 ${activePage === 'feedback_list' ? 'bg-amber-900/20 text-amber-400 border-amber-900/30' : 'text-amber-600 hover:bg-amber-950/20 hover:text-amber-400'}`}
            >
                <div className="flex items-center gap-4">
                  <MessageSquare className="h-5 w-5" />
                  <span className="font-bold text-sm tracking-tight">Gestão de Feedback</span>
                </div>
            </button>
          )}
        </nav>

        <div className="p-6 border-t border-white/5 bg-zorion-950/40">
          <button onClick={() => onNavigate('profile')} className="flex items-center gap-4 mb-5 w-full text-left group hover:bg-white/5 p-2 rounded-xl transition-all -ml-2">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-zorion-700 to-zorion-900 text-zorion-100 flex items-center justify-center font-black border border-white/10 shadow-lg group-hover:scale-105 transition-transform">
              {user.name.charAt(0)}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate text-white tracking-tight group-hover:text-zorion-300 transition-colors">{user.name}</p>
              <p className="text-[10px] text-zorion-500 truncate font-bold uppercase tracking-widest group-hover:text-zorion-400 transition-colors">{user.role}</p>
            </div>
          </button>
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-red-400 py-3 rounded-xl hover:bg-red-950/20 transition-all border border-transparent hover:border-red-900/30">
            <LogOut size={14} /> {t('nav.logout')}
          </button>
        </div>
      </aside>

      <div className="md:hidden bg-white/80 backdrop-blur-md border-b border-slate-100 px-6 sticky top-0 z-30 flex justify-between items-center h-16 transition-all">
         <div className="flex items-center gap-3">
             {!isDashboard && (
               <button onClick={() => onNavigate('dashboard')} className="p-1 -ml-1 text-slate-400 hover:text-zorion-900 transition-colors active:scale-90">
                 <ArrowLeft size={22} strokeWidth={2.5} />
               </button>
             )}
             <button onClick={() => onNavigate('dashboard')} className="flex items-center gap-2 outline-none active:opacity-70 transition-opacity">
                <img src="logo.png" alt="Zorion" className="h-8 w-auto object-contain" />
             </button>
         </div>
         <div className="flex items-center gap-3">
             {/* Seletor Moeda Mobile */}
             {onToggleCurrency && (
                 <button onClick={onToggleCurrency} className="bg-slate-100 p-2 rounded-xl text-slate-600 active:bg-zorion-900 active:text-white transition-colors">
                    <Coins size={18} />
                 </button>
             )}
             <button onClick={() => onNavigate('profile')} className="flex items-center gap-3 text-right group">
                <div>
                   <p className="text-[10px] font-black text-slate-800 tracking-tight leading-none group-hover:text-zorion-600">{user.name.split(' ')[0]}</p>
                   <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter">Online</p>
                </div>
                <div className="h-8 w-8 rounded-lg bg-zorion-900 text-white border border-zorion-800 flex items-center justify-center font-black text-xs group-hover:bg-zorion-800 transition-colors">{user.name.charAt(0)}</div>
             </button>
         </div>
      </div>

      <main className="flex-1 overflow-y-auto bg-slate-50 relative pb-32 md:pb-0">
        <div className={`${isFullWidthPage ? 'p-0 w-full max-w-none' : 'p-4 md:p-12 max-w-7xl mx-auto'} min-h-full transition-all duration-300`}>
            {children}
        </div>
      </main>

      {!hideMobileNav && (
        <div className="md:hidden fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-md z-50">
           <div className="bg-[#0f172a] rounded-[2rem] shadow-2xl p-2 flex justify-between items-center relative border border-slate-800">
              {mobileNavItems.map((item) => {
                 const isActive = activePage === item.id || (item.isApps && isAppsModalOpen);
                 const Icon = item.icon;
                 if (item.isAction) {
                    return (
                        <div key={item.id} className="relative -mt-10 mx-2">
                            <button onClick={() => onNavigate(item.id)} className="h-16 w-16 rounded-full bg-zorion-500 text-white shadow-xl shadow-zorion-900/40 flex items-center justify-center border-4 border-slate-50 active:scale-95 transition-all"><Plus size={28} /></button>
                        </div>
                    );
                 }
                 return (
                    <button key={item.id} onClick={() => item.isApps ? setIsAppsModalOpen(true) : onNavigate(item.id)} className={`flex-1 flex flex-col items-center justify-center py-3 rounded-2xl transition-all ${isActive ? 'text-zorion-400 bg-white/5' : 'text-slate-500 hover:text-slate-300'}`}>
                        <Icon size={20} strokeWidth={isActive ? 2.5 : 2} className="mb-1" />
                        <span className="text-[9px] font-bold uppercase tracking-wide">{item.label}</span>
                    </button>
                 )
              })}
           </div>
        </div>
      )}

      {isAppsModalOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-md animate-fade-in flex items-end md:items-center justify-center p-4">
           <div className="bg-white w-full max-w-lg rounded-[3rem] p-8 shadow-2xl border border-white/20 animate-slide-up md:animate-fade-in relative max-h-[85vh] overflow-y-auto custom-scrollbar">
              <div className="flex justify-between items-center mb-8">
                 <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter">Menu Zorion</h3>
                 <button onClick={() => setIsAppsModalOpen(false)} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:bg-slate-200 transition-colors"><X size={24} /></button>
              </div>
              <div className="grid grid-cols-2 gap-4 mb-8">
                 
                 {/* Vendas - Visível apenas Mobile (md:hidden) */}
                 <button onClick={() => handleMobileMenuNavigation('sales')} className="md:hidden p-6 bg-slate-50 border border-slate-100 rounded-[2.5rem] flex flex-col items-center text-center gap-3 active:scale-95 transition-all">
                    <div className="h-14 w-14 bg-white text-blue-600 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100"><Trello size={28} /></div>
                    <div><h4 className="font-black text-slate-900 text-sm">{t('nav.sales')}</h4><p className="text-[10px] font-bold text-slate-400 uppercase">Vendas</p></div>
                 </button>
                 
                 {/* Tabelas de Preço - Visível apenas Mobile (md:hidden) */}
                 <button onClick={() => handleMobileMenuNavigation('price_table')} className="md:hidden p-6 bg-amber-50 border border-amber-100 rounded-[2.5rem] flex flex-col items-center text-center gap-3 active:scale-95 transition-all">
                    <div className="h-14 w-14 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center shadow-sm border border-amber-200"><FileSpreadsheet size={28} /></div>
                    <div><h4 className="font-black text-slate-900 text-sm">{t('nav.prices')}</h4><p className="text-[10px] font-bold text-slate-400 uppercase">Tabelas</p></div>
                 </button>

                 {/* LINK EXTERNO: ESTOQUE (Visível Desktop e Mobile) */}
                 <a href="https://controle-de-estoque-zorion.web.app/" target="_blank" rel="noopener noreferrer" className="p-6 bg-blue-50 border border-blue-100 rounded-[2.5rem] flex flex-col items-center text-center gap-3 active:scale-95 transition-all">
                    <div className="h-14 w-14 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shadow-sm border border-blue-200"><Package size={28} /></div>
                    <div><h4 className="font-black text-slate-900 text-sm">Estoque</h4><p className="text-[10px] font-bold text-slate-400 uppercase">Logística</p></div>
                 </a>

                 {/* LINK EXTERNO: DR. ZETA (Visível Desktop e Mobile) */}
                 <a href="https://doctor-zeta.web.app/" target="_blank" rel="noopener noreferrer" className="p-6 bg-purple-50 border border-purple-100 rounded-[2.5rem] flex flex-col items-center text-center gap-3 active:scale-95 transition-all">
                    <div className="h-14 w-14 bg-purple-100 text-purple-600 rounded-2xl flex items-center justify-center shadow-sm border border-purple-200"><Dna size={28} /></div>
                    <div><h4 className="font-black text-slate-900 text-sm">Dr. Zeta</h4><p className="text-[10px] font-bold text-slate-400 uppercase">Veterinária</p></div>
                 </a>

                 {/* DIAGNÓSTICO WHATSAPP (Visível Apenas para lucas.maia) */}
                 {(user.email || '').toLowerCase().includes('lucas.maia') && (
                   <button onClick={() => handleMobileMenuNavigation('integration_test')} className="p-6 bg-green-50 border border-green-100 rounded-[2.5rem] flex flex-col items-center text-center gap-3 active:scale-95 transition-all">
                      <div className="h-14 w-14 bg-green-100 text-green-600 rounded-2xl flex items-center justify-center shadow-sm border border-green-200"><MessageSquare size={28} /></div>
                      <div><h4 className="font-black text-slate-900 text-sm">WhatsApp</h4><p className="text-[10px] font-bold text-slate-400 uppercase">Diagnóstico</p></div>
                   </button>
                 )}


              </div>
              
              {/* Opção Mobile para Reportar Bug */}
              <div className="mb-4 p-4 bg-amber-50 border border-amber-100 rounded-[2rem]">
                 <button onClick={() => { setIsAppsModalOpen(false); setIsFeedbackModalOpen(true); }} className="w-full p-4 bg-white border border-amber-100 rounded-2xl flex items-center justify-between shadow-sm active:scale-95 transition-all">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center"><Bug size={18} /></div>
                        <div className="text-left"><p className="font-black text-xs text-slate-700">Relatar Problema</p><p className="text-[9px] font-bold text-slate-400 uppercase">Bugs ou Melhorias</p></div>
                    </div>
                 </button>
              </div>

              {/* Opção Mobile para GESTÃO DE FEEDBACK (Restrito) */}
              {canManageFeedback && (
                <div className="mb-4 p-4 bg-slate-50 border border-slate-100 rounded-[2rem]">
                    <button onClick={() => handleMobileMenuNavigation('feedback_list')} className="w-full p-4 bg-white border border-slate-200 rounded-2xl flex items-center justify-between shadow-sm active:scale-95 transition-all">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 bg-slate-200 text-slate-600 rounded-xl flex items-center justify-center"><MessageSquare size={18} /></div>
                            <div className="text-left"><p className="font-black text-xs text-slate-700">Gestão de Feedback</p><p className="text-[9px] font-bold text-slate-400 uppercase">Apenas Admin</p></div>
                        </div>
                    </button>
                </div>
              )}
              
              {isAdmin && (
                <div className="mb-8 p-4 bg-slate-50 border border-slate-100 rounded-[2rem]">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
                        <ShieldCheck size={12} /> Administração e Dados
                    </h4>
                    
                    <div className="space-y-3">
                        <button onClick={handleSyncEstoque} disabled={isSyncing} className="w-full p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between shadow-sm active:scale-95 transition-all">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 bg-slate-100 text-slate-600 rounded-xl flex items-center justify-center"><RotateCw size={18} className={isSyncing ? "animate-spin" : ""} /></div>
                                <div className="text-left"><p className="font-black text-xs text-slate-700">Sincronizar Estoque</p><p className="text-[9px] font-bold text-slate-400 uppercase">Importar Clientes</p></div>
                            </div>
                        </button>

                        {/* BOTÕES DE BACKUP ADICIONADOS AQUI */}
                        <div className="grid grid-cols-2 gap-3">
                            <button onClick={() => handleBackup('system')} disabled={isBackingUp} className="p-4 bg-white border border-slate-100 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-all text-center">
                                <div className="h-8 w-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center"><Database size={16} /></div>
                                <span className="text-[9px] font-black text-slate-600 uppercase leading-tight">Backup JSON<br/>(Sistema)</span>
                            </button>
                            <button onClick={() => handleBackup('human')} disabled={isBackingUp} className="p-4 bg-white border border-slate-100 rounded-2xl flex flex-col items-center justify-center gap-2 shadow-sm active:scale-95 transition-all text-center">
                                <div className="h-8 w-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center"><FileDown size={16} /></div>
                                <span className="text-[9px] font-black text-slate-600 uppercase leading-tight">Relatório CSV<br/>(Excel)</span>
                            </button>
                        </div>
                    </div>
                </div>
              )}
              <button onClick={onLogout} className="w-full py-4 text-xs font-black uppercase text-red-500 bg-red-50 rounded-[1.5rem] hover:bg-red-100 transition-colors">{t('nav.logout')}</button>
           </div>
        </div>
      )}

      {/* MODAL DE FEEDBACK / BUGS */}
      {isFeedbackModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl relative border border-slate-100 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 italic tracking-tighter uppercase flex items-center gap-2">
                            <Bug className="text-amber-500" size={24} /> Relatar Problema
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ajude-nos a melhorar o sistema</p>
                    </div>
                    <button onClick={() => { setIsFeedbackModalOpen(false); setFeedbackFiles([]); setFeedbackText(''); }} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
                </div>

                <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-4">
                    <button onClick={() => setFeedbackType('Melhoria')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${feedbackType === 'Melhoria' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400'}`}>Melhoria</button>
                    <button onClick={() => setFeedbackType('Bug')} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-lg transition-all ${feedbackType === 'Bug' ? 'bg-white text-red-500 shadow-sm' : 'text-slate-400'}`}>Erro / Bug</button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <textarea 
                        value={feedbackText} 
                        onChange={e => setFeedbackText(e.target.value)} 
                        className="w-full h-32 p-4 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-medium outline-none focus:border-zorion-500 transition-all shadow-inner resize-none mb-4" 
                        placeholder={feedbackType === 'Bug' ? "Descreva o erro encontrado..." : "Descreva sua ideia de melhoria..."} 
                    />

                    <div className="space-y-2 mb-4">
                        <p className="text-[10px] font-black uppercase text-slate-400 ml-1">Evidências (Prints/Imagens)</p>
                        {feedbackFiles.length > 0 && (
                            <div className="grid grid-cols-3 gap-2">
                                {feedbackFiles.map((f, i) => (
                                    <div key={i} className="aspect-square relative rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                                        <img src={URL.createObjectURL(f)} className="absolute inset-0 w-full h-full object-cover" />
                                        <button onClick={() => setFeedbackFiles(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full"><X size={10} /></button>
                                    </div>
                                ))}
                            </div>
                        )}
                        <button onClick={() => feedbackFileInputRef.current?.click()} className="w-full py-4 border-2 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:border-zorion-500 hover:text-zorion-600 transition-colors bg-slate-50/50">
                            <Camera size={24} className="mb-1" />
                            <span className="text-[10px] font-black uppercase tracking-widest">Adicionar Print</span>
                        </button>
                        <input type="file" accept="image/*" multiple className="hidden" ref={feedbackFileInputRef} onChange={e => {
                            if (e.target.files) setFeedbackFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                            e.target.value = '';
                        }} />
                    </div>
                </div>

                <div className="pt-4 border-t border-slate-100 mt-2">
                    <Button onClick={handleFeedbackSubmit} isLoading={isSubmittingFeedback} className="w-full py-4 rounded-2xl font-black uppercase text-xs shadow-lg flex items-center justify-center gap-2">
                        <Send size={16} /> Enviar Relatório
                    </Button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default Layout;
