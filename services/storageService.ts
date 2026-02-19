import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import { storage, auth } from "./firebase";

/**
 * Faz o upload de qualquer arquivo de visita (Foto, Vídeo, PDF, Áudio).
 */
export const uploadVisitFile = async (
  file: File, 
  clientId: string, 
  visitId: string
): Promise<string> => {
  // Verificação preventiva de autenticação
  if (!auth.currentUser) {
    console.error("Storage Service: Tentativa de upload sem usuário autenticado.");
    throw new Error("Você precisa estar logado para enviar arquivos.");
  }

  try {
    const timestamp = Date.now();
    // Sanitiza o nome do arquivo removendo caracteres especiais problemáticos
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
    const path = `clients/${clientId}/visits/${visitId}/${timestamp}_${cleanFileName}`;
    
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    const downloadURL = await getDownloadURL(snapshot.ref);
    
    return downloadURL;
  } catch (error: any) {
    console.error("Erro detalhado no upload:", error);
    
    if (error.code === 'storage/unauthorized') {
      throw new Error("Permissão negada no Firebase Storage. Certifique-se de que as Regras de Storage no Console do Firebase permitem acesso (request.auth != null).");
    }
    
    throw error;
  }
};

/**
 * Faz upload de arquivos para relatórios de feedback/bugs
 */
export const uploadFeedbackFile = async (file: File): Promise<string> => {
  if (!auth.currentUser) throw new Error("Usuário não autenticado");

  try {
    const timestamp = Date.now();
    const cleanFileName = file.name.replace(/[^a-zA-Z0-9.]/g, "_");
    const path = `system_feedback/${auth.currentUser.uid}/${timestamp}_${cleanFileName}`;
    
    const storageRef = ref(storage, path);
    const snapshot = await uploadBytes(storageRef, file);
    return await getDownloadURL(snapshot.ref);
  } catch (error) {
    console.error("Erro upload feedback:", error);
    throw error;
  }
};

/**
 * Remove uma foto do Storage a partir da sua URL.
 */
export const deleteVisitPhoto = async (photoUrl: string): Promise<void> => {
  try {
    const decodeUrl = decodeURIComponent(photoUrl);
    const startIndex = decodeUrl.indexOf('/o/') + 3;
    const endIndex = decodeUrl.indexOf('?alt=media');
    
    if (startIndex > 2 && endIndex > startIndex) {
        const filePath = decodeUrl.substring(startIndex, endIndex);
        const storageRef = ref(storage, filePath);
        await deleteObject(storageRef);
    }
  } catch (error) {
    console.error("Erro ao deletar arquivo do Storage:", error);
  }
};