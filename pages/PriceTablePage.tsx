
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  FileSpreadsheet, Plus, Save, Trash2, Loader2, Pencil, Undo, LayoutList, 
  Palette, Type, GripVertical, GripHorizontal, ChevronDown, ChevronUp,
  MoreHorizontal
} from 'lucide-react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { COLLECTIONS, prepareForSave } from '../services/dbSchema';
import { Button } from '../components/Button';
import { User } from '../types';

// Dnd-kit imports
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

type TabType = 'Brasil' | 'Argentina' | 'COMEX';
type RowType = 'data' | 'section';

interface CellStyle {
  bg?: string;
  text?: string;
}

interface TableCell {
  value: string;
  style?: CellStyle;
}

interface TableRow {
  id: string; 
  type: RowType;
  cells: TableCell[];
}

interface ColumnHeader {
  id: string;
  label: string;
}

const DEFAULT_HEADERS: ColumnHeader[] = [
  { id: 'col_0', label: 'Produto' },
  { id: 'col_1', label: 'Descrição' },
  { id: 'col_2', label: 'Unidade' },
  { id: 'col_3', label: 'Preço' }
];

const createEmptyCells = (count: number): TableCell[] => 
  new Array(count).fill(null).map(() => ({ value: '' }));

const DEFAULT_ROWS: TableRow[] = [
  { id: 'row_init', type: 'data', cells: createEmptyCells(4) }
];

const SortableHeader = ({ id, label, index, isEditing, onUpdate, onRemove }: any) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <th 
      ref={setNodeRef} 
      style={style}
      className="px-1 py-1 text-left text-xs font-medium text-slate-500 uppercase tracking-wider border-r border-slate-200 min-w-[150px] relative group bg-slate-50"
    >
      <div className="flex items-center gap-1">
        {isEditing && (
          <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-slate-500">
            <GripHorizontal size={12} />
          </div>
        )}
        {isEditing ? (
          <div className="flex-1 relative">
            <input 
              value={label} 
              onChange={(e) => onUpdate(index, e.target.value)}
              className="w-full bg-white p-2 font-black text-slate-900 outline-none focus:ring-2 focus:ring-zorion-500/20 rounded border border-transparent focus:border-slate-300"
            />
            <button 
              onClick={() => onRemove(index)}
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1 text-red-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity bg-white/80 rounded"
              title="Remover Coluna"
            >
              <Trash2 size={12} />
            </button>
          </div>
        ) : (
          <div className="p-2 font-black text-slate-700">{label}</div>
        )}
      </div>
    </th>
  );
};

const SortableRow = ({ row, rIdx, headers, isEditing, onUpdateCell, onRemoveRow, onCellClick, selectedCells }: any) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr 
      ref={setNodeRef} 
      style={style}
      className={`transition-colors group ${row.type === 'section' ? 'bg-slate-100/50 hover:bg-slate-100' : 'hover:bg-slate-50/50'}`}
    >
      <td className="px-2 py-2 text-center text-xs text-slate-400 font-mono border-r border-slate-200 relative bg-white">
        <div className="flex flex-col items-center gap-1">
          {isEditing && (
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing p-1 text-slate-300 hover:text-slate-500">
              <GripVertical size={12} />
            </div>
          )}
          <span>{rIdx + 1}</span>
        </div>
        {isEditing && (
          <button 
            onClick={() => onRemoveRow(rIdx)}
            className="absolute left-0 top-0 bottom-0 w-1 flex items-center justify-center bg-red-50 text-red-500 opacity-0 group-hover:opacity-100 transition-opacity overflow-hidden hover:w-full"
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
              value={row.cells[0]?.value || ''}
              onChange={(e) => onUpdateCell(rIdx, 0, e.target.value)}
              className="w-full h-full p-3 text-xs font-black uppercase tracking-widest text-zorion-900 bg-slate-50 outline-none focus:bg-blue-50 focus:ring-inset focus:ring-2 focus:ring-blue-500/20 transition-all text-center"
              placeholder="TÍTULO DA SEÇÃO..."
            />
          ) : (
            <div className="w-full h-full p-3 text-xs font-black uppercase tracking-widest text-zorion-900 bg-slate-50 min-h-[44px] flex items-center justify-center">
              {row.cells[0]?.value}
            </div>
          )}
        </td>
      ) : (
        row.cells.map((cell: any, cIdx: number) => {
          const isSelected = selectedCells.has(`${rIdx}-${cIdx}`);
          return (
            <td 
              key={cIdx} 
              className={`px-0 py-0 border-r border-slate-200 relative ${isSelected ? 'ring-2 ring-zorion-500 ring-inset z-10' : ''}`}
              onClick={(e) => onCellClick(rIdx, cIdx, e)}
              style={{
                backgroundColor: cell.style?.bg || (isSelected ? '#e0f2fe' : undefined),
                color: cell.style?.text || undefined
              }}
            >
              {isEditing ? (
                <input 
                  value={cell.value}
                  onChange={(e) => onUpdateCell(rIdx, cIdx, e.target.value)}
                  className="w-full h-full p-3 text-sm bg-transparent outline-none focus:bg-blue-50/50 transition-all"
                  placeholder="..."
                  style={{ color: 'inherit' }}
                />
              ) : (
                <div className="w-full h-full p-3 text-sm min-h-[44px] flex items-center">
                  {cell.value}
                </div>
              )}
            </td>
          );
        })
      )}
    </tr>
  );
};

