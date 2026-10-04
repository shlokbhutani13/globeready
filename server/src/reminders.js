function localDateString(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(date);
}

function todayFor(date, timeZone) {
  try {
    return localDateString(date, timeZone);
  } catch {
    return localDateString(date, "UTC");
  }
}

export function createReminderService({ store, clock = () => new Date() }) {
  return {
    async sync(uid) {
      const [tasks, profile, notifications] = await Promise.all([
        store.tasks.list(uid),
        store.profiles.get(uid),
        store.notifications.list(uid),
      ]);
      const timeZone = typeof profile?.timeZone === "string" && profile.timeZone ? profile.timeZone : "UTC";
      const today = todayFor(new Date(clock()), timeZone);
      // A reminder is identified by task and due date, so moving a task's due date earns a new reminder.
      const remindedKeys = new Set(
        notifications
          .filter((notification) => notification?.type === "task-reminder")
          .map((notification) => `${notification.taskId}|${notification.dueDate}`),
      );

      const created = [];
      for (const task of tasks) {
        if (task.completed) continue;
        if (typeof task.dueDate !== "string" || !task.dueDate) continue;
        if (task.dueDate > today) continue;
        if (remindedKeys.has(`${task.id}|${task.dueDate}`)) continue;

        const notification = await store.notifications.create(uid, {
          type: "task-reminder",
          taskId: task.id,
          title: `Due: ${task.title}`,
          body: task.dueDate < today ? "This task is overdue." : "This task is due today.",
          dueDate: task.dueDate,
          read: false,
        });
        created.push(notification);
      }
      return created;
    },
  };
}
