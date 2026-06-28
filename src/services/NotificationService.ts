export interface Notification {
  id: string;
  is_read: boolean;
  type: 'friend_request' | 'system' | string;
  title: string;
  content: string;
  created_at: string;
}

const STORAGE_KEY = 'cinemovie_notifications';

export const NotificationService = {
  async getNotifications(): Promise<Notification[]> {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },

  async markAsRead(id: string): Promise<boolean> {
    try {
      const notifications = await this.getNotifications();
      const updated = notifications.map(n => n.id === id ? { ...n, is_read: true } : n);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return true;
    } catch {
      return false;
    }
  },

  async markAllAsRead(): Promise<boolean> {
    try {
      const notifications = await this.getNotifications();
      const updated = notifications.map(n => ({ ...n, is_read: true }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return true;
    } catch {
      return false;
    }
  },

  async deleteNotification(id: string): Promise<boolean> {
    try {
      const notifications = await this.getNotifications();
      const updated = notifications.filter(n => n.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      return true;
    } catch {
      return false;
    }
  },

  async deleteAllNotifications(): Promise<boolean> {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch {
      return false;
    }
  },

  async addNotification(type: string, title: string, content: string): Promise<void> {
    try {
      const notifications = await this.getNotifications();
      const newNotification: Notification = {
        id: Math.random().toString(36).substr(2, 9),
        is_read: false,
        type,
        title,
        content,
        created_at: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify([newNotification, ...notifications]));
    } catch (e) {
      console.error(e);
    }
  }
};
