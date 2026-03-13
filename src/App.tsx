import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  TrendingUp, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  Plus,
  Search,
  Filter,
  ChevronRight,
  MapPin,
  Phone,
  Mail,
  Beef,
  ClipboardList,
  BarChart3,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Nutrition from './pages/Nutrition';

// --- Mock Data ---
const MOCK_CLIENTS = [
  { id: '1', name: 'Fazenda Santa Maria', owner: 'João Silva', city: 'Uberaba', state: 'MG', status: 'Ativo', phone: '(34) 99999-9999' },
  { id: '2', name: 'Estância Bela Vista', owner: 'Maria Oliveira', city: 'Campo Grande', state: 'MS', status: 'Ativo', phone: '(67) 98888-8888' },
  { id: '3', name: 'Sítio Recanto', owner: 'Pedro Santos', city: 'Goiânia', state: 'GO', status: 'Lead', phone: '(62) 97777-7777' },
];

const MOCK_DEALS = [
  { id: 'd1', title: 'Suplementação Inverno', client: 'Fazenda Santa Maria', value: 15000, stage: 'Prospecção', date: '2024-03-15' },
  { id: 'd2', title: 'Mineralização Período Águas', client: 'Estância Bela Vista', value: 25000, stage: 'Negociação', date: '2024-03-20' },
  { id: 'd3', title: 'Projeto Confinamento', client: 'Sítio Recanto', value: 120000, stage: 'Proposta', date: '2024-04-01' },
];

// --- Components ---

const Sidebar = ({ isOpen, toggle }: { isOpen: boolean, toggle: () => void }) => {
  const location = useLocation();
  
  const menuItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
    { icon: TrendingUp, label: 'Funil de Vendas', path: '/sales' },
    { icon: BarChart3, label: 'Funil de Produção', path: '/production' },
    { icon: Users, label: 'Clientes', path: '/clients' },
    { icon: Calendar, label: 'Visitas', path: '/visits' },
    { icon: Sparkles, label: 'Nutrição (IA)', path: '/nutrition' },
  ];

  return (
    <>
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-slate-900 text-white transform ${isOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 lg:translate-x-0 lg:static lg:inset-0`}>
        <div className="flex items-center justify-between h-16 px-6 bg-slate-950">
          <div className="flex items-center gap-2">
            <Beef className="text-emerald-500" />
            <span className="text-xl font-bold tracking-tight">ZORION</span>
          </div>
          <button onClick={toggle} className="lg:hidden">
            <X size={24} />
          </button>
        </div>
        
        <nav className="mt-6 px-4 space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}
              >
                <item.icon size={20} />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="absolute bottom-0 w-full p-6 border-t border-slate-800">
          <button className="flex items-center gap-3 text-slate-400 hover:text-white transition-colors">
            <LogOut size={20} />
            <span className="font-medium">Sair</span>
          </button>
        </div>
      </div>
      
      {isOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden" 
          onClick={toggle}
        />
      )}
    </>
  );
};

const Header = ({ toggleSidebar }: { toggleSidebar: () => void }) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-30">
      <button onClick={toggleSidebar} className="lg:hidden p-2 hover:bg-slate-100 rounded-lg">
        <Menu size={24} className="text-slate-600" />
      </button>
      
      <div className="flex-1 max-w-md mx-4 hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <input 
            type="text" 
            placeholder="Buscar clientes, visitas..." 
            className="w-full pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl focus:ring-2 focus:ring-emerald-500 transition-all outline-none text-slate-700"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-bold text-slate-900">Dr. Ricardo Silva</p>
          <p className="text-xs text-slate-500">Consultor Técnico</p>
        </div>
        <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold border-2 border-emerald-200">
          RS
        </div>
      </div>
    </header>
  );
};

// --- Pages ---

const Dashboard = () => {
  const stats = [
    { label: 'Clientes Ativos', value: '42', icon: Users, color: 'bg-blue-500' },
    { label: 'Visitas este Mês', value: '18', icon: Calendar, color: 'bg-emerald-500' },
    { label: 'Propostas em Aberto', value: 'R$ 450k', icon: TrendingUp, color: 'bg-amber-500' },
    { label: 'Conversão', value: '68%', icon: BarChart3, color: 'bg-purple-500' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/20">
          <Plus size={20} />
          Nova Visita
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-center justify-between mb-4">
              <div className={`${stat.color} p-3 rounded-xl text-white`}>
                <stat.icon size={24} />
              </div>
            </div>
            <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
            <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Próximas Visitas</h2>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer border border-transparent hover:border-slate-200">
                <div className="w-12 h-12 rounded-xl bg-slate-100 flex flex-col items-center justify-center text-slate-600">
                  <span className="text-xs font-bold uppercase">Mar</span>
                  <span className="text-lg font-black leading-none">{15 + i}</span>
                </div>
                <div className="flex-1">
                  <p className="font-bold text-slate-900">Fazenda Santa Maria</p>
                  <p className="text-xs text-slate-500">Acompanhamento Nutricional</p>
                </div>
                <ChevronRight className="text-slate-400" size={20} />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h2 className="text-lg font-bold text-slate-900 mb-4">Alertas de Nutrição</h2>
          <div className="space-y-4">
            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl flex gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <Beef size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-amber-900">Lote 04 - Baixo Ganho</p>
                <p className="text-xs text-amber-700">Fazenda Bela Vista: Ganho médio 15% abaixo do esperado.</p>
              </div>
            </div>
            <div className="p-4 bg-red-50 border border-red-100 rounded-xl flex gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600">
                <ClipboardList size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-red-900">Estoque Crítico</p>
                <p className="text-xs text-red-700">Sítio Recanto: Suplemento mineral acaba em 3 dias.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const KanbanPage = ({ title }: { title: string }) => {
  const stages = ['Prospecção', 'Qualificação', 'Proposta', 'Negociação', 'Fechamento'];
  
  return (
    <div className="p-6 h-[calc(100vh-64px)] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{title}</h1>
        <div className="flex gap-2">
          <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"><Filter size={20} /></button>
          <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all">
            <Plus size={20} />
            Novo Card
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-6 h-full min-w-max">
          {stages.map((stage) => (
            <div key={stage} className="w-80 bg-slate-100/50 rounded-2xl p-4 flex flex-col">
              <div className="flex items-center justify-between mb-4 px-2">
                <h3 className="font-bold text-slate-700 uppercase text-xs tracking-wider">{stage}</h3>
                <span className="bg-white px-2 py-0.5 rounded-full text-[10px] font-bold text-slate-500 border border-slate-200">
                  {MOCK_DEALS.filter(d => d.stage === stage).length}
                </span>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-4">
                {MOCK_DEALS.filter(d => d.stage === stage).map((deal) => (
                  <motion.div 
                    layoutId={deal.id}
                    key={deal.id} 
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-grab active:cursor-grabbing"
                  >
                    <p className="text-xs font-bold text-emerald-600 mb-1 uppercase tracking-tight">{deal.client}</p>
                    <h4 className="font-bold text-slate-900 text-sm mb-3">{deal.title}</h4>
                    
                    <div className="flex items-center justify-between mt-auto">
                      <p className="text-sm font-black text-slate-900">
                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(deal.value)}
                      </p>
                      {/* Forecast date removed as per user request */}
                      <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-500">
                        {deal.client.charAt(0)}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const ClientsPage = () => {
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Clientes</h1>
        <button className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-900/20">
          <Plus size={20} />
          Novo Cliente
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fazenda / Proprietário</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Localização</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Contato</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {MOCK_CLIENTS.map((client) => (
                <tr key={client.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                  <td className="px-6 py-4">
                    <p className="font-bold text-slate-900">{client.name}</p>
                    <p className="text-xs text-slate-500">{client.owner}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1 text-slate-600">
                      <MapPin size={14} />
                      <span className="text-sm">{client.city}, {client.state}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1 text-slate-600">
                        <Phone size={14} />
                        <span className="text-xs">{client.phone}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${client.status === 'Ativo' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                      {client.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button className="text-slate-400 hover:text-emerald-600 transition-colors">
                      <ChevronRight size={20} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---

const AppContent = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleSidebar = () => setIsSidebarOpen(!isSidebarOpen);

  return (
    <div className="flex min-h-screen bg-slate-50 font-sans text-slate-900">
      <Sidebar isOpen={isSidebarOpen} toggle={toggleSidebar} />
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header toggleSidebar={toggleSidebar} />
        
        <main className="flex-1 overflow-y-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/sales" element={<KanbanPage title="Funil de Vendas" />} />
            <Route path="/production" element={<KanbanPage title="Funil de Produção" />} />
            <Route path="/clients" element={<ClientsPage />} />
            <Route path="/visits" element={<div className="p-6"><h1>Gestão de Visitas em Breve</h1></div>} />
            <Route path="/nutrition" element={<Nutrition />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
