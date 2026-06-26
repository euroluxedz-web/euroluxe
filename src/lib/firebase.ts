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
  Timestamp,
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
  if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);

// ── Timeout Helper ──

/** Wrap a Firestore operation with a timeout. Returns null on timeout/error. */
function withTimeout<T>(promise: Promise<T>, ms: number = 8000): Promise<T | null> {
  return Promise.race([
    promise.then((v) => v).catch(() => null as T | null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/** Wrap a Firestore write operation with a timeout. Throws on timeout. */
function withTimeoutThrow<T>(promise: Promise<T>, ms: number = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Operation timed out")), ms);
    promise
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

// ── Auth Helpers ──

export async function registerUser(
  email: string,
  password: string,
  userData: { name?: string; phone?: string; wilaya?: string; commune?: string; codePostal?: string; address?: string }
) {
  // Step 1: Create the Firebase Auth user (with timeout)
  const credential = await withTimeoutThrow(
    createUserWithEmailAndPassword(auth, email, password),
    15000 // 15s for auth (can be slow from Algeria)
  );
  const uid = credential.user.uid;

  // Step 2: Try to store additional user data in Firestore (non-critical)
  try {
    await withTimeoutThrow(
      setDoc(doc(db, "users", uid), {
        email,
        name: userData.name || null,
        phone: userData.phone || null,
        wilaya: userData.wilaya || null,
        commune: userData.commune || null,
        codePostal: userData.codePostal || null,
        address: userData.address || null,
        walletBalance: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      8000
    );
  } catch (firestoreErr: any) {
    console.warn(
      "Firestore profile write failed (non-critical):",
      firestoreErr?.code || firestoreErr?.message || "Unknown error"
    );
  }

  // Step 3: Try to create wallet (non-critical)
  try {
    await withTimeoutThrow(
      setDoc(doc(db, "wallets", uid), {
        balance: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true }),
      5000
    );
  } catch {}

  return { uid, email, name: userData.name };
}

export async function loginUser(email: string, password: string) {
  const credential = await withTimeoutThrow(
    signInWithEmailAndPassword(auth, email, password),
    15000
  );
  return credential.user;
}

export async function logoutUser() {
  await firebaseSignOut(auth);
}

export async function getUserData(uid: string) {
  try {
    const result = await withTimeout(
      getDoc(doc(db, "users", uid)),
      6000
    );
    if (result && result.exists()) {
      return { id: uid, ...result.data() } as DocumentData;
    }
  } catch (err: any) {
    console.warn("Firestore read failed:", err?.code || err?.message);
  }
  return null;
}

export async function updateUserData(
  uid: string,
  data: { name?: string; phone?: string; wilaya?: string; commune?: string; codePostal?: string; address?: string }
) {
  try {
    await withTimeoutThrow(
      updateDoc(doc(db, "users", uid), {
        ...data,
        updatedAt: serverTimestamp(),
      }),
      8000
    );
  } catch (err: any) {
    console.warn("Firestore update failed:", err?.code || err?.message);
    throw err;
  }
}

// ── Cart Helpers ──

export async function getCartItems(uid: string) {
  try {
    const q = query(
      collection(db, "users", uid, "cartItems"),
      orderBy("createdAt", "desc")
    );
    const result = await withTimeout(getDocs(q), 6000);
    if (result) {
      return result.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (err: any) {
    console.warn("Cart read failed:", err?.code || err?.message);
  }
  return [];
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
  const existingResult = await withTimeout(getDocs(q), 6000);

  if (existingResult && !existingResult.empty) {
    const existingDoc = existingResult.docs[0];
    const currentQty = existingDoc.data().quantity || 1;
    await withTimeoutThrow(
      updateDoc(existingDoc.ref, {
        quantity: currentQty + (item.quantity || 1),
        updatedAt: serverTimestamp(),
      }),
      6000
    );
    return { id: existingDoc.id, ...existingDoc.data(), quantity: currentQty + (item.quantity || 1) };
  }

  // Create new cart item
  const cartItemRef = doc(collection(db, "users", uid, "cartItems"));
  await withTimeoutThrow(
    setDoc(cartItemRef, {
      ...item,
      quantity: item.quantity || 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
    6000
  );
  return { id: cartItemRef.id, ...item };
}

export async function updateCartItem(uid: string, itemId: string, quantity: number) {
  if (quantity <= 0) {
    await withTimeoutThrow(deleteDoc(doc(db, "users", uid, "cartItems", itemId)), 6000);
    return { deleted: true };
  }
  await withTimeoutThrow(
    updateDoc(doc(db, "users", uid, "cartItems", itemId), {
      quantity,
      updatedAt: serverTimestamp(),
    }),
    6000
  );
  return { id: itemId, quantity };
}

export async function removeCartItem(uid: string, itemId: string) {
  await withTimeoutThrow(deleteDoc(doc(db, "users", uid, "cartItems", itemId)), 6000);
}

export async function clearCart(uid: string) {
  const q = query(collection(db, "users", uid, "cartItems"));
  const result = await withTimeout(getDocs(q), 6000);
  if (result) {
    for (const d of result.docs) {
      await withTimeoutThrow(deleteDoc(d.ref), 4000);
    }
  }
}

// ── Order Helpers ──

export async function createOrder(
  uid: string,
  orderData: {
    items: { name: string; price: number; quantity: number; image?: string; url?: string; productId?: string }[];
    total: number;
    wilaya?: string;
    commune?: string;
    codePostal?: string;
    address?: string;
    phone?: string;
    fullName?: string;
    email?: string;
    notes?: string;
  }
) {
  const orderRef = doc(collection(db, "users", uid, "orders"));
  const orderPayload = {
    ...orderData,
    items: JSON.stringify(orderData.items),
    status: "pending",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await withTimeoutThrow(setDoc(orderRef, orderPayload), 8000);

  // Also save to global orders collection for admin access
  try {
    const globalOrderRef = doc(collection(db, "orders"));
    await withTimeoutThrow(
      setDoc(globalOrderRef, {
        ...orderPayload,
        userId: uid,
        userOrderId: orderRef.id,
      }),
      6000
    );
  } catch (err: any) {
    console.warn("Global order write failed (non-critical):", err?.code || err?.message);
  }

  return { id: orderRef.id, ...orderData, status: "pending" };
}

export async function getOrders(uid: string) {
  try {
    const q = query(
      collection(db, "users", uid, "orders"),
      orderBy("createdAt", "desc")
    );
    const result = await withTimeout(getDocs(q), 8000);
    if (result) {
      return result.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (err: any) {
    console.warn("Orders read failed:", err?.code || err?.message);
  }
  return [];
}

// ── Global Orders (Admin) Helpers ──

export async function getAllOrders() {
  try {
    const q = query(
      collection(db, "orders"),
      orderBy("createdAt", "desc")
    );
    const result = await withTimeout(getDocs(q), 10000);
    if (result) {
      return result.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (err: any) {
    console.warn("All orders read failed:", err?.code || err?.message);
  }
  return [];
}

export async function updateOrderStatus(orderId: string, status: string) {
  try {
    await withTimeoutThrow(
      updateDoc(doc(db, "orders", orderId), {
        status,
        updatedAt: serverTimestamp(),
      }),
      8000
    );
    return { success: true };
  } catch (err: any) {
    console.warn("Order status update failed:", err?.message);
    throw err;
  }
}

// ── Wallet Helpers ──

export async function getWallet(uid: string): Promise<number> {
  try {
    const result = await withTimeout(
      getDoc(doc(db, "wallets", uid)),
      5000
    );
    if (result && result.exists()) {
      return result.data().balance || 0;
    }
  } catch (err: any) {
    console.warn("Wallet read failed:", err?.code || err?.message);
  }
  return 0;
}

export async function createWallet(uid: string) {
  try {
    await withTimeoutThrow(
      setDoc(doc(db, "wallets", uid), {
        balance: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true }),
      5000
    );
  } catch (err: any) {
    console.warn("Wallet create failed:", err?.code || err?.message);
  }
}

export async function updateWalletBalance(uid: string, amount: number) {
  try {
    const walletRef = doc(db, "wallets", uid);
    const walletDoc = await withTimeout(getDoc(walletRef), 5000);
    if (walletDoc && walletDoc.exists()) {
      const currentBalance = walletDoc.data().balance || 0;
      await withTimeoutThrow(
        updateDoc(walletRef, {
          balance: currentBalance + amount,
          updatedAt: serverTimestamp(),
        }),
        5000
      );
      return currentBalance + amount;
    } else {
      await withTimeoutThrow(
        setDoc(walletRef, {
          balance: amount,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
        5000
      );
      return amount;
    }
  } catch (err: any) {
    console.warn("Wallet update failed:", err?.code || err?.message);
    throw err;
  }
}

// ── Recharge Helpers ──

export interface RechargeRequest {
  id: string;
  uid: string;
  email: string;
  amount: number;
  status: "pending" | "confirmed" | "rejected";
  receiptUrl: string;
  createdAt: Timestamp | null;
  confirmedAt: Timestamp | null;
  rejectedAt: Timestamp | null;
  adminNote: string | null;
}

export async function createRechargeRequest(
  uid: string,
  email: string,
  amount: number,
  receiptData: string
) {
  const rechargeRef = doc(collection(db, "recharges"));
  await withTimeoutThrow(
    setDoc(rechargeRef, {
      uid,
      email,
      amount,
      status: "pending",
      receiptData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      confirmedAt: null,
      rejectedAt: null,
      adminNote: null,
    }),
    8000
  );
  return { id: rechargeRef.id, uid, email, amount, status: "pending" as const };
}

export async function getUserRecharges(uid: string) {
  try {
    const q = query(
      collection(db, "recharges"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc")
    );
    const result = await withTimeout(getDocs(q), 8000);
    if (result) {
      return result.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (err: any) {
    console.warn("Recharges read failed:", err?.code || err?.message);
  }
  return [];
}

export async function getAllRecharges() {
  try {
    const q = query(
      collection(db, "recharges"),
      orderBy("createdAt", "desc")
    );
    const result = await withTimeout(getDocs(q), 10000);
    if (result) {
      return result.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
  } catch (err: any) {
    console.warn("All recharges read failed:", err?.code || err?.message);
  }
  return [];
}

export async function confirmRecharge(rechargeId: string) {
  try {
    const rechargeDoc = await withTimeout(getDoc(doc(db, "recharges", rechargeId)), 6000);
    if (!rechargeDoc || !rechargeDoc.exists()) throw new Error("Recharge not found");
    const data = rechargeDoc.data();
    if (data.status !== "pending") throw new Error("Recharge already processed");

    await withTimeoutThrow(
      updateDoc(doc(db, "recharges", rechargeId), {
        status: "confirmed",
        confirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
      6000
    );

    const newBalance = await updateWalletBalance(data.uid, data.amount);
    return { success: true, newBalance };
  } catch (err: any) {
    console.warn("Confirm recharge failed:", err?.message);
    throw err;
  }
}

export async function rejectRecharge(rechargeId: string, note?: string) {
  try {
    await withTimeoutThrow(
      updateDoc(doc(db, "recharges", rechargeId), {
        status: "rejected",
        rejectedAt: serverTimestamp(),
        adminNote: note || null,
        updatedAt: serverTimestamp(),
      }),
      6000
    );
    return { success: true };
  } catch (err: any) {
    console.warn("Reject recharge failed:", err?.message);
    throw err;
  }
}

export async function adminCreditUser(uid: string, amount: number) {
  const newBalance = await updateWalletBalance(uid, amount);
  return { success: true, newBalance };
}

export async function findUserByEmail(email: string) {
  try {
    const q = query(
      collection(db, "users"),
      where("email", "==", email)
    );
    const result = await withTimeout(getDocs(q), 6000);
    if (result && !result.empty) {
      const userDoc = result.docs[0];
      return { uid: userDoc.id, ...userDoc.data() };
    }
  } catch (err: any) {
    console.warn("Find user failed:", err?.message);
  }
  return null;
}

export async function getAllWallets() {
  try {
    const result = await withTimeout(getDocs(collection(db, "wallets")), 10000);
    if (result) {
      return result.docs.map((d) => ({ uid: d.id, ...d.data() }));
    }
  } catch (err: any) {
    console.warn("Wallets read failed:", err?.message);
  }
  return [];
}

export { onAuthStateChanged, type User as FirebaseUser };
