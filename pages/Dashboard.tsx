
import React, { useState, useMemo, useEffect } from 'react';
import { TrendingUp, Users, ClipboardCheck, Beef, Calendar as CalendarIcon, ChevronRight, Clock, MapPin, Sparkles, ChevronLeft, CalendarPlus, CheckCircle2, DollarSign, Target, Percent, Briefcase, Phone, Mail, MessageSquare, Cloud, Sun, CloudRain, Wind, Droplets, Thermometer, CloudLightning, CloudSnow, Loader2, Coins, X, User as UserIcon, Settings, Package, CheckSquare, Plus, Trash2 } from 'lucide-react';
import { Client, Visit, User, Deal, Activity, Translator, Todo } from '../types';
import { Button } from '../components/Button';
import { collection, query, where, orderBy, onSnapshot, addDoc, updateDoc, deleteDoc, doc, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTIONS } from '../services/dbSchema';

interface DashboardProps {
  clients: Client[];
  visits: Visit[];
  user: User;
  onNavigate: (page: string, extra?: any) => void;
  onSelectClient: (id: string) => void;
  deals?: Deal[];
  activities?: Activity[];
  currencyMode?: 'BRL' | 'USD';
  exchangeRate?: number;
  onToggleCurrency?: () => void;
  onUpdateExchangeRate?: (rate: number, manual: boolean) => void;
  isManualExchange?: boolean;
  t?: Translator;
}

const StatCard = ({ title, value, subtext, icon: Icon, color, onClick, currencyInfo }: any) => (
  <button 
    onClick={onClick}
    className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100 flex items-center justify-between group hover:shadow-xl hover:border-emerald-100 hover:-translate-y-1 transition-all text-left w-full active:scale-95"
  >
    <div className="flex-1">
      <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</p>
      <h3 className="text-2xl md:text-3xl font-black text-slate-900 mt-1 italic tracking-tighter">{value}</h3>
      {currencyInfo && (
          <p className="text-[10px] font-black text-blue-600 uppercase tracking-tighter mt-0.5">{currencyInfo}</p>
      )}
      <p className="text-[10px] mt-1 text-slate-500 font-bold uppercase tracking-tight">
        {subtext}
      </p>
    </div>
    <div className={`p-4 rounded-2xl ${color} bg-opacity-10 group-hover:scale-110 transition-transform`}>
      <Icon className={`h-7 w-7 ${color.replace('bg-', 'text-')}`} />
    </div>
  </button>
);

