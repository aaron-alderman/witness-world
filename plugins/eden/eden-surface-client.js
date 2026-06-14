function createEdenGotoSurfaceNode(surface, deps) {
  const { focusTarget, setStatus } = deps;
  const node = document.createElement(surface.href ? 'a' : 'button');
  node.className = 'eden-surface eden-surface-goto';
  if (surface.href) node.href = surface.href;
  else node.type = 'button';
  node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"></div>';
  node.querySelector('.eden-surface-title').textContent = surface.title;
  node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || 'Transport';
  node.querySelector('.eden-surface-body').textContent = surface.body || 'Move across the world.';
  node.addEventListener('click', event => {
    event.preventDefault();
    if (surface.cameraTargetId) focusTarget(surface.cameraTargetId);
    if (surface.href) {
      setStatus('transporting to ' + surface.title);
      setTimeout(() => { window.location.href = surface.href; }, 160);
    }
  });
  return node;
}

function createEdenDefaultSurfaceNode(surface, deps) {
  const { applySurfaceMeta, renderActions } = deps;
  const node = document.createElement('section');
  node.className = 'eden-surface' + (surface.href ? ' eden-surface-link' : '');
  node.innerHTML = '<div class="eden-surface-header"><div><div class="eden-surface-title"></div><div class="eden-surface-subtitle"></div></div></div><div class="eden-surface-body"><p></p><div class="eden-surface-meta"></div></div><div class="eden-surface-actions"></div>';
  node.querySelector('.eden-surface-title').textContent = surface.title;
  node.querySelector('.eden-surface-subtitle').textContent = surface.subtitle || '';
  node.querySelector('.eden-surface-body p').textContent = surface.body || '';
  applySurfaceMeta(node.querySelector('.eden-surface-meta'), surface);
  renderActions(node.querySelector('.eden-surface-actions'), surface);
  return node;
}

export function renderEdenSurfaceClientPrelude() {
  return `
${createEdenGotoSurfaceNode.toString()}
${createEdenDefaultSurfaceNode.toString()}
`;
}
