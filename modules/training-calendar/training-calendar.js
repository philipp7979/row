(function(){

(function(){
'use strict';

const SUPABASE_URL = 'PASTE-YOUR-SUPABASE-PROJECT-URL-HERE';
const SUPABASE_KEY = 'PASTE-YOUR-SUPABASE-PUBLISHABLE-KEY-HERE';
const GROQ_API_KEY = ''; // paste Groq API key here
const SK = 'training_calendar_v1';

const DISC = {
  run:      {label:'🏃 Run',      color:'#6ee7b7',short:'Run'},
  bike:     {label:'🚴 Bike',     color:'#f59e0b',short:'Bike'},
  swim:     {label:'🏊 Swim',     color:'#38bdf8',short:'Swim'},
  strength: {label:'💪 Strength', color:'#a78bfa',short:'Strength'},
  hyrox:    {label:'🔥 Hyrox',   color:'#fb923c',short:'Hyrox'},
  race:     {label:'🏁 Race',     color:'#f43f5e',short:'Race'},
  rest:     {label:'😴 Rest',     color:'#6b7280',short:'Rest'}
};
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAYS_S = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

let trState = {
  view: 'week',
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selDate: null,
  sessions: []
};

function load(){try{trState.sessions=JSON.parse(localStorage.getItem(SK))||[];}catch(e){trState.sessions=[];}}
function save(){try{localStorage.setItem(SK,JSON.stringify(trState.sessions));}catch(e){}syncSupa();}
async function syncSupa(){
  if(!SUPABASE_URL||SUPABASE_URL.includes('PASTE')||!window.supabase)return;
  try{const db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);await db.from('app_state').upsert({key:SK,data:trState.sessions,updated_at:new Date().toISOString()},{onConflict:'key'});}catch(e){}
}

function p2(n){return String(n).padStart(2,'0')}
function dk(y,m,d){return y+'-'+p2(m+1)+'-'+p2(d)}
function today(){const d=new Date();return dk(d.getFullYear(),d.getMonth(),d.getDate())}
function parseD(s){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function fmtDE(s){const[y,m,d]=s.split('-');return d+'.'+m+'.'+y}
function fmt12(t){if(!t)return'';const[h,m]=t.split(':').map(Number);return(h%12||12)+':'+p2(m)+(h>=12?' PM':' AM')}
function discColor(d){return(DISC[d]||DISC.run).color}

function weekDays(ds){
  const d=parseD(ds);const s=new Date(d);s.setDate(d.getDate()-d.getDay());
  return Array.from({length:7},(_,i)=>{const x=new Date(s);x.setDate(s.getDate()+i);return dk(x.getFullYear(),x.getMonth(),x.getDate());});
}
function sessionsOn(ds){return trState.sessions.filter(s=>s.date===ds);}
function getWhoopRecovery(ds){
  try{const w=JSON.parse(localStorage.getItem('whoop_data_v1'));if(!w)return null;const entries=w.recoveries||w.data||[];const e=entries.find(x=>x.date===ds||(x.created_at||'').startsWith(ds));return e?Math.round(e.score||e.recovery_score||0):null;}catch(e){return null;}
}
function recoveryColor(score){if(!score)return'#6b7280';if(score>=67)return'#30d158';if(score>=34)return'#f59e0b';return'#f43f5e';}
function getLifeEventsOn(ds){
  try{const evs=JSON.parse(localStorage.getItem('life_calendar_v1'))||[];return evs.filter(ev=>{const end=ev.endDate&&ev.endDate>ev.date?ev.endDate:ev.date;return ds>=ev.date&&ds<=end;});}catch(e){return[];}
}

/* ====== Rendering ====== */
function renderNavTitle(){
  const days=weekDays(trState.selDate||today());
  const s=parseD(days[0]),e=parseD(days[6]);
  const sm=MONTHS[s.getMonth()].slice(0,3),em=MONTHS[e.getMonth()].slice(0,3);
  const t=trState.view==='week'
    ?(sm===em?sm+' '+s.getDate()+'–'+e.getDate():sm+' '+s.getDate()+' – '+em+' '+e.getDate())+' <span>'+s.getFullYear()+'</span>'
    :trState.view==='month'
    ?MONTHS[trState.month]+' <span>'+trState.year+'</span>'
    :(()=>{const d=parseD(trState.selDate||today());return DAYS_S[d.getDay()]+', '+MONTHS[d.getMonth()].slice(0,3)+' '+d.getDate()+' <span>'+d.getFullYear()+'</span>';})();
  document.getElementById('trTitle').innerHTML=t;
}

function renderWeek(){
  const todayStr=today(),days=weekDays(trState.selDate||todayStr);
  document.getElementById('trWeekHdr').innerHTML=days.map(ds=>{
    const d=parseD(ds),isT=ds===todayStr,rec=getWhoopRecovery(ds);
    return`<div class="tr-wday${isT?' today':''}" data-date="${ds}">
      <div class="tr-wday-name">${DAYS_S[d.getDay()].slice(0,1)}</div>
      <div class="tr-wday-num">${d.getDate()}</div>
      <div class="tr-wday-dot" style="background:${rec?recoveryColor(rec):'transparent'}" title="${rec?'Whoop: '+rec+'%':''}"></div>
    </div>`;
  }).join('');
  document.getElementById('trWeekHdr').querySelectorAll('[data-date]').forEach(el=>{
    el.addEventListener('click',()=>{trState.selDate=el.dataset.date;trState.view='day';switchView();document.querySelectorAll('.tr-view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view==='day'));render(null);});
  });
  const maxVol=Math.max(1,...days.map(ds=>sessionsOn(ds).reduce((s,x)=>s+(x.duration||0),0)));
  document.getElementById('trVolRow').innerHTML=days.map(ds=>{
    const vol=sessionsOn(ds).reduce((s,x)=>s+(x.duration||0),0),pct=Math.round(vol/maxVol*100);
    return`<div class="tr-vol-col"><div class="tr-vol-bar-wrap"><div class="tr-vol-bar" style="width:${pct}%;background:#0A84FF"></div></div><div class="tr-vol-label">${vol?vol+'m':''}</div></div>`;
  }).join('');
  const cols=document.getElementById('trWeekCols');
  cols.innerHTML=days.map(ds=>{
    const sess=sessionsOn(ds),lifeEvs=getLifeEventsOn(ds),conflict=lifeEvs.some(e=>e.type==='exam'||e.type==='appointment');
    let html=`<div class="tr-day-col" data-date="${ds}">`;
    if(conflict&&!sess.length)html+=`<div style="font-size:8px;color:rgba(244,63,94,.6);padding:3px;text-align:center">Busy</div>`;
    sess.forEach(s=>{
      const dc=DISC[s.discipline]||DISC.run;const meta=[];
      if(s.duration)meta.push(s.duration+'min');if(s.distance)meta.push(s.distance+'km');if(s.intensity)meta.push(s.intensity);
      html+=`<div class="tr-session${s.done?' done':''}${s.aiGen?' ai-gen':''}" data-id="${s.id}" style="background:${dc.color}">
        <div class="tr-session-icon">${dc.label.split(' ')[0]}</div>
        <div class="tr-session-name">${s.name}</div>
        <div class="tr-session-meta">${meta.join(' · ')}</div></div>`;
    });
    html+='</div>';return html;
  }).join('');
  cols.addEventListener('click',e=>{const el=e.target.closest('[data-id]');if(el){openDetSheet(el.dataset.id);return;}const col=e.target.closest('[data-date]');if(col)openAddModal(col.dataset.date);});
  const allSess=days.flatMap(d=>sessionsOn(d));
  const totalMin=allSess.reduce((s,x)=>s+(x.duration||0),0);
  const totalKm=allSess.filter(x=>x.distance).reduce((s,x)=>s+(x.distance||0),0);
  const byDisc={};allSess.forEach(s=>{byDisc[s.discipline]=(byDisc[s.discipline]||0)+(s.duration||0);});
  let sumHtml=`<div class="tr-sum-pill"><span class="tr-sum-dot" style="background:#0A84FF"></span><span class="tr-sum-val">${Math.round(totalMin/60*10)/10}h</span><span class="tr-sum-lbl">total</span></div>`;
  if(totalKm)sumHtml+=`<div class="tr-sum-pill"><span class="tr-sum-val">${Math.round(totalKm*10)/10}</span><span class="tr-sum-lbl">km</span></div>`;
  Object.entries(byDisc).forEach(([disc,min])=>{const dc=DISC[disc]||DISC.run;sumHtml+=`<div class="tr-sum-pill"><span class="tr-sum-dot" style="background:${dc.color}"></span><span class="tr-sum-val">${min}m</span><span class="tr-sum-lbl">${dc.short}</span></div>`;});
  document.getElementById('trWeekSummary').innerHTML=sumHtml;
}

function renderMonth(){
  const todayStr=today(),first=new Date(trState.year,trState.month,1),last=new Date(trState.year,trState.month+1,0),startDow=first.getDay();
  const cells=[];
  for(let i=0;i<startDow;i++){const d=new Date(trState.year,trState.month,-(startDow-i-1));cells.push({ds:dk(d.getFullYear(),d.getMonth(),d.getDate()),other:true});}
  for(let d=1;d<=last.getDate();d++)cells.push({ds:dk(trState.year,trState.month,d),other:false});
  while(cells.length%7!==0){const idx=cells.length-startDow-last.getDate()+1;const d=new Date(trState.year,trState.month+1,idx);cells.push({ds:dk(d.getFullYear(),d.getMonth(),d.getDate()),other:true});}
  const grid=document.getElementById('trMonthGrid');
  grid.innerHTML=cells.map(c=>{
    const d=parseD(c.ds),isT=c.ds===todayStr,sess=sessionsOn(c.ds);
    const dots=sess.slice(0,4).map(s=>`<div class="tr-mc-dot" style="background:${discColor(s.discipline)}"></div>`).join('');
    return`<div class="tr-mc${c.other?' other':''}${isT?' today':''}" data-date="${c.ds}"><div class="tr-mc-num">${d.getDate()}</div><div class="tr-mc-dots">${dots}</div></div>`;
  }).join('');
  grid.addEventListener('click',e=>{const cell=e.target.closest('[data-date]');if(!cell)return;trState.selDate=cell.dataset.date;trState.view='day';switchView();document.querySelectorAll('.tr-view-btn').forEach(b=>b.classList.toggle('active',b.dataset.view==='day'));render(null);});
}

function renderDayView(){
  const ds=trState.selDate||today(),d=parseD(ds),sess=sessionsOn(ds);
  const dayName=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d.getDay()];
  const rec=getWhoopRecovery(ds),lifeEvs=getLifeEventsOn(ds);
  let html=`<div class="tr-day-hdr">${dayName}, ${MONTHS[d.getMonth()].slice(0,3)} ${d.getDate()}`;
  if(rec)html+=` <span style="font-size:13px;color:${recoveryColor(rec)};font-weight:400;margin-left:8px">Whoop ${rec}%</span>`;
  html+='</div>';
  if(lifeEvs.length)html+=`<div style="font-size:12px;color:rgba(244,63,94,.7);padding:4px 0 10px">⚠️ ${lifeEvs.map(e=>e.title).join(', ')}</div>`;
  if(!sess.length)html+=`<div style="text-align:center;padding:40px 0;color:var(--text3);font-size:14px">No sessions — tap + to add one</div>`;
  sess.forEach(s=>{
    const dc=DISC[s.discipline]||DISC.run;const meta=[];
    if(s.time)meta.push(fmt12(s.time));if(s.duration)meta.push(s.duration+' min');if(s.distance)meta.push(s.distance+' km');if(s.intensity)meta.push(s.intensity);if(s.hrZone)meta.push(s.hrZone);
    html+=`<div class="tr-day-card" data-id="${s.id}">
      <div class="tr-dcard-top"><span class="tr-dcard-icon">${dc.label.split(' ')[0]}</span><span class="tr-dcard-title">${s.name}</span><span class="tr-dcard-badge" style="background:${dc.color}">${dc.short}</span>${s.aiGen?'<span title="AI">🤖</span>':''}</div>
      <div class="tr-dcard-meta">${meta.join(' · ')}${s.notes?'<br><span style="opacity:.7">'+s.notes+'</span>':''}</div>
      ${!s.done?`<button class="tr-dcard-done" data-id="${s.id}">✓ Mark as done</button>`:'<div style="color:var(--green);font-size:13px;font-weight:600;margin-top:8px">✓ Completed</div>'}
    </div>`;
  });
  document.getElementById('trDayView').innerHTML=html;
  document.querySelectorAll('.tr-day-card').forEach(el=>{el.addEventListener('click',e=>{if(e.target.closest('.tr-dcard-done'))return;openDetSheet(el.dataset.id);});});
  document.querySelectorAll('.tr-dcard-done').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();const s=trState.sessions.find(x=>x.id===btn.dataset.id);if(s){s.done=true;save();renderDayView();}});});
}

function switchView(){
  const v=trState.view;
  document.getElementById('viewWeek').style.display=v==='week'?'flex':'none';
  document.getElementById('viewMonth').style.display=v==='month'?'flex':'none';
  document.getElementById('viewDay').style.display=v==='day'?'block':'none';
  if(v==='month'){document.getElementById('viewMonth').style.flexDirection='column';document.getElementById('viewMonth').style.flex='1';}
}
function render(){renderNavTitle();switchView();if(trState.view==='week')renderWeek();else if(trState.view==='month')renderMonth();else renderDayView();}

document.getElementById('trPrev').addEventListener('click',()=>{
  if(trState.view==='week'){const d=parseD(trState.selDate||today());d.setDate(d.getDate()-7);trState.selDate=dk(d.getFullYear(),d.getMonth(),d.getDate());}
  else if(trState.view==='month'){trState.month--;if(trState.month<0){trState.month=11;trState.year--;}}
  else{const d=parseD(trState.selDate||today());d.setDate(d.getDate()-1);trState.selDate=dk(d.getFullYear(),d.getMonth(),d.getDate());}
  render();
});
document.getElementById('trNext').addEventListener('click',()=>{
  if(trState.view==='week'){const d=parseD(trState.selDate||today());d.setDate(d.getDate()+7);trState.selDate=dk(d.getFullYear(),d.getMonth(),d.getDate());}
  else if(trState.view==='month'){trState.month++;if(trState.month>11){trState.month=0;trState.year++;}}
  else{const d=parseD(trState.selDate||today());d.setDate(d.getDate()+1);trState.selDate=dk(d.getFullYear(),d.getMonth(),d.getDate());}
  render();
});
document.querySelectorAll('.tr-view-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.tr-view-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');trState.view=btn.dataset.view;if(!trState.selDate)trState.selDate=today();render();});});

