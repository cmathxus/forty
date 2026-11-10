// Elementos flutuantes ficam fora dos contêineres com scroll dos formulários.
function controlOverlayRoot() {
  let root = document.getElementById('controlOverlayRoot');
  if (!root) {
    root = document.createElement('div'); root.id = 'controlOverlayRoot';
    document.body.append(root);
  }
  return root;
}

function popupPlacement(anchor, width, height, viewport) {
  const pad = 12, gap = 7;
  const availableWidth = Math.max(0, viewport.width - pad * 2);
  width = Math.min(width, availableWidth);
  const below = Math.max(0, viewport.top + viewport.height - anchor.bottom - gap - pad);
  const above = Math.max(0, anchor.top - viewport.top - gap - pad);
  const upwards = below < height && above > below;
  const maxHeight = Math.min(height, upwards ? above : below);
  const left = Math.max(viewport.left + pad, Math.min(anchor.left, viewport.left + viewport.width - pad - width));
  const top = upwards ? anchor.top - gap - maxHeight : anchor.bottom + gap;
  return { left, top: Math.max(viewport.top + pad, top), width, maxHeight, upwards };
}

function placeControlPopup(popup, anchor, width, height) {
  const viewport = window.visualViewport;
  const placement = popupPlacement(anchor.getBoundingClientRect(), width, height, {
    left: viewport?.offsetLeft || 0, top: viewport?.offsetTop || 0,
    width: viewport?.width || window.innerWidth, height: viewport?.height || window.innerHeight
  });
  popup.style.setProperty('--popup-left', `${placement.left}px`);
  popup.style.setProperty('--popup-top', `${placement.top}px`);
  popup.style.setProperty('--popup-width', `${placement.width}px`);
  popup.style.setProperty('--popup-height', `${placement.maxHeight}px`);
  return placement;
}
