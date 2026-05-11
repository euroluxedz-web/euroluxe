import { initializeApp, getApps } from "firebase/app";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";

// Firebase configuration - reads from environment variables
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

// Check if Firebase is properly configured
export const isFirebaseConfigured = !!(
  process.env.NEXT_PUBLIC_FIREBASE_API_KEY &&
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
);

// Initialize Firebase (prevent re-initialization in dev)
let app;
try {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
} catch (e) {
  console.error("Firebase init error:", e);
  // Create a dummy app to prevent crashes
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);

// ── Auth Helpers ──

export async function registerUser(
  email: string,
  password: string,
  userData: { name?: string; phone?: string; wilaya?: string; address?: string }
) {
  // Step 1: Create the Firebase Auth user
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  const uid = credential.user.uid;

  // Step 2: Try to store additional user data in Firestore
  // This is non-critical - if it fails, the auth account still exists
  try {
    await setDoc(doc(db, "users", uid), {
      email,
      name: userData.name || null,
      phone: userData.phone || null,
      wilaya: userData.wilaya || null,
      address: userData.address || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (firestoreErr: any) {
    // Log the error but don't throw - the auth account was created successfully
    console.warn(
      "Firestore profile write failed (non-critical):",
      firestoreErr?.code || firestoreErr?.message || "Unknown error"
    );
    // If Firestore is not enabled, we still want the user to be registered
    // They just won't have a profile document
  }

  return { uid, email, name: userData.name };
}

export async function loginUser(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

export async function logoutUser() {
  await firebaseSignOut(auth);
}

export async function getUserData(uid: string) {
  try {
    const userDoc = await getDoc(doc(db, "users", uid));
    if (userDoc.exists()) {
      return { id: uid, ...userDoc.data() } as DocumentData;
    }
  } catch (err: any) {
    console.warn("Firestore read failed:", err?.code || err?.message);
  }
  return null;
}

export async function updateUserData(
  uid: string,
  data: { name?: string; phone?: string; wilaya?: string; address?: string }
) {
  try {
    await updateDoc(doc(db, "users", uid), {
      ...data,
      updatedAt: serverTimestamp(),
    });
  } catch (err: any) {
    console.warn("Firestore update failed:", err?.code || err?.message);
    throw err; // Re-throw for API routes to handle
  }
}

// ── Cart Helpers ──

export async function getCartItems(uid: string) {
  const q = query(
    collection(db, "users", uid, "cartItems"),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function addCartItem(
  uid: string,
  item: { productId?: string; name: string; image?: string; price: number; quantity: number; url?: string }
) {
  // Check for existing item with same name
  const q = query(
    collection(db, "users", uid, "cartItems"),
    where("name", "==", item.name)
  );
  const existing = await getDocs(q);

  if (!existing.empty) {
    // Update quantity of existing item
    const existingDoc = existing.docs[0];
    const currentQty = existingDoc.data().quantity || 1;
    await updateDoc(existingDoc.ref, {
      quantity: currentQty + (item.quantity || 1),
      updatedAt: serverTimestamp(),
    });
    return { id: existingDoc.id, ...existingDoc.data(), quantity: currentQty + (item.quantity || 1) };
  }

  // Create new cart item
  const cartItemRef = doc(collection(db, "users", uid, "cartItems"));
  await setDoc(cartItemRef, {
    ...item,
    quantity: item.quantity || 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: cartItemRef.id, ...item };
}

export async function updateCartItem(uid: string, itemId: string, quantity: number) {
  if (quantity <= 0) {
    await deleteDoc(doc(db, "users", uid, "cartItems", itemId));
    return { deleted: true };
  }
  await updateDoc(doc(db, "users", uid, "cartItems", itemId), {
    quantity,
    updatedAt: serverTimestamp(),
  });
  return { id: itemId, quantity };
}

export async function removeCartItem(uid: string, itemId: string) {
  await deleteDoc(doc(db, "users", uid, "cartItems", itemId));
}

export async function clearCart(uid: string) {
  const q = query(collection(db, "users", uid, "cartItems"));
  const snapshot = await getDocs(q);
  for (const doc of snapshot.docs) {
    await deleteDoc(doc.ref);
  }
}

// ── Order Helpers ──

export async function createOrder(
  uid: string,
  orderData: {
    items: { name: string; price: number; quantity: number; image?: string }[];
    total: number;
    wilaya?: string;
    address?: string;
    phone?: string;
    notes?: string;
  }
) {
  const orderRef = doc(collection(db, "users", uid, "orders"));
  await setDoc(orderRef, {
    ...orderData,
    items: JSON.stringify(orderData.items),
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { id: orderRef.id, ...orderData, status: "pending" };
}

export async function getOrders(uid: string) {
  const q = query(
    collection(db, "users", uid, "orders"),
    orderBy("createdAt", "desc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export { onAuthStateChanged, type User as FirebaseUser };
