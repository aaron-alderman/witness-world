function renderEdenQuestCard(quest, { includeNotes = true } = {}) {
  const card = document.createElement('div');
  card.className = 'eden-chapter-quest'
    + (quest.status === 'completed' ? ' is-completed' : '')
    + (quest.status === 'locked' ? ' is-locked' : '');
  const header = document.createElement('div');
  header.className = 'eden-chapter-quest-header';
  const title = document.createElement('div');
  title.className = 'eden-chapter-quest-title';
  title.textContent = quest.title || quest.id;
  const stateLabel = document.createElement('div');
  stateLabel.className = 'eden-chapter-quest-state';
  stateLabel.textContent = quest.statusLabel || quest.status || 'ready';
  header.appendChild(title);
  header.appendChild(stateLabel);
  card.appendChild(header);
  if (quest.description) {
    const body = document.createElement('div');
    body.className = 'eden-chapter-quest-body';
    body.textContent = quest.description;
    card.appendChild(body);
  }
  if (includeNotes) {
    const notes = [];
    if (Array.isArray(quest.unlocks) && quest.unlocks.length) notes.push('Unlocks: ' + quest.unlocks.join(', '));
    if (Array.isArray(quest.missingDependencies) && quest.missingDependencies.length) notes.push('Needs: ' + quest.missingDependencies.join(', '));
    if (Array.isArray(quest.missingSignals) && quest.missingSignals.length && quest.status !== 'completed') notes.push('Practice signals: ' + quest.missingSignals.join(', '));
    if (notes.length) {
      const note = document.createElement('div');
      note.className = 'eden-chapter-quest-note';
      note.textContent = notes.join(' · ');
      card.appendChild(note);
    }
  }
  return card;
}

function renderEdenTrackCard(track) {
  const card = document.createElement('div');
  card.className = 'eden-chapter-quest'
    + (track.status === 'locked' ? ' is-locked' : '')
    + (track.status === 'practiced' ? ' is-completed' : '');
  const header = document.createElement('div');
  header.className = 'eden-chapter-quest-header';
  const title = document.createElement('div');
  title.className = 'eden-chapter-quest-title';
  title.textContent = track.title || track.id;
  const stateLabel = document.createElement('div');
  stateLabel.className = 'eden-chapter-quest-state';
  stateLabel.textContent = track.statusLabel || track.status || 'ready';
  header.appendChild(title);
  header.appendChild(stateLabel);
  card.appendChild(header);
  if (track.description) {
    const body = document.createElement('div');
    body.className = 'eden-chapter-quest-body';
    body.textContent = track.description;
    card.appendChild(body);
  }
  const notes = ['Witnessed count: ' + String(track.count || 0)];
  if (track.nextThreshold && track.nextLabel) notes.push('Next: ' + track.nextLabel + ' at ' + String(track.nextThreshold));
  const breakdown = Array.isArray(track.breakdown) ? track.breakdown.filter(entry => (entry?.count || 0) > 0) : [];
  if (breakdown.length) notes.push(breakdown.map(entry => entry.label + ': ' + String(entry.count || 0)).join(' · '));
  const note = document.createElement('div');
  note.className = 'eden-chapter-quest-note';
  note.textContent = notes.join(' · ');
  card.appendChild(note);
  return card;
}

function renderEdenCheckpoint(chapter, checkpoint, academy) {
  const {
    root,
    title,
    body,
    unlocks,
    quests,
    tracks
  } = chapter;
  root.hidden = !checkpoint;
  if (!checkpoint) return;
  title.textContent = checkpoint.title;
  body.textContent = checkpoint.description || checkpoint.statusText || '';
  unlocks.innerHTML = '';
  for (const item of checkpoint.unlocks || []) {
    const chip = document.createElement('span');
    chip.className = 'eden-chip is-open';
    chip.textContent = item;
    unlocks.appendChild(chip);
  }
  quests.innerHTML = '';
  for (const quest of checkpoint.quests || []) quests.appendChild(renderEdenQuestCard(quest));
  tracks.innerHTML = '';
  for (const track of academy.tracks || []) tracks.appendChild(renderEdenTrackCard(track));
}

export function renderEdenChapterClientPrelude() {
  return `
${renderEdenQuestCard.toString()}
${renderEdenTrackCard.toString()}
${renderEdenCheckpoint.toString()}
`;
}
