function propRow(labelText, input) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  row.appendChild(label);
  row.appendChild(input);
  return row;
}

function textInput(value, onCommit, type) {
  const input = document.createElement('input');
  input.type = type || 'text';
  input.value = value;
  input.addEventListener('change', () => onCommit(input.value));
  input.addEventListener('keydown', event => { if (event.key === 'Enter') input.blur(); });
  return input;
}

function appendReadonlyText(parent, labelText, value) {
  const input = textInput(value == null ? '' : String(value), () => {});
  input.readOnly = true;
  parent.appendChild(propRow(labelText, input));
}

function appendReadonlyValue(parent, labelText, value) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  const text = document.createElement('div');
  text.style.flex = '1';
  text.style.minWidth = '0';
  text.style.wordBreak = 'break-word';
  text.textContent = value == null ? '' : String(value);
  row.appendChild(label);
  row.appendChild(text);
  parent.appendChild(row);
}

function appendLinkRow(parent, labelText, href, text) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  const link = document.createElement('a');
  link.href = href;
  link.textContent = text || href;
  link.target = '_blank';
  link.rel = 'noreferrer';
  row.appendChild(label);
  row.appendChild(link);
  parent.appendChild(row);
}

function appendPreviewRow(parent, labelText, builder) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  const box = document.createElement('div');
  box.className = 'asset-preview';
  builder(box);
  row.appendChild(label);
  row.appendChild(box);
  parent.appendChild(row);
}

function appendActionRow(parent, labelText, buttons) {
  if (!buttons.length) return;
  const row = document.createElement('div');
  row.className = 'prop-row';
  const label = document.createElement('label');
  label.textContent = labelText;
  const controls = document.createElement('div');
  controls.style.display = 'flex';
  controls.style.gap = '6px';
  controls.style.flexWrap = 'wrap';
  controls.style.flex = '1';
  for (const button of buttons) controls.appendChild(button);
  row.appendChild(label);
  row.appendChild(controls);
  parent.appendChild(row);
}

function derivedMetadataValue(value) {
  if (Array.isArray(value)) return value.join(', ');
  if (value == null) return '';
  return String(value);
}

function appendAssetDerivedMetadata(parent, metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return;
  const fields = [
    ['kind', 'Derived kind'],
    ['pageCount', 'Pages'],
    ['rowCount', 'Rows'],
    ['dataRowCount', 'Data rows'],
    ['columnCount', 'Columns'],
    ['headers', 'Headers'],
    ['headingCount', 'Headings'],
    ['headings', 'Heading list'],
    ['frontmatterKeyCount', 'Frontmatter keys'],
    ['frontmatterKeys', 'Frontmatter list'],
    ['sectionCount', 'Sections'],
    ['sections', 'Section list'],
    ['arrayTableCount', 'Array tables'],
    ['listCount', 'List items'],
    ['rootKind', 'Root kind'],
    ['entryCount', 'Entries'],
    ['topLevelKeyCount', 'Top-level keys'],
    ['topLevelKeys', 'Key list'],
    ['rootTag', 'Root tag'],
    ['title', 'Document title'],
    ['author', 'Author'],
    ['subject', 'Subject'],
    ['lineCount', 'Lines'],
    ['wordCount', 'Words'],
    ['charCount', 'Characters']
  ];
  for (const [key, label] of fields) {
    const value = metadata[key];
    if (value == null) continue;
    if (Array.isArray(value) && !value.length) continue;
    appendReadonlyText(parent, label, derivedMetadataValue(value));
  }
}

function selectInput(options, value) {
  const input = document.createElement('select');
  for (const optionRow of options) {
    const option = document.createElement('option');
    option.value = optionRow.value;
    option.textContent = optionRow.label;
    input.appendChild(option);
  }
  input.value = value || (options[0]?.value || '');
  return input;
}

function formatThingReference(id, title, kind) {
  const base = title && title !== id ? title + ' (' + id + ')' : (title || id || '');
  return kind ? base + ' [' + kind + ']' : base;
}

function thingCatalog() {
  const rows = new Map();
  const add = row => {
    if (!row || !row.id) return;
    if (rows.has(row.id)) return;
    rows.set(row.id, {
      id: row.id,
      label: row.label || row.id,
      kind: row.kind || null,
      context: row.context || null,
      contextTitle: row.contextTitle || null,
      asset: row.asset || null,
      attachedAssets: row.attachedAssets || [],
      attachedTo: row.attachedTo || [],
      attachedToRows: row.attachedToRows || []
    });
  };
  for (const row of state.model?.instances || []) add({ id: row.thing, label: row.label, kind: row.kind, context: row.context, contextTitle: row.contextTitle, asset: row.asset, attachedAssets: row.attachedAssets, attachedTo: row.attachedTo, attachedToRows: row.attachedToRows });
  for (const row of state.model?.availableThings || []) add(row);
  return [...rows.values()].sort((a, b) => String(a.label || a.id).localeCompare(String(b.label || b.id)));
}

