
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";

// CONFIGURAÇÃO DO FIREBASE - ZORION CRM (PRINCIPAL)
const firebaseConfig = {
  apiKey: "AIzaSyCqLGggNvvRPBAI3lFLenVyJtsHYU82eBc",
  authDomain: "zorion-crm.firebaseapp.com",
  projectId: "zorion-crm",
  storageBucket: "zorion-crm.firebasestorage.app",
  messagingSenderId: "752483977430",
  appId: "1:752483977430:web:d4aefc8660e4edf024a177",
  measurementId: "G-ZXYZR9VX7G"
};

// CONFIGURAÇÃO DO FIREBASE - ZORION ESTOQUE (SECUNDÁRIO)
// Dados fornecidos para sincronização
const configEstoqueZorion = {
  apiKey: "AIzaSyDXPP1lnN4S6sAfsdasJjk1Xf_Gri1Ez64",
  authDomain: "controle-de-estoque-zorion.firebaseapp.com",
  projectId: "controle-de-estoque-zorion",
  storageBucket: "controle-de-estoque-zorion.firebasestorage.app",
  messagingSenderId: "382935366156",
  appId: "1:382935366156:web:c407c54a6a42a0ef2e8c29"
};

// Inicialização Principal (CRM)
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);

// Analytics only on client side
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

// Inicialização Secundária (Estoque)
// O segundo parâmetro "estoqueZorionApp" é essencial para o Firebase gerenciar duas conexões ao mesmo tempo
const appEstoque = initializeApp(configEstoqueZorion, "estoqueZorionApp");
export const dbEstoque = getFirestore(appEstoque);

export default app;
