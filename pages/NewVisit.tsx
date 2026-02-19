
import React, { useState, useRef, useEffect } from 'react';
import { Client, Visit, User, Lot, ClientLocation, CatalogItem, Attachment } from '../types';
import { Button } from '../components/Button';
import { summarizeVisitAudio } from '../services/geminiService';
import { uploadVisitFile } from '../services/storageService';
import { 
  Search, UserPlus, Mic, StopCircle, Camera, Loader2, Check, 
  ChevronRight, Plus, X, ArrowLeft, BrainCircuit, Sparkles, 
  Calendar as CalendarIcon, Clock, MapPin, Beef, Truck, 
  CalendarCheck, CheckCircle2, Image as ImageIcon, Trash2, Pencil,
  Paperclip, FileText, Video, Mic as MicIcon, File as FileIcon, Package
} from 'lucide-react';

interface NewVisitProps {
  clients: Client[];
  catalog: CatalogItem[];
  onAddClient: (client: Client) => void;
  onUpdateClient: (client: Client) => void;
  onAddVisit: (visit: Visit) => void;
  onAddCatalogItem?: (item: CatalogItem) => void;
  onComplete: () => void;
  user: User;
}

const NewVisit: React.FC<NewVisitProps> = ({ clients, catalog, onAddVisit, onAddCatalogItem, onComplete, user }) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [transcript, setTranscript] = useState('');
  const [purpose, setPurpose] = useState<Visit['purpose']>('Nutrição');
  const [product, setProduct] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [visitDate, setVisitDate] = useState(() => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
  });
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      setSelectedFiles(prev => [...prev, ...files]);
      e.target.value = '';
    }
  };

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

  const handleSubmitVisit = async () => {
    if (!selectedClient) return;
    setIsSubmitting(true);
    try {
        const visitId = `vis_${Date.now()}`;
        const finalAttachments: Attachment[] = [];

        if (selectedFiles.length > 0) {
          for (const file of selectedFiles) {
              const url = await uploadVisitFile(file, selectedClient.id, visitId);
              finalAttachments.push({
                  id: `att_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                  url: url,
                  name: file.name,
                  type: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : 'document',
                  size: file.size
              });
          }
        }
        
        onAddVisit({
          id: visitId,
          clientId: selectedClient.id,
          date: new Date(visitDate).toISOString(),
          technicianId: user.id,
          technicianName: user.name,
          purpose: purpose,
          product: product,
          status: 'Concluída',
          transcript,
          attachments: finalAttachments,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        onComplete();
    } catch (error) {
        console.error("Erro no upload:", error);
        alert("Erro ao enviar arquivos. Verifique sua conexão.");
    } finally {
        setIsSubmitting(false);
    }
  };

  if (step === 1) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 animate-fade-in px-4">
        <div className="text-center md:text-left">
          <h2 className="text-3xl font-black text-slate-900 tracking-tighter italic uppercase">Próxima Visita</h2>
          <p className="text-slate-500 font-medium mt-1">Selecione o cliente para iniciar o relato técnico.</p>
        </div>
        <div className="bg-white rounded-[2.5rem] shadow-xl border border-slate-100 p-8 space-y-6">
          <div className="relative">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 h-5 w-5" />
            <input type="text" placeholder="Buscar unidade..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-14 pr-6 py-5 rounded-[1.5rem] bg-slate-50 border-2 border-transparent focus:border-zorion-900/10 outline-none font-black italic" />
          </div>
          <div className="grid grid-cols-1 gap-3 max-h-[50vh] overflow-y-auto pr-2 custom-scrollbar">
            {clients.filter(c => c.farmName.toLowerCase().includes(searchTerm.toLowerCase())).map(client => (
              <button key={client.id} onClick={() => { setSelectedClient(client); setStep(2); }} className="w-full text-left p-6 rounded-[2rem] bg-white border border-slate-100 hover:border-zorion-900/30 flex justify-between items-center group transition-all shadow-sm active:scale-98">
                <div className="flex items-center gap-4">
                  <div className="h-12 w-12 rounded-2xl bg-slate-50 flex items-center justify-center group-hover:bg-zorion-900 group-hover:text-white transition-all"><Beef size={24} /></div>
                  <div>
                    <h3 className="font-black text-slate-900 text-lg italic tracking-tight uppercase leading-none">{client.farmName}</h3>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-1">{client.name}</p>
                  </div>
                </div>
                <ChevronRight className="text-slate-200 group-hover:text-zorion-900 transition-colors" />
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-48 animate-fade-in px-4">
      <div className="flex items-center gap-4">
        <button onClick={() => setStep(1)} className="p-3 bg-white rounded-2xl text-slate-400 border border-slate-100 shadow-sm active:scale-90 transition-all"><ArrowLeft size={24} /></button>
        <div>
          <h2 className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase leading-none">Relato Técnico</h2>
          <p className="text-sm text-zorion-600 font-black uppercase tracking-widest">{selectedClient?.farmName}</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2.8rem] shadow-xl border border-slate-100 space-y-8">
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest ml-2">Data e Hora da Visita</label>
            <input 
              type="datetime-local" 
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] font-bold text-slate-700 outline-none focus:border-zorion-900/10 transition-colors"
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest ml-2">Produto em Uso</label>
            <select 
              value={product}
              onChange={handleProductChange}
              className="w-full p-4 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] font-bold text-slate-700 outline-none focus:border-zorion-900/10 transition-colors bg-white"
            >
              <option value="">Nenhum Produto</option>
              {catalog.filter(c => c.type === 'product').map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
              <option value="NEW_PRODUCT" className="text-zorion-600 font-black">+ CADASTRAR NOVO PRODUTO</option>
            </select>
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest ml-2">Finalidade da Visita</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {['Nutrição', 'Sanitário', 'Reprodutivo', 'Geral', 'Entrega'].map(p => (
              <button key={p} onClick={() => setPurpose(p as any)} className={`py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border-2 ${purpose === p ? 'bg-zorion-900 text-white border-zorion-900 shadow-lg' : 'bg-slate-50 text-slate-400 border-transparent hover:border-slate-200'}`}>{p}</button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <label className="text-[10px] text-slate-400 font-black uppercase tracking-widest ml-2">Observações de Campo</label>
          <textarea value={transcript} onChange={(e) => setTranscript(e.target.value)} placeholder="O que foi observado hoje?" className="w-full h-48 p-6 bg-slate-50 rounded-[2.5rem] font-bold text-slate-700 outline-none resize-none border-2 border-transparent focus:border-zorion-900/10 shadow-inner" />
          <div className="flex gap-2">
            <button type="button" onClick={() => cameraInputRef.current?.click()} className="flex-1 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-purple-600 transition-all"><Camera size={24} /></button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="flex-1 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl flex items-center justify-center text-slate-400 hover:text-emerald-600 transition-all"><Paperclip size={24} /></button>
            <input type="file" multiple className="hidden" ref={fileInputRef} onChange={handleFileSelection} />
            <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileSelection} />
          </div>
          
          {selectedFiles.length > 0 && (
             <div className="grid grid-cols-4 gap-2 mt-4 p-4 bg-slate-50 rounded-[2rem] border border-dashed border-slate-200">
                {selectedFiles.map((f, i) => (
                    <div key={i} className="aspect-square relative rounded-xl overflow-hidden bg-white border border-slate-100 shadow-sm flex flex-col items-center justify-center p-2 group">
                        {f.type.startsWith('image/') ? (
                            <img src={URL.createObjectURL(f)} className="absolute inset-0 w-full h-full object-cover opacity-80" />
                        ) : (
                            <FileText size={20} className="text-slate-300" />
                        )}
                        <span className="absolute bottom-1 right-1 bg-zorion-500 text-white text-[7px] font-black px-1.5 rounded uppercase">Pendente</span>
                        <button onClick={() => setSelectedFiles(prev => prev.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"><X size={10}/></button>
                    </div>
                ))}
             </div>
          )}
        </div>

        <Button onClick={handleSubmitVisit} disabled={isSubmitting || (!transcript && selectedFiles.length === 0)} isLoading={isSubmitting} className="w-full py-5 rounded-[2rem] font-black uppercase text-sm shadow-2xl shadow-zorion-900/40">
           {isSubmitting ? 'ENVIANDO RELATÓRIO...' : 'CONFIRMAR REGISTRO TÉCNICO'}
        </Button>
      </div>
    </div>
  );
};

export default NewVisit;