let txS=0,tyS=0;
document.getElementById('trApp').addEventListener('touchstart',e=>{txS=e.changedTouches[0].clientX;tyS=e.changedTouches[0].clientY;},{passive:true});
document.getElementById('trApp').addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-txS,dy=e.changedTouches[0].clientY-tyS;if(Math.abs(dx)>Math.abs(dy)*1.5&&Math.abs(dx)>44){if(dx<0)document.getElementById('trNext').click();else document.getElementById('trPrev').click();}},{passive:true});

/* ====== Detail sheet ====== */
function openDetSheet(id){
  const s=trState.sessions.find(x=>x.id===id);if(!s)return;
  const dc=DISC[s.discipline]||DISC.run;
  const meta=[];if(s.date)meta.push(s.date);if(s.time)meta.push(fmt12(s.time));if(s.duration)meta.push(s.duration+' min');if(s.distance)meta.push(s.distance+' km');if(s.intensity)meta.push(s.intensity);if(s.hrZone)meta.push(s.hrZone);
  document.getElementById('trDetContent').innerHTML=`
    <span class="tr-det-badge" style="background:${dc.color};color:rgba(0,0,0,.85)">${dc.label}</span>
    <div class="tr-det-title">${s.name}</div>
    <div class="tr-det-meta">${meta.join(' · ')}${s.notes?'<br><br>'+s.notes:''}${s.aiGen?'<br>🤖 AI planned':''}</div>
    ${s.done?'<div style="color:var(--green);font-size:14px;font-weight:600;margin-top:12px">✓ Completed</div>':''}
    <div class="tr-det-actions">
      <button class="tr-det-complete" data-id="${s.id}">${s.done?'✓ Done':'Mark as done'}</button>
      <button class="tr-det-del" data-id="${s.id}">Delete</button>
    </div>`;
  document.getElementById('trDetContent').querySelector('.tr-det-complete').addEventListener('click',()=>{const sess=trState.sessions.find(x=>x.id===id);if(sess){sess.done=!sess.done;save();closeDetSheet();render();}});
  document.getElementById('trDetContent').querySelector('.tr-det-del').addEventListener('click',()=>{trState.sessions=trState.sessions.filter(x=>x.id!==id);save();closeDetSheet();render();});
  document.getElementById('trDetail').classList.add('open');
  document.getElementById('trDetOverlay').classList.add('open');
}
function closeDetSheet(){document.getElementById('trDetail').classList.remove('open');document.getElementById('trDetOverlay').classList.remove('open');}
document.getElementById('trDetOverlay').addEventListener('click',closeDetSheet);
document.getElementById('trFab').addEventListener('click',()=>openAddModal(trState.selDate||today()));

