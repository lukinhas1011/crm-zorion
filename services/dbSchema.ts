

export const COLLECTIONS = {
  USERS: 'users',
  CLIENTS: 'clients',
  VISITS: 'visits',
  CATALOG: 'catalog',
  PIPELINES: 'pipelines',
  STAGES: 'stages',
  DEALS: 'deals',
  ACTIVITIES: 'activities',
  LOGS: 'system_logs',
  PRICE_TABLES: 'price_tables',
  FEEDBACK: 'feedback',
  TODOS: 'todos',
} as const;

export const prepareForSave = (data: any, isNew: boolean = false) => {
  const cleanData = JSON.parse(JSON.stringify(data)); 
  delete cleanData.isEditing; 
  const timestamp = new Date().toISOString(); 
  
  if (isNew) {
    cleanData.createdAt = timestamp;
  } else {
    delete cleanData.createdAt; 
    // Nunca enviar o ID dentro do corpo do documento em updates
    delete cleanData.id;
  }
  
  cleanData.updatedAt = timestamp;
  return cleanData;
};