import { create } from "zustand";

export type NotificationKind = "session-exit" | "bell" | "card" | "hook" | "error" | "info";

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  paneId?: string;
  ts: number;
  read: boolean;
}

export interface NotificationInput {
  kind: NotificationKind;
  title: string;
  body?: string;
  paneId?: string;
  ts: number;
}

interface NotificationsState {
  items: NotificationItem[];
  unreadCount: number;
  panelOpen: boolean;
  notify: (input: NotificationInput) => string;
  markAllRead: () => void;
  clear: () => void;
  remove: (id: string) => void;
  togglePanel: () => void;
}

const MAX_ITEMS = 200;

export const useNotifications = create<NotificationsState>((set) => ({
  items: [],
  unreadCount: 0,
  panelOpen: false,

  notify: (input) => {
    const id = crypto.randomUUID();
    set((state) => {
      const items = [{ ...input, id, read: false }, ...state.items].slice(0, MAX_ITEMS);
      return { items, unreadCount: items.reduce((count, item) => count + (item.read ? 0 : 1), 0) };
    });
    return id;
  },

  markAllRead: () => set((state) => ({
    items: state.items.map((item) => item.read ? item : { ...item, read: true }),
    unreadCount: 0,
  })),

  clear: () => set({ items: [], unreadCount: 0 }),

  remove: (id) => set((state) => {
    const items = state.items.filter((item) => item.id !== id);
    return { items, unreadCount: items.reduce((count, item) => count + (item.read ? 0 : 1), 0) };
  }),

  togglePanel: () => set((state) => ({ panelOpen: !state.panelOpen })),
}));