/* ====== Apple Calendar Modal ====== */
let modalState = {
  editingId: null,
  date: today(),
  time: '07:00',
  allDay: false,
  discipline: 'run',
  miniYear: new Date().getFullYear(),
  miniMonth: new Date().getMonth(),
  openPanel: null
};

function openAddModal(date){
  modalState.editingId=null;modalState.date=date||today();modalState.time='07:00';
  modalState.allDay=false;modalState.discipline='run';modalState.openPanel=null;
  const pd=parseD(modalState.date);modalState.miniYear=pd.getFullYear();modalState.miniMonth=pd.getMonth();
  document.getElementById('acName').value='';document.getElementById('acLocation').value='';
  document.getElementById('acDuration').value='';document.getElementById('acDistance').value='';
  document.getElementById('acIntensity').value='';document.getElementById('acHrZone').value='';
  document.getElementById('acNotes').value='';
  updateModalUI();
  document.getElementById('acModal').classList.add('open');
  document.getElementById('acOverlay').classList.add('open');
  document.body.style.overflow='hidden';
  setTimeout(()=>document.getElementById('acName').focus(),350);
}
function closeModal(){
  document.getElementById('acModal').classList.remove('open');
  document.getElementById('acOverlay').classList.remove('open');
  document.getElementById('acDiscSheet').classList.remove('open');
  document.body.style.overflow='';
}

