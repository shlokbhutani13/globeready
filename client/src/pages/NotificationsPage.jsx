import React from "react";
import { Bell, Check } from "lucide-react";
import PageHeader from "../components/ui/PageHeader";

export default function NotificationsPage({ notifications = [], onMarkRead, onMarkAllRead, localMode = false }) {
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Reminders"
        title="Reminders"
        description={`${localMode ? "Tasks that are overdue or due within three days, and key dates inside their reminder window." : "Reminders about your plan and matched updates."} ${unreadCount > 0 ? `${unreadCount} unread.` : "No unread reminders."}`}
        action={unreadCount > 0 && <button type="button" className="button secondary" onClick={onMarkAllRead}><Check size={16} aria-hidden="true" /> Mark all read</button>}
      >
        {localMode && <p className="muted-note">Shown only while GlobeReady is open. The free beta sends no email or push notifications, and read marks stay on this device.</p>}
      </PageHeader>

      {notifications.length === 0 ? (
        <div className="empty-state">
          <h3>Nothing here yet</h3>
          <p>{localMode ? "Tasks that are overdue or due within three days, and key dates inside their reminder window, appear here while the app is open." : "Task reminders and matched updates will appear here."}</p>
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