function attachmentCandidatesForTarget(node) {
  const attached = new Set((node?.attachedAssets || []).map(row => row.id));
  return thingCatalog().filter(row => row.asset && row.id !== node?.thing && !attached.has(row.id));
}

function attachmentTargetsForAsset(node) {
  const attached = new Set(node?.attachedTo || []);
  return thingCatalog().filter(row => !row.asset && row.id !== node?.thing && !attached.has(row.id));
}

function renderInspector() {
  const thingProps = el('thing-props');
  const projectionProps = el('projection-props');
  const palette = el('palette');
  thingProps.innerHTML = '';
  projectionProps.innerHTML = '';
  palette.innerHTML = '';
  if (!state.model) {
    thingProps.innerHTML = '<div class="inspector-empty">No perspective open.</div>';
    projectionProps.innerHTML = '<div class="inspector-empty">No perspective open.</div>';
    return;
  }
  if (selectionSize() > 1) {
    const count = selectionSize();
    const summary = document.createElement('div');
    summary.className = 'prop-id';
    summary.textContent = count + ' nodes selected';
    thingProps.appendChild(summary);
    const bulkColor = textInput('#ffcc00', value => {
      for (const id of state.selected) {
        const member = findInstance(id);
        if (!member) continue;
        member.style = Object.assign({}, member.style, { color: value });
        queueStyle(id, member.style);
      }
      markDirty();
    }, 'color');
    projectionProps.appendChild(propRow('Color all', bulkColor));
    const removeAll = document.createElement('button');
    removeAll.textContent = 'Remove all (' + count + ')';
    removeAll.className = 'danger';
    removeAll.addEventListener('click', async () => {
      await post('canvas.removeMany', { perspective: state.perspective, instances: [...state.selected] });
      clearSelection();
      await refresh();
    });
    projectionProps.appendChild(removeAll);
  } else if (selectionSize() === 1) {
    const node = soleSelected();
    if (node) {
      const id = document.createElement('div');
      id.className = 'prop-id';
      id.textContent = node.thing;
      thingProps.appendChild(id);
      thingProps.appendChild(propRow('Name', textInput(node.label, async value => {
        if (!value.trim()) return;
        await post('canvas.thing.setTitle', { thing: node.thing, title: value, perspective: state.perspective });
        await refresh();
      })));
      if (node.kind) {
        appendReadonlyText(thingProps, 'Kind', node.kind);
      }
      if (!node.asset && node.attachedAssets?.length) {
        for (const asset of node.attachedAssets) {
          const row = document.createElement('div');
          row.className = 'relation-row';
          row.textContent = 'attached ' + (asset.title || asset.id) + ' [' + (asset.mimeType || 'file') + ']';
          if (asset.contentUrl) {
            const link = document.createElement('a');
            link.href = asset.contentUrl;
            link.textContent = ' open';
            link.target = '_blank';
            link.rel = 'noreferrer';
            row.appendChild(link);
          }
          if (isLive()) {
            const removeAttachment = document.createElement('button');
            removeAttachment.type = 'button';
            removeAttachment.textContent = 'Detach';
            removeAttachment.dataset.assetDetachButton = asset.id;
            removeAttachment.addEventListener('click', async () => {
              const removed = await detachAsset(asset.id, node.thing);
              if (!removed.ok) {
                setStatus('detach failed: ' + removed.error);
                return;
              }
              setStatus(removed.statusMessage || ('detached ' + (asset.title || asset.id)));
              await refresh();
            });
            row.appendChild(document.createTextNode(' '));
            row.appendChild(removeAttachment);
          }
          thingProps.appendChild(row);
        }
      }
      if (node.asset) {
        appendReadonlyText(thingProps, 'Type', node.asset.mimeType || '');
        appendReadonlyText(thingProps, 'Size', formatBytes(node.asset.sizeBytes));
        if (node.asset.imageWidth && node.asset.imageHeight) appendReadonlyText(thingProps, 'Dimensions', node.asset.imageWidth + ' x ' + node.asset.imageHeight);
        appendReadonlyValue(
          thingProps,
          'Context',
          node.asset.context
            ? formatThingReference(node.asset.context, node.asset.contextTitle, 'context')
            : (node.context || '')
        );
        appendReadonlyText(thingProps, 'Access', node.asset.visibility || 'private');
        appendReadonlyText(thingProps, 'Store', node.asset.storageKey || '');
        if (node.asset.processingStatus) appendReadonlyText(thingProps, 'Processing', assetProcessingSummary(node.asset));
        if (node.asset.processingStatus) appendReadonlyText(thingProps, 'Processing status', node.asset.processingStatus);
        if (node.asset.processingAttempt) appendReadonlyText(thingProps, 'Processing attempt', node.asset.processingAttempt);
        if (node.asset.textStatus) appendReadonlyText(thingProps, 'Text ingest', node.asset.textStatus + (node.asset.textBytes ? ' (' + formatBytes(node.asset.textBytes) + ')' : ''));
        if (node.asset.textExtractor) appendReadonlyText(thingProps, 'Extractor', node.asset.textExtractor);
        appendAssetDerivedMetadata(thingProps, node.asset.derivedMetadata);
        if (node.asset.thumbnailStatus) appendReadonlyText(thingProps, 'Thumbnail', node.asset.thumbnailStatus);
        if (node.asset.searchStatus) appendReadonlyText(thingProps, 'Search', assetSearchSummary(node.asset));
        if (node.asset.searchStatus) appendReadonlyText(thingProps, 'Search status', node.asset.searchStatus);
        if (node.asset.searchPolicy) appendReadonlyText(thingProps, 'Search policy', node.asset.searchPolicy);
        if (node.asset.searchError) appendReadonlyText(thingProps, 'Search error', node.asset.searchError);
        if (node.asset.processingError) appendReadonlyText(thingProps, 'Last error', node.asset.processingError);
        if (node.attachedTo?.length) {
          const attachedTargets = node.asset.attachedToRows?.length
            ? node.asset.attachedToRows
            : node.attachedTo.map(targetId => ({ id: targetId, title: targetId, kind: null, context: null, contextTitle: null }));
          for (const target of attachedTargets) {
            const row = document.createElement('div');
            row.className = 'relation-row';
            row.textContent = 'attached to ' + formatThingReference(target.id, target.title, target.kind);
            if (target.context) {
              row.textContent += ' in ' + formatThingReference(target.context, target.contextTitle, 'context');
            }
            if (isLive()) {
              const removeAttachment = document.createElement('button');
              removeAttachment.type = 'button';
              removeAttachment.textContent = 'Detach';
              removeAttachment.dataset.assetDetachButton = target.id;
              removeAttachment.addEventListener('click', async () => {
                const removed = await detachAsset(node.asset.id, target.id);
                if (!removed.ok) {
                  setStatus('detach failed: ' + removed.error);
                  return;
                }
                setStatus(removed.statusMessage || ('detached from ' + (target.title || target.id)));
                await refresh();
              });
              row.appendChild(document.createTextNode(' '));
              row.appendChild(removeAttachment);
            }
            thingProps.appendChild(row);
          }
        }
        if (node.asset.contentUrl) {
          appendLinkRow(thingProps, 'Content', node.asset.contentUrl, 'Open file');
          appendLinkRow(thingProps, 'Download', assetDownloadUrl(node.asset), 'Download file');
        }
        if (node.asset.textUrl) appendLinkRow(thingProps, 'Derived text', node.asset.textUrl, 'Open derived text');
        if (isLive() && (assetCanRetryIngest(node.asset) || assetCanRefreshSearch(node.asset))) {
          const actions = [];
          if (assetCanRetryIngest(node.asset)) {
            const retryButton = document.createElement('button');
            retryButton.type = 'button';
            retryButton.textContent = 'Retry ingest';
            retryButton.dataset.assetRetryIngestButton = node.asset.id;
            retryButton.addEventListener('click', async () => {
              setStatus('retrying ingest for ' + (node.label || node.asset.id) + '...');
              const retried = await retryAssetIngest(node.asset.id);
              if (!retried.ok) {
                setStatus('ingest retry failed for ' + (node.label || node.asset.id) + ': ' + retried.error);
                return;
              }
              setStatus('requeued ingest for ' + (node.label || node.asset.id));
              await refresh();
            });
            actions.push(retryButton);
          }
          if (assetCanRefreshSearch(node.asset)) {
            const refreshButton = document.createElement('button');
            refreshButton.type = 'button';
            refreshButton.textContent = 'Refresh search';
            refreshButton.dataset.assetRefreshSearchButton = node.asset.id;
            refreshButton.addEventListener('click', async () => {
              setStatus('refreshing search for ' + (node.label || node.asset.id) + '...');
              const refreshed = await refreshAssetSearch(node.asset.id);
              if (!refreshed.ok) {
                setStatus('search refresh failed for ' + (node.label || node.asset.id) + ': ' + refreshed.error);
                return;
              }
              setStatus('refreshed search for ' + (node.label || node.asset.id));
              await refresh();
            });
            actions.push(refreshButton);
          }
          appendActionRow(thingProps, 'Repair', actions);
        }
        const preview = ensureAssetPreview(node.asset);
        if (preview.status === 'image') {
          appendPreviewRow(thingProps, 'Preview', box => {
            const image = document.createElement('img');
            image.src = preview.src;
            image.alt = node.label || node.asset.originalName || node.asset.id || 'asset preview';
            box.appendChild(image);
          });
        } else if (preview.status === 'loading') {
          appendPreviewRow(thingProps, 'Preview', box => {
            box.textContent = 'Loading preview...';
          });
        } else if (preview.status === 'ready') {
          appendPreviewRow(thingProps, 'Preview', box => {
            const pre = document.createElement('pre');
            pre.textContent = preview.text;
            box.appendChild(pre);
          });
        } else if (preview.status === 'error') {
          appendPreviewRow(thingProps, 'Preview', box => {
            box.textContent = 'Preview failed: ' + preview.reason;
          });
        } else if (preview.status === 'none' && preview.reason) {
          appendPreviewRow(thingProps, 'Preview', box => {
            box.textContent = preview.reason;
          });
        }
        if (isLive()) {
          const targets = attachmentTargetsForAsset(node);
          if (targets.length) {
            const attachRow = document.createElement('div');
            attachRow.className = 'prop-row';
            const label = document.createElement('label');
            label.textContent = 'Attach to';
            const controls = document.createElement('div');
            controls.style.display = 'flex';
            controls.style.gap = '6px';
            controls.style.flex = '1';
            const picker = selectInput(targets.map(target => ({
              value: target.id,
              label: (target.label || target.id) + ' [' + (target.kind || 'thing') + ']'
            })), targets[0]?.id || '');
            picker.dataset.assetAttachTarget = 'true';
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = 'Attach';
            button.dataset.assetAttachButton = node.asset.id;
            button.addEventListener('click', async () => {
              const attached = await attachAsset(node.asset.id, picker.value);
              if (!attached.ok) {
                setStatus('attach failed: ' + attached.error);
                return;
              }
              setStatus(attached.statusMessage || ('attached ' + (node.label || node.asset.id)));
              await refresh();
            });
            controls.appendChild(picker);
            controls.appendChild(button);
            attachRow.appendChild(label);
            attachRow.appendChild(controls);
            thingProps.appendChild(attachRow);
          }
        }
      } else if (isLive()) {
        const candidates = attachmentCandidatesForTarget(node);
        if (candidates.length) {
          const attachRow = document.createElement('div');
          attachRow.className = 'prop-row';
          const label = document.createElement('label');
          label.textContent = 'Attach file';
          const controls = document.createElement('div');
          controls.style.display = 'flex';
          controls.style.gap = '6px';
          controls.style.flex = '1';
          const picker = selectInput(candidates.map(asset => ({
            value: asset.id,
            label: (asset.label || asset.id) + ' [' + (asset.asset?.mimeType || 'file') + ']'
          })), candidates[0]?.id || '');
          picker.dataset.attachAssetSelect = 'true';
          const button = document.createElement('button');
          button.type = 'button';
          button.textContent = 'Attach';
          button.dataset.attachAssetButton = node.thing;
          button.addEventListener('click', async () => {
            const attached = await attachAsset(picker.value, node.thing);
            if (!attached.ok) {
              setStatus('attach failed: ' + attached.error);
              return;
            }
            setStatus(attached.statusMessage || ('attached file to ' + (node.label || node.thing)));
            await refresh();
          });
          controls.appendChild(picker);
          controls.appendChild(button);
          attachRow.appendChild(label);
          attachRow.appendChild(controls);
          thingProps.appendChild(attachRow);
        }
      }
      for (const r of node.relations || []) {
        const row = document.createElement('div');
        row.className = 'relation-row';
        row.textContent = r.from + ' \\u2192 ' + r.rel + ' \\u2192 ' + r.to;
        thingProps.appendChild(row);
      }

      const instanceId = document.createElement('div');
      instanceId.className = 'prop-id';
      instanceId.textContent = node.id;
      projectionProps.appendChild(instanceId);
      const moveWith = patch => {
        const next = Object.assign({ x: node.x, y: node.y, w: node.w, h: node.h }, patch);
        node.x = Math.round(Number.isFinite(Number(next.x)) ? Number(next.x) : node.x);
        node.y = Math.round(Number.isFinite(Number(next.y)) ? Number(next.y) : node.y);
        node.w = Math.max(MIN_W, Math.round(Number.isFinite(Number(next.w)) ? Number(next.w) : node.w));
        node.h = Math.max(MIN_H, Math.round(Number.isFinite(Number(next.h)) ? Number(next.h) : node.h));
        queueMove(node.id, { x: node.x, y: node.y, w: node.w, h: node.h });
        markDirty();
        renderInspector();
      };
      projectionProps.appendChild(propRow('X', textInput(String(node.x), v => moveWith({ x: Number(v) }), 'number')));
      projectionProps.appendChild(propRow('Y', textInput(String(node.y), v => moveWith({ y: Number(v) }), 'number')));
      projectionProps.appendChild(propRow('Width', textInput(String(node.w), v => moveWith({ w: Number(v) }), 'number')));
      projectionProps.appendChild(propRow('Height', textInput(String(node.h), v => moveWith({ h: Number(v) }), 'number')));
      const color = textInput((node.style && node.style.color) || '#ffffff', value => {
        node.style = Object.assign({}, node.style, { color: value });
        queueStyle(node.id, node.style);
        markDirty();
      }, 'color');
      projectionProps.appendChild(propRow('Color', color));
      const duplicate = document.createElement('button');
      duplicate.textContent = 'Duplicate';
      duplicate.addEventListener('click', () => duplicateSelected());
      projectionProps.appendChild(duplicate);
      const remove = document.createElement('button');
      remove.textContent = 'Remove from canvas';
      remove.className = 'danger';
      remove.addEventListener('click', async () => {
        await post('canvas.remove', { perspective: state.perspective, instance: node.id });
        clearSelection();
        await refresh();
      });
      projectionProps.appendChild(remove);
    }
  } else if (state.selectedConnector) {
    const c = findConnector(state.selectedConnector);
    if (c) {
      const row = document.createElement('div');
      row.className = 'relation-row';
      row.textContent = c.from + ' \\u2192 ' + c.rel + ' \\u2192 ' + c.to;
      thingProps.appendChild(row);
      const remove = document.createElement('button');
      remove.textContent = 'Delete relation';
      remove.className = 'danger';
      remove.addEventListener('click', async () => {
        await post('canvas.unrelate', { from: c.from, rel: c.rel, to: c.to, perspective: state.perspective });
        clearSelection();
        await refresh();
      });
      thingProps.appendChild(remove);
      projectionProps.innerHTML = '<div class="inspector-empty">Deletes the relation everywhere it is drawn \\u2014 a connector is one reality relation, shown once per instance pair.</div>';
    }
  } else {
    thingProps.innerHTML = '<div class="inspector-empty">Select a node or connector.</div>';
    projectionProps.innerHTML = '<div class="inspector-empty">Select a node.</div>';
  }
  for (const t of state.model.availableThings) {
    const item = document.createElement('div');
    item.className = 'palette-item';
    item.textContent = t.label === t.id ? t.id : t.label + ' (' + t.id + ')';
    if (t.placed > 0) {
      const badge = document.createElement('span');
      badge.className = 'placed-badge';
      badge.textContent = '\\u00d7' + t.placed;
      item.appendChild(badge);
    }
    item.title = 'Place on canvas';
    item.addEventListener('click', async () => {
      const cx = snapValue((stage.clientWidth / 2 - state.camera.x) / state.camera.zoom - 80);
      const cy = snapValue((stage.clientHeight / 2 - state.camera.y) / state.camera.zoom - 28);
      await post('canvas.place', { perspective: state.perspective, thing: t.id, x: cx, y: cy });
      await refresh();
    });
    palette.appendChild(item);
  }
  if (!state.model.availableThings.length) {
    palette.innerHTML = '<div class="inspector-empty">No things yet.</div>';
  }
  if (!isLive()) {
    for (const section of [thingProps, projectionProps, palette]) {
      for (const control of section.querySelectorAll('input, button')) control.disabled = true;
    }
  }
}

export function renderCanvasInspectorRuntimePrelude() {
  return `
${propRow.toString()}
${textInput.toString()}
${appendReadonlyText.toString()}
${appendReadonlyValue.toString()}
${appendLinkRow.toString()}
${appendPreviewRow.toString()}
${appendActionRow.toString()}
${derivedMetadataValue.toString()}
${appendAssetDerivedMetadata.toString()}
${selectInput.toString()}
${formatThingReference.toString()}
${thingCatalog.toString()}
${attachmentCandidatesForTarget.toString()}
${attachmentTargetsForAsset.toString()}
${renderInspector.toString()}
`;
}