function updateModalUI(){
  document.getElementById('acStartDateBtn').textContent=fmtDE(modalState.date);
  document.getElementById('acStartTimeBtn').textContent=modalState.time;
  document.getElementById('acStartDateBtn').classList.toggle('active',modalState.openPanel==='date');
  document.getElementById('acStartTimeBtn').classList.toggle('active',modalState.openPanel==='time');
  document.getElementById('acAllDayToggle').classList.toggle('on',modalState.allDay);
  document.getElementById('acStartTimeBtn').style.display=modalState.allDay?'none':'';
  const dc=DISC[modalState.discipline]||DISC.run;
  document.getElementById('acDiscDot').style.background=dc.color;
  document.getElementById('acDiscVal').textContent=dc.short;
  document.getElementById('acCalPanel').classList.toggle('open',modalState.openPanel==='date');
  document.getElementById('acTimePanel').classList.toggle('open',modalState.openPanel==='time');
  if(modalState.openPanel==='date')renderMiniCal();
  if(modalState.openPanel==='time')renderTimePicker();
}

function renderMiniCal(){
  const todayStr=today();
  document.getElementById('acMiniMonthTitle').innerHTML=MONTHS[modalState.miniMonth]+' '+modalState.miniYear+' <span class="chevron">›</span>';
  const first=new Date(modalState.miniYear,modalState.miniMonth,1);
  const last=new Date(modalState.miniYear,modalState.miniMonth+1,0);
  const startDow=(first.getDay()+6)%7;
  const cells=[];
  for(let i=0;i<startDow;i++){const d=new Date(modalState.miniYear,modalState.miniMonth,-(startDow-i-1));cells.push({ds:dk(d.getFullYear(),d.getMonth(),d.getDate()),other:true});}
  for(let d=1;d<=last.getDate();d++)cells.push({ds:dk(modalState.miniYear,modalState.miniMonth,d),other:false});
  while(cells.length%7!==0){const idx=cells.length-startDow-last.getDate()+1;const d=new Date(modalState.miniYear,modalState.miniMonth+1,idx);cells.push({ds:dk(d.getFullYear(),d.getMonth(),d.getDate()),other:true});}
  const grid=document.getElementById('acMiniGrid');
  grid.innerHTML=cells.map(c=>{
    const d=parseD(c.ds),isT=c.ds===todayStr,isSel=c.ds===modalState.date;
    return`<div class="ac-mini-day${c.other?' other-month':''}${isT?' today':''}${isSel?' selected':''}" data-date="${c.ds}">${d.getDate()}</div>`;
  }).join('');
  grid.onclick=null;
  grid.addEventListener('click',e=>{const el=e.target.closest('[data-date]');if(!el)return;modalState.date=el.dataset.date;const pd=parseD(modalState.date);modalState.miniYear=pd.getFullYear();modalState.miniMonth=pd.getMonth();updateModalUI();});
}

