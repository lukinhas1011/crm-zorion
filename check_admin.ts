import admin from 'firebase-admin';

admin.initializeApp({
  projectId: 'zorion-crm'
});

const db = admin.firestore();

async function check() {
  console.log("Checking whatsapp_batches...");
  const batchesSnap = await db.collection('whatsapp_batches').get();
  batchesSnap.forEach(doc => console.log(doc.id, doc.data()));

  console.log("\nChecking whatsapp_messages...");
  const msgSnap = await db.collection('whatsapp_messages').orderBy('receivedAt', 'desc').limit(5).get();
  msgSnap.forEach(doc => console.log(doc.id, doc.data()));

  console.log("\nChecking whatsapp_logs...");
  const logsSnap = await db.collection('whatsapp_logs').orderBy('receivedAt', 'desc').limit(5).get();
  logsSnap.forEach(doc => console.log(doc.id, doc.data()));
}

check().catch(console.error);
