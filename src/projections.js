export function todoState(witnesses) {
  const todos = new Map();
  for (const w of witnesses) {
    if (w.process === "todo.create" && w.body?.todo) {
      todos.set(w.body.todo.id, { ...w.body.todo });
    }
    if (w.process === "todo.update" && w.body?.todo) {
      const prev = todos.get(w.body.todo.id) ?? {};
      todos.set(w.body.todo.id, { ...prev, ...w.body.todo });
    }
    if (w.process === "todo.delete" && w.body?.id) {
      todos.delete(w.body.id);
    }
  }
  return [...todos.values()];
}

export function privateNotesFor(witnesses, actor) {
  if (!actor) return [];
  return witnesses
    .filter(w => w.process === "privateNote.create" && w.actor === actor && w.body?.note)
    .map(w => ({ ...w.body.note }));
}

export function publicWitnessesFor(witnesses, actor) {
  return witnesses.filter(w => {
    if (w.process.startsWith("privateNote") || w.process.startsWith("privateNotes")) return actor && w.actor === actor;
    return true;
  });
}
