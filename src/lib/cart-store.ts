import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartItemType {
  id: string;
  productId?: string;
  name: string;
  image?: string;
  price: number;
  quantity: number;
  url?: string;
}

interface CartState {
  items: CartItemType[];
  isOpen: boolean;
  isHydrated: boolean;
  setOpen: (open: boolean) => void;
  addItem: (item: CartItemType) => void;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  clearCart: () => void;
  setItems: (items: CartItemType[]) => void;
  totalItems: () => number;
  totalPrice: () => number;
  setHydrated: (val: boolean) => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      isHydrated: false,

      setOpen: (open) => set({ isOpen: open }),

      setHydrated: (val) => set({ isHydrated: val }),

      addItem: (item) =>
        set((state) => {
          const existing = state.items.find(
            (i) =>
              (i.productId && i.productId === item.productId) ||
              i.name === item.name
          );
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === existing.id
                  ? { ...i, quantity: i.quantity + item.quantity }
                  : i
              ),
            };
          }
          return { items: [...state.items, item] };
        }),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      updateQuantity: (id, quantity) =>
        set((state) => ({
          items:
            quantity <= 0
              ? state.items.filter((i) => i.id !== id)
              : state.items.map((i) => (i.id === id ? { ...i, quantity } : i)),
        })),

      clearCart: () => set({ items: [] }),

      setItems: (items) => set({ items }),

      totalItems: () => get().items.reduce((sum, i) => sum + i.quantity, 0),

      totalPrice: () =>
        get().items.reduce((sum, i) => sum + i.price * i.quantity, 0),
    }),
    {
      name: "euroluxe-cart",
      partialize: (state) => ({ items: state.items }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);

/* ── Firebase Auth Token Helper ── */

async function getAuthToken(): Promise<string | null> {
  try {
    const { auth } = await import("./firebase");
    const user = auth.currentUser;
    if (!user) return null;
    return await user.getIdToken();
  } catch {
    return null;
  }
}

/* ── Cart-Server Sync Helpers (Firebase) ── */

export async function syncAddToServer(item: CartItemType) {
  const token = await getAuthToken();
  if (!token) return;

  try {
    const res = await fetch("/api/cart", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(item),
    });
    if (res.ok) {
      const saved = await res.json();
      const store = useCartStore.getState();
      store.setItems(
        store.items.map((i) => (i.id === item.id ? { ...i, id: saved.id } : i))
      );
    }
  } catch (e) {
    console.error("Sync add failed:", e);
  }
}

export async function syncRemoveFromServer(id: string) {
  const token = await getAuthToken();
  if (!token) return;

  try {
    await fetch(`/api/cart/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    console.error("Sync remove failed:", e);
  }
}

export async function syncUpdateOnServer(id: string, quantity: number) {
  const token = await getAuthToken();
  if (!token) return;

  try {
    await fetch(`/api/cart/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ quantity }),
    });
  } catch (e) {
    console.error("Sync update failed:", e);
  }
}

export async function syncClearOnServer() {
  const token = await getAuthToken();
  if (!token) return;

  try {
    await fetch("/api/cart", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    console.error("Sync clear failed:", e);
  }
}

export async function loadCartFromServer() {
  const token = await getAuthToken();
  if (!token) return;

  try {
    const res = await fetch("/api/cart", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        useCartStore.getState().setItems(data);
      }
    }
  } catch (e) {
    console.error("Load cart from server failed:", e);
  }
}

export async function mergeGuestCartToServer() {
  const token = await getAuthToken();
  if (!token) return;

  const localItems = useCartStore.getState().items;
  if (localItems.length === 0) return;

  try {
    for (const item of localItems) {
      await fetch("/api/cart", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          productId: item.productId,
          name: item.name,
          image: item.image,
          price: item.price,
          quantity: item.quantity,
          url: item.url,
        }),
      });
    }
    await loadCartFromServer();
  } catch (e) {
    console.error("Merge guest cart failed:", e);
  }
}
