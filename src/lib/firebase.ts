import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, set, get, update, remove, push, query, orderByChild, equalTo } from "firebase/database";
import { getAnalytics } from "firebase/analytics";

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

// Database helper functions for primary Firebase
export const dbRef = (path: string) => ref(database, path);

export const dbSet = (path: string, data: Record<string, unknown>) => set(ref(database, path), data);

export const dbGet = async (path: string) => {
  const snapshot = await get(ref(database, path));
  return snapshot.exists() ? snapshot.val() : null;
};

export const dbUpdate = (path: string, data: Record<string, unknown>) => update(ref(database, path), data);

export const dbRemove = (path: string) => remove(ref(database, path));

export const dbPush = (path: string, data: Record<string, unknown>) => {
  const newRef = push(ref(database, path));
  return set(newRef, data).then(() => newRef.key);
};

export const dbQuery = (path: string, orderBy: string, equalToValue: string | number | boolean) => {
  return query(ref(database, path), orderByChild(orderBy), equalTo(equalToValue));
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