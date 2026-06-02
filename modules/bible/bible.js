(function(){
'use strict';

// ═══════════════════════════════════════════
// BIBLE DATA
// ═══════════════════════════════════════════
const BOOKS=[
  ['Genesis',50,'OT'],['Exodus',40,'OT'],['Leviticus',27,'OT'],['Numbers',36,'OT'],['Deuteronomy',34,'OT'],
  ['Joshua',24,'OT'],['Judges',21,'OT'],['Ruth',4,'OT'],['1 Samuel',31,'OT'],['2 Samuel',24,'OT'],
  ['1 Kings',22,'OT'],['2 Kings',25,'OT'],['1 Chronicles',29,'OT'],['2 Chronicles',36,'OT'],['Ezra',10,'OT'],
  ['Nehemiah',13,'OT'],['Esther',10,'OT'],['Job',42,'OT'],['Psalms',150,'OT'],['Proverbs',31,'OT'],
  ['Ecclesiastes',12,'OT'],['Song of Songs',8,'OT'],['Isaiah',66,'OT'],['Jeremiah',52,'OT'],['Lamentations',5,'OT'],
  ['Ezekiel',48,'OT'],['Daniel',12,'OT'],['Hosea',14,'OT'],['Joel',3,'OT'],['Amos',9,'OT'],
  ['Obadiah',1,'OT'],['Jonah',4,'OT'],['Micah',7,'OT'],['Nahum',3,'OT'],['Habakkuk',3,'OT'],
  ['Zephaniah',3,'OT'],['Haggai',2,'OT'],['Zechariah',14,'OT'],['Malachi',4,'OT'],
  ['Matthew',28,'NT'],['Mark',16,'NT'],['Luke',24,'NT'],['John',21,'NT'],['Acts',28,'NT'],
  ['Romans',16,'NT'],['1 Corinthians',16,'NT'],['2 Corinthians',13,'NT'],['Galatians',6,'NT'],
  ['Ephesians',6,'NT'],['Philippians',4,'NT'],['Colossians',4,'NT'],['1 Thessalonians',5,'NT'],
  ['2 Thessalonians',3,'NT'],['1 Timothy',6,'NT'],['2 Timothy',4,'NT'],['Titus',3,'NT'],
  ['Philemon',1,'NT'],['Hebrews',13,'NT'],['James',5,'NT'],['1 Peter',5,'NT'],['2 Peter',3,'NT'],
  ['1 John',5,'NT'],['2 John',1,'NT'],['3 John',1,'NT'],['Jude',1,'NT'],['Revelation',22,'NT']
];
const TOTAL_CHAPTERS=1189;

// Flat chapter list [{bi,ch}]
const CL=[]; const BS=[];
BOOKS.forEach(([,ch],bi)=>{BS[bi]=CL.length;for(let c=1;c<=ch;c++)CL.push({bi,c});});

// Format reading: [{bi,c}] → string
function fmtReading(chapters){
  if(!chapters||!chapters.length)return'Rest day';
  const groups=[];let g=null;
  chapters.forEach(({bi,c})=>{
    if(g&&g.bi===bi&&c===g.end+1){g.end=c;}
    else{if(g)groups.push(g);g={bi,start:c,end:c};}
  });
  if(g)groups.push(g);
  return groups.map(({bi,start,end})=>start===end?`${BOOKS[bi][0]} ${start}`:`${BOOKS[bi][0]} ${start}–${end}`).join(' · ');
}

// Get day's chapters for a preset plan
function getPlanChapters(plan, dayNum){
  const id=plan.presetId;
  if(id==='bible_1_year'){
    const s=Math.floor((dayNum-1)*TOTAL_CHAPTERS/365);
    const e=Math.floor(dayNum*TOTAL_CHAPTERS/365);
    return CL.slice(s,e);
  }
  if(id==='nt_90'){
    const ntStart=BS[39];
    const s=Math.floor((dayNum-1)*260/90);
    const e=Math.floor(dayNum*260/90);
    return CL.slice(ntStart+s,ntStart+e);
  }
  if(id==='psalms_proverbs'){
    const psTotal=181;
    const cyc=((dayNum-1)%30)+1;
    const s=Math.floor((cyc-1)*psTotal/30);
    const e=Math.floor(cyc*psTotal/30);
    return CL.slice(BS[18]+s,BS[18]+e);
  }
  if(id==='custom'){
    const bi=plan.customBook||0;
    const cpd=plan.chaptersPerDay||3;
    const s=BS[bi]+((dayNum-1)*cpd);
    const e=Math.min(BS[bi]+dayNum*cpd,BS[bi]+BOOKS[bi][1]);
    return CL.slice(s,e);
  }
  return[];
}

// Days elapsed from startDate to today
function daysElapsed(startDate){
  const s=new Date(startDate+'T00:00:00');
  const t=new Date(todayKey()+'T00:00:00');
  return Math.max(1,Math.round((t-s)/86400000)+1);
}

// ═══════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════
const KEY='bible_plan_v1';
function load(){try{return JSON.parse(localStorage.getItem(KEY))||defState();}catch{return defState();}}
function save(s){localStorage.setItem(KEY,JSON.stringify(s));}
function defState(){return{plans:[],log:{},readChapters:{},notifications:{enabled:false,time:'20:00'},longestStreak:0};}
function todayKey(){const d=new Date();return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function dateOffset(k,days){const d=new Date(k+'T12:00:00');d.setDate(d.getDate()+days);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}

// ═══════════════════════════════════════════
// STREAK
// ═══════════════════════════════════════════
function calcStreak(log){
  let streak=0,k=todayKey();
  // if today read, count it; otherwise start from yesterday
  if(!log[k]?.read) k=dateOffset(k,-1);
  while(log[k]?.read){streak++;k=dateOffset(k,-1);}
  return streak;
}
function calcMissedDays(log,plans){
  if(!plans.length)return[];
  const oldest=plans.reduce((a,p)=>p.startDate<a?p.startDate:a,'9999');
  const missed=[];
  let k=oldest;
  const today=todayKey();
  while(k<today){
    if(!log[k]?.read) missed.push(k);
    k=dateOffset(k,1);
  }
  return missed;
}

// ═══════════════════════════════════════════
// MARK CHAPTERS READ
// ═══════════════════════════════════════════
function markChaptersRead(state,chapters){
  chapters.forEach(({bi,c})=>{
    if(!state.readChapters[bi])state.readChapters[bi]=[];
    if(!state.readChapters[bi].includes(c))state.readChapters[bi].push(c);
  });
}
function totalChaptersRead(state){
  return Object.values(state.readChapters).reduce((a,v)=>a+v.length,0);
}

// ═══════════════════════════════════════════
// PLAN MODAL
// ═══════════════════════════════════════════
let selectedPlan='bible_1_year';
window.openPlanModal=function(){
  selectedPlan='bible_1_year';
  refreshPlanOptions();
  document.getElementById('planStartDate').value=todayKey();
  // Populate book select
  const sel=document.getElementById('customBook');
  sel.innerHTML=BOOKS.map(([n],i)=>`<option value="${i}">${n}</option>`).join('');
  document.getElementById('planModal').classList.add('open');
};
window.closePlanModal=function(){document.getElementById('planModal').classList.remove('open');};
window.selectPlan=function(id){
  selectedPlan=id;
  document.getElementById('customFields').classList.toggle('show',id==='custom');
  refreshPlanOptions();
};
function refreshPlanOptions(){
  ['bible_1_year','nt_90','psalms_proverbs','custom'].forEach(id=>{
    document.getElementById('opt-'+id)?.classList.toggle('sel',id===selectedPlan);
    const chk=document.getElementById('chk-'+id);
    if(chk)chk.innerHTML=id===selectedPlan?'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>':'';
  });
}
window.addPlan=function(){
  const state=load();
  const startDate=document.getElementById('planStartDate').value||todayKey();
  const plan={
    id:'plan_'+(Date.now()),
    presetId:selectedPlan,
    name:selectedPlan==='custom'?document.getElementById('customName').value||'Custom Plan':
         selectedPlan==='bible_1_year'?'Bible in 1 Year':
         selectedPlan==='nt_90'?'New Testament in 90 Days':'Psalms & Proverbs',
    startDate,
    paused:false,
    customBook:parseInt(document.getElementById('customBook').value)||0,
    chaptersPerDay:parseInt(document.getElementById('customChapters').value)||3,
  };
  state.plans.push(plan);
  save(state);
  window.closePlanModal();
  renderAll();
};
window.removePlan=function(id){
  if(!confirm('Remove this plan?'))return;
  const state=load();
  state.plans=state.plans.filter(p=>p.id!==id);
  save(state);
  renderAll();
};
window.togglePause=function(id){
  const state=load();
  const p=state.plans.find(p=>p.id===id);
  if(p)p.paused=!p.paused;
  save(state);
  renderAll();
};

// ═══════════════════════════════════════════
// MARK TODAY READ
// ═══════════════════════════════════════════
window.toggleRead=function(){
  const state=load();
  const today=todayKey();
  const wasRead=state.log[today]?.read;
  if(!wasRead){
    // Gather today's chapters from all active plans
    const chapters=[];
    state.plans.filter(p=>!p.paused).forEach(p=>{
      const day=daysElapsed(p.startDate);
      getPlanChapters(p,day).forEach(c=>{if(!chapters.find(x=>x.bi===c.bi&&x.c===c.c))chapters.push(c);});
    });
    markChaptersRead(state,chapters);
    if(!state.log[today])state.log[today]={};
    state.log[today].read=true;
    // Update longest streak
    const streak=calcStreak(state.log);
    if(streak>state.longestStreak)state.longestStreak=streak;
  } else {
    if(state.log[today])state.log[today].read=false;
  }
  save(state);
  renderAll();
};

window.saveNotes=function(){
  const state=load();
  const today=todayKey();
  if(!state.log[today])state.log[today]={};
  state.log[today].notes=document.getElementById('notesField')?.value||'';
  state.log[today].verse=document.getElementById('verseField')?.value||'';
  save(state);
};
window.markMissedRead=function(){
  const state=load();
  const missed=calcMissedDays(state.log,state.plans);
  missed.forEach(k=>{if(!state.log[k])state.log[k]={};state.log[k].read=true;});
  save(state);
  renderAll();
};
window.skipMissed=function(){
  const state=load();
  const missed=calcMissedDays(state.log,state.plans);
  missed.forEach(k=>{if(!state.log[k])state.log[k]={};state.log[k].skipped=true;});
  save(state);
  renderAll();
};

// ═══════════════════════════════════════════
// RENDER
// ═══════════════════════════════════════════
function renderAll(){
  const state=load();
  renderBacklog(state);
  renderToday(state);
  renderStreak(state);
  renderCalendar(state);
  renderProgress(state);
  renderStats(state);
  renderPlans(state);
}

function renderBacklog(state){
  const banner=document.getElementById('backlogBanner');
  if(!state.plans.length){banner.style.display='none';return;}
  const missed=calcMissedDays(state.log,state.plans);
  if(missed.length<3){banner.style.display='none';return;}
  banner.style.display='block';
  banner.innerHTML=`<div class="backlog-banner">
    <div class="backlog-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>️</div>
    <div style="flex:1">
      <div class="backlog-title">${missed.length} Missed Days</div>
      <div class="backlog-desc">You've missed ${missed.length} day${missed.length!==1?'s':''} of reading. What would you like to do?</div>
      <div class="backlog-btns">
        <button class="backlog-btn pri" onclick="markMissedRead()">Mark All Read</button>
        <button class="backlog-btn sec" onclick="skipMissed()">Skip Them</button>
      </div>
    </div>
  </div>`;
}

function renderToday(state){
  const card=document.getElementById('todayCard');
  const today=todayKey();
  const isRead=state.log[today]?.read;
  const d=new Date();
  const dateStr=d.toLocaleDateString('en',{weekday:'long',month:'long',day:'numeric'});

  if(!state.plans.length){
    card.innerHTML=`<div class="no-plan-msg">No active reading plan.<br>Add a plan below to get started.</div>`;
    return;
  }

  // Gather today's reading from all active plans
  const readingParts=[];
  state.plans.filter(p=>!p.paused).forEach(p=>{
    const day=daysElapsed(p.startDate);
    const chapters=getPlanChapters(p,day);
    if(chapters.length)readingParts.push({plan:p,text:fmtReading(chapters)});
  });

  const readingText=readingParts.map(r=>r.text).join('\n')||'Rest day';
  const notesVal=state.log[today]?.notes||'';
  const verseVal=state.log[today]?.verse||'';

  card.innerHTML=`
    <div class="today-header">
      <span class="today-label">Today's Reading</span>
      <span class="today-date">${dateStr}</span>
    </div>
    <div class="today-reading">${readingText.replace(/\n/g,'<br>')}</div>
    ${readingParts.length>1?`<div class="today-sub">${readingParts.map(r=>`<span style="color:var(--t3)">${r.plan.name}</span>`).join(' · ')}</div>`:''}
    <button class="check-btn ${isRead?'done':'unread'}" onclick="toggleRead()">
      ${isRead
        ?`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Done — Marked Read`
        :`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg> Mark as Read`}
    </button>
    <div class="notes-wrap">
      <div class="notes-label">Notes</div>
      <textarea class="notes-ta" id="notesField" placeholder="What impacted you from today's reading?" rows="3" onblur="saveNotes()">${notesVal}</textarea>
      <div class="notes-label" style="margin-top:10px">Favourite Verse</div>
      <input type="text" class="verse-field" id="verseField" placeholder="e.g. John 3:16 — For God so loved..." value="${verseVal.replace(/"/g,'&quot;')}" onblur="saveNotes()">
    </div>`;
}

function renderStreak(state){
  const card=document.getElementById('streakCard');
  const streak=calcStreak(state.log);
  const longest=Math.max(streak,state.longestStreak||0);
  const today=todayKey();
  const isRead=state.log[today]?.read;
  card.innerHTML=`
    <div class="streak-row">
      <div class="streak-pill">
        <span class="streak-fire"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span>
        <span class="streak-num">${streak}</span>
        <span class="streak-label">day streak</span>
      </div>
      ${isRead?`<div style="display:flex;align-items:center;gap:6px;font-size:14px;color:var(--green)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg> Today complete</div>`:''}
    </div>
    <div style="display:flex;gap:16px;margin-top:4px">
      <div><div style="font-size:13px;color:var(--t3)">Longest streak</div><div style="font-size:18px;font-weight:700">${longest} days</div></div>
      <div style="margin-left:auto;text-align:right"><div style="font-size:13px;color:var(--t3)">Active plans</div><div style="font-size:18px;font-weight:700">${state.plans.filter(p=>!p.paused).length}</div></div>
    </div>`;
}

function renderCalendar(state){
  const card=document.getElementById('calCard');
  const today=todayKey();
  let html='<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">';
  const days=['S','M','T','W','T','F','S'];
  days.forEach(d=>html+=`<div style="font-size:9px;color:var(--t4);text-align:center;padding-bottom:2px">${d}</div>`);
  // Figure out day of week for 30 days ago
  const startDate=new Date(today+'T12:00:00');
  startDate.setDate(startDate.getDate()-29);
  const startDow=startDate.getDay();
  // Fill leading blanks
  for(let i=0;i<startDow;i++)html+=`<div></div>`;
  for(let i=0;i<30;i++){
    const k=dateOffset(today,i-29);
    const isToday=k===today;
    const read=state.log[k]?.read;
    const skipped=state.log[k]?.skipped;
    let bg='';
    if(read)bg='background:var(--green)';
    else if(skipped)bg='background:rgba(255,255,255,.03)';
    else bg='background:rgba(255,255,255,.06)';
    const ring=isToday?'box-shadow:0 0 0 2px var(--green);':'';
    html+=`<div style="aspect-ratio:1;border-radius:50%;${bg};${ring}"></div>`;
  }
  html+='</div>';
  html+=`<div class="cal-legend">
    <div class="cal-legend-item"><div class="cal-legend-dot" style="background:var(--green)"></div>Read</div>
    <div class="cal-legend-item"><div class="cal-legend-dot" style="background:rgba(255,255,255,.06)"></div>Missed</div>
    <div class="cal-legend-item"><div class="cal-legend-dot" style="background:rgba(255,255,255,.03)"></div>Skipped</div>
  </div>`;
  card.innerHTML=html;
}

function renderProgress(state){
  const card=document.getElementById('progressCard');
  const totalRead=totalChaptersRead(state);
  const pct=Math.round(totalRead/TOTAL_CHAPTERS*100);

  let booksHtml='';

  // OT books
  booksHtml+=`<div class="book-section-head">Old Testament</div>`;
  BOOKS.slice(0,39).forEach(([name,total],bi)=>{
    const read=(state.readChapters[bi]||[]).length;
    const bookPct=Math.round(read/total*100);
    const done=read>=total;
    booksHtml+=`<div class="book-row">
      <div class="book-name">${name}</div>
      <div class="book-bar-wrap"><div class="book-bar-fill" style="width:${bookPct}%"></div></div>
      <div class="book-pct">${read}/${total}</div>
      <div class="book-done">${done?'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>':''}</div>
    </div>`;
  });
  booksHtml+=`<div class="book-section-head">New Testament</div>`;
  BOOKS.slice(39).forEach(([name,total],i)=>{
    const bi=i+39;
    const read=(state.readChapters[bi]||[]).length;
    const bookPct=Math.round(read/total*100);
    const done=read>=total;
    booksHtml+=`<div class="book-row">
      <div class="book-name">${name}</div>
      <div class="book-bar-wrap"><div class="book-bar-fill" style="width:${bookPct}%"></div></div>
      <div class="book-pct">${read}/${total}</div>
      <div class="book-done">${done?'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>':''}</div>
    </div>`;
  });

  const booksCompleted=BOOKS.filter(([,total],bi)=>(state.readChapters[bi]||[]).length>=total).length;

  card.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">
      <div style="font-size:17px;font-weight:700">Bible Progress</div>
      <div style="font-size:28px;font-weight:800;color:var(--green)">${pct}<span style="font-size:16px;font-weight:600;color:var(--t3)">%</span></div>
    </div>
    <div class="prog-bar-wrap"><div class="prog-bar-fill" style="width:${pct}%"></div></div>
    <div class="prog-nums"><span>${totalRead} chapters read</span><span>${TOTAL_CHAPTERS} total · ${booksCompleted}/66 books</span></div>
    <div id="booksListWrap" style="margin-top:4px;max-height:300px;overflow-y:auto;display:none">${booksHtml}</div>
    <button class="books-toggle" onclick="toggleBooksList(this)">Show Per-Book Progress ▾</button>`;
}

window.toggleBooksList=function(btn){
  const wrap=document.getElementById('booksListWrap');
  if(wrap.style.display==='none'){wrap.style.display='block';btn.textContent='Hide Per-Book Progress ▴';}
  else{wrap.style.display='none';btn.textContent='Show Per-Book Progress ▾';}
};

function renderStats(state){
  const card=document.getElementById('statsCard');
  const totalRead=totalChaptersRead(state);
  const days=Object.values(state.log).filter(d=>d.read).length;
  const booksCompleted=BOOKS.filter(([,total],bi)=>(state.readChapters[bi]||[]).length>=total).length;
  const streak=calcStreak(state.log);
  const weeklyAvg=days>0?Math.round(totalRead/(Math.max(1,days)/7)):0;

  // Best month
  const monthCounts={};
  Object.entries(state.log).forEach(([k,v])=>{if(v.read){const m=k.slice(0,7);monthCounts[m]=(monthCounts[m]||0)+1;}});
  const bestMonth=Object.entries(monthCounts).sort((a,b)=>b[1]-a[1])[0];
  const bestMonthStr=bestMonth?`${new Date(bestMonth[0]+'-15').toLocaleDateString('en',{month:'short',year:'numeric'})} (${bestMonth[1]}d)`:'—';

  card.innerHTML=`<div class="stats-grid">
    <div class="stat-box"><div class="stat-val">${totalRead.toLocaleString()}</div><div class="stat-label">Chapters read</div></div>
    <div class="stat-box"><div class="stat-val">${booksCompleted}</div><div class="stat-label">Books completed</div></div>
    <div class="stat-box"><div class="stat-val">${weeklyAvg}</div><div class="stat-label">Avg chapters/week</div></div>
    <div class="stat-box"><div class="stat-val" style="font-size:18px">${bestMonthStr}</div><div class="stat-label">Best month</div></div>
  </div>`;
}

function renderPlans(state){
  const card=document.getElementById('plansCard');
  if(!state.plans.length){
    card.innerHTML=`<div style="text-align:center;padding:8px 0 4px;color:var(--t3);font-size:15px;margin-bottom:12px">No plans yet</div>
      <button onclick="openPlanModal()" style="width:100%;padding:14px;background:var(--green);color:#000;border:none;border-radius:14px;font-size:16px;font-weight:700">+ Add Reading Plan</button>`;
    return;
  }
  let html='';
  state.plans.forEach(p=>{
    const day=daysElapsed(p.startDate);
    const chapters=getPlanChapters(p,day);
    const dur=p.presetId==='bible_1_year'?365:p.presetId==='nt_90'?90:p.presetId==='psalms_proverbs'?30:null;
    const pct=dur?Math.min(100,Math.round(day/dur*100)):null;
    html+=`<div style="padding:14px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div>
          <div style="font-size:15px;font-weight:600">${p.name}</div>
          <div style="font-size:12px;color:var(--t3);margin-top:2px">Day ${day}${dur?' of '+dur:''} · ${p.paused?'<span style="color:var(--orange)">Paused</span>':'Active'}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="togglePause('${p.id}')" style="padding:6px 10px;background:rgba(255,255,255,.06);border:none;border-radius:8px;color:var(--t2);font-size:12px;font-weight:600">${p.paused?'Resume':'Pause'}</button>
          <button onclick="removePlan('${p.id}')" style="padding:6px 10px;background:rgba(248,113,113,.1);border:none;border-radius:8px;color:#f87171;font-size:12px;font-weight:600">Remove</button>
        </div>
      </div>
      ${pct!==null?`<div class="prog-bar-wrap" style="height:4px"><div class="prog-bar-fill" style="width:${pct}%"></div></div><div style="font-size:11px;color:var(--t4);margin-top:3px">${pct}% complete</div>`:''}
    </div>`;
  });
  html+=`<button onclick="openPlanModal()" style="width:100%;padding:12px;background:rgba(107,227,164,.1);border:1px solid var(--green-border);border-radius:12px;color:var(--green);font-size:15px;font-weight:600;margin-top:12px">+ Add Another Plan</button>`;
  card.innerHTML=html;
}

// ═══════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════
renderAll();
window.addEventListener('storage', renderAll);
window.addEventListener('focus', renderAll);

// Cloud sync
if(window.initCloudSync){
  window.initCloudSync({appKey:'bible-plan',syncedKeys:[KEY],onApplied:renderAll});
}

// ── OTHERS SUB-TAB SWITCHER ──
window.otSwitch=function(pane){
  document.getElementById('otTab-thoughts').classList.toggle('on',pane==='thoughts');
  document.getElementById('otTab-bible').classList.toggle('on',pane==='bible');
  document.getElementById('thoughtsPane').classList.toggle('on',pane==='thoughts');
  document.getElementById('mainPage').classList.toggle('on',pane==='bible');
  try{localStorage.setItem('ot_subtab',pane);}catch(e){}
  window.scrollTo(0,0);
};
(function(){try{const sv=localStorage.getItem('ot_subtab');if(sv==='bible')window.otSwitch('bible');}catch(e){}})();

})();