const WeatherWidget = ({ t = (k:string) => k }: { t?: Translator }) => {
  const [weather, setWeather] = useState<any>(null);
  const [locationName, setLocationName] = useState<string>(t('dash.localizando'));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const cachedWeather = localStorage.getItem('zorion_weather_cache');
    const cachedLocation = localStorage.getItem('zorion_location_cache');
    const cacheTime = localStorage.getItem('zorion_weather_timestamp');
    
    // Cache válido por 1 hora (3600000 ms)
    if (cachedWeather && cachedLocation && cacheTime && (Date.now() - Number(cacheTime) < 3600000)) {
        setWeather(JSON.parse(cachedWeather));
        setLocationName(cachedLocation);
        setLoading(false);
        return;
    }

    if (!navigator.geolocation) { setError(true); setLoading(false); return; }
    
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          let locName = 'Sua Localização';
          
          try {
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`);
            const geoData = await geoRes.json();
            locName = geoData.address.city || geoData.address.town || geoData.address.village || 'Campo Remoto';
            setLocationName(locName);
          } catch (e) { setLocationName(locName); }

          const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min&timezone=auto`);
          const weatherData = await weatherRes.json();
          setWeather(weatherData);

          // Salvar Cache
          localStorage.setItem('zorion_weather_cache', JSON.stringify(weatherData));
          localStorage.setItem('zorion_location_cache', locName);
          localStorage.setItem('zorion_weather_timestamp', String(Date.now()));

        } catch (err) { setError(true); } finally { setLoading(false); }
      },
      () => { setError(true); setLoading(false); }
    );
  }, []);

  const getWeatherIcon = (code: number) => {
    if (code === 0) return <Sun className="h-12 w-12 text-amber-400" />;
    if (code >= 1 && code <= 3) return <Cloud className="h-12 w-12 text-slate-200" />;
    if (code >= 51 && code <= 67) return <CloudRain className="h-12 w-12 text-blue-300" />;
    if (code >= 95) return <CloudLightning className="h-12 w-12 text-purple-300" />;
    return <Cloud className="h-12 w-12 text-slate-200" />;
  };

  if (loading) return (
    <div className="bg-slate-900 rounded-[2.5rem] p-8 shadow-xl border border-slate-800 flex items-center justify-center min-h-[220px]">
        <div className="flex flex-col items-center gap-2 text-slate-500">
            <Loader2 className="animate-spin text-zorion-500" size={24} />
            <span className="text-xs font-bold uppercase tracking-widest">{t('dash.clima')} Zorion...</span>
        </div>
    </div>
  );
  if (error || !weather) return null;
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-zorion-950 text-white rounded-[2.5rem] p-8 shadow-2xl border border-slate-700/50 group">
       <div className="absolute top-0 right-0 -mt-8 -mr-8 w-32 h-32 bg-emerald-500/20 rounded-full blur-3xl"></div>
       <div className="relative z-10">
          <div className="flex justify-between items-start mb-6">
             <div><h4 className="flex items-center gap-2 text-sm font-bold text-slate-300 uppercase tracking-wider mb-1"><MapPin size={14} className="text-emerald-400" /> {locationName}</h4><p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">{new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div>
             <div className="bg-white/10 p-2 rounded-2xl backdrop-blur-md border border-white/5 group-hover:scale-110 transition-transform duration-500">{getWeatherIcon(weather.current.weather_code)}</div>
          </div>
          <div className="flex items-end gap-2 mb-6">
             <h2 className="text-6xl font-black tracking-tighter bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">{Math.round(weather.current.temperature_2m)}°</h2>
             <div className="pb-3"><p className="text-lg font-medium text-emerald-400 leading-none">{t('dash.ceu_limpo')}</p></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
             <div className="bg-white/5 rounded-2xl p-3 flex items-center gap-3 border border-white/5"><div className="p-2 bg-blue-500/20 rounded-xl text-blue-300"><Droplets size={16} /></div><div><p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{t('dash.umidade')}</p><p className="text-sm font-black">{weather.current.relative_humidity_2m}%</p></div></div>
             <div className="bg-white/5 rounded-2xl p-3 flex items-center gap-3 border border-white/5"><div className="p-2 bg-emerald-500/20 rounded-xl text-emerald-300"><Wind size={16} /></div><div><p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">{t('dash.vento')}</p><p className="text-sm font-black">{weather.current.wind_speed_10m} km/h</p></div></div>
          </div>
       </div>
    </div>
  );
};

