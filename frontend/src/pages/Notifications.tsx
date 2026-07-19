import { ArrowLeft, BellOff } from "lucide-react";
import { Link } from "react-router-dom";

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "../api/hooks";
import { Card, Spinner } from "../components/ui";
import { shortDate } from "../lib/format";

export default function NotificationsPage() {
  const { data, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  if (isLoading) return <Spinner />;

  return (
    <div className="mx-auto max-w-lg px-4 pb-16 pt-6">
      <header className="mb-6 flex items-center gap-3">
        <Link
          to="/"
          aria-label="Back to garage"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-muted hover:text-text"
        >
          <ArrowLeft size={19} strokeWidth={1.8} />
        </Link>
        <h1 className="flex-1 text-[22px] font-extrabold tracking-tight">Notifications</h1>
        {data && data.unread_count > 0 && (
          <button
            onClick={() => markAll.mutate()}
            className="text-[13px] font-semibold text-accent"
            disabled={markAll.isPending}
          >
            Mark all read
          </button>
        )}
      </header>

      {!data?.notifications.length ? (
        <Card className="flex flex-col items-center py-12 text-center">
          <BellOff size={28} strokeWidth={1.6} className="mb-3 text-muted" />
          <p className="text-[14px] text-muted">Nothing here — you're all caught up.</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {data.notifications.map((notification) => (
            <Card
              key={notification.id}
              className={`flex items-start gap-3 px-4 py-3.5 ${notification.read ? "opacity-60" : ""}`}
            >
              {!notification.read && (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold leading-snug">{notification.title}</p>
                {notification.body && (
                  <p className="mt-0.5 text-[13px] text-muted">{notification.body}</p>
                )}
                <p className="mt-1 text-[12px] text-muted">{shortDate(notification.created_at)}</p>
              </div>
              {!notification.read && (
                <button
                  onClick={() => markRead.mutate(notification.id)}
                  className="shrink-0 text-[12px] font-semibold text-accent"
                >
                  Mark read
                </button>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
