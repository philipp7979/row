(function(){
'use strict';

async function loadSubModule(name, paneEl) {
  const base = 'modules/' + name + '/' + name;
  const [html, css] = await Promise.all([
    fetch(base + '.html').then(r => r.text()),
    fetch(base + '.css').then(r => r.text()),
  ]);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  paneEl.insertAdjacentHTML('beforeend', html);
  await new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = base + '.js';
    s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
  });
}

window.trSwitch = function(pane) {
  document.querySelectorAll('.tr-tab').forEach(b => b.classList.toggle('on', b.dataset.pane === pane));
  const gymPane = document.getElementById('trPaneGym');
  const endPane = document.getElementById('trPaneEnd');
  if (gymPane) gymPane.classList.toggle('on', pane === 'gym');
  if (endPane) endPane.classList.toggle('on', pane === 'end');
  try { localStorage.setItem('tr_subtab', pane); } catch(e) {}
};

document.querySelectorAll('.tr-tab').forEach(btn => {
  btn.addEventListener('click', () => window.trSwitch(btn.dataset.pane));
});

const gymPane = document.getElementById('trPaneGym');
const endPane = document.getElementById('trPaneEnd');
if (gymPane && endPane) {
  Promise.all([
    loadSubModule('gym', gymPane),
    loadSubModule('endurance', endPane),
  ]).then(() => {
    const saved = localStorage.getItem('tr_subtab') || 'gym';
    window.trSwitch(saved);
  }).catch(e => console.error('Training sub-module load failed:', e));
}

})();
