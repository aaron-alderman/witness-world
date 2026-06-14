function syncEdenEmbeddedSurfaceNode(node, { inspect }) {
  if (!node) return;
  const frame = node.querySelector('iframe');
  const layer = node.querySelector('[data-eden-relief-layer]');
  const inspectButton = node.querySelector('[data-eden-embedded-inspect]');
  const commandButton = node.querySelector('[data-eden-embedded-command]');
  const modeLabel = node.querySelector('[data-eden-embedded-mode]');
  if (frame) frame.style.pointerEvents = inspect ? 'auto' : 'none';
  if (layer) layer.hidden = inspect;
  if (inspectButton) {
    inspectButton.textContent = inspect ? 'Return To Map' : 'Inspect Board';
    inspectButton.classList.toggle('is-active', inspect);
    inspectButton.setAttribute('aria-pressed', inspect ? 'true' : 'false');
  }
  if (commandButton) commandButton.disabled = !inspect;
  if (modeLabel) modeLabel.textContent = inspect ? 'Inspect mode' : 'Map mode';
}

function createEdenEmbeddedSurfaceNode(surface, deps) {
  const {
    applySurfaceMeta,
    renderActions,
    embeddedMode,
    syncEmbeddedMode,
    toggleEmbeddedInspect,
    setEmbeddedSurfaceCommand,
    render
  } = deps;
  const node = document.createElement('section');
  node.className = 'eden-surface';
  node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div></div><div class="eden-surface-actions"></div><iframe class="eden-embedded-frame" loading="lazy"></iframe><div class="eden-relief-layer" data-eden-relief-layer></div><div class="eden-embedded-actions"><span class="eden-embedded-mode" data-eden-embedded-mode>Map mode</span><button type="button" data-eden-embedded-inspect aria-pressed="false">Inspect Board</button><button type="button" data-eden-embedded-command disabled>Search Board</button><a target="_self">Open app</a></div>';
  node.querySelector('.eden-surface-title').textContent = surface.title;
  node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || 'Live embedded board';
  node.querySelector('.eden-surface-body p').textContent = surface.body || 'The canonical starter app remains real inside the neighbourhood.';
  applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
  renderActions(node.querySelector('.eden-surface-actions'), surface);
  node.querySelector('iframe').src = surface.src || '/';
  node.querySelector('iframe').dataset.baseSrc = surface.src || '/';
  node.querySelector('iframe').addEventListener('load', () => {
    syncEmbeddedMode(surface);
    render();
  });
  node.querySelector('[data-eden-embedded-inspect]').addEventListener('click', event => {
    event.preventDefault();
    toggleEmbeddedInspect(surface);
  });
  node.querySelector('[data-eden-embedded-command]').addEventListener('click', event => {
    event.preventDefault();
    if (!embeddedMode(surface.id).inspect) toggleEmbeddedInspect(surface, true);
    setEmbeddedSurfaceCommand(surface.id, true);
  });
  node.querySelector('a').href = surface.href || surface.src || '/';
  syncEdenEmbeddedSurfaceNode(node, { inspect: embeddedMode(surface.id).inspect });
  return node;
}

export function renderEdenEmbeddedClientPrelude() {
  return `
${syncEdenEmbeddedSurfaceNode.toString()}
${createEdenEmbeddedSurfaceNode.toString()}
`;
}
