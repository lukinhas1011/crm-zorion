
import React, { useState } from 'react';
import { X, Plus, Trash2, Beef, Factory, MapPin } from 'lucide-react';
import { Client, Farm, Contact, User } from '../types';
import { Button } from './Button';
import { LocationPicker } from './LocationPicker';

interface ClientEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    client: Client;
    onSave: (updatedClient: Client) => void;
    allUsers: User[];
}

const STANDARD_ROLES = ['Gerente', 'Técnico', 'Vendedor', 'Consultor', 'Proprietário'];

export const ClientEditModal: React.FC<ClientEditModalProps> = ({ isOpen, onClose, client, onSave, allUsers }) => {
    const [editData, setEditData] = useState<Client>({ ...client });

    if (!isOpen) return null;

    const handleAddFarm = () => {
        const newFarm: Farm = {
            id: `farm_${Date.now()}`,
            name: '',
            location: { lat: 0, lng: 0, address: '' },
            herdSize: 0,
            lots: [],
            contacts: []
        };
        setEditData({ ...editData, farms: [...(editData.farms || []), newFarm] });
    };

    const handleRemoveFarm = (idx: number) => {
        const newFarms = (editData.farms || []).filter((_, i) => i !== idx);
        setEditData({ ...editData, farms: newFarms });
    };

    const handleUpdateFarm = (idx: number, updates: Partial<Farm>) => {
        const newFarms = [...(editData.farms || [])];
        newFarms[idx] = { ...newFarms[idx], ...updates };
        setEditData({ ...editData, farms: newFarms });
    };

    const handleAddContact = (farmIdx: number) => {
        const newContact: Contact = { id: `cont_${Date.now()}`, name: '', role: 'Gerente' };
        const newFarms = [...(editData.farms || [])];
        newFarms[farmIdx].contacts = [...(newFarms[farmIdx].contacts || []), newContact];
        setEditData({ ...editData, farms: newFarms });
    };

    const handleUpdateContact = (farmIdx: number, contactIdx: number, updates: Partial<Contact>) => {
        const newFarms = [...(editData.farms || [])];
        if (newFarms[farmIdx] && newFarms[farmIdx].contacts) {
            newFarms[farmIdx].contacts[contactIdx] = { ...newFarms[farmIdx].contacts[contactIdx], ...updates };
        }
        setEditData({ ...editData, farms: newFarms });
    };

    const handleRemoveContact = (farmIdx: number, contactIdx: number) => {
        const newFarms = [...(editData.farms || [])];
        if (newFarms[farmIdx] && newFarms[farmIdx].contacts) {
            newFarms[farmIdx].contacts = newFarms[farmIdx].contacts.filter((_, i) => i !== contactIdx);
        }
        setEditData({ ...editData, farms: newFarms });
    };

    const handleAddClientContact = () => {
        const newContact: Contact = { id: `cont_${Date.now()}`, name: '', role: 'Gerente' };
        setEditData({ ...editData, contacts: [...(editData.contacts || []), newContact] });
    };

    const handleUpdateClientContact = (contactIdx: number, updates: Partial<Contact>) => {
        const newContacts = [...(editData.contacts || [])];
        newContacts[contactIdx] = { ...newContacts[contactIdx], ...updates };
        setEditData({ ...editData, contacts: newContacts });
    };

    const handleRemoveClientContact = (contactIdx: number) => {
        const newContacts = (editData.contacts || []).filter((_, i) => i !== contactIdx);
        setEditData({ ...editData, contacts: newContacts });
    };

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-[2.5rem] w-full max-w-2xl p-8 shadow-2xl relative border border-slate-100 flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="text-2xl font-black text-slate-900 italic tracking-tighter uppercase">
                        {editData.id ? 'Editar Cadastro' : 'Novo Cadastro'}
                    </h3>
                    <button onClick={onClose} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:text-red-500 transition-colors"><X size={20} /></button>
                </div>
                
                <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tipo</label>
                            <div className="flex gap-2">
                                <button type="button" onClick={() => setEditData({...editData, type: 'Fazenda'})} className={`flex-1 py-3 rounded-2xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all ${editData.type === 'Fazenda' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}>
                                    <Beef size={16} /> CLIENTE
                                </button>
                                <button type="button" onClick={() => setEditData({...editData, type: 'Fábrica'})} className={`flex-1 py-3 rounded-2xl border-2 font-bold text-xs flex items-center justify-center gap-2 transition-all ${editData.type === 'Fábrica' ? 'bg-blue-50 border-blue-500 text-blue-700 shadow-md' : 'bg-white border-slate-100 text-slate-400'}`}>
                                    <Factory size={16} /> FÁBRICA
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Telefone Principal</label>
                            <input className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" placeholder="(00) 0000-0000" value={editData.phone} onChange={e => setEditData({...editData, phone: e.target.value})} />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome do Cliente / Fábrica</label>
                        <input required className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} placeholder="Ex: Grupo AgroBarra ou BioRação Industrial" />
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Responsável</label>
                        <select 
                            className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold text-sm outline-none focus:border-zorion-500"
                            value={editData.assignedTechnicianId || ''}
                            onChange={e => setEditData({...editData, assignedTechnicianId: e.target.value})}
                        >
                            <option value="">Selecione um responsável</option>
                            {(allUsers || []).map(u => (
                                <option key={u.id} value={u.id}>{u.name || u.email}</option>
                            ))}
                        </select>
                    </div>

                    {/* SEÇÃO DE RESPONSÁVEIS DO CLIENTE */}
                    <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between">
                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Responsáveis</label>
                            <button 
                                type="button" 
                                onClick={handleAddClientContact}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="text-[9px] font-black text-blue-600 hover:text-blue-700 flex items-center gap-1 uppercase tracking-widest relative z-10"
                            >
                                <Plus size={12} className="pointer-events-none" /> Adicionar Nomes
                            </button>
                        </div>

                        <div className="space-y-2">
                            {(editData.contacts || []).map((contact, contactIdx) => {
                                const isStandardRole = STANDARD_ROLES.includes(contact.role);
                                return (
                                    <div key={contact.id} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-slate-200">
                                        <input 
                                            className="flex-1 p-2 bg-slate-50 rounded-lg font-bold text-xs outline-none" 
                                            placeholder="Nome do Responsável"
                                            value={contact.name}
                                            onChange={e => handleUpdateClientContact(contactIdx, { name: e.target.value })}
                                        />
                                        {isStandardRole ? (
                                            <select 
                                                className="w-32 p-2 bg-slate-50 rounded-lg font-bold text-[10px] outline-none border-none"
                                                value={contact.role}
                                                onChange={e => {
                                                    if (e.target.value === 'Outro') {
                                                        handleUpdateClientContact(contactIdx, { role: '' });
                                                    } else {
                                                        handleUpdateClientContact(contactIdx, { role: e.target.value });
                                                    }
                                                }}
                                            >
                                                {STANDARD_ROLES.map(role => (
                                                    <option key={role} value={role}>{role}</option>
                                                ))}
                                                <option value="Outro">Outro...</option>
                                            </select>
                                        ) : (
                                            <div className="relative w-32">
                                                <input 
                                                    className="w-full p-2 bg-blue-50 text-blue-700 rounded-lg font-bold text-[10px] outline-none border-none"
                                                    placeholder="Qual cargo?"
                                                    value={contact.role}
                                                    autoFocus
                                                    onChange={e => handleUpdateClientContact(contactIdx, { role: e.target.value })}
                                                    onBlur={e => {
                                                        if (!e.target.value) handleUpdateClientContact(contactIdx, { role: 'Gerente' });
                                                    }}
                                                />
                                            </div>
                                        )}
                                        <button 
                                            type="button"
                                            onMouseDown={(e) => e.stopPropagation()}
                                            onClick={() => handleRemoveClientContact(contactIdx)}
                                            className="p-2 text-slate-300 hover:text-red-500"
                                        >
                                            <X size={14} className="pointer-events-none" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-black text-slate-900 uppercase tracking-widest">Fazendas / Unidades</label>
                            <button 
                                type="button" 
                                onClick={handleAddFarm}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="text-[10px] font-black text-emerald-600 hover:text-emerald-700 flex items-center gap-1 uppercase tracking-widest relative z-10"
                            >
                                <Plus size={14} className="pointer-events-none" /> Adicionar Fazenda
                            </button>
                        </div>

                        <div className="space-y-6">
                            {(editData.farms || []).map((farm, farmIdx) => (
                                <div key={farm.id} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 space-y-4 relative group">
                                    <button 
                                        type="button"
                                        onMouseDown={(e) => e.stopPropagation()}
                                        onClick={() => handleRemoveFarm(farmIdx)}
                                        className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 size={16} className="pointer-events-none" />
                                    </button>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nome da Fazenda</label>
                                            <input 
                                                required 
                                                className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-zorion-500" 
                                                value={farm.name} 
                                                onChange={e => handleUpdateFarm(farmIdx, { name: e.target.value })} 
                                                placeholder="Ex: Fazenda Santa Fé" 
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Rebanho / Capacidade</label>
                                            <input 
                                                type="number" 
                                                className="w-full p-3 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-zorion-500" 
                                                value={farm.herdSize} 
                                                onChange={e => handleUpdateFarm(farmIdx, { herdSize: Number(e.target.value) })} 
                                            />
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <LocationPicker 
                                            label="Localização da Fazenda"
                                            value={farm.location}
                                            onChange={(location) => handleUpdateFarm(farmIdx, { location })}
                                        />
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Responsáveis</label>
                                            <button 
                                                type="button" 
                                                onClick={() => handleAddContact(farmIdx)}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                className="text-[9px] font-black text-blue-600 hover:text-blue-700 flex items-center gap-1 uppercase tracking-widest relative z-10"
                                            >
                                                <Plus size={12} className="pointer-events-none" /> Adicionar Nomes
                                            </button>
                                        </div>

                                        <div className="space-y-2">
                                            {(farm.contacts || []).map((contact, contactIdx) => {
                                                const isStandardRole = STANDARD_ROLES.includes(contact.role);
                                                return (
                                                    <div key={contact.id} className="flex gap-2 items-center bg-white p-2 rounded-xl border border-slate-200">
                                                        <input 
                                                            className="flex-1 p-2 bg-slate-50 rounded-lg font-bold text-xs outline-none" 
                                                            placeholder="Nome do Responsável"
                                                            value={contact.name}
                                                            onChange={e => handleUpdateContact(farmIdx, contactIdx, { name: e.target.value })}
                                                        />
                                                        {isStandardRole ? (
                                                            <select 
                                                                className="w-32 p-2 bg-slate-50 rounded-lg font-bold text-[10px] outline-none border-none"
                                                                value={contact.role}
                                                                onChange={e => {
                                                                    if (e.target.value === 'Outro') {
                                                                        handleUpdateContact(farmIdx, contactIdx, { role: '' });
                                                                    } else {
                                                                        handleUpdateContact(farmIdx, contactIdx, { role: e.target.value });
                                                                    }
                                                                }}
                                                            >
                                                                {STANDARD_ROLES.map(role => (
                                                                    <option key={role} value={role}>{role}</option>
                                                                ))}
                                                                <option value="Outro">Outro...</option>
                                                            </select>
                                                        ) : (
                                                            <div className="relative w-32">
                                                                <input 
                                                                    className="w-full p-2 bg-blue-50 text-blue-700 rounded-lg font-bold text-[10px] outline-none border-none"
                                                                    placeholder="Qual cargo?"
                                                                    value={contact.role}
                                                                    autoFocus
                                                                    onChange={e => handleUpdateContact(farmIdx, contactIdx, { role: e.target.value })}
                                                                    onBlur={e => {
                                                                        if (!e.target.value) handleUpdateContact(farmIdx, contactIdx, { role: 'Gerente' });
                                                                    }}
                                                                />
                                                            </div>
                                                        )}
                                                        <button 
                                                            type="button"
                                                            onMouseDown={(e) => e.stopPropagation()}
                                                            onClick={() => handleRemoveContact(farmIdx, contactIdx)}
                                                            className="p-2 text-slate-300 hover:text-red-500"
                                                        >
                                                            <X size={14} className="pointer-events-none" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(!editData.farms || editData.farms.length === 0) && (
                                <div className="py-12 text-center border-2 border-dashed border-slate-100 rounded-[2.5rem] text-slate-400 text-xs font-bold uppercase flex flex-col items-center gap-2">
                                    <Building2 className="opacity-20" size={32} />
                                    Nenhuma fazenda adicionada.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex gap-3 pt-8 border-t border-slate-100 mt-6">
                    <Button onClick={onClose} variant="outline" className="flex-1 py-4 rounded-2xl text-xs font-black uppercase">Cancelar</Button>
                    <Button onClick={() => {
                        if (!editData.name) {
                            alert("O nome do cliente/fábrica é obrigatório.");
                            return;
                        }

                        let finalFarms = editData.farms || [];
                        if (finalFarms.length === 0) {
                            finalFarms = [{
                                id: `farm_${Date.now()}`,
                                name: editData.farmName || 'Fazenda Principal',
                                location: editData.location || { lat: 0, lng: 0, address: '' },
                                herdSize: editData.herdSize || 0,
                                treatedHerdSize: editData.treatedHerdSize || 0,
                                lots: editData.lots || [],
                                contacts: [{
                                    id: `cont_${Date.now()}`,
                                    name: editData.name,
                                    role: 'Proprietário'
                                }]
                            }];
                        }

                        const totalHerdSize = finalFarms.reduce((acc, farm) => acc + (farm.herdSize || 0), 0);
                        const totalTreatedHerdSize = finalFarms.reduce((acc, farm) => acc + (farm.treatedHerdSize || 0), 0);

                        const dataToSave = {
                            ...editData,
                            farmName: finalFarms[0]?.name || editData.farmName,
                            farms: finalFarms,
                            herdSize: totalHerdSize,
                            treatedHerdSize: totalTreatedHerdSize,
                            updatedAt: new Date().toISOString()
                        };

                        onSave(dataToSave);
                    }} className="flex-1 py-4 rounded-2xl text-xs font-black uppercase">Salvar Alterações</Button>
                </div>
            </div>
        </div>
    );
};

const Building2 = ({ size, className }: { size: number, className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
    </svg>
);
