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
  /** Internal: tracks whether the item has been pushed to the server.
   *  Items loaded from server have this set to true; locally-created items
   *  start as false and become true after a successful POST. */
  _synced?: boolean;
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
      // Mark item as synced so we don't double-merge it later
      store.setItems(
        store.items.map((i) =>
          i.id === item.id
            ? { ...i, id: saved.id ?? i.id, _synced: true }
            : i
        )
      );
    } else {
      console.warn("Sync add failed: HTTP", res.status);
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
        const store = useCartStore.getState();
        const localItems = store.items;

        // Defensive: if server returned an empty cart but the local cart
        // has items, DO NOT wipe the local cart. This protects against:
        //  - POST failures during mergeGuestCartToServer that silently
        //    leave the server empty while local items exist
        //  - Firestore rules denying reads (returning [] via the catch)
        //  - Network hiccups that return [] unexpectedly
        // The local cart is the source of truth for the user's session.
        if (data.length === 0 && localItems.length > 0) {
          console.warn(
            "[cart] Server returned empty cart but local has",
            localItems.length,
            "items — preserving local cart"
          );
          return;
        }

        // Mark server items as synced
        const serverItems = data.map((i: any) => ({
          id: String(i.id),
          productId: i.productId,
          name: i.name,
          image: i.image,
          price: Number(i.price),
          quantity: Number(i.quantity),
          url: i.url,
          _synced: true,
        }));

        store.setItems(serverItems);
      }
    } else {
      console.warn("[cart] loadCartFromServer: HTTP", res.status);
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

  // Only push items that haven't been synced yet.
  // Items already synced (e.g., added while logged in) are skipped to
  // avoid doubling quantities via the server's "existing-by-name" merge.
  const unsyncedItems = localItems.filter((i) => !i._synced);
  if (unsyncedItems.length === 0) return;

  let anyFailed = false;

  try {
    for (const item of unsyncedItems) {
      const res = await fetch("/api/cart", {
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

      if (!res.ok) {
        console.warn("[cart] merge POST failed: HTTP", res.status);
        anyFailed = true;
        // Stop on first failure — if the server is rejecting one item,
        // it's likely to reject the rest too (auth, rules, etc.).
        break;
      }

      // Mark this item as synced and update its id to the server's id
      const saved = await res.json().catch(() => ({}));
      const store = useCartStore.getState();
      store.setItems(
        store.items.map((i) =>
          i.id === item.id
            ? { ...i, id: saved.id ?? i.id, _synced: true }
            : i
        )
      );
    }
  } catch (e) {
    console.error("Merge guest cart failed:", e);
    anyFailed = true;
  }

  // If any POST failed, signal to caller NOT to call loadCartFromServer
  // (otherwise the empty server response would wipe the local cart).
  if (anyFailed) {
    throw new Error("Cart merge had failures — refusing to load from server");
  }
}
