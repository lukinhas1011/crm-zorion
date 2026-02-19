
import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Plus, Save, Trash2, Loader2, Pencil, Undo, LayoutList } from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTIONS, prepareForSave } from '../services/dbSchema';
import { Button } from '../components/Button';
import { User } from '../types';

type TabType = 'Brasil' | 'Argentina' | 'COMEX';
type RowType = 'data' | 'section';

interface TableRow {
  id: string; 
  type: RowType;
  data: string[];
}

const DEFAULT_HEADERS = ['Produto', 'Descrição', 'Unidade', 'Preço'];
const DEFAULT_ROWS: TableRow[] = [{ id: 'row_init', type: 'data', data: ['', '', '', ''] }];

const PriceTablePage: React.FC<{ user?: User }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<TabType>('Brasil');
  const [headers, setHeaders] = useState<string[]>(DEFAULT_HEADERS);
  const [rows, setRows] = useState<TableRow[]>(DEFAULT_ROWS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // REGRA ESTRITA: Apenas este usuário pode editar
  const canEdit = user && (user.email || '').trim().toLowerCase() === 'l.rigolin@zorionan.com';

  const getTableId = (tab: TabType) => {
    switch (tab) {
      case 'Brasil': return 'table_brasil';
      case 'Argentina': return 'table_argentina';
      case 'COMEX': return 'table_comex';
    }
  };

  const loadTable = async () => {
    setIsLoading(true);
    try {
      const docRef = doc(db, COLLECTIONS.PRICE_TABLES, getTableId(activeTab));
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        setHeaders(data.headers || DEFAULT_HEADERS);
        
        if (data.rows && Array.isArray(data.rows)) {
           const loadedRows = data.rows.map((r: any, idx: number) => {
               if (!r) return { id: `row_${idx}`, type: 'data', data: [] } as TableRow;
               if (Array.isArray(r)) return { id: `row_${idx}`, type: 'data', data: r } as TableRow;
               if (!r.type) return { id: `row_${idx}`, type: 'data', data: r.data || [] } as TableRow;
               return {
                   id: r.id || `row_${idx}`,
                   type: r.type as RowType,
                   data: r.data || []
               } as TableRow;
           });
           setRows(loadedRows.length > 0 ? loadedRows : DEFAULT_ROWS);
        } else {
           setRows(DEFAULT_ROWS);
        }
      } else {
        setHeaders(DEFAULT_HEADERS);
        setRows(DEFAULT_ROWS);
      }
    } catch (error) {
      console.error("Erro ao carregar tabela:", error);
      alert("Erro ao carregar dados da tabela.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTable();
    setIsEditing(false);
  }, [activeTab]);

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    try {
      const rowsToSave = rows.map(r => ({ type: r.type, data: r.data }));
      const tableData = {
        id: getTableId(activeTab),
        name: activeTab,
        headers,
        rows: rowsToSave,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, COLLECTIONS.PRICE_TABLES, tableData.id), prepareForSave(tableData, false));
      setIsEditing(false);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Erro ao salvar tabela.");
    } finally {
      setIsSaving(false);
    }
  };

  // Funções de Tabela
  const handleCancel = () => { setIsEditing(false); loadTable(); };
  const addColumn = () => { setHeaders([...headers, `Nova Coluna`]); setRows(rows.map(row => ({ ...row, data: [...row.data, ''] }))); };
  const updateHeader = (index: number, value: string) => { const newHeaders = [...headers]; newHeaders[index] = value; setHeaders(newHeaders); };
  const removeColumn = (index: number) => { if (headers.length <= 1) return; setHeaders(headers.filter((_, i) => i !== index)); setRows(rows.map(row => ({ ...row, data: row.data.filter((_, i) => i !== index) }))); };
  const addRow = () => { setRows([...rows, { id: `row_${Date.now()}`, type: 'data', data: new Array(headers.length).fill('') }]); };
  const addSection = () => { setRows([...rows, { id: `sec_${Date.now()}`, type: 'section', data: new Array(headers.length).fill('') }]); };
  const updateCell = (rowIndex: number, colIndex: number, value: string) => { const newRows = [...rows]; newRows[rowIndex] = { ...newRows[rowIndex], data: [...newRows[rowIndex].data] }; newRows[rowIndex].data[colIndex] = value; setRows(newRows); };
  const removeRow = (index: number) => { if (rows.length <= 1) { setRows([{ id: `row_${Date.now()}`, type: 'data', data: new Array(headers.length).fill('') }]); return; } setRows(rows.filter((_, i) => i !== index)); };

  return (
    <div className="flex flex-col h-[calc(100vh-64px)] md:h-screen bg-[#f4f7f9] overflow-hidden">
      {/* Header */}
      <div className="flex-none bg-white border-b px-6 py-4 flex justify-between items-center z-20">
         <div className="flex items-center gap-3">
             <FileSpreadsheet size={24} className="text-zorion-900" />
             <div>
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-800 italic">Tabela de Preços</h3>
                <p className="text-[10px] font-bold text-slate-400">Gestão de Valores Regionais</p>
             </div>
         </div>
         <div className="flex gap-2 items-center">
            
            {/* Botão de Editar visível apenas para o usuário específico */}
            {canEdit && !isEditing && (
                <Button onClick={() => setIsEditing(true)} className="bg-zorion-900 text-white px-6 py-2 rounded-xl font-black text-xs uppercase shadow-lg hover:bg-zorion-800">
                    <Pencil size={14} className="mr-2" /> Editar Tabela
                </Button>
            )}

            {isEditing && (
                <>
                    <Button onClick={addSection} className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl font-black text-xs uppercase shadow-sm border border-blue-100 hover:bg-blue-100">
                        <LayoutList size={14} className="mr-2" /> Nova Seção
                    </Button>
                    <Button onClick={addRow} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-black text-xs uppercase shadow-sm border border-slate-200 hover:bg-slate-200">
                        <Plus size={14} className="mr-2" /> Nova Linha
                    </Button>
                    <div className="h-8 w-px bg-slate-200 mx-1"></div>
                    <Button onClick={addColumn} className="bg-slate-100 text-slate-600 px-4 py-2 rounded-xl font-black text-xs uppercase shadow-sm border border-slate-200 hover:bg-slate-200">
                        <Plus size={14} className="mr-2" /> Coluna
                    </Button>
                    <div className="h-8 w-px bg-slate-200 mx-1"></div>
                    <Button onClick={handleCancel} variant="outline" className="px-4 py-2 rounded-xl font-black text-xs uppercase border-slate-200 text-slate-500">
                        <Undo size={14} className="mr-2" /> Cancelar
                    </Button>
                    <Button onClick={handleSave} isLoading={isSaving} className="bg-zorion-900 text-white px-6 py-2 rounded-xl font-black text-xs uppercase shadow-lg">
                        <Save size={14} className="mr-2" /> Salvar
                    </Button>
                </>
            )}
         </div>
      </div>

      {/* Tabs */}
      <div className="flex-none px-6 py-4 bg-slate-50 border-b border-slate-200 flex gap-2 overflow-x-auto">
        {(['Brasil', 'Argentina', 'COMEX'] as TabType[]).map(tab => (
            <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                disabled={isEditing} 
                className={`px-6 py-3 rounded-t-xl font-black text-xs uppercase tracking-widest transition-all border-b-2 ${
                    activeTab === tab 
                    ? `bg-white border-zorion-900 text-zorion-900 shadow-sm` 
                    : 'bg-transparent border-transparent text-slate-400 hover:bg-white/50 hover:text-slate-600'
                } ${isEditing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
                {tab === 'Argentina' ? '🇦🇷 Argentina' : tab === 'Brasil' ? '🇧🇷 Brasil' : '🌍 COMEX'}
            </button>
        ))}
      </div>

      {/* Grid Area */}
      <div className="flex-1 overflow-auto bg-white p-6 custom-scrollbar relative">
        {isLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
                <Loader2 className="animate-spin text-zorion-500" size={32} />
            </div>
        ) : (
            <div className="inline-block min-w-full border border-slate-200 rounded-lg overflow-hidden shadow-sm">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="w-10 px-2 py-3 text-center border-r border-slate-200 bg-slate-100 text-xs font-bold text-slate-400">#</th>
                            {headers.map((header, idx) => (
                                <th key={idx} className="px-1 py-1 text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-r border-slate-200 min-w-[150px] relative group bg-slate-50">
                                    {isEditing ? (
                                        <>
                                            <input 
                                                value={header} 
                                                onChange={(e) => updateHeader(idx, e.target.value)}
                                                className="w-full bg-white p-2 font-black text-slate-900 outline-none focus:ring-2 focus:ring-zorion-500/20 rounded border border-transparent focus:border-slate-300"
                                            />
                                            <button 
                                                onClick={() => removeColumn(idx)}
                                                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded"
                                                title="Remover Coluna"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </>
                                    ) : (
                                        <div className="p-2 font-black text-slate-700">{header}</div>
                                    )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                        {rows.map((row, rIdx) => (
                            <tr key={rIdx || rIdx} className={`transition-colors group ${row.type === 'section' ? 'bg-slate-100/50 hover:bg-slate-100' : 'hover:bg-slate-50/50'}`}>
                                <td className="px-2 py-2 text-center text-xs text-slate-400 font-mono border-r border-slate-200 relative bg-white">
                                    {rIdx + 1}
                                    {isEditing && (
                                        <button 
                                            onClick={() => removeRow(rIdx)}
                                            className="absolute left-0 top-0 bottom-0 w-full flex items-center justify-center bg-red-50 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                            title="Remover Linha"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </td>
                                {row.type === 'section' ? (
                                    <td colSpan={headers.length} className="p-0 border-r border-slate-200">
                                        {isEditing ? (
                                            <input 
                                                value={row.data[0] || ''}
                                                onChange={(e) => updateCell(rIdx, 0, e.target.value)}
                                                className="w-full h-full p-3 text-xs font-black uppercase tracking-widest text-zorion-900 bg-slate-50 outline-none focus:bg-blue-50 focus:ring-inset focus:ring-2 focus:ring-blue-500/20 transition-all text-center"
                                                placeholder="TÍTULO DA SEÇÃO..."
                                            />
                                        ) : (
                                            <div className="w-full h-full p-3 text-xs font-black uppercase tracking-widest text-zorion-900 bg-slate-50 min-h-[44px] flex items-center justify-center">
                                                {row.data[0]}
                                            </div>
                                        )}
                                    </td>
                                ) : (
                                    row.data.map((cell, cIdx) => (
                                        <td key={cIdx} className="px-0 py-0 border-r border-slate-200">
                                            {isEditing ? (
                                                <input 
                                                    value={cell}
                                                    onChange={(e) => updateCell(rIdx, cIdx, e.target.value)}
                                                    className="w-full h-full p-3 text-sm text-slate-900 bg-white outline-none focus:bg-blue-50 focus:ring-inset focus:ring-2 focus:ring-blue-500/20 transition-all"
                                                    placeholder="..."
                                                />
                                            ) : (
                                                <div className="w-full h-full p-3 text-sm text-slate-700 bg-white min-h-[44px] flex items-center">
                                                    {cell}
                                                </div>
                                            )}
                                        </td>
                                    ))
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
                
                {isEditing && (
                    <div className="p-4 border-t border-slate-200 bg-slate-50 text-center flex justify-center gap-4">
                        <button onClick={addRow} className="text-xs font-bold text-slate-400 hover:text-zorion-600 uppercase tracking-widest flex items-center gap-2">
                            <Plus size={14} /> Nova Linha
                        </button>
                        <span className="text-slate-300">|</span>
                        <button onClick={addSection} className="text-xs font-bold text-blue-400 hover:text-blue-600 uppercase tracking-widest flex items-center gap-2">
                            <LayoutList size={14} /> Nova Seção
                        </button>
                    </div>
                )}
            </div>
        )}
      </div>
    </div>
  );
};

export default PriceTablePage;