document.getElementById('acMiniPrev').addEventListener('click',()=>{modalState.miniMonth--;if(modalState.miniMonth<0){modalState.miniMonth=11;modalState.miniYear--;}renderMiniCal();});
document.getElementById('acMiniNext').addEventListener('click',()=>{modalState.miniMonth++;if(modalState.miniMonth>11){modalState.miniMonth=0;modalState.miniYear++;}renderMiniCal();});

const HOURS=Array.from({length:24},(_,i)=>p2(i));
const MINS=Array.from({length:12},(_,i)=>p2(i*5));

function buildPickerCol(el,items,selItem){
  el.innerHTML='';
  const tp=document.createElement('div');tp.className='ac-pick-pad';el.appendChild(tp);
  items.forEach(item=>{const div=document.createElement('div');div.className='ac-pick-item'+(item===selItem?' sel':'');div.textContent=item;el.appendChild(div);});
  const bp=document.createElement('div');bp.className='ac-pick-pad';el.appendChild(bp);
  const idx=items.indexOf(selItem);if(idx>=0)requestAnimationFrame(()=>{el.scrollTop=idx*44;});
}

function renderTimePicker(){
  const[h,m]=modalState.time.split(':');
  const selMin=p2(Math.round(parseInt(m)/5)*5);
  const hCol=document.getElementById('acHourCol'),mCol=document.getElementById('acMinCol');
  buildPickerCol(hCol,HOURS,h);buildPickerCol(mCol,MINS,selMin==='60'?'00':selMin);
  function onScroll(col,items,setter){let t;return()=>{clearTimeout(t);t=setTimeout(()=>{const idx=Math.max(0,Math.min(Math.round(col.scrollTop/44),items.length-1));col.querySelectorAll('.ac-pick-item').forEach((el,i)=>el.classList.toggle('sel',i===idx));setter(items[idx]);col.scrollTo({top:idx*44,behavior:'smooth'});},120);};}
  hCol.onscroll=onScroll(hCol,HOURS,val=>{const[,m]=modalState.time.split(':');modalState.time=val+':'+m;document.getElementById('acStartTimeBtn').textContent=modalState.time;});
  mCol.onscroll=onScroll(mCol,MINS,val=>{const[h]=modalState.time.split(':');modalState.time=h+':'+val;document.getElementById('acStartTimeBtn').textContent=modalState.time;});
}

