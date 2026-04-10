
// Base interface for all database documents to ensure audit trails
export interface BaseDocument {
  id: string;
  createdAt?: string; 
  updatedAt?: string;
  customAttributes?: Record<string, any>; 
}

export type Language = 'pt-BR' | 'es';
export type Translator = (key: string) => string;

export interface User extends BaseDocument {
  name: string;
  email?: string;
  phone?: string; // Adicionado para integração WhatsApp
  role: 'Veterinário' | 'Técnico' | 'Admin' | 'Engenheiro Agrônomo';
  active: boolean;
  password?: string;
}

export interface ClientLocation {
  lat: number;
  lng: number;
  address?: string;
  city?: string;
  state?: string;
}

export interface Lot {
  id: string;
  name: string;
  product?: string;
  animals: number;
  description?: string;
}

export interface Contact {
  id: string;
  name: string;
  role: string; // Gerente, Técnico, Vendedor, Proprietário, etc.
  phone?: string;
  email?: string;
}

export interface Farm {
  id: string;
  name: string;
  location: ClientLocation;
  herdSize: number;
  treatedHerdSize?: number;
  lots: Lot[];
  contacts: Contact[];
}

export interface Client extends BaseDocument {
  type: 'Fazenda' | 'Fábrica';
  name: string; // Nome do Cliente/Fábrica (Entidade Principal)
  contacts: Contact[];
  farms: Farm[];
  phone: string;
  email?: string;
  location: ClientLocation;
  herdSize: number; 
  treatedHerdSize?: number;
  lots: Lot[]; 
  lastVisitDate?: string;
  assignedTechnicianId?: string; // Mantido para compatibilidade (Gestor Principal)
  assignedTechnicianIds?: string[]; // Novo campo: Lista de acesso múltiplo
  status?: 'Ativo' | 'Inativo' | 'Prospect';
  // Campo legado para compatibilidade
  farmName: string; 
}

export interface Pipeline extends BaseDocument {
  name: string;
  order: number;
  isActive: boolean;
}

export interface Stage extends BaseDocument {
  pipelineId: string;
  name: string;
  order: number;
  probability: number; 
  rottingDays?: number; 
}

export interface DealProduct {
  productId: string;
  name: string;
  quantity: number;
  price: number;
  taxPercent: number;
}

export interface Deal extends BaseDocument {
  title: string;
  clientId: string;
  farmId?: string;
  contactIds?: string[];
  contactNames?: string[];
  clientName: string; 
  farmName: string;   
  pipelineId: string;
  stageId: string;
  value: number;
  currency: string;
  status: 'Open' | 'Won' | 'Lost';
  expectedCloseDate?: string;
  creatorId: string;
  creatorName: string;
  products: DealProduct[];
  lastStageChangeDate: string;
  description?: string;
  // Novos campos Pipedrive
  label?: string;
  probability?: number;
  ownerName: string;
  originChannel?: string;
  originChannelId?: string;
  visibility: 'Owner' | 'Team' | 'Company';
  attachments?: Attachment[];
  orgDetails?: {
    phone?: string;
    email?: string;
    companyName?: string;
    industryType?: string;
    plantContact?: string;
    contactPhone?: string;
  };
  feedFormula?: string;
}

export interface Attachment {
  id: string;
  url: string;
  type: 'image' | 'video' | 'document' | 'audio';
  name: string;
  size?: number;
}

export interface WhatsAppMessage extends BaseDocument {
  phone: string;
  receiverPhone?: string; // The phone number of the account that received the message
  text: string;
  mediaUrl?: string;
  mediaUrls?: { url: string; type: string }[];
  mediaType?: 'image' | 'video' | 'audio' | 'document';
  status: 'pending' | 'processed' | 'ignored';
  receivedAt: string;
  senderName?: string;
  linkedClientId?: string;
  linkedActivityId?: string;
  aiProcessedData?: any; // Dados processados pela IA para não gastar tokens novamente
}

export interface Activity extends BaseDocument {
  dealId?: string; // Opcional, pode ser atividade solta no cliente
  clientId: string;
  type: 'Call' | 'Meeting' | 'Email' | 'Task' | 'Whatsapp';
  title: string;
  description?: string; // Detalhes da interação
  dueDate: string;
  isDone: boolean;
  technicianId: string;
  createdAt: string;
  attachments?: Attachment[]; // Added to support file persistence
}

export interface Visit extends BaseDocument {
  clientId: string;
  farmId?: string;
  contactId?: string;
  contactName?: string;
  dealId?: string; // Vinculo com oportunidade específica
  technicianId: string;
  technicianName: string;
  date: string;
  isAllDay?: boolean;
  status: 'Agendada' | 'Concluída' | 'Cancelada';
  purpose: 'Nutrição' | 'Sanitário' | 'Reprodutivo' | 'Geral' | 'Entrega de Ração' | 'Manutenção Industrial';
  lot?: string;
  lotId?: string;
  product?: string;
  transcript?: string;
  aiSummary?: string;
  photos?: string[]; // Mantido para retrocompatibilidade
  attachments?: Attachment[]; // Novo campo para arquivos diversos
  metrics?: Record<string, number | string>; 
}

export interface CatalogItem extends BaseDocument {
  type: 'product' | 'ingredient';
  name: string;
  active: boolean;
  properties: Record<string, any>; 
}

export interface DietRequirement {
  animalWeight: number;
  targetGain: number;
  breed: string;
}

export interface Ingredient {
  id: string;
  name: string;
  dryMatter: number;
  protein: number;
  energy: number;
  costPerKg: number;
}

export interface DietRecommendation {
  summary: string;
  ingredients: { name: string; amountKg: number; cost: number; }[];
  totalCost: number;
  nutritionalAnalysis: { protein: string; energy: string; fiber: string; };
}

// Estrutura para a Tabela de Preços (Excel-like)
export interface PriceTableData extends BaseDocument {
  name: string; // 'Brasil', 'Argentina', 'COMEX'
  headers: string[]; // Nomes das colunas
  rows: string[][]; // Matriz de dados (linhas x colunas)
}

// Estrutura para Feedback/Bugs
export interface Feedback extends BaseDocument {
  type: 'Bug' | 'Melhoria';
  description: string;
  userId: string;
  userName: string;
  userEmail: string;
  attachments: Attachment[];
  status: 'Pendente' | 'Em Análise' | 'Resolvido';
  pageContext?: string;
}

export interface Todo extends BaseDocument {
  userId: string; // The user assigned to the task
  userName: string; // Name of the user assigned
  text: string;
  isDone: boolean;
  dueDate?: string; // ISO Date string
  creatorId?: string; // ID of the user who created the task
}