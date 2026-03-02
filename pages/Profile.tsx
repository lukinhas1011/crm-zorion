import React, { useState, useEffect } from 'react';
import { User } from '../types';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTIONS, prepareForSave } from '../services/dbSchema';
import { User as UserIcon, Phone, Mail, Save, Loader2 } from 'lucide-react';
import { Button } from '../components/Button';

interface ProfileProps {
  user: User;
  onUpdateUser: (updatedUser: User) => void;
}

const Profile: React.FC<ProfileProps> = ({ user, onUpdateUser }) => {
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone || '');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setName(user.name);
    setPhone(user.phone || '');
  }, [user]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updatedUser = { ...user, name, phone };
      await updateDoc(doc(db, COLLECTIONS.USERS, user.id), prepareForSave(updatedUser, false));
      onUpdateUser(updatedUser);
      alert('Perfil atualizado com sucesso!');
    } catch (error) {
      console.error("Erro ao atualizar perfil:", error);
      alert('Erro ao atualizar perfil.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black text-slate-900 italic tracking-tighter uppercase mb-2">Meu Perfil</h1>
        <p className="text-slate-500 font-medium">Gerencie suas informações pessoais e de contato.</p>
      </div>

      <div className="bg-white rounded-[2.5rem] p-8 shadow-xl shadow-slate-200/50 border border-slate-100">
        <div className="flex items-center gap-6 mb-8 pb-8 border-b border-slate-50">
          <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-zorion-500 to-zorion-700 text-white flex items-center justify-center text-4xl font-black shadow-lg shadow-zorion-500/30">
            {name.charAt(0)}
          </div>
          <div>
            <h2 className="text-xl font-black text-slate-900">{name}</h2>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{user.role}</p>
            <p className="text-xs text-slate-400 mt-1">{user.email}</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Nome Completo</label>
            <div className="relative group">
              <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-zorion-500 transition-colors" size={20} />
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-zorion-500 focus:bg-white transition-all shadow-inner"
                placeholder="Seu nome"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">WhatsApp (Integração)</label>
            <div className="relative group">
              <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors" size={20} />
              <input 
                type="tel" 
                value={phone} 
                onChange={e => setPhone(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-bold text-slate-700 outline-none focus:border-emerald-500 focus:bg-white transition-all shadow-inner"
                placeholder="5511999999999"
              />
            </div>
            <p className="text-[10px] text-slate-400 mt-2 ml-1 font-medium">
              * Digite apenas números com DDD e código do país (Ex: 5544998561614). Necessário para a integração funcionar.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Email (Login)</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
              <input 
                type="email" 
                value={user.email} 
                disabled
                className="w-full pl-12 pr-4 py-4 bg-slate-100 border border-slate-200 rounded-2xl text-sm font-bold text-slate-500 outline-none cursor-not-allowed opacity-70"
              />
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-50">
            <Button 
              onClick={handleSave} 
              isLoading={isSaving}
              className="w-full py-4 rounded-2xl font-black uppercase text-xs shadow-xl shadow-zorion-900/10 flex items-center justify-center gap-2 bg-zorion-900 hover:bg-zorion-800 text-white transition-all transform active:scale-[0.98]"
            >
              <Save size={18} /> Salvar Alterações
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Profile;
