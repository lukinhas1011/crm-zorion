
import React, { useState, useEffect } from 'react';
import { HashRouter as Router } from 'react-router-dom';
import { collection, onSnapshot, query, orderBy, setDoc, doc, updateDoc, getDoc, writeBatch, deleteDoc, where, getDocs } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './services/firebase';
import { COLLECTIONS, prepareForSave } from './services/dbSchema';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Login from './pages/Login';
import Clients from './pages/Clients';
import ClientDetails from './pages/ClientDetails';
import MapPage from './pages/MapPage';
import NewVisit from './pages/NewVisit';
import Visits from './pages/Visits';
import SalesFunnel from './pages/SalesFunnel';
import ProductionFunnel from './pages/ProductionFunnel';
import Nutrition from './pages/Nutrition';
import PriceTablePage from './pages/PriceTablePage';
import FeedbackList from './pages/FeedbackList';
import Profile from './pages/Profile';
import IntegrationTest from './pages/IntegrationTest';
import { User, Client, Visit, CatalogItem, Deal, Stage, Pipeline, Activity, Language, Translator } from './types';
import { Beef, Loader2 } from 'lucide-react';

// Dicionário de traduções
const TRANSLATIONS: Record<Language, Record<string, string>> = {
  'pt-BR': {
    'nav.dashboard': 'Página Inicial',
    'nav.production': 'Clientes Ativos',
    'nav.sales': 'Oportunidades',
    'nav.clients': 'Cadastro',
    'nav.visits': 'Histórico de Clientes',
    'nav.map': 'Mapa Operacional',
    'nav.prices': 'Tabela de Preços',
    'nav.apps': 'Apps Zorion',
    'nav.new_visit': 'Lançar Visita',
    'nav.logout': 'Encerrar Sessão',
    'dash.welcome': 'Olá',
    'dash.subtitle': 'Performance e análise financeira.',
    'dash.base_cadastro': 'Base de Cadastro',
    'dash.fazendas_cadastradas': 'fazendas cadastradas',
    'dash.em_suplementacao': 'Em Suplementação',
    'dash.conversao': 'de conversão',
    'dash.visitas_mes': 'Visitas (Mês Atual)',
    'dash.total_de': 'Total de',
    'dash.oportunidades': 'Oportunidades Ativas',
    'dash.em_aberto': 'em aberto',
    'dash.taxa_conversao': 'Taxa de Conversão',
    'dash.ganhos': 'ganhos',
    'dash.atividades': 'Atividades Pendentes',
    'dash.destaques': 'Destaques Financeiros',
    'dash.agenda': 'Agenda do Dia',
    'dash.sem_eventos': 'Sem eventos.',
    'dash.clima': 'Clima',
    'dash.localizando': 'Localizando...',
    'dash.ceu_limpo': 'Céu Limpo',
    'dash.umidade': 'Umidade',
    'dash.vento': 'Vento',
  },
  'es': {
    'nav.dashboard': 'Página de Inicio',
    'nav.production': 'Clientes Activos',
    'nav.sales': 'Oportunidades',
    'nav.clients': 'Registro',
    'nav.visits': 'Historial de Clientes',
    'nav.map': 'Mapa Operacional',
    'nav.prices': 'Tabla de Precios',
    'nav.apps': 'Apps Zorion',
    'nav.new_visit': 'Nueva Visita',
    'nav.logout': 'Cerrar Sesión',
    'dash.welcome': 'Hola',
    'dash.subtitle': 'Rendimiento y análisis financiero.',
    'dash.base_cadastro': 'Base de Registro',
    'dash.fazendas_cadastradas': 'haciendas registradas',
    'dash.em_suplementacao': 'En Suplementación',
    'dash.conversao': 'de conversión',
    'dash.visitas_mes': 'Visitas (Mes Actual)',
    'dash.total_de': 'Total de',
    'dash.oportunidades': 'Oportunidades Activas',
    'dash.em_aberto': 'abiertas',
    'dash.taxa_conversao': 'Tasa de Conversión',
    'dash.ganhos': 'ganados',
    'dash.atividades': 'Actividades Pendentes',
    'dash.destaques': 'Destacados Financieros',
    'dash.agenda': 'Agenda del Día',
    'dash.sem_eventos': 'Sin eventos.',
    'dash.clima': 'Clima',
    'dash.localizando': 'Ubicando...',
    'dash.ceu_limpo': 'Cielo Despejado',
    'dash.umidade': 'Humedad',
    'dash.vento': 'Viento',
  }
};

const AppContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  const [clients, setClients] = useState<Client[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  
  // Controle de Permissão da Tabela de Preços - AGORA SEMPRE TRUE (Visível para todos)
  const [canViewPriceTable] = useState(true);

  // Estado de Idioma
  const [language, setLanguage] = useState<Language>('pt-BR');

  // Moeda fixada em USD
  const currencyMode = 'USD';
  const exchangeRate = 1;

  const [activePage, setActivePage] = useState('dashboard');
  const [pageContext, setPageContext] = useState<any>(null);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const isAdmin = user && ((user.email || '').toLowerCase() === 'l.rigolin@zorionan.com' || user.role === 'Admin');
  // Verificação robusta de Master: Email ou ID específico
  const isMaster = user && ((user.email || '').trim().toLowerCase() === 'l.rigolin@zorionan.com' || user.id === 'MkccVyRleBRnwnFvpLkkvzHYSC83');

  // Função de Tradução
  const t: Translator = (key) => {
    return TRANSLATIONS[language][key] || key;
  };

  // Detecção de Localização para Idioma
  useEffect(() => {
    const cachedLang = localStorage.getItem('zorion_lang_cache');
    if (cachedLang) {
        setLanguage(cachedLang as Language);
        return;
    }

    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          try {
            // Usa a mesma API do mapa para reverse geocoding
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            
            if (data && data.address && data.address.country_code) {
              const cc = data.address.country_code.toLowerCase();
              // Lista de códigos de países hispanofalantes na América Latina + Espanha
              const spanishSpeaking = ['ar', 'bo', 'cl', 'co', 'cr', 'cu', 'do', 'ec', 'sv', 'gt', 'hn', 'mx', 'ni', 'pa', 'py', 'pe', 'uy', 've', 'es'];
              
              if (spanishSpeaking.includes(cc)) {
                setLanguage('es');
                localStorage.setItem('zorion_lang_cache', 'es');
                console.log("Idioma alterado para Espanhol com base na localização:", cc);
              } else {
                localStorage.setItem('zorion_lang_cache', 'pt-BR');
              }
            }
          } catch (fetchError) {
            console.warn("Could not determine location for language:", fetchError);
          }
        } catch (error) {
          console.error("Erro ao detectar país para idioma:", error);
        }
      });
    }
  }, []);

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, COLLECTIONS.USERS, firebaseUser.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            // Force email from Auth to be the source of truth for permissions
            setUser({ 
                id: userDoc.id, 
                ...userData,
                email: firebaseUser.email || userData.email || '' 
            } as User);
          } else {
            const newUser: User = {
              id: firebaseUser.uid,
              name: firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Técnico Zorion',
              role: 'Engenheiro Agrônomo',
              active: true,
              email: firebaseUser.email || '',
              createdAt: new Date().toISOString()
            };
            setUser(newUser);
          }
        } catch (error) {
          console.error("Erro ao recuperar perfil do usuário:", error);
        }
      } else {
        setUser(null);
      }
      setIsAuthenticating(false);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    const unsubClients = onSnapshot(query(collection(db, COLLECTIONS.CLIENTS), orderBy('updatedAt', 'desc')), 
      (snap) => {
        const allClients = snap.docs.map(d => ({ ...d.data(), id: d.id } as Client));
        if (isAdmin) {
          setClients(allClients);
        } else {
          // Filtra clientes atribuídos ao usuário logado (suporte a legado e múltipla atribuição)
          setClients(allClients.filter(c => {
             const isLegacyOwner = c.assignedTechnicianId === user.id;
             const isMultiOwner = c.assignedTechnicianIds?.includes(user.id);
             return isLegacyOwner || isMultiOwner;
          }));
        }
      });

    const unsubVisits = onSnapshot(query(collection(db, COLLECTIONS.VISITS), orderBy('date', 'desc')), 
      (snap) => {
        const allVisits = snap.docs.map(d => ({ ...d.data(), id: d.id } as Visit));
        if (isAdmin) {
          setVisits(allVisits);
        } else {
          // Permite ver visitas onde o usuário é o técnico OU onde o cliente faz parte da lista de clientes do usuário
          setVisits(allVisits.filter(v => v.technicianId === user.id || (clients.some(c => c.id === v.clientId))));
        }
      });

    const unsubCatalog = onSnapshot(query(collection(db, COLLECTIONS.CATALOG), orderBy('name', 'asc')), 
      (snap) => setCatalog(snap.docs.map(d => ({ ...d.data(), id: d.id } as CatalogItem))));

    const unsubPipelines = onSnapshot(query(collection(db, COLLECTIONS.PIPELINES), orderBy('order', 'asc')), 
      (snap) => {
        const pips = snap.docs.map(d => ({ ...d.data(), id: d.id } as Pipeline));
        setPipelines(pips);
        if (snap.empty) {
          const defaultPip: Pipeline = { id: 'pip_principal', name: 'Vendas Diretas', order: 1, isActive: true };
          setDoc(doc(db, COLLECTIONS.PIPELINES, defaultPip.id), prepareForSave(defaultPip, true));
        }
      });

    const unsubStages = onSnapshot(query(collection(db, COLLECTIONS.STAGES), orderBy('order', 'asc')), async (snap) => {
      const stgs = snap.docs.map(d => ({ ...d.data(), id: d.id } as Stage));
      const newStageNames = ['Cliente potencial', 'Estabelecimento de oportunidade', 'Validação de negociação', 'Validação e negociação comercial'];
      const currentNames = stgs.map(s => s.name);
      const isCorrect = stgs.length === newStageNames.length && JSON.stringify(currentNames) === JSON.stringify(newStageNames);

      if (snap.empty || !isCorrect) {
        const batch = writeBatch(db);
        snap.docs.forEach(d => batch.delete(d.ref));
        newStageNames.forEach((name, idx) => {
          const sid = `stg_${idx + 1}`;
          const newStage: Stage = { id: sid, pipelineId: 'pip_principal', name, order: idx + 1, probability: (idx + 1) * 25 };
          batch.set(doc(db, COLLECTIONS.STAGES, sid), prepareForSave(newStage, true));
        });
        await batch.commit();
      } else {
        setStages(stgs);
      }
    });

    const unsubDeals = onSnapshot(query(collection(db, COLLECTIONS.DEALS), orderBy('updatedAt', 'desc')), 
      (snap) => {
        const allDeals = snap.docs.map(d => ({ ...d.data(), id: d.id } as Deal));
        if (isAdmin) {
          setDeals(allDeals);
        } else {
          // CORREÇÃO: Permite ver deals criados pelo usuário OU deals pertencentes aos clientes do usuário (mesmo que criados por admin)
          setDeals(allDeals.filter(d => {
             const isCreator = d.creatorId === user.id;
             const isClientOwner = clients.some(c => c.id === d.clientId);
             return isCreator || isClientOwner;
          }));
        }
      });

    const unsubActivities = onSnapshot(query(collection(db, COLLECTIONS.ACTIVITIES), orderBy('dueDate', 'asc')), 
      (snap) => {
        const allActivities = snap.docs.map(d => ({ ...d.data(), id: d.id } as Activity));
        if (isAdmin) {
          setActivities(allActivities);
        } else {
          // CORREÇÃO: Permite ver atividades do usuário OU atividades nos clientes do usuário (mesmo que feitas por admin)
          setActivities(allActivities.filter(a => a.technicianId === user.id || clients.some(c => c.id === a.clientId)));
        }
      });

    return () => {
      unsubClients(); unsubVisits(); unsubCatalog(); unsubPipelines(); 
      unsubStages(); unsubDeals(); unsubActivities();
    };
  }, [user, isAdmin, isMaster]); // REMOVIDO clients.length para evitar loop de reconexão

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const handleAddClient = async (client: Client) => {
    const finalClient = { ...client, assignedTechnicianId: client.assignedTechnicianId || user?.id };
    await setDoc(doc(db, COLLECTIONS.CLIENTS, finalClient.id), prepareForSave(finalClient, true));
  };

  const handleUpdateClient = async (client: Client) => {
    await updateDoc(doc(db, COLLECTIONS.CLIENTS, client.id), prepareForSave(client, false));
  };

  const handleAddDeal = async (deal: Deal) => {
    await setDoc(doc(db, COLLECTIONS.DEALS, deal.id), prepareForSave(deal, true));
  };

  const handleUpdateDeal = async (deal: Deal) => {
    await updateDoc(doc(db, COLLECTIONS.DEALS, deal.id), prepareForSave(deal, false));
  };

  const handleDeleteDeal = async (dealId: string) => {
    try { await deleteDoc(doc(db, COLLECTIONS.DEALS, dealId)); } catch (error) { alert("Erro ao excluir o negócio."); }
  };

  const handleAddVisit = async (visit: Visit) => {
    await setDoc(doc(db, COLLECTIONS.VISITS, visit.id), prepareForSave(visit, true));
  };

  const handleUpdateVisit = async (visit: Visit) => {
    await updateDoc(doc(db, COLLECTIONS.VISITS, visit.id), prepareForSave(visit, false));
  };

  const handleDeleteVisit = async (visitId: string) => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.VISITS, visitId));
    } catch (error) {
      console.error("Erro ao excluir visita:", error);
      alert("Erro ao excluir a visita.");
    }
  };

  const handleAddActivity = async (activity: Activity) => {
    await setDoc(doc(db, COLLECTIONS.ACTIVITIES, activity.id), prepareForSave(activity, true));
  };
  
  const handleUpdateActivity = async (activity: Activity) => {
    await updateDoc(doc(db, COLLECTIONS.ACTIVITIES, activity.id), prepareForSave(activity, false));
  };

  const handleDeleteActivity = async (activityId: string) => {
    try { await deleteDoc(doc(db, COLLECTIONS.ACTIVITIES, activityId)); } catch (error) { alert("Erro ao excluir a atividade."); }
  };

  const handleAddCatalogItem = async (item: CatalogItem) => {
    await setDoc(doc(db, COLLECTIONS.CATALOG, item.id), prepareForSave(item, true));
  };

  const handleSelectClient = (id: string) => {
    setSelectedClientId(id);
    setActivePage('client_details');
    setPageContext(null);
  };

  const handleNavigate = (page: string, extra?: any) => {
    setActivePage(page);
    setPageContext(extra || null);
  };

  if (isAuthenticating) {
    return (
      <div className="min-h-screen bg-zorion-950 flex flex-col items-center justify-center p-8">
        <Loader2 className="animate-spin text-zorion-400 h-12 w-12 mb-4" />
        <h1 className="text-white font-black italic text-2xl tracking-tighter uppercase">Sincronizando Zorion...</h1>
      </div>
    );
  }

  if (!user) return <Login onLogin={setUser} onLanguageChange={setLanguage} currentLanguage={language} />;

  const commonProps = { 
    currencyMode: 'USD' as const, 
    exchangeRate: 1,
    t // Passando a função de tradução
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard': return <Dashboard clients={clients} visits={visits} user={user} onNavigate={handleNavigate} onSelectClient={handleSelectClient} deals={deals} activities={activities} {...commonProps} />;
      case 'sales': return <SalesFunnel deals={deals} stages={stages} pipelines={pipelines} activities={activities} clients={clients} catalog={catalog} user={user} onAddDeal={handleAddDeal} onUpdateDeal={handleUpdateDeal} onDeleteDeal={handleDeleteDeal} onAddVisit={handleAddVisit} onSelectClient={handleSelectClient} pendingDealId={pageContext?.dealId} createForClientId={pageContext?.createFor} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onDeleteActivity={handleDeleteActivity} onAddCatalogItem={handleAddCatalogItem} {...commonProps} />;
      case 'production_funnel': return <ProductionFunnel deals={deals} activities={activities} clients={clients} visits={visits} catalog={catalog} user={user} onAddDeal={handleAddDeal} onUpdateDeal={handleUpdateDeal} onDeleteDeal={handleDeleteDeal} onSelectClient={handleSelectClient} onAddVisit={handleAddVisit} onUpdateClient={handleUpdateClient} onAddCatalogItem={handleAddCatalogItem} pendingDealId={pageContext?.dealId} createForClientId={pageContext?.createFor} onAddActivity={handleAddActivity} onUpdateActivity={handleUpdateActivity} onDeleteActivity={handleDeleteActivity} {...commonProps} />;
      case 'map': return <MapPage clients={clients} visits={visits} onSelectClient={handleSelectClient} user={user} />;
      case 'clients': return <Clients clients={clients} visits={visits} deals={deals} activities={activities} onAddClient={handleAddClient} onUpdateClient={handleUpdateClient} onSelectClient={handleSelectClient} onNavigate={handleNavigate} user={user} />;
      case 'new_visit': return <NewVisit clients={clients} catalog={catalog} onAddClient={handleAddClient} onUpdateClient={handleUpdateClient} onAddVisit={handleAddVisit} onAddCatalogItem={handleAddCatalogItem} onComplete={() => setActivePage('dashboard')} user={user} />;
      case 'price_table': return <PriceTablePage user={user} />;
      case 'client_details':
        const client = clients.find(c => c.id === selectedClientId);
        if (!client) return null;
        return <ClientDetails 
          client={client} 
          visits={visits.filter(v => v.clientId === selectedClientId)} 
          deals={deals} 
          stages={stages}
          pipelines={pipelines}
          catalog={catalog} 
          user={user} 
          onBack={() => setActivePage('clients')} 
          onAddVisit={handleAddVisit} 
          onUpdateVisit={handleUpdateVisit} 
          onUpdateClient={handleUpdateClient} 
          onAddCatalogItem={handleAddCatalogItem}
          onNavigate={handleNavigate} 
          activities={activities.filter(a => a.clientId === selectedClientId)}
          onAddActivity={handleAddActivity}
          onUpdateActivity={handleUpdateActivity}
          {...commonProps}
        />;
      case 'visits': return <Visits visits={visits} clients={clients} onSelectClient={handleSelectClient} onUpdateVisit={handleUpdateVisit} onDeleteVisit={handleDeleteVisit} />;
      case 'nutrition': return <Nutrition />;
      case 'feedback_list': return <FeedbackList />;
      case 'profile': return <Profile user={user} onUpdateUser={setUser} />;
      case 'integration_test': return <IntegrationTest />;
      default: return <Dashboard clients={clients} visits={visits} user={user} onNavigate={handleNavigate} onSelectClient={handleSelectClient} deals={deals} activities={activities} {...commonProps} />;
    }
  };

  return <Layout activePage={activePage} onNavigate={handleNavigate} user={user} onLogout={handleLogout} t={t} showPriceTable={canViewPriceTable} {...commonProps}>{renderPage()}</Layout>;
};

const App: React.FC = () => <Router><AppContent /></Router>;
export default App;
