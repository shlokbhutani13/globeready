import React from "react";
import { Bell, Check } from "lucide-react";

export default function NotificationsPage({ notifications = [], onMarkRead, onMarkAllRead }) {
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Notification inbox</span>
          <h1>Notifications</h1>
          <p>Reminders about your plan and matched updates. {unreadCount > 0 ? `${unreadCount} unread.` : "No unread reminders."}</p>
        </div>
        {unreadCount > 0 && (
          <button className="button secondary" onClick={onMarkAllRead}>
            <Check size={16} /> Mark all read
          </button>
        )}
      </header>

      {notifications.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing here yet</h3>
          <p>Task reminders and matched updates will appear here.</p>
        </div>
      ) : (
        <section className="panel notification-list">
          {notifications.map((notification) => (
            <div className={`notification-row ${notification.read ? "" : "unread"}`} key={notification.id}>
              <span className="notification-icon"><Bell size={16} /></span>
              <div>
                <strong>{notification.title}</strong>
                <small>{notification.body}</small>
              </div>
              {!notification.read && (
                <button
                  className="icon-button"
                  aria-label={`Mark ${notification.title} as read`}
                  onClick={() => onMarkRead(notification)}
                >
                  <Check size={16} />
                </button>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
