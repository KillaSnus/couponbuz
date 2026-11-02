// 1) Firebase Console → Project settings → General → "Your apps" → Web app → copy the config here.
export const firebaseConfig = {
  apiKey: 'PASTE_API_KEY',
  authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
  projectId: 'PASTE_PROJECT_ID',
  storageBucket: 'PASTE_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PASTE_SENDER_ID',
  appId: 'PASTE_APP_ID',
};

// 2) The ONLY account allowed into the CMS (must match the email in firestore.rules and storage.rules).
export const ADMIN_EMAILS = ['ADMIN_EMAIL_HERE'];
