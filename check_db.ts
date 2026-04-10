import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import * as fs from 'fs';

const firebaseConfig = {
  projectId: "zorion-crm",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function checkLogs() {
  console.log("Checking whatsapp_logs...");
  const logsQuery = query(collection(db, 'whatsapp_logs'), orderBy('receivedAt', 'desc'), limit(5));
  const logsSnap = await getDocs(logsQuery);
  logsSnap.forEach(doc => console.log(doc.id, doc.data()));

  console.log("\nChecking whatsapp_messages...");
  const msgQuery = query(collection(db, 'whatsapp_messages'), orderBy('receivedAt', 'desc'), limit(5));
  const msgSnap = await getDocs(msgQuery);
  msgSnap.forEach(doc => console.log(doc.id, doc.data()));
}

checkLogs().catch(console.error);