const Dashboard: React.FC<DashboardProps> = ({ 
  clients, visits, user, onNavigate, onSelectClient, deals = [], activities = [], currencyMode = 'USD', exchangeRate = 1, t = (k) => k
}) => {
  const [viewMode, setViewMode] = useState<'operacional' | 'comercial'>('operacional');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [isVisitModalOpen, setIsVisitModalOpen] = useState(false);
  
  // Todo List State
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [todoDueDate, setTodoDueDate] = useState('');
  const [todoAssignee, setTodoAssignee] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);

  const isAdmin = user && ((user.email || '').toLowerCase() === 'l.rigolin@zorionan.com' || user.role === 'Admin');

  // Fetch Users for Admin (to assign tasks)
  useEffect(() => {
    if (isAdmin) {
        const fetchUsers = async () => {
            try {
                const usersCollection = collection(db, COLLECTIONS.USERS);
                const snap = await getDocs(usersCollection);
                
                let usersList = snap.docs.map(d => ({ id: d.id, ...d.data() } as User));
                
                // Remove duplicates based on email
                const uniqueUsers = new Map();
                usersList.forEach(u => {
                    if (u.email) {
                        const emailLower = u.email.toLowerCase();
                        if (!uniqueUsers.has(emailLower)) {
                            uniqueUsers.set(emailLower, u);
                        }
                    } else {
                        // If no email, use ID as key to keep them
                        uniqueUsers.set(u.id, u);
                    }
                });
                
                usersList = Array.from(uniqueUsers.values());

                // Ordenação Alfabética
                usersList.sort((a, b) => {
                    const nameA = (a.name || a.email || '').toLowerCase();
                    const nameB = (b.name || b.email || '').toLowerCase();
                    return nameA.localeCompare(nameB);
                });

                setAllUsers(usersList);
            } catch (error) {
                console.error("Erro ao buscar usuários:", error);
            }
        };
        fetchUsers();
    }
  }, [isAdmin]);

  // Todo List Effect
  useEffect(() => {
    if (!user) return;
    
    let q;
    if (isAdmin) {
      q = query(collection(db, COLLECTIONS.TODOS), orderBy('createdAt', 'desc'));
    } else {
      // Remove orderBy from query to avoid needing a composite index
      q = query(collection(db, COLLECTIONS.TODOS), where('userId', '==', user.id));
    }

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedTodos = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Todo));
      
      // Sort in memory if not admin (since we removed orderBy from query)
      if (!isAdmin) {
          fetchedTodos.sort((a, b) => {
              const dateA = a.createdAt || '';
              const dateB = b.createdAt || '';
              return dateB.localeCompare(dateA);
          });
      }
      
      setTodos(fetchedTodos);
    });

    return () => unsubscribe();
  }, [user, isAdmin]);

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodo.trim()) return;
    
    try {
      let assignedUserId = user.id;
      let assignedUserName = user.name;

      if (isAdmin && todoAssignee) {
          const selectedUser = allUsers.find(u => u.id === todoAssignee);
          if (selectedUser) {
              assignedUserId = selectedUser.id;
              assignedUserName = selectedUser.name || selectedUser.email || 'Usuário';
          }
      }

      await addDoc(collection(db, COLLECTIONS.TODOS), {
        userId: assignedUserId,
        userName: assignedUserName,
        text: newTodo.trim(),
        isDone: false,
        dueDate: todoDueDate || null,
        creatorId: user.id,
        createdAt: new Date().toISOString()
      });
      setNewTodo('');
      setTodoDueDate('');
      setTodoAssignee('');
    } catch (error) {
      console.error("Error adding todo:", error);
    }
  };

  const toggleTodo = async (todo: Todo) => {
    try {
      await updateDoc(doc(db, COLLECTIONS.TODOS, todo.id), {
        isDone: !todo.isDone
      });
    } catch (error) {
      console.error("Error toggling todo:", error);
    }
  };

  const deleteTodo = async (id: string) => {
    try {
      await deleteDoc(doc(db, COLLECTIONS.TODOS, id));
    } catch (error) {
      console.error("Error deleting todo:", error);
    }
  };

  const totalHerdSize = useMemo(() => clients.reduce((acc, client) => acc + (client.herdSize || 0), 0), [clients]);
  const totalTreated = useMemo(() => clients.reduce((acc, client) => acc + (client.treatedHerdSize || 0), 0), [clients]);
  
  const currentMonthVisits = useMemo(() => {
    const now = new Date();
    return visits.filter(v => {
      const vDate = new Date(v.date);
      return v.status === 'Concluída' && 
             vDate.getMonth() === now.getMonth() && 
             vDate.getFullYear() === now.getFullYear();
    });
  }, [visits]);

  const visitsByClient = useMemo(() => {
    const map = new Map<string, { count: number, farmName: string, clientName: string }>();
    currentMonthVisits.forEach(v => {
      const client = clients.find(c => c.id === v.clientId);
      const existing = map.get(v.clientId) || { count: 0, farmName: client?.farmName || 'Fazenda', clientName: client?.name || 'Cliente' };
      map.set(v.clientId, { ...existing, count: existing.count + 1 });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [currentMonthVisits, clients]);
  
  const salesMetrics = useMemo(() => {
    const activeDeals = deals.filter(d => d.status === 'Open');
    const totalPipelineUSD = activeDeals.reduce((acc, d) => acc + d.value, 0);
    
    const wonDeals = deals.filter(d => d.status === 'Won');
    const lostDeals = deals.filter(d => d.status === 'Lost');
    const totalClosed = wonDeals.length + lostDeals.length;
    const winRate = totalClosed > 0 ? Math.round((wonDeals.length / totalClosed) * 100) : 0;
    const pendingActivities = activities.filter(a => !a.isDone).length;
    
    return { totalPipelineUSD, wonCount: wonDeals.length, winRate, pendingActivities };
  }, [deals, activities]);

  const daysInMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const firstDayOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  const getCalendarDays = () => {
    const days = [];
    const totalDays = daysInMonth(currentMonth);
    const startOffset = firstDayOfMonth(currentMonth);
    for (let i = 0; i < startOffset; i++) { days.push(null); }
    for (let i = 1; i <= totalDays; i++) { days.push(new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i)); }
    return days;
  };
  const isSameDay = (d1: Date, d2: Date) => d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
  const getEventsForDay = (day: Date) => {
    const dayVisits = visits.filter(v => isSameDay(new Date(v.date), day)).map(v => ({...v, type: 'visit'}));
    const dayActivities = activities.filter(a => isSameDay(new Date(a.dueDate), day)).map(a => ({...a, type: 'activity', date: a.dueDate}));
    return [...dayVisits, ...dayActivities];
  };

  const changeMonth = (offset: number) => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));

  const renderOperacionalView = () => (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 animate-fade-in">
      <StatCard title={t('dash.base_cadastro')} value={totalHerdSize.toLocaleString()} subtext={`${clients.length} ${t('dash.fazendas_cadastradas')}`} icon={Beef} color="bg-emerald-600" onClick={() => onNavigate('clients')} />
      <StatCard title={t('dash.em_suplementacao')} value={totalTreated.toLocaleString()} subtext={`${totalHerdSize > 0 ? Math.round((totalTreated/totalHerdSize)*100) : 0}% ${t('dash.conversao')}`} icon={TrendingUp} color="bg-blue-600" onClick={() => onNavigate('clients')} />
      <StatCard 
        title={t('dash.visitas_mes')}
        value={currentMonthVisits.length} 
        subtext={`${t('dash.total_de')} ${new Date().toLocaleString('pt-BR', { month: 'long' })}`} 
        icon={ClipboardCheck} 
        color="bg-indigo-600" 
        onClick={() => setIsVisitModalOpen(true)} 
      />
    </div>
  );

  const renderComercialView = () => {
    const displayValue = `$ ${(salesMetrics.totalPipelineUSD / 1000).toFixed(1)}k`;
    
    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 animate-fade-in">
          <StatCard 
            title={t('dash.oportunidades')}
            value={displayValue} 
            subtext={`${deals.filter(d => d.status === 'Open').length} ${t('dash.em_aberto')}`} 
            icon={Target} 
            color="bg-amber-600" 
            onClick={() => onNavigate('sales')}
          />
          <StatCard title={t('dash.taxa_conversao')} value={`${salesMetrics.winRate}%`} subtext={`${salesMetrics.wonCount} ${t('dash.ganhos')}`} icon={Percent} color="bg-emerald-600" onClick={() => onNavigate('sales')} />
          <StatCard title={t('dash.atividades')} value={salesMetrics.pendingActivities} subtext="Calls, E-mails" icon={Phone} color="bg-blue-600" onClick={() => onNavigate('sales')} />
        </div>
    );
  };

  return (
    <div className="space-y-8 animate-fade-in pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div><h2 className="text-3xl font-black text-slate-900 tracking-tighter italic">{t('dash.welcome')}, {user.name.split(' ')[0]}</h2><p className="text-slate-500 text-sm font-medium">{t('dash.subtitle')}</p></div>
        
        <div className="flex gap-2">
            {isAdmin && (
            <div className="bg-slate-200/50 p-1.5 rounded-[1.5rem] flex gap-2 border border-slate-200">
                <button onClick={() => setViewMode('operacional')} className={`px-5 py-2.5 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'operacional' ? 'bg-white text-emerald-900 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}><Beef size={14} /> Operacional</button>
                <button onClick={() => setViewMode('comercial')} className={`px-5 py-2.5 rounded-[1.2rem] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${viewMode === 'comercial' ? 'bg-white text-amber-900 shadow-md' : 'text-slate-500 hover:text-slate-700'}`}><DollarSign size={14} /> Comercial</button>
            </div>
            )}
        </div>
      </div>
      
      {(viewMode === 'operacional' || !isAdmin) ? renderOperacionalView() : renderComercialView()}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-7 space-y-6">
          <div className="bg-white rounded-[3rem] shadow-xl border border-slate-100 p-8 overflow-hidden">
            <div className="flex items-center justify-between mb-8"><h3 className="text-xl font-black text-slate-900 italic tracking-tighter flex items-center gap-2"><CalendarIcon size={24} /> {currentMonth.toLocaleString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}</h3><div className="flex gap-2"><button onClick={() => changeMonth(-1)} className="p-2 bg-slate-50 rounded-xl text-slate-400"><ChevronLeft size={20}/></button><button onClick={() => changeMonth(1)} className="p-2 bg-slate-50 rounded-xl text-slate-400"><ChevronRight size={20}/></button></div></div>
            <div className="grid grid-cols-7 mb-4">{['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'].map(day => (<div key={day} className="text-center text-[9px] font-black text-slate-300 tracking-[0.2em]">{day}</div>))}</div>
            <div className="grid grid-cols-7 gap-2">{getCalendarDays().map((day, idx) => { if (!day) return <div key={idx} className="aspect-square"></div>; const events = getEventsForDay(day); const isSelected = isSameDay(day, selectedDate); return (<button key={day.toISOString()} onClick={() => setSelectedDate(day)} className={`aspect-square relative flex items-center justify-center rounded-2xl text-sm font-black transition-all ${isSelected ? 'bg-zorion-900 text-white shadow-lg' : 'hover:bg-slate-50 text-slate-700'}`}>{day.getDate()}{events.length > 0 && !isSelected && (<div className="absolute bottom-2 h-1 w-1 rounded-full bg-zorion-500"></div>)}</button>); })}</div>
          </div>
          <div className="bg-white rounded-[2.5rem] p-8 border border-slate-100 shadow-sm min-h-[400px]">
             <div className="flex items-center justify-between mb-8"><div><h4 className="text-lg font-black text-slate-900 italic tracking-tighter">{t('dash.agenda')}</h4><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p></div><button onClick={() => onNavigate('new_visit', { date: selectedDate.toISOString().split('T')[0] })} className="bg-zorion-900 text-white p-3 rounded-2xl shadow-lg"><CalendarPlus size={20} /></button></div>
             <div className="space-y-4">{getEventsForDay(selectedDate).length === 0 ? (<div className="py-20 text-center"><p className="text-sm font-bold text-slate-300 italic">{t('dash.sem_eventos')}</p></div>) : (getEventsForDay(selectedDate).sort((a,b) => a.date.localeCompare(b.date)).map((event: any) => {
               const client = clients.find(c => c.id === event.clientId);
               return (
                <div key={event.id} className="w-full flex items-center gap-5 p-5 bg-slate-50 rounded-[2rem] border border-slate-100 group cursor-pointer" onClick={() => onSelectClient(event.clientId)}>
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center border ${event.type === 'visit' ? 'text-emerald-600 bg-emerald-50' : 'text-blue-600 bg-blue-50'}`}>
                    <MapPin size={20} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h5 className="font-black text-slate-900 truncate italic leading-tight">
                      {client?.name || 'Cliente'}
                    </h5>
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-bold text-slate-400 uppercase truncate">
                        {new Date(event.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {client?.farmName || 'Propriedade'} • {event.purpose || 'Atividade CRM'}
                      </p>
                      {event.product && (
                        <span className="text-[8px] font-black text-blue-500 bg-blue-50 px-1.5 rounded flex items-center gap-1 uppercase">
                          <Package size={8} /> {event.product}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[8px] font-black uppercase ${event.type === 'visit' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                    {event.type}
                  </div>
                </div>
               );
             }))}</div>
          </div>
        </div>
        <div className="lg:col-span-5 space-y-6">
           <WeatherWidget t={t} />

           {/* TODO LIST WIDGET */}
           <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm">
             <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 px-1 flex items-center gap-2">
                <CheckSquare size={16} className="text-emerald-500" /> 
                {isAdmin ? 'Lista de Tarefas (Todos)' : 'Minhas Tarefas'}
             </h3>
             
             <form onSubmit={handleAddTodo} className="flex flex-col gap-2 mb-6">
                <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newTodo}
                      onChange={(e) => setNewTodo(e.target.value)}
                      placeholder="Adicionar nova tarefa..."
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium outline-none focus:border-emerald-500 transition-colors"
                    />
                    <button 
                      type="submit"
                      disabled={!newTodo.trim()}
                      className="bg-emerald-600 text-white p-2 rounded-xl hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-emerald-200"
                    >
                      <Plus size={20} />
                    </button>
                </div>
                
                <div className="flex gap-2">
                    <div className="flex-1 relative">
                        <input 
                            type="date" 
                            value={todoDueDate}
                            onChange={(e) => setTodoDueDate(e.target.value)}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium outline-none focus:border-emerald-500 transition-colors text-slate-600"
                        />
                    </div>
                    
                    {isAdmin && (
                        <div className="flex-1 relative">
                            <select
                                value={todoAssignee}
                                onChange={(e) => setTodoAssignee(e.target.value)}
                                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-xs font-medium outline-none focus:border-emerald-500 transition-colors text-slate-600 appearance-none"
                            >
                                <option value="">Para mim</option>
                                {allUsers.map(u => (
                                    <option key={u.id} value={u.id}>{u.name || u.email}</option>
                                ))}
                            </select>
                            <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 rotate-90 pointer-events-none" size={12} />
                        </div>
                    )}
                </div>
             </form>

             <div className="space-y-3 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                {todos.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 font-medium py-8 italic bg-slate-50 rounded-2xl border border-slate-100 border-dashed">Nenhuma tarefa pendente.</p>
                ) : (
                    todos.map(todo => (
                        <div key={todo.id} className={`group flex items-start gap-3 p-3 rounded-xl border transition-all ${todo.isDone ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100 hover:border-emerald-200 hover:shadow-sm'}`}>
                            <button 
                                onClick={() => toggleTodo(todo)}
                                className={`mt-0.5 h-5 w-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${todo.isDone ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400 bg-white'}`}
                            >
                                {todo.isDone && <CheckCircle2 size={14} />}
                            </button>
                            <div className="flex-1 min-w-0">
                                <p className={`text-sm font-bold leading-tight ${todo.isDone ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                                    {todo.text}
                                </p>
                                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                                    {isAdmin && (
                                        <span className="text-[9px] font-black text-slate-400 uppercase bg-slate-100 px-1.5 py-0.5 rounded tracking-wide truncate max-w-[100px]" title={`Atribuído a: ${todo.userName}`}>
                                            {todo.userName}
                                        </span>
                                    )}
                                    {todo.dueDate && (
                                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-1 ${new Date(todo.dueDate) < new Date() && !todo.isDone ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                                            <Clock size={10} /> {new Date(todo.dueDate).toLocaleDateString()}
                                        </span>
                                    )}
                                    <span className="text-[9px] text-slate-300 font-bold" title={`Criado em: ${new Date(todo.createdAt || '').toLocaleString()}`}>
                                        Criado: {new Date(todo.createdAt || '').toLocaleDateString()}
                                    </span>
                                </div>
                            </div>
                            <button 
                                onClick={() => deleteTodo(todo.id)}
                                className="text-slate-300 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-50 rounded-lg"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))
                )}
             </div>
           </div>

           <div className="bg-white rounded-[2.5rem] border border-slate-100 p-8 shadow-sm">
             <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 px-1">{t('dash.destaques')}</h3>
             <div className="space-y-4">
                {deals.filter(d => d.status === 'Open').slice(0, 3).map(deal => (
                    <button key={deal.id} onClick={() => onNavigate('sales')} className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 rounded-2xl border border-transparent hover:border-slate-100 group">
                        <div className="h-10 w-10 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center"><DollarSign size={20}/></div>
                        <div className="flex-1 text-left">
                            <p className="text-sm font-black text-slate-900 truncate italic">{deal.title}</p>
                            <p className="text-[10px] text-slate-700 font-bold uppercase">
                                $ {(deal.value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </p>
                        </div>
                    </button>
                ))}
             </div>
           </div>
        </div>
      </div>

      {/* MODAL DE DETALHAMENTO DE VISITAS (Mês Atual) */}
      {isVisitModalOpen && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
           <div className="bg-white rounded-[2.5rem] w-full max-w-lg p-8 shadow-2xl relative border border-slate-100 flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center mb-6">
                 <div>
                    <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase leading-none">Relatório de Visitas</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Mês de {new Date().toLocaleString('pt-BR', { month: 'long' })}</p>
                 </div>
                 <button onClick={() => setIsVisitModalOpen(false)} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"><X size={20} /></button>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-3">
                 {visitsByClient.length > 0 ? (
                    visitsByClient.map(([clientId, data]) => (
                      <button 
                        key={clientId} 
                        onClick={() => { onSelectClient(clientId); setIsVisitModalOpen(false); }}
                        className="w-full p-5 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-center justify-between group hover:bg-white hover:border-emerald-200 transition-all hover:shadow-md"
                      >
                         <div className="flex items-center gap-4 text-left min-w-0">
                            <div className="h-10 w-10 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                               <MapPin size={18} />
                            </div>
                            <div className="truncate">
                               <h4 className="font-black text-slate-800 text-sm truncate italic">{data.clientName}</h4>
                               <p className="text-[10px] font-bold text-slate-400 uppercase truncate">{data.farmName}</p>
                            </div>
                         </div>
                         <div className="flex items-center gap-2">
                            <div className="text-right">
                               <span className="text-lg font-black text-zorion-900 italic">{data.count}</span>
                               <span className="text-[8px] font-black text-slate-400 uppercase ml-1">Visitas</span>
                            </div>
                            <ChevronRight size={16} className="text-slate-300 group-hover:text-zorion-900" />
                         </div>
                      </button>
                    ))
                 ) : (
                    <div className="py-20 text-center text-slate-300 font-bold italic">Nenhuma visita concluída este mês.</div>
                 )}
              </div>

              <div className="mt-6 pt-6 border-t border-slate-100 flex justify-between items-center px-2">
                 <div className="flex flex-col">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total no Mês</span>
                    <span className="text-xl font-black text-indigo-600 italic leading-none">{currentMonthVisits.length} Atendimentos</span>
                 </div>
                 <Button onClick={() => onNavigate('visits')} className="px-6 py-2.5 rounded-xl text-[10px] font-black uppercase">Ver Histórico Completo</Button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