const ColorPicker = ({ onSelect, onClose, title }: any) => {
  const colors = [
    '#ffffff', '#f8fafc', '#f1f5f9', '#e2e8f0', '#cbd5e1', '#94a3b8', '#64748b', '#475569', '#334155', '#1e293b', '#0f172a',
    '#fee2e2', '#fecaca', '#fca5a5', '#f87171', '#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d',
    '#ffedd5', '#fed7aa', '#fdbb74', '#fb923c', '#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12',
    '#fef9c3', '#fef08a', '#fde047', '#facc15', '#eab308', '#ca8a04', '#a16207', '#854d0e', '#713f12',
    '#dcfce7', '#bbf7d0', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#15803d', '#166534', '#14532d',
    '#d1fae5', '#a7f3d0', '#6ee7b7', '#34d399', '#10b981', '#059669', '#047857', '#065f46', '#064e3b',
    '#e0f2fe', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#0284c7', '#0369a1', '#075985', '#0c4a6e',
    '#e0e7ff', '#c7d2fe', '#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81',
    '#f5f3ff', '#ede9fe', '#ddd6fe', '#c4b5fd', '#a78bfa', '#8b5cf6', '#7c3aed', '#6d28d9', '#5b21b6', '#4c1d95',
    '#fae8ff', '#f5d0fe', '#f0abfc', '#e879f9', '#d946ef', '#c026d3', '#a21caf', '#86198f', '#701a75',
  ];

  return (
    <div className="absolute z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 w-64 top-full mt-2 left-0 animate-in fade-in zoom-in duration-200">
      <div className="flex justify-between items-center mb-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><Plus size={14} className="rotate-45" /></button>
      </div>
      <div className="grid grid-cols-8 gap-1">
        {colors.map(c => (
          <button 
            key={c} 
            onClick={() => onSelect(c)}
            className="w-6 h-6 rounded-md border border-slate-100 hover:scale-110 transition-transform"
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-slate-100">
        <button 
          onClick={() => onSelect(undefined)}
          className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50 rounded-lg transition-colors"
        >
          Limpar Cor
        </button>
      </div>
    </div>
  );
};

const PriceTablePage: React.FC<{ user?: User }> = ({ user }) => {
  const [activeTab, setActiveTab] = useState<TabType>('Brasil');
  const [headers, setHeaders] = useState<ColumnHeader[]>(DEFAULT_HEADERS);
  const [rows, setRows] = useState<TableRow[]>(DEFAULT_ROWS);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [lastSelected, setLastSelected] = useState<{r: number, c: number} | null>(null);
  const [showColorPicker, setShowColorPicker] = useState<'bg' | 'text' | null>(null);

  // Dnd Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // REGRA ESTRITA: Apenas estes usuários podem editar
  const canEdit = user && (
    (user.email || '').trim().toLowerCase() === 'l.rigolim@zorionan.com' ||
    (user.email || '').trim().toLowerCase() === 'l.rigolim@zorion.com' ||
    user.id === 'MkccVyRleBRnwnFvpLkkvzHYSC83'
  );

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
        
        // Migrate headers
        let loadedHeaders: ColumnHeader[] = [];
        if (data.headers && Array.isArray(data.headers)) {
          loadedHeaders = data.headers.map((h: any, idx: number) => {
            if (typeof h === 'string') return { id: `col_${idx}`, label: h };
            return { id: h.id || `col_${idx}`, label: h.label || '' };
          });
        }
        setHeaders(loadedHeaders.length > 0 ? loadedHeaders : DEFAULT_HEADERS);
        
        // Migrate rows
        if (data.rows && Array.isArray(data.rows)) {
           const loadedRows = data.rows.map((r: any, idx: number) => {
               const id = r.id || `row_${idx}_${Date.now()}`;
               const type = (r.type || 'data') as RowType;
               let cells: TableCell[] = [];
               
               if (r.cells && Array.isArray(r.cells)) {
                 cells = r.cells.map((c: any) => ({
                   value: c.value || '',
                   style: c.style || {}
                 }));
               } else if (r.data && Array.isArray(r.data)) {
                 cells = r.data.map((v: any) => ({ value: String(v || '') }));
               } else if (Array.isArray(r)) {
                 cells = r.map((v: any) => ({ value: String(v || '') }));
               }
               
               return { id, type, cells } as TableRow;
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
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTable();
    setIsEditing(false);
    setSelectedCells(new Set());
  }, [activeTab]);

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    try {
      const tableData = {
        id: getTableId(activeTab),
        name: activeTab,
        headers,
        rows,
        updatedAt: new Date().toISOString()
      };
      await setDoc(doc(db, COLLECTIONS.PRICE_TABLES, tableData.id), prepareForSave(tableData, false));
      setIsEditing(false);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      alert("Erro ao salvar tabela.");
    } finally {
      setIsSaving(true); // Wait for reload
      await loadTable();
      setIsSaving(false);
    }
  };

  // Funções de Tabela
  const handleCancel = () => { setIsEditing(false); loadTable(); setSelectedCells(new Set()); };
  
  const addColumn = () => { 
    const newId = `col_${Date.now()}`;
    setHeaders([...headers, { id: newId, label: 'Nova Coluna' }]); 
    setRows(rows.map(row => ({ ...row, cells: [...row.cells, { value: '' }] }))); 
  };

  const updateHeader = (index: number, value: string) => { 
    const newHeaders = [...headers]; 
    newHeaders[index] = { ...newHeaders[index], label: value }; 
    setHeaders(newHeaders); 
  };

  const removeColumn = (index: number) => { 
    if (headers.length <= 1) return; 
    setHeaders(headers.filter((_, i) => i !== index)); 
    setRows(rows.map(row => ({ ...row, cells: row.cells.filter((_, i) => i !== index) }))); 
  };

  const addRow = () => { 
    setRows([...rows, { id: `row_${Date.now()}`, type: 'data', cells: createEmptyCells(headers.length) }]); 
  };

  const addSection = () => { 
    setRows([...rows, { id: `sec_${Date.now()}`, type: 'section', cells: createEmptyCells(headers.length) }]); 
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => { 
    const newRows = [...rows]; 
    newRows[rowIndex] = { ...newRows[rowIndex], cells: [...newRows[rowIndex].cells] }; 
    newRows[rowIndex].cells[colIndex] = { ...newRows[rowIndex].cells[colIndex], value }; 
    setRows(newRows); 
  };

  const removeRow = (index: number) => { 
    if (rows.length <= 1) { 
      setRows([{ id: `row_${Date.now()}`, type: 'data', cells: createEmptyCells(headers.length) }]); 
      return; 
    } 
    setRows(rows.filter((_, i) => i !== index)); 
  };

  // Selection Logic
  const handleCellClick = (r: number, c: number, e: React.MouseEvent) => {
    if (!isEditing) return;
    
    const key = `${r}-${c}`;
    const newSelected = new Set(selectedCells);

    if (e.shiftKey && lastSelected) {
      const startR = Math.min(lastSelected.r, r);
      const endR = Math.max(lastSelected.r, r);
      const startC = Math.min(lastSelected.c, c);
      const endC = Math.max(lastSelected.c, c);
      
      for (let i = startR; i <= endR; i++) {
        for (let j = startC; j <= endC; j++) {
          newSelected.add(`${i}-${j}`);
        }
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (newSelected.has(key)) newSelected.delete(key);
      else newSelected.add(key);
      setLastSelected({ r, c });
    } else {
      newSelected.clear();
      newSelected.add(key);
      setLastSelected({ r, c });
    }
    
    setSelectedCells(newSelected);
  };

  const applyStyleToSelected = (style: CellStyle) => {
    if (selectedCells.size === 0) return;
    const newRows = [...rows];
    selectedCells.forEach(key => {
      const [r, c] = key.split('-').map(Number);
      if (newRows[r]) {
        newRows[r] = { ...newRows[r], cells: [...newRows[r].cells] };
        newRows[r].cells[c] = { 
          ...newRows[r].cells[c], 
          style: { ...(newRows[r].cells[c].style || {}), ...style } 
        };
      }
    });
    setRows(newRows);
  };

  // Dnd Handlers
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeId = String(active.id);
    if (activeId.startsWith('col_')) {
      const oldIndex = headers.findIndex((h) => h.id === active.id);
      const newIndex = headers.findIndex((h) => h.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        setHeaders((items) => arrayMove(items, oldIndex, newIndex));
        setRows((items) => items.map(row => ({
          ...row,
          cells: arrayMove(row.cells, oldIndex, newIndex)
        })));
        setSelectedCells(new Set());
      }
    } else {
      const oldIndex = rows.findIndex((i) => i.id === active.id);
      const newIndex = rows.findIndex((i) => i.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        setRows((items) => arrayMove(items, oldIndex, newIndex));
        setSelectedCells(new Set());
      }
    }
  };



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
                    {/* Color Pickers */}
                    <div className="relative">
                      <Button 
                        onClick={() => setShowColorPicker(showColorPicker === 'bg' ? null : 'bg')} 
                        className="bg-white text-slate-600 px-4 py-2 rounded-xl font-black text-xs uppercase shadow-sm border border-slate-200 hover:bg-slate-50"
                        disabled={selectedCells.size === 0}
                      >
                        <Palette size={14} className="mr-2" /> Fundo
                      </Button>
                      {showColorPicker === 'bg' && (
                        <ColorPicker 
                          title="Cor de Fundo"
                          onSelect={(c: string) => { applyStyleToSelected({ bg: c }); setShowColorPicker(null); }}
                          onClose={() => setShowColorPicker(null)}
                        />
                      )}
                    </div>

                    <div className="relative">
                      <Button 
                        onClick={() => setShowColorPicker(showColorPicker === 'text' ? null : 'text')} 
                        className="bg-white text-slate-600 px-4 py-2 rounded-xl font-black text-xs uppercase shadow-sm border border-slate-200 hover:bg-slate-50"
                        disabled={selectedCells.size === 0}
                      >
                        <Type size={14} className="mr-2" /> Texto
                      </Button>
                      {showColorPicker === 'text' && (
                        <ColorPicker 
                          title="Cor do Texto"
                          onSelect={(c: string) => { applyStyleToSelected({ text: c }); setShowColorPicker(null); }}
                          onClose={() => setShowColorPicker(null)}
                        />
                      )}
                    </div>
                    
                    <div className="h-8 w-px bg-slate-200 mx-1"></div>

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
                <DndContext 
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50 sticky top-0 z-10 shadow-sm">
                      <SortableContext items={headers.map(h => h.id)} strategy={horizontalListSortingStrategy}>
                        <tr>
                          <th className="w-10 px-2 py-3 text-center border-r border-slate-200 bg-slate-100 text-xs font-bold text-slate-400">#</th>
                          {headers.map((header, idx) => (
                            <SortableHeader 
                              key={header.id}
                              id={header.id}
                              label={header.label}
                              index={idx}
                              isEditing={isEditing}
                              onUpdate={updateHeader}
                              onRemove={removeColumn}
                            />
                          ))}
                        </tr>
                      </SortableContext>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      <SortableContext items={rows.map(r => r.id)} strategy={verticalListSortingStrategy}>
                        {rows.map((row, rIdx) => (
                          <SortableRow 
                            key={row.id}
                            row={row}
                            rIdx={rIdx}
                            headers={headers}
                            isEditing={isEditing}
                            onUpdateCell={updateCell}
                            onRemoveRow={removeRow}
                            onCellClick={handleCellClick}
                            selectedCells={selectedCells}
                          />
                        ))}
                      </SortableContext>
                    </tbody>
                  </table>
                </DndContext>
                
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
