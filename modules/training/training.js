(function(){
'use strict';

/* Tab switching for training sub-tabs */
window.trSwitch = function(pane) {
  document.querySelectorAll('.tr-tab').forEach(b => b.classList.toggle('on', b.dataset.pane === pane));
  document.getElementById('trPaneGym').classList.toggle('on', pane === 'gym');
  document.getElementById('trPaneEnd').classList.toggle('on', pane === 'end');
  localStorage.setItem('tr_subtab', pane);
};

document.querySelectorAll('.tr-tab').forEach(btn => {
  btn.addEventListener('click', () => window.trSwitch(btn.dataset.pane));
});

/* Load gym and endurance sub-modules into their panes */
async function loadSubModule(name, paneEl) {
  const base = `modules/${name}/${name}`;
  const [html, css] = await Promise.all([
    fetch(base + '.html').then(r => r.text()),
    fetch(base + '.css').then(r => r.text()),
  ]);
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
  paneEl.innerHTML = html;
  await new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = base + '.js';
    s.onload = ok; s.onerror = fail;
    document.head.appendChild(s);
  });
}

const gymPane = document.getElementById('trPaneGym');
const endPane = document.getElementById('trPaneEnd');
if (gymPane && endPane) {
  loadSubModule('gym', gymPane);
  loadSubModule('endurance', endPane);
}

/* Restore last sub-tab */
try {
  const saved = localStorage.getItem('tr_subtab') || 'gym';
  window.trSwitch(saved);
} catch(e) {}

})();
