import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, set, get, update, remove, push, query, orderByChild, equalTo, onValue, off } from "firebase/database";
import { getAnalytics } from "firebase/analytics";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "firebase/storage";
import { activeYear, yearPath } from './showYear';

// Primary Firebase (Show Management)
const firebaseConfig = {
  apiKey: "AIzaSyCxOWHjnnyjILF_zZFC0gVha9rx8nrpGwE",
  authDomain: "snowyrivercaravanshow.firebaseapp.com",
  databaseURL: "https://snowyrivercaravanshow-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "snowyrivercaravanshow",
  storageBucket: "snowyrivercaravanshow.firebasestorage.app",
  messagingSenderId: "694283393601",
  appId: "1:694283393601:web:7881e6874d48a689c7c4c0",
  measurementId: "G-30FVX1JBT8"
};

// Secondary Firebase (Scheduling)
const schedulingFirebaseConfig = {
  apiKey: "AIzaSyBcczqGj5X1_w9aCX1lOK4-kgz49Oi03Bg",
  authDomain: "scheduling-dd672.firebaseapp.com",
  databaseURL: "https://scheduling-dd672-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "scheduling-dd672",
  storageBucket: "scheduling-dd672.firebasestorage.app",
  messagingSenderId: "432092773012",
  appId: "1:432092773012:web:ebc7203ea570b0da2ad281"
};

const app = initializeApp(firebaseConfig);
const schedulingApp = initializeApp(schedulingFirebaseConfig, "scheduling");

export const auth = getAuth(app);
export const database = getDatabase(app);
export const schedulingDatabase = getDatabase(schedulingApp);
export const analytics = getAnalytics(app);
export const storage = getStorage(app);

// Database helper functions for primary Firebase
export const dbRef = (path: string) => ref(database, yearPath(path));

export const dbSet = (path: string, data: Record<string, unknown>) => set(dbRef(path), data);

export const dbGet = async (path: string) => {
  const snapshot = await get(dbRef(path));
  return snapshot.exists() ? snapshot.val() : null;
};

// Read-only source for the temporary name list in the 2027 Finance Result view.
export const dbGet2026ShowsForFinanceTemplate = async () => {
  if (activeYear !== 2027) throw new Error('Name templates are available only for 2027.');
  const snapshot = await get(ref(database, 'shows'));
  return snapshot.exists() ? snapshot.val() : null;
};

export const dbSubscribe = (path: string, callback: (value: unknown) => void) => {
  const reference = dbRef(path);
  onValue(reference, (snapshot) => callback(snapshot.exists() ? snapshot.val() : null));
  return () => off(reference);
};

export const dbUpdate = (path: string, data: Record<string, unknown>) => update(dbRef(path), data);

export const dbRemove = (path: string) => remove(dbRef(path));

export const dbPush = (path: string, data: Record<string, unknown>) => {
  const newRef = push(dbRef(path));
  return set(newRef, data).then(() => newRef.key);
};

export const dbQuery = (path: string, orderBy: string, equalToValue: string | number | boolean) => {
  return query(dbRef(path), orderByChild(orderBy), equalTo(equalToValue));
};

// The import is a single atomic update, restricted to the 2027 business tree.
export const dbImport2027 = (updates: Record<string, unknown>) => {
  if (activeYear !== 2027) throw new Error('Excel import is available only for 2027.');
  for (const path of Object.keys(updates)) {
    if (!/^(shows|showBudgets|showActualOverrides|finance\/internalSalesOrders)\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) {
      throw new Error('Invalid 2027 import destination.');
    }
  }
  return update(ref(database, 'years/2027'), updates);
};

// Database helper functions for scheduling Firebase
export const schedulingDbRef = (path: string) => ref(schedulingDatabase, path);

export const schedulingDbGet = async (path: string) => {
  const snapshot = await get(ref(schedulingDatabase, path));
  return snapshot.exists() ? snapshot.val() : null;
};

export const schedulingDbSet = (path: string, data: Record<string, unknown>) => set(ref(schedulingDatabase, path), data);

export const schedulingDbUpdate = (path: string, data: Record<string, unknown>) => update(ref(schedulingDatabase, path), data);

export const schedulingDbRemove = (path: string) => remove(ref(schedulingDatabase, path));

export const schedulingDbPush = (path: string, data: Record<string, unknown>) => {
  const newRef = push(ref(schedulingDatabase, path));
  return set(newRef, data).then(() => newRef.key);
};

export const uploadStorageFile = async (path: string, file: File) => {
  const fileRef = storageRef(storage, activeYear === 2027 ? `years/2027/${path}` : path);
  await uploadBytes(fileRef, file);
  return getDownloadURL(fileRef);
};
