// ---- layout constants ----
const NODE_WIDTH = 232;
const DY = 270; // horizontal distance between depth levels (columns)
const DX = 88;  // vertical distance between sibling slots
const MARGIN = 60;

// ---- dom refs ----
let viewportEl, canvasEl, svgEl, nodesEl;

// ---- pan/zoom state ----
let scale = 1, tx = 0, ty = 0;
let isPanning = false, startX = 0, startY = 0, startTx = 0, startTy = 0;

// ---- tree state ----
let root;
let layoutInfo = null;

function applyTransform() {
  canvasEl.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
}

function initPanZoom() {
  viewportEl.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.node-box')) return;
    isPanning = true;
    viewportEl.classList.add('grabbing');
    startX = e.clientX; startY = e.clientY;
    startTx = tx; startTy = ty;
    viewportEl.setPointerCapture(e.pointerId);
  });

  viewportEl.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    tx = startTx + (e.clientX - startX);
    ty = startTy + (e.clientY - startY);
    applyTransform();
  });

  const stopPan = () => { isPanning = false; viewportEl.classList.remove('grabbing'); };
  viewportEl.addEventListener('pointerup', stopPan);
  viewportEl.addEventListener('pointercancel', stopPan);
  viewportEl.addEventListener('pointerleave', stopPan);

  viewportEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.0015;
    const newScale = Math.min(2.2, Math.max(0.25, scale * (1 + delta)));
    const rect = viewportEl.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const wx = (mx - tx) / scale, wy = (my - ty) / scale;
    scale = newScale;
    tx = mx - wx * scale;
    ty = my - wy * scale;
    applyTransform();
  }, { passive: false });

  document.getElementById('zoom-in').addEventListener('click', () => zoomButton(1.2));
  document.getElementById('zoom-out').addEventListener('click', () => zoomButton(1 / 1.2));
  document.getElementById('zoom-reset').addEventListener('click', () => centerView());
}

function zoomButton(factor) {
  const vw = viewportEl.clientWidth, vh = viewportEl.clientHeight;
  const mx = vw / 2, my = vh / 2;
  const wx = (mx - tx) / scale, wy = (my - ty) / scale;
  scale = Math.min(2.2, Math.max(0.25, scale * factor));
  tx = mx - wx * scale;
  ty = my - wy * scale;
  applyTransform();
}

function centerView() {
  if (!layoutInfo) return;
  scale = 1;
  const vw = viewportEl.clientWidth, vh = viewportEl.clientHeight;
  tx = vw - layoutInfo.canvasWidth - 24;
  ty = vh / 2 - layoutInfo.rootTop;
  applyTransform();
}

// ---- data prep ----
function prepData(node) {
  node._hasKids = !!(node.children && node.children.length);
  if (node.children) node.children.forEach(prepData);
}

function tagBranches(hierRoot) {
  if (!hierRoot.children) return;
  hierRoot.children.forEach((branchNode, i) => {
    const cls = 'branch-' + ((i % 8) + 1);
    branchNode.each((n) => { n.data._branchClass = cls; });
  });
}

function collapseTopBranchesChildren(hierRoot) {
  if (!hierRoot.children) return;
  hierRoot.children.forEach((branch) => {
    if (branch.children) {
      branch._children = branch.children;
      branch.children = null;
    }
  });
}

function toggle(d) {
  if (d.children) {
    d._children = d.children;
    d.children = null;
  } else if (d._children) {
    d.children = d._children;
    d._children = null;
  }
  render();
}

// ---- render ----
function render() {
  const treeLayout = d3.tree().nodeSize([DX, DY]);
  treeLayout(root);

  const nodes = root.descendants();
  const links = root.links();

  let minX = Infinity, maxX = -Infinity, maxDepth = 0;
  nodes.forEach((d) => {
    if (d.x < minX) minX = d.x;
    if (d.x > maxX) maxX = d.x;
    if (d.depth > maxDepth) maxDepth = d.depth;
  });

  const canvasWidth = maxDepth * DY + NODE_WIDTH + MARGIN * 2;
  const canvasHeight = (maxX - minX) + MARGIN * 2;
  const rootColRightX = canvasWidth - MARGIN;

  const colRightX = (depth) => rootColRightX - depth * DY;
  const screenY = (d) => (d.x - minX) + MARGIN;

  canvasEl.style.width = canvasWidth + 'px';
  canvasEl.style.height = canvasHeight + 'px';
  svgEl.setAttribute('width', canvasWidth);
  svgEl.setAttribute('height', canvasHeight);
  nodesEl.style.width = canvasWidth + 'px';
  nodesEl.style.height = canvasHeight + 'px';

  // links
  let linksHtml = '';
  links.forEach((l) => {
    const cls = l.target.data._branchClass || '';
    const px = colRightX(l.source.depth) - NODE_WIDTH;
    const py = screenY(l.source);
    const cx = colRightX(l.target.depth);
    const cy = screenY(l.target);
    const midx = (px + cx) / 2;
    const d = `M ${px} ${py} C ${midx} ${py}, ${midx} ${cy}, ${cx} ${cy}`;
    linksHtml += `<path class="link-path ${cls}" d="${d}"></path>`;
  });
  svgEl.innerHTML = linksHtml;

  // nodes
  nodesEl.innerHTML = '';
  const rootNode = nodes.find((d) => d.depth === 0);
  nodes.forEach((d) => {
    const left = colRightX(d.depth) - NODE_WIDTH;
    const top = screenY(d);
    const isRoot = d.depth === 0;
    const isLeaf = !d.data._hasKids;
    const cls = d.data._branchClass || '';

    const el = document.createElement('div');
    el.className = 'node-box ' + (isRoot ? 'is-root' : (isLeaf ? 'is-leaf' : 'is-branch')) + (cls ? (' ' + cls) : '');
    el.style.width = NODE_WIDTH + 'px';
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    el.style.opacity = '0';

    const ar = document.createElement('div');
    ar.className = 'node-ar';
    ar.dir = 'rtl';
    ar.textContent = d.data.ar;
    el.appendChild(ar);

    const en = document.createElement('div');
    en.className = 'node-en';
    en.dir = 'ltr';
    en.textContent = d.data.en;
    el.appendChild(en);

    if (!isLeaf) {
      const btn = document.createElement('div');
      btn.className = 'toggle-btn font-mono';
      btn.textContent = d.children ? '−' : '+';
      btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(d); });
      el.appendChild(btn);
      el.addEventListener('click', () => toggle(d));
    }

    nodesEl.appendChild(el);
  });

  requestAnimationFrame(() => {
    nodesEl.querySelectorAll('.node-box').forEach((n) => { n.style.opacity = '1'; });
  });

  layoutInfo = {
    canvasWidth,
    canvasHeight,
    rootTop: screenY(rootNode),
  };
}

// ---- bootstrap ----
async function main() {
  viewportEl = document.getElementById('viewport');
  canvasEl = document.getElementById('canvas');
  svgEl = document.getElementById('links-svg');
  nodesEl = document.getElementById('nodes-layer');

  initPanZoom();

  const res = await fetch('./data.json');
  const raw = await res.json();
  prepData(raw);

  root = d3.hierarchy(raw);
  tagBranches(root);
  collapseTopBranchesChildren(root);

  render();
  centerView();
  document.getElementById('loading').style.display = 'none';
}

main().catch((err) => {
  document.getElementById('loading').textContent = 'تعذّر تحميل data.json — شغّل الملف عبر خادم محلي (راجع التعليمات). ' + err.message;
});