document.getElementById('acStartDateBtn').addEventListener('click',()=>{modalState.openPanel=modalState.openPanel==='date'?null:'date';const pd=parseD(modalState.date);modalState.miniYear=pd.getFullYear();modalState.miniMonth=pd.getMonth();updateModalUI();});
document.getElementById('acStartTimeBtn').addEventListener('click',()=>{modalState.openPanel=modalState.openPanel==='time'?null:'time';updateModalUI();});
document.getElementById('acAllDayToggle').addEventListener('click',()=>{modalState.allDay=!modalState.allDay;if(modalState.allDay)modalState.openPanel=null;updateModalUI();});

document.getElementById('acDiscRow').addEventListener('click',()=>{
  const opt=document.getElementById('acDiscOptions');
  opt.innerHTML=Object.entries(DISC).map(([k,v])=>`<div class="ac-opt-row" data-disc="${k}"><span class="ac-opt-row-label"><span style="width:10px;height:10px;border-radius:50%;background:${v.color};display:inline-block;margin-right:6px"></span>${v.label}</span>${modalState.discipline===k?'<span class="ac-opt-check">✓</span>':''}</div>`).join('');
  opt.onclick=null;opt.addEventListener('click',e=>{const row=e.target.closest('[data-disc]');if(!row)return;modalState.discipline=row.dataset.disc;document.getElementById('acDiscSheet').classList.remove('open');updateModalUI();});
  document.getElementById('acDiscSheet').classList.add('open');
});
document.getElementById('acDiscCancel').addEventListener('click',()=>document.getElementById('acDiscSheet').classList.remove('open'));

