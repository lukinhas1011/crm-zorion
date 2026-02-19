
import { collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { COLLECTIONS } from './dbSchema';
import { Visit, Client, Deal, Activity, User } from '../types';

// Helper para baixar arquivos no navegador
const downloadFile = (content: string, fileName: string, contentType: string) => {
  const a = document.createElement("a");
  const file = new Blob([content], { type: contentType });
  a.href = URL.createObjectURL(file);
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(a.href);
};

// Helper para formatar campos CSV corretamente
const escapeCsv = (value: any): string => {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  const escaped = stringValue.replace(/"/g, '""'); 
  return `"${escaped}"`; 
};

// Helper para formatar data e hora
const formatDateTime = (isoString: string) => {
  if (!isoString) return { date: '', time: '' };
  const d = new Date(isoString);
  return {
    date: d.toLocaleDateString('pt-BR'),
    time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  };
};

// --- BACKUP TÉCNICO (JSON) ---
export const generateSystemBackup = async () => {
  const backupData: Record<string, any> = {
    version: "1.2",
    timestamp: new Date().toISOString(),
    collections: {}
  };

  const collectionsToBackup = [
    COLLECTIONS.CLIENTS,
    COLLECTIONS.VISITS,
    COLLECTIONS.DEALS,
    COLLECTIONS.ACTIVITIES,
    COLLECTIONS.USERS,
    COLLECTIONS.CATALOG,
    COLLECTIONS.PIPELINES,
    COLLECTIONS.STAGES
  ];

  for (const colName of collectionsToBackup) {
    const snap = await getDocs(collection(db, colName));
    backupData.collections[colName] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  const jsonString = JSON.stringify(backupData, null, 2);
  downloadFile(jsonString, `zorion_backup_full_${new Date().toISOString().split('T')[0]}.json`, 'application/json');
};

// --- RELATÓRIO HUMANO (CSV/EXCEL) ---
export const generateHumanReport = async () => {
  // 1. Buscar TODOS os dados necessários
  const clientsSnap = await getDocs(collection(db, COLLECTIONS.CLIENTS));
  const visitsSnap = await getDocs(collection(db, COLLECTIONS.VISITS));
  const dealsSnap = await getDocs(collection(db, COLLECTIONS.DEALS));
  const activitiesSnap = await getDocs(collection(db, COLLECTIONS.ACTIVITIES));
  const usersSnap = await getDocs(collection(db, COLLECTIONS.USERS));

  const clients = clientsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Client));
  const visits = visitsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Visit));
  const deals = dealsSnap.docs.map(d => ({ id: d.id, ...d.data() } as Deal));
  const activities = activitiesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Activity));
  const users = usersSnap.docs.map(d => ({ id: d.id, ...d.data() } as User));

  // Mapa de Usuários para acesso rápido ao nome pelo ID
  const userMap = new Map<string, string>();
  users.forEach(u => userMap.set(u.id, u.name || u.email || 'Usuário Desconhecido'));

  // Mapa de Deals para saber de qual Negócio/Card veio a atividade
  const dealMap = new Map<string, string>();
  deals.forEach(d => dealMap.set(d.id, d.title));

  // --- CSV 1: HISTÓRICO GLOBAL (VISITAS + ATIVIDADES CRM) ---
  let csvHistory = "\uFEFF"; 
  csvHistory += "Data;Hora;Tipo de Registro;Status;Cliente;Fazenda;Responsável (Funcionário);Origem (Oportunidade/Card);Produto;Lote/Setor;Descrição / Relato;Links dos Arquivos (Fotos/Vídeos/Docs)\n";

  // Lista unificada para processamento
  const combinedHistory: any[] = [];

  // A. Processar Visitas
  visits.forEach(v => {
    combinedHistory.push({
      sortDate: v.date,
      type: 'VISITA TÉCNICA',
      subType: v.purpose,
      status: v.status,
      clientId: v.clientId,
      dealId: v.dealId,
      technicianName: v.technicianName, // Visita já tem o nome gravado
      product: v.product,
      lot: v.lot,
      description: v.transcript ? `${v.transcript} \n[Resumo IA]: ${v.aiSummary || ''}` : v.aiSummary || '',
      attachments: v.attachments,
      photos: v.photos // Legado
    });
  });

  // B. Processar Atividades CRM (Calls, WhatsApp, etc)
  activities.forEach(a => {
    const techName = userMap.get(a.technicianId) || 'Não identificado';
    combinedHistory.push({
      sortDate: a.dueDate,
      type: 'INTERAÇÃO CRM',
      subType: a.type, // Call, Meeting, etc.
      status: a.isDone ? 'Concluída' : 'Pendente',
      clientId: a.clientId,
      dealId: a.dealId,
      technicianName: techName,
      product: '-', 
      lot: '-',
      description: a.description || `Título: ${a.title}`,
      attachments: a.attachments,
      photos: [] // Atividades não usam o campo photos legado
    });
  });

  // Ordenar por data (mais recente primeiro)
  combinedHistory.sort((a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime());

  // Gerar linhas do CSV
  combinedHistory.forEach(item => {
    const client = clients.find(c => c.id === item.clientId);
    const { date, time } = formatDateTime(item.sortDate);
    const dealTitle = item.dealId ? (dealMap.get(item.dealId) || 'Card Excluído') : '-';
    const finalType = item.type === 'VISITA TÉCNICA' ? `VISITA (${item.subType})` : `CRM (${item.subType})`;

    // Geração de Links (Unificada)
    let linksList: string[] = [];
    
    // Anexos Novos
    if (item.attachments && Array.isArray(item.attachments)) {
        item.attachments.forEach((att: any) => {
            if (att.url) {
                const type = (att.type || 'ARQ').toUpperCase();
                const name = att.name || 'Arquivo';
                linksList.push(`${att.url}  ([${type}] ${name})`);
            }
        });
    }
    // Fotos Legado (apenas visitas antigas)
    if (item.photos && Array.isArray(item.photos)) {
        item.photos.forEach((url: string, idx: number) => {
            if (url) linksList.push(`${url}  (Foto Legado ${idx + 1})`);
        });
    }

    const linksString = linksList.length > 0 ? linksList.join('\n') : "Sem anexos";

    csvHistory += [
        escapeCsv(date),
        escapeCsv(time),
        escapeCsv(finalType),
        escapeCsv(item.status),
        escapeCsv(client?.name || 'Cliente Removido'),
        escapeCsv(client?.farmName || 'Fazenda Removida'),
        escapeCsv(item.technicianName),
        escapeCsv(dealTitle),
        escapeCsv(item.product || '-'),
        escapeCsv(item.lot || '-'),
        escapeCsv(item.description),
        escapeCsv(linksString)
    ].join(';') + "\n";
  });

  downloadFile(csvHistory, `zorion_historico_completo_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');

  // --- CSV 2: RELATÓRIO DE CLIENTES E OPORTUNIDADES ---
  let csvClients = "\uFEFF";
  csvClients += "Cliente;Fazenda;Localização;Telefone;Email;Rebanho;Negócios Ativos ($);Etapa Comercial Atual\n";

  clients.forEach(c => {
    const cDeals = deals.filter(d => d.clientId === c.id && d.status === 'Open');
    const totalValue = cDeals.reduce((acc, curr) => acc + curr.value, 0);
    // Pega os nomes dos estágios/títulos das oportunidades ativas
    const stages = cDeals.map(d => d.title).join(' | '); 

    csvClients += [
        escapeCsv(c.name),
        escapeCsv(c.farmName),
        escapeCsv(c.location?.address || ''),
        escapeCsv(c.phone || ''),
        escapeCsv(c.email || ''),
        escapeCsv(c.herdSize),
        escapeCsv(totalValue),
        escapeCsv(stages || 'Sem oportunidades ativas')
    ].join(';') + "\n";
  });

  // Delay para o segundo download
  setTimeout(() => {
    downloadFile(csvClients, `zorion_clientes_oportunidades_${new Date().toISOString().split('T')[0]}.csv`, 'text/csv;charset=utf-8;');
  }, 1000);
};
