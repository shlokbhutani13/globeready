import React, { useMemo, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";

const dayMs = 24 * 60 * 60 * 1000;

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

export function buildCalendarMonth(tasks, monthDate) {
  const year = monthDate.getUTCFullYear();
  const month = monthDate.getUTCMonth();
  const firstOfMonth = new Date(Date.UTC(year, month, 1));
  const startOffset = firstOfMonth.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  const countsByDate = new Map();
  for (const task of tasks) {
    if (!task.dueDate) continue;
    countsByDate.set(task.dueDate, (countsByDate.get(task.dueDate) || 0) + 1);
  }

  const days = [];
  for (let index = 0; index < startOffset; index += 1) days.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    const key = toDateKey(date);
    days.push({ key, dayNumber: day, taskCount: countsByDate.get(key) || 0 });
  }
  return days;
}

export default function TasksPage({ tasks, onAdd, onToggle, onDelete }) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("medium");
  const [monthDate, setMonthDate] = useState(() => {
    const firstDue = tasks.map((task) => task.dueDate).filter(Boolean).sort()[0];
    const base = firstDue ? new Date(`${firstDue}T00:00:00Z`) : new Date();
    return new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1));
  });
  const [selectedDate, setSelectedDate] = useState("");

  const calendarDays = useMemo(() => buildCalendarMonth(tasks, monthDate), [tasks, monthDate]);
  const visibleTasks = selectedDate ? tasks.filter((task) => task.dueDate === selectedDate) : tasks;
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(monthDate);

  const submit = (event) => {
    event.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim(), dueDate, priority });
    setTitle("");
    setDueDate("");
    setPriority("medium");
  };

  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Action plan</span><h1>Tasks and deadlines</h1><p>Turn complex requirements into a manageable next step.</p></div></header>

      <form className="quick-add" onSubmit={submit}>
        <input aria-label="New task" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a task, deadline, or reminder" />
        <input aria-label="Due date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
        <select aria-label="Priority" value={priority} onChange={(event) => setPriority(event.target.value)}>
          <option value="low">Low priority</option>
          <option value="medium">Medium priority</option>
          <option value="high">High priority</option>
        </select>
        <button className="button primary"><Plus size={17} /> Add</button>
      </form>

      <section className="panel calendar-panel">
        <div className="panel-title">
          <h2>{monthLabel}</h2>
          <div className="action-row">
            <button className="icon-button" aria-label="Previous month" onClick={() => setMonthDate(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() - 1, 1)))}><ChevronLeft size={16} /></button>
            <button className="icon-button" aria-label="Next month" onClick={() => setMonthDate(new Date(Date.UTC(monthDate.getUTCFullYear(), monthDate.getUTCMonth() + 1, 1)))}><ChevronRight size={16} /></button>
          </div>
        </div>
        <div className="calendar-grid" role="grid">
          {calendarDays.map((day, index) => day === null
            ? <span key={`blank-${index}`} className="calendar-day blank" />
            : (
              <button
                key={day.key}
                type="button"
                className={`calendar-day ${selectedDate === day.key ? "selected" : ""} ${day.taskCount > 0 ? "has-tasks" : ""}`}
                onClick={() => setSelectedDate(selectedDate === day.key ? "" : day.key)}
                aria-label={`${day.key}${day.taskCount ? `, ${day.taskCount} task${day.taskCount > 1 ? "s" : ""}` : ""}`}
              >
                {day.dayNumber}
                {day.taskCount > 0 && <small>{day.taskCount}</small>}
              </button>
            ))}
        </div>
        {selectedDate && <button className="text-button" onClick={() => setSelectedDate("")}>Show all tasks</button>}
      </section>

      <section className="panel task-list">
        {visibleTasks.length === 0 && <p className="muted">No tasks for this view.</p>}
        {visibleTasks.map((task) => <div className={`task-row ${task.completed ? "done" : ""}`} key={task.id}><button className="check-button" aria-label={`Complete ${task.title}`} onClick={() => onToggle(task.id)}>{task.completed && <Check size={15} />}</button><div><strong>{task.title}</strong><small>{task.category || "General"} · {task.priority || "medium"} priority</small></div><time>{task.dueDate || "No deadline"}</time><button className="icon-button" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task.id)}><Trash2 size={16} /></button></div>)}
      </section>
    </div>
  );
}
