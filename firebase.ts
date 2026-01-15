
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Standard modular Firebase v9+ initialization
const firebaseConfig = {
  apiKey: "AIzaSyBWFTMqPjCkFv85I5lvPq2O4UXDzukIRSE",
  authDomain: "c2-bd-financeiro.firebaseapp.com",
  projectId: "c2-bd-financeiro",
  storageBucket: "c2-bd-financeiro.firebasestorage.app",
  messagingSenderId: "375575228838",
  appId: "1:375575228838:web:513ebee7add2ea9870df67"
};

// Initialize Firebase app instance with the configuration
const app = initializeApp(firebaseConfig);

// Export Firestore database instance for use throughout the application
export const db = getFirestore(app);