document.getElementById('acClose').addEventListener('click',closeModal);
document.getElementById('acOverlay').addEventListener('click',closeModal);

document.getElementById('acDone').addEventListener('click',()=>{
  const name=document.getElementById('acName').value.trim();
  if(!name){document.getElementById('acName').focus();document.getElementById('acName').style.outline='2px solid var(--red)';setTimeout(()=>document.getElementById('acName').style.outline='',1500);return;}
  const s={
    id:modalState.editingId||'tr_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),
    discipline:modalState.discipline,name,date:modalState.date,
    time:modalState.allDay?null:modalState.time,
    duration:Number(document.getElementById('acDuration').value)||null,
    distance:Number(document.getElementById('acDistance').value)||null,
    intensity:document.getElementById('acIntensity').value||null,
    hrZone:document.getElementById('acHrZone').value||null,
    notes:document.getElementById('acNotes').value.trim()||null,
    done:false,aiGen:false
  };
  if(modalState.editingId){const idx=trState.sessions.findIndex(x=>x.id===modalState.editingId);if(idx>=0)trState.sessions[idx]={...trState.sessions[idx],...s,done:trState.sessions[idx].done};}
  else{trState.sessions.push(s);}
  save();closeModal();render();
});

/* ====== Groq AI ====== */
function showAiLoader(t){document.getElementById('aiLoadingText').textContent=t||'Groq is building your plan…';document.getElementById('aiLoading').classList.add('show');}
function hideAiLoader(){document.getElementById('aiLoading').classList.remove('show');}

async function callGroq(prompt){
  const res=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+GROQ_API_KEY},body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'user',content:prompt}],temperature:.7,max_tokens:2500})});
  if(!res.ok)throw new Error('Groq error '+res.status);return(await res.json()).choices[0].message.content;
}
function parseAiSessions(raw){const m=raw.match(/\[[\s\S]*\]/);if(!m)throw new Error('No JSON array');return JSON.parse(m[0]);}

