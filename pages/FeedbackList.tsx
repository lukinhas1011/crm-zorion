
import React, { useState, useEffect } from 'react';
import { Feedback } from '../types';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTIONS } from '../services/dbSchema';
import { 
  Bug, Lightbulb, CheckCircle2, Circle, Trash2, 
  User, Calendar, Image as ImageIcon, ExternalLink, X,
  MessageSquare, LayoutDashboard, Loader2
} from 'lucide-react';

const FeedbackList: React.FC = () => {
  const [feedbacks, setFeedbacks] = useState<Feedback[]>([]);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  // States para exclusão
  const [feedbackToDelete, setFeedbackToDelete] = useState<Feedback | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const q = query(collection(db, COLLECTIONS.FEEDBACK), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Feedback));
      setFeedbacks(data);
    });
    return () => unsubscribe();
  }, []);

  const toggleStatus = async (item: Feedback) => {
    const newStatus = item.status === 'Resolvido' ? 'Pendente' : 'Resolvido';
    const ref = doc(db, COLLECTIONS.FEEDBACK, item.id);
    await updateDoc(ref, { status: newStatus, updatedAt: new Date().toISOString() });
  };

  const handleConfirmDelete = async () => {
    if (!feedbackToDelete) return;
    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, COLLECTIONS.FEEDBACK, feedbackToDelete.id));
      setFeedbackToDelete(null);
    } catch (error) {
      console.error("Erro ao excluir:", error);
      alert("Erro ao excluir o relato.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex items-center gap-4">
        <div className="h-12 w-12 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center">
            <MessageSquare size={24} />
        </div>
        <div>
            <h2 className="text-2xl font-black text-slate-900 italic tracking-tighter">Gestão de Feedback</h2>
            <p className="text-sm text-slate-500 font-medium">Bugs reportados e sugestões de melhoria</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {feedbacks.length === 0 ? (
            <div className="p-12 text-center bg-white rounded-[2rem] border border-slate-100 shadow-sm">
                <LayoutDashboard className="mx-auto h-12 w-12 text-slate-300 mb-4" />
                <p className="text-slate-400 font-black uppercase text-xs tracking-widest">Nenhum feedback registrado ainda.</p>
            </div>
        ) : (
            feedbacks.map(item => (
                <div key={item.id} className={`bg-white p-6 rounded-[2rem] border shadow-sm transition-all ${item.status === 'Resolvido' ? 'border-slate-100 opacity-70' : 'border-slate-200 hover:shadow-md'}`}>
                    <div className="flex flex-col md:flex-row gap-6">
                        {/* Coluna Status e Tipo */}
                        <div className="flex md:flex-col items-center md:items-start gap-4 md:w-32 shrink-0">
                            <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 ${item.type === 'Bug' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                {item.type === 'Bug' ? <Bug size={24} /> : <Lightbulb size={24} />}
                            </div>
                            <button 
                                onClick={() => toggleStatus(item)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border transition-all w-full justify-center ${
                                    item.status === 'Resolvido' 
                                    ? 'bg-slate-100 text-slate-500 border-slate-200' 
                                    : 'bg-white text-zorion-600 border-zorion-200 hover:bg-zorion-50'
                                }`}
                            >
                                {item.status === 'Resolvido' ? <CheckCircle2 size={12}/> : <Circle size={12}/>}
                                {item.status}
                            </button>
                        </div>

                        {/* Coluna Conteúdo */}
                        <div className="flex-1 space-y-3">
                            <div className="flex justify-between items-start">
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm mb-1">{item.type.toUpperCase()}</h4>
                                    <p className="text-slate-600 text-sm leading-relaxed whitespace-pre-wrap">{item.description}</p>
                                </div>
                                <button onClick={() => setFeedbackToDelete(item)} className="text-slate-300 hover:text-red-500 transition-colors p-2">
                                    <Trash2 size={16} />
                                </button>
                            </div>

                            {/* Anexos */}
                            {item.attachments && item.attachments.length > 0 && (
                                <div className="flex gap-2 overflow-x-auto py-2">
                                    {item.attachments.map((att, idx) => (
                                        <div key={idx} className="relative group cursor-pointer" onClick={() => setSelectedImage(att.url)}>
                                            <div className="h-16 w-16 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden">
                                                <img src={att.url} alt="print" className="h-full w-full object-cover" />
                                            </div>
                                            <div className="absolute inset-0 bg-black/40 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <ExternalLink className="text-white h-4 w-4" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Rodapé do Card */}
                            <div className="flex flex-wrap gap-4 pt-3 border-t border-slate-50 text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                                <span className="flex items-center gap-1"><User size={12}/> {item.userName} ({item.userEmail})</span>
                                <span className="flex items-center gap-1"><Calendar size={12}/> {new Date(item.createdAt || '').toLocaleString()}</span>
                                {item.pageContext && <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-500">Página: {item.pageContext}</span>}
                            </div>
                        </div>
                    </div>
                </div>
            ))
        )}
      </div>

      {/* Modal de Visualização de Imagem */}
      {selectedImage && (
        <div className="fixed inset-0 z-[2000] bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedImage(null)}>
            <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2">
                <X size={32} />
            </button>
            <img src={selectedImage} alt="Feedback Full" className="max-w-full max-h-full rounded-lg shadow-2xl" />
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {feedbackToDelete && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-sm p-8 shadow-2xl relative border border-slate-100 flex flex-col items-center text-center">
                <div className="h-20 w-20 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-6 border border-red-100">
                    <Trash2 size={40} />
                </div>
                <h3 className="text-xl font-black text-slate-900 mb-2 italic tracking-tighter">Excluir Relato?</h3>
                <p className="text-sm text-slate-500 mb-8 font-medium">
                    Você tem certeza que deseja excluir este feedback? Esta ação não pode ser desfeita.
                </p>
                <div className="flex gap-3 w-full">
                    <button 
                        onClick={() => setFeedbackToDelete(null)} 
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
    </div>
  );
};

export default FeedbackList;
