import React, { useState } from "react";
import { Check, Plus, Trash2 } from "lucide-react";

export default function TasksPage({ tasks, onAdd, onToggle, onDelete }) {
  const [title, setTitle] = useState("");
  return (
    <div className="page">
      <header className="page-header"><div><span className="eyebrow">Action plan</span><h1>Tasks and deadlines</h1><p>Turn complex requirements into a manageable next step.</p></div></header>
      <form className="quick-add" onSubmit={(event) => { event.preventDefault(); if (title.trim()) { onAdd(title.trim()); setTitle(""); } }}><input aria-label="New task" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Add a task, deadline, or reminder" /><button className="button primary"><Plus size={17} /> Add</button></form>
      <section className="panel task-list">
        {tasks.map((task) => <div className={`task-row ${task.completed ? "done" : ""}`} key={task.id}><button className="check-button" aria-label={`Complete ${task.title}`} onClick={() => onToggle(task.id)}>{task.completed && <Check size={15} />}</button><div><strong>{task.title}</strong><small>{task.category || "General"} · {task.priority || "medium"} priority</small></div><time>{task.dueDate || "No deadline"}</time><button className="icon-button" aria-label={`Delete ${task.title}`} onClick={() => onDelete(task.id)}><Trash2 size={16} /></button></div>)}
      </section>
    </div>
  );
}