document.getElementById('aiWeekBtn').addEventListener('click',async()=>{
  if(!GROQ_API_KEY){document.getElementById('groqBanner').style.display='block';return;}
  const days=weekDays(trState.selDate||today());
  const life=JSON.parse(localStorage.getItem('life_calendar_v1')||'[]').filter(e=>e.date>=days[0]&&e.date<=days[6]);
  const recent=trState.sessions.slice(-14).map(s=>({discipline:s.discipline,name:s.name,duration:s.duration,done:s.done}));
  const prompt=`You are a triathlon/Hyrox coach. Create a 7-day training plan.\nWeek: ${days.join(', ')}\nLife events: ${JSON.stringify(life)}\nRecent history: ${JSON.stringify(recent)}\n\nReturn ONLY a JSON array:\n[{"date":"YYYY-MM-DD","discipline":"run|bike|swim|strength|hyrox|race|rest","name":"string","duration":60,"distance":10,"intensity":"Easy|Tempo|Interval|Race Pace","hrZone":"Z1|Z2|Z3|Z4|Z5","notes":"string"}]`;
  showAiLoader('Groq is planning your week…');document.getElementById('aiWeekBtn').disabled=true;
  try{const sessions=parseAiSessions(await callGroq(prompt));sessions.forEach(s=>{if(!s.date||!s.discipline||!s.name)return;trState.sessions.push({id:'ai_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),discipline:s.discipline,name:s.name,date:s.date,time:null,duration:s.duration||null,distance:s.distance||null,intensity:s.intensity||null,hrZone:s.hrZone||null,notes:s.notes||null,done:false,aiGen:true});});save();render();}
  catch(e){alert('AI planning failed: '+e.message);}
  finally{hideAiLoader();document.getElementById('aiWeekBtn').disabled=false;}
});

document.getElementById('aiMonthBtn').addEventListener('click',async()=>{
  if(!GROQ_API_KEY){document.getElementById('groqBanner').style.display='block';return;}
  const start=today();const allDays=Array.from({length:28},(_,i)=>{const d=parseD(start);d.setDate(d.getDate()+i);return dk(d.getFullYear(),d.getMonth(),d.getDate());});
  const life=JSON.parse(localStorage.getItem('life_calendar_v1')||'[]').filter(e=>e.date>=allDays[0]&&e.date<=allDays[27]);
  const recent=trState.sessions.slice(-14).map(s=>({discipline:s.discipline,name:s.name,duration:s.duration,done:s.done}));
  const prompt=`Create a 4-week periodized training plan (Week1=Base, Week2=Build, Week3=Peak, Week4=Taper).\nDates: ${allDays[0]} to ${allDays[27]}\nLife events: ${JSON.stringify(life)}\nRecent: ${JSON.stringify(recent)}\n\nReturn ONLY JSON array with same structure as before. Include rest days.`;
  showAiLoader('Groq is building 4-week plan…');document.getElementById('aiMonthBtn').disabled=true;
  try{const sessions=parseAiSessions(await callGroq(prompt));sessions.forEach(s=>{if(!s.date||!s.discipline||!s.name)return;trState.sessions.push({id:'ai_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),discipline:s.discipline,name:s.name,date:s.date,time:null,duration:s.duration||null,distance:s.distance||null,intensity:s.intensity||null,hrZone:s.hrZone||null,notes:s.notes||null,done:false,aiGen:true});});save();render();}
  catch(e){alert('AI planning failed: '+e.message);}
  finally{hideAiLoader();document.getElementById('aiMonthBtn').disabled=false;}
});

async function reqNotifs(){if('Notification'in window&&Notification.permission==='default')await Notification.requestPermission();}

document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(document.getElementById('acDiscSheet').classList.contains('open')){document.getElementById('acDiscSheet').classList.remove('open');return;}closeModal();closeDetSheet();}
  const modalOpen=document.getElementById('acModal').classList.contains('open');
  if(!modalOpen){if(e.key==='ArrowLeft')document.getElementById('trPrev').click();if(e.key==='ArrowRight')document.getElementById('trNext').click();}
});

load();trState.selDate=today();
if(!GROQ_API_KEY)document.getElementById('groqBanner').style.display='block';
render();reqNotifs();

})();

})();