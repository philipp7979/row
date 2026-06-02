(function(){
'use strict';

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
function openPlanModal(){
  selectedPlan='bible_1_year';
  refreshPlanOptions();
  const d=new Date();
  document.getElementById('planStartDate').value=todayKey();
  // Populate book select
  const sel=document.getElementById('customBook');
  sel.innerHTML=BOOKS.map(([n],i)=>`<option value="${i}">${n}</option>`).join('');
  document.getElementById('planModal').classList.add('open');
}
function closePlanModal(){document.getElementById('planModal').classList.remove('open');}
function selectPlan(id){
  selectedPlan=id;
  document.getElementById('customFields').classList.toggle('show',id==='custom');
  refreshPlanOptions();
}
function refreshPlanOptions(){
  ['bible_1_year','nt_90','psalms_proverbs','custom'].forEach(id=>{
    document.getElementById('opt-'+id)?.classList.toggle('sel',id===selectedPlan);
    const chk=document.getElementById('chk-'+id);
    if(chk)chk.innerHTML=id===selectedPlan?'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>':'';
  });
}
function addPlan(){
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
  closePlanModal();
  renderAll();
}
function removePlan(id){
  if(!confirm('Remove this plan?'))return;
  const state=load();
  state.plans=state.plans.filter(p=>p.id!==id);
  save(state);
  renderAll();
}
function togglePause(id){
  const state=load();
  const p=state.plans.find(p=>p.id===id);
  if(p)p.paused=!p.paused;
  save(state);
  renderAll();
}

// ═══════════════════════════════════════════
// MARK TODAY READ
// ═══════════════════════════════════════════
function toggleRead(){
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
}

function saveNotes(){
  const state=load();
  const today=todayKey();
  if(!state.log[today])state.log[today]={};
  state.log[today].notes=document.getElementById('notesField')?.value||'';
  state.log[today].verse=document.getElementById('verseField')?.value||'';
  save(state);
}
function markMissedRead(){
  const state=load();
  const missed=calcMissedDays(state.log,state.plans);
  missed.forEach(k=>{if(!state.log[k])state.log[k]={};state.log[k].read=true;});
  save(state);
  renderAll();
}
function skipMissed(){
  const state=load();
  const missed=calcMissedDays(state.log,state.plans);
  missed.forEach(k=>{if(!state.log[k])state.log[k]={};state.log[k].skipped=true;});
  save(state);
  renderAll();
}

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
  if(missed.length<5){banner.style.display='none';return;}
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
  const dateStr=d.toLocaleDateString('en',{weekday:'short',month:'short',day:'numeric'});
  const streak=calcStreak(state.log);

  if(!state.plans.length){
    card.innerHTML=`<div class="no-plan-msg" style="padding:8px 0 4px">No active reading plan.
      <br><br><button onclick="bxOpen('bxPlans');openPlanModal()"
        style="padding:12px;background:var(--green);color:#000;border:none;border-radius:12px;font-size:15px;font-weight:700;width:100%;cursor:pointer">
        + Add Reading Plan</button></div>`;
    return;
  }

  const readingParts=[];
  state.plans.filter(p=>!p.paused).forEach(p=>{
    const day=daysElapsed(p.startDate);
    const chapters=getPlanChapters(p,day);
    if(chapters.length)readingParts.push({plan:p,text:fmtReading(chapters)});
  });
  const readingText=readingParts.map(r=>r.text).join('\n')||'Rest day';

  const notesVal=state.log[today]?.notes||'';
  const verseVal=state.log[today]?.verse||'';
  const hasNotes=!!(notesVal||verseVal);

  // 30-day compact dots
  let dotsHtml='<div class="bx-dots">';
  for(let i=29;i>=0;i--){
    const k=dateOffset(today,-i);
    const isT=k===today;
    const read2=state.log[k]?.read;
    const skipped=state.log[k]?.skipped;
    const bg=read2?'var(--green)':skipped?'rgba(255,255,255,.04)':'rgba(255,255,255,.09)';
    const ring=isT?';outline:2px solid var(--green);outline-offset:1px':'';
    dotsHtml+=`<div style="width:9px;height:9px;border-radius:50%;background:${bg}${ring};flex-shrink:0"></div>`;
  }
  dotsHtml+='</div>';

  card.innerHTML=`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--t3)">${dateStr}</div>
      <div class="bx-streak-pill">
        <span style="font-size:14px">🔥</span>
        <span style="font-size:16px;font-weight:800;color:var(--green)">${streak}</span>
        <span style="font-size:12px;color:var(--t2);font-weight:500">day streak</span>
      </div>
    </div>
    <div class="today-reading" style="font-size:22px;line-height:1.3;margin-bottom:14px">${readingText.replace(/\n/g,'<br>')}</div>
    ${readingParts.length>1?`<div style="font-size:11px;color:var(--t3);margin-bottom:10px">${readingParts.map(r=>r.plan.name).join(' · ')}</div>`:''}
    <button class="check-btn ${isRead?'done':'unread'}" onclick="toggleRead()">
      ${isRead
        ?`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Done — Marked Read`
        :`<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg> Mark as Read`}
    </button>
    ${dotsHtml}
    <div style="margin-top:10px">
      <button id="noteToggleBtn" onclick="bxToggleNotes()"
        style="background:none;border:none;color:var(--t3);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;padding:0;display:flex;align-items:center;gap:5px">
        ${hasNotes?'📝 Note saved — edit':'✏️ Add Note'}
        <span id="noteArrow" style="font-size:10px;transition:transform .2s">${hasNotes?'▴':'▾'}</span>
      </button>
      <div id="notesSection" style="display:${hasNotes?'block':'none'};margin-top:8px">
        <div class="notes-label">Notes</div>
        <textarea class="notes-ta" id="notesField" placeholder="What impacted you from today's reading?" rows="2" onblur="saveNotes()">${notesVal}</textarea>
        <div class="notes-label" style="margin-top:8px">Favourite Verse</div>
        <input type="text" class="verse-field" id="verseField" placeholder="e.g. John 3:16 — For God so loved..." value="${verseVal.replace(/"/g,'&quot;')}" onblur="saveNotes()">
      </div>
    </div>`;
}

function renderStreak(state){
  // Streak is now shown inside renderToday — this is a no-op kept for API compat
}

function renderCalendar(state){
  // Calendar dots are now shown inside renderToday — this is a no-op kept for API compat
}

function renderProgress(state){
  const card=document.getElementById('progressCard');
  const totalRead=totalChaptersRead(state);
  const pct=Math.round(totalRead/TOTAL_CHAPTERS*100);

  let booksHtml='';
  let showingAll=false;
  const showToggle=BOOKS.length>10;

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

function toggleBooksList(btn){
  const wrap=document.getElementById('booksListWrap');
  if(wrap.style.display==='none'){wrap.style.display='block';btn.textContent='Hide Per-Book Progress ▴';}
  else{wrap.style.display='none';btn.textContent='Show Per-Book Progress ▾';}
}

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
// COLLAPSIBLE HELPERS
// ═══════════════════════════════════════════
function bxToggle(bodyId, cardId){
  const body=document.getElementById(bodyId);
  const arrow=document.getElementById(bodyId+'Arrow');
  const isOpen=body.classList.contains('open');
  body.classList.toggle('open',!isOpen);
  if(arrow)arrow.classList.toggle('open',!isOpen);
}
function bxOpen(bodyId){
  const body=document.getElementById(bodyId);
  const arrow=document.getElementById(bodyId+'Arrow');
  body.classList.add('open');
  if(arrow)arrow.classList.add('open');
}
function bxToggleNotes(){
  const section=document.getElementById('notesSection');
  const arrow=document.getElementById('noteArrow');
  const btn=document.getElementById('noteToggleBtn');
  if(!section)return;
  const isOpen=section.style.display!=='none';
  section.style.display=isOpen?'none':'block';
  if(arrow)arrow.style.transform=isOpen?'':'rotate(180deg)';
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


(function(){
'use strict';
const TK='thoughts_v1';
function load(){try{return JSON.parse(localStorage.getItem(TK))||def();}catch{return def();}}
function def(){return{thoughts:[],projects:[],weeklySummary:null,view:'list'};}
function save(s){localStorage.setItem(TK,JSON.stringify(s));}
function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
function now(){return Date.now();}
function groqKey(){return localStorage.getItem('groq_api_key')||'';}

const TAGS=[
  {id:'idea',label:'Idea',color:'#fbbf24'},
  {id:'project',label:'Project',color:'#60a5fa'},
  {id:'question',label:'Question',color:'#a78bfa'},
  {id:'todo',label:'Todo',color:'#34d399'},
  {id:'note',label:'Note',color:'#94a3b8'}
];
const PRIO=[{id:'high',label:'High',color:'#f87171'},{id:'medium',label:'Medium',color:'#fbbf24'},{id:'low',label:'Low',color:'#6ee7b7'}];
const PCOLORS=['#60a5fa','#34d399','#fbbf24','#f87171','#a78bfa','#fb923c','#22d3ee','#f472b6'];
const STATUS={Active:'#34d399','On Hold':'#fbbf24',Done:'#76746E'};
function tagOf(id){return TAGS.find(t=>t.id===id)||TAGS[4];}
function prioOf(id){return PRIO.find(p=>p.id===id)||PRIO[1];}
function projOf(s,id){return (s.projects||[]).find(p=>p.id===id);}

// markdown-lite: **bold** *italic* and - bullets
function md(t){
  t=(t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  t=t.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/\*([^*]+)\*/g,'<i>$1</i>');
  const lines=t.split(/\n/);let out='',inList=false;
  lines.forEach(l=>{
    if(/^\s*[-•]\s+/.test(l)){if(!inList){out+='<ul style="margin:4px 0 4px 18px;padding:0">';inList=true;}out+='<li>'+l.replace(/^\s*[-•]\s+/,'')+'</li>';}
    else{if(inList){out+='</ul>';inList=false;}out+=l+'<br>';}
  });
  if(inList)out+='</ul>';
  return out.replace(/<br>$/,'');
}

// ── CAPTURE STATE ──
let capTag='note', capPrio='medium', capProj='';

// ── RENDER ──
let filter={tag:'',project:'',priority:''}, search='', expandedIds=new Set();
function render(){
  const root=document.getElementById('thoughtsRoot');if(!root)return;
  const s=load();
  const all=sortThoughts(s.thoughts);
  const list=all.filter(t=>!search||(t.content||'').toLowerCase().includes(search.toLowerCase()));

  // Capture — just type and save (Apple Notes style)
  let cap='<div class="th-capture">'
    +'<textarea class="th-capture-ta" id="thCapInput" placeholder="Take a note…" rows="2"></textarea>'
    +'<div class="th-capture-actions">'
      +'<button class="th-voice" id="thVoiceBtn" onclick="thVoice()" title="Voice input"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg></button>'
      +'<button class="th-save" id="thSaveBtn" onclick="thSave()">Save</button>'
    +'</div></div>';

  // Search — only when there are a few notes
  let searchBar = all.length>4
    ? '<div class="th-search" style="margin-bottom:14px"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#76746E" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>'
      +'<input id="thSearch" placeholder="Search" value="'+esc(search)+'" oninput="thSearchInput(this.value)"></div>'
    : '';

  const body = list.length
    ? list.map(t=>noteRow(t)).join('')
    : '<div class="th-empty">No notes yet. Jot something down above.</div>';

  root.innerHTML='<div style="padding:0 16px 90px">'+cap+searchBar+body+'</div>';
  bindCaptureEnter();
  bindSwipes();
}

function sortThoughts(arr){
  return arr.slice().sort((a,b)=>{
    if(!!b.pinned!==!!a.pinned)return (b.pinned?1:0)-(a.pinned?1:0);
    return b.created-a.created;
  });
}

function noteRow(t){
  const date=new Date(t.created).toLocaleDateString('en',{month:'short',day:'numeric'});
  // first line = headline, rest = preview (Apple Notes style)
  const lines=(t.content||'').split(/\n/);
  const title=(lines.shift()||'').trim()||'New Note';
  const preview=lines.join(' ').trim();
  const inner='<div class="th-row'+(t.pinned?' pinned':'')+(expandedIds.has(t.id)?' expanded':'')+'" id="throw-'+t.id+'" onclick="thToggleExpand(event,\''+t.id+'\')">'
    +(t.pinned?'<span class="th-pin-ico on" style="float:right;margin-left:8px" onclick="thPin(event,\''+t.id+'\')"><svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 10.76V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6.76l2 3.24H7z"/></svg></span>':'')
    +'<div class="th-note-title">'+esc(title)+'</div>'
    +(preview?'<div class="th-note-preview">'+esc(preview)+'</div>':'')
    +'<div class="th-row-meta"><span>'+date+'</span>'+(t.modified&&t.modified>t.created+60000?'<span>· edited</span>':'')+'</div>'
    +'<div class="th-expand" onclick="event.stopPropagation()">'
      +'<textarea class="th-edit-ta" id="thedit-'+t.id+'">'+esc(t.content)+'</textarea>'
      +'<div class="th-exp-btns">'
        +'<button class="th-xbtn" onclick="thSaveEdit(\''+t.id+'\')"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> Save</button>'
        +'<button class="th-xbtn" onclick="thPin(event,\''+t.id+'\')">'+(t.pinned?'Unpin':'Pin')+'</button>'
        +'<button class="th-xbtn ai" onclick="thDevelop(\''+t.id+'\')"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg> Develop</button>'
        +'<button class="th-xbtn del" onclick="thDelete(\''+t.id+'\')">Delete</button>'
      +'</div>'
      +'<div class="th-ai-out" id="thai-'+t.id+'"></div>'
    +'</div>'
  +'</div>';
  return'<div class="th-row-wrap"><div class="th-row-bg"><span class="left"></span><span class="right">Delete <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></span></div>'+inner+'</div>';
}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

// ── CAPTURE ──
window.thSetTag=function(id){capTag=id;document.querySelectorAll('#thTagChips .th-chip').forEach((c,i)=>c.classList.toggle('on',TAGS[i].id===id));};
window.thSetPrio=function(id){capPrio=id;document.querySelectorAll('#thPrioChips .th-chip').forEach((c,i)=>c.classList.toggle('on',PRIO[i].id===id));};
window.thSetCapProj=function(v){capProj=v;};
function bindCaptureEnter(){
  const inp=document.getElementById('thCapInput');if(!inp)return;
  inp.addEventListener('keydown',e=>{if(e.key==='Enter'&&(e.metaKey||e.ctrlKey)){e.preventDefault();thSave();}});
}
window.thSave=function(){
  const inp=document.getElementById('thCapInput');const v=(inp.value||'').trim();if(!v)return;
  const s=load();
  s.thoughts.push({id:uid(),content:v,pinned:false,created:now(),modified:now()});
  save(s);inp.value='';render();
};

// ── VOICE → Groq Whisper transcription ──
let mediaRec=null, recChunks=[];
window.thVoice=async function(){
  const btn=document.getElementById('thVoiceBtn');
  // tap again to stop
  if(mediaRec && mediaRec.state==='recording'){ mediaRec.stop(); return; }
  if(!groqKey()){alert('Add a Groq key in dashboard Settings to use voice transcription.');return;}
  if(!navigator.mediaDevices||!window.MediaRecorder){alert('Recording not supported on this browser.');return;}
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    recChunks=[];
    mediaRec=new MediaRecorder(stream);
    mediaRec.ondataavailable=e=>{if(e.data&&e.data.size)recChunks.push(e.data);};
    mediaRec.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());
      btn.classList.remove('rec'); btn.classList.add('busy');
      btn.innerHTML='<span class="th-spin"></span>';
      try{
        const blob=new Blob(recChunks,{type:mediaRec.mimeType||'audio/webm'});
        const txt=await groqTranscribe(blob);
        const inp=document.getElementById('thCapInput');
        if(inp&&txt){inp.value=(inp.value.trim()?inp.value.trim()+' ':'')+txt; inp.focus();}
      }catch(e){alert('Transcription failed: '+(e.message||e));}
      btn.classList.remove('busy'); btn.innerHTML=MIC_SVG; mediaRec=null;
    };
    mediaRec.start();
    btn.classList.add('rec');
  }catch(e){alert('Microphone access denied.');}
};
const MIC_SVG='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3"/></svg>';
async function groqTranscribe(blob){
  const fd=new FormData();
  fd.append('file', blob, 'note.webm');
  fd.append('model','whisper-large-v3-turbo');
  fd.append('response_format','json');
  const r=await fetch('https://api.groq.com/openai/v1/audio/transcriptions',{method:'POST',headers:{'Authorization':'Bearer '+groqKey()},body:fd});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error((d.error&&d.error.message)||('Error '+r.status));
  return (d.text||'').trim();
}

// ── VIEW / FILTER / SEARCH ──
window.thSetView=function(v){const s=load();s.view=v;save(s);render();};
window.thFilter=function(k,v){filter[k]=filter[k]===v?'':v;render();};
window.thClearFilter=function(){filter={tag:'',project:'',priority:''};render();};
window.thSearchInput=function(v){search=v;const s=load();const root=document.getElementById('thoughtsRoot');
  // re-render only list area would be ideal; simple re-render keeps focus loss minimal by restoring
  render();const si=document.getElementById('thSearch');if(si){si.focus();si.value=v;si.setSelectionRange(v.length,v.length);}};

// ── ROW ACTIONS ──
window.thToggleExpand=function(e,id){
  if(expandedIds.has(id))expandedIds.delete(id);else expandedIds.add(id);
  const row=document.getElementById('throw-'+id);if(row)row.classList.toggle('expanded',expandedIds.has(id));
};
window.thSetPrio2=function(id,p){const s=load();const t=s.thoughts.find(x=>x.id===id);if(t){t.priority=p;t.modified=now();save(s);render();}};
window.thSetProj2=function(id,pid){const s=load();const t=s.thoughts.find(x=>x.id===id);if(t){t.project=pid;t.modified=now();save(s);render();}};
window.thPin=function(e,id){e.stopPropagation();const s=load();const t=s.thoughts.find(x=>x.id===id);if(t){t.pinned=!t.pinned;save(s);render();}};
window.thSaveEdit=function(id){const s=load();const t=s.thoughts.find(x=>x.id===id);const ta=document.getElementById('thedit-'+id);if(t&&ta){t.content=ta.value;t.modified=now();save(s);render();}};
window.thToggleDone=function(id){const s=load();const t=s.thoughts.find(x=>x.id===id);if(t){t.done=!t.done;if(t.done)t.status='done';else if(t.status==='done')t.status='';save(s);render();}};
window.thBoardMove=function(id){const s=load();const t=s.thoughts.find(x=>x.id===id);if(t){t.status=t.status==='in_progress'?'':'in_progress';if(t.status==='in_progress')t.done=false;save(s);render();}};
window.thDelete=function(id){const s=load();s.thoughts=s.thoughts.filter(x=>x.id!==id);save(s);render();};

// ── SWIPE left to delete ──
function bindSwipes(){
  document.querySelectorAll('.th-row-wrap').forEach(wrap=>{
    const row=wrap.querySelector('.th-row');if(!row||row._sw)return;row._sw=1;
    let sx=0,sy=0,dx=0,drag=false;
    row.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;drag=true;row.style.transition='none';},{passive:true});
    row.addEventListener('touchmove',e=>{if(!drag)return;dx=e.touches[0].clientX-sx;const dy=e.touches[0].clientY-sy;
      if(Math.abs(dy)>Math.abs(dx)){drag=false;return;}row.style.transform='translateX('+Math.min(0,dx)+'px)';},{passive:true});
    row.addEventListener('touchend',()=>{if(!drag)return;drag=false;row.style.transition='';
      const id=row.id.replace('throw-','');
      if(dx<-90){row.style.transform='translateX(-100%)';setTimeout(()=>thDelete(id),180);}
      else row.style.transform='';dx=0;});
  });
}

// ── PROJECTS ──
window.thNewProject=function(){thEditProject(null);};
function thEditProject(id){
  const s=load();const p=id?projOf(s,id):{name:'',color:PCOLORS[0],description:'',status:'Active'};
  thOpenModal('<div class="th-modal-title">'+(id?'Edit':'New')+' Project</div>'
    +'<div class="th-field"><label>Name</label><input id="thpName" value="'+esc(p.name)+'" placeholder="e.g. Dashboard"></div>'
    +'<div class="th-field"><label>Description</label><textarea id="thpDesc" rows="2">'+esc(p.description||'')+'</textarea></div>'
    +'<div class="th-field"><label>Status</label><select id="thpStatus">'+['Active','On Hold','Done'].map(st=>'<option'+(p.status===st?' selected':'')+'>'+st+'</option>').join('')+'</select></div>'
    +'<div class="th-field"><label>Color</label><div class="th-color-row" id="thpColors">'+PCOLORS.map(c=>'<div class="th-color-opt '+(c===p.color?'on':'')+'" style="background:'+c+'" onclick="thPickColor(\''+c+'\')"></div>').join('')+'</div></div>'
    +'<button class="th-mbtn pri" onclick="thSaveProject(\''+(id||'')+'\')">Save</button>'
    +(id?'<button class="th-mbtn sec" onclick="thDeleteProject(\''+id+'\')" style="color:#f87171">Delete Project</button>':'')
    +'<button class="th-mbtn sec" onclick="thCloseModal()">Cancel</button>');
  window._thpColor=p.color;
}
window.thPickColor=function(c){window._thpColor=c;document.querySelectorAll('#thpColors .th-color-opt').forEach(o=>o.classList.toggle('on',o.style.background===c||o.style.backgroundColor===c));};
window.thSaveProject=function(id){
  const s=load();const name=document.getElementById('thpName').value.trim();if(!name)return;
  const data={name,description:document.getElementById('thpDesc').value,status:document.getElementById('thpStatus').value,color:window._thpColor||PCOLORS[0]};
  if(id){Object.assign(projOf(s,id),data);}else{s.projects.push(Object.assign({id:uid()},data));}
  save(s);thCloseModal();render();
};
window.thDeleteProject=function(id){const s=load();s.projects=s.projects.filter(p=>p.id!==id);s.thoughts.forEach(t=>{if(t.project===id)t.project='';});save(s);thCloseModal();render();};
window.thOpenProject=function(id){
  const s=load();const p=projOf(s,id);if(!p)return;
  const linked=sortThoughts(s.thoughts.filter(t=>t.project===id));
  thOpenModal('<div class="th-modal-title" style="display:flex;align-items:center;gap:10px"><span class="th-proj-color" style="background:'+p.color+';width:14px;height:14px"></span>'+esc(p.name)+'</div>'
    +(p.description?'<div class="th-proj-desc" style="margin-bottom:14px">'+esc(p.description)+'</div>':'')
    +'<button class="th-mbtn sec" onclick="thEditProject(\''+id+'\')" style="margin-bottom:14px">Edit project</button>'
    +'<div style="font-size:12px;color:var(--t3);font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">'+linked.length+' thoughts</div>'
    +(linked.length?linked.map(t=>'<div class="th-row" style="margin-bottom:8px;cursor:default"><div class="th-row-top"><span class="th-tag" style="background:'+tagOf(t.tag).color+'22;color:'+tagOf(t.tag).color+'">'+tagOf(t.tag).label+'</span><span class="th-prio-dot" style="background:'+prioOf(t.priority).color+'"></span></div><div class="th-row-content">'+md(t.content)+'</div></div>').join(''):'<div class="th-empty">No thoughts linked yet.</div>')
    +'<button class="th-mbtn sec" onclick="thCloseModal()" style="margin-top:8px">Close</button>');
};

// ── MODAL ──
function thOpenModal(html){document.getElementById('thModalPanel').innerHTML='<div class="th-modal-handle"></div>'+html;document.getElementById('thModal').classList.add('open');}
window.thCloseModal=function(){document.getElementById('thModal').classList.remove('open');};

// ── GROQ AI ──
async function groq(messages,max){
  const key=groqKey();if(!key)throw new Error('NO_KEY');
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({model:'llama-3.3-70b-versatile',messages,max_tokens:max||400,temperature:0.6})});
  const d=await r.json();if(!r.ok)throw new Error((d.error&&d.error.message)||'failed');
  return (d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content||'').trim();
}
function aiOut(id,html,show){const el=document.getElementById('thai-'+id);if(el){el.innerHTML=html;el.classList.toggle('show',show!==false);}}
function aiLoading(id,label){aiOut(id,'<span class="th-spin"></span> '+label);}
function aiErr(id,e){aiOut(id,e.message==='NO_KEY'?'<span style="color:#f87171">Add a Groq key in dashboard Settings.</span>':'<span style="color:#f87171">'+(e.message||e)+'</span>');}

window.thDevelop=async function(id){const s=load();const t=s.thoughts.find(x=>x.id===id);if(!t)return;
  aiLoading(id,'Developing this idea…');
  try{const out=await groq([{role:'system',content:'You are a sharp product/strategy thinker. Expand the idea into a concise plan: goal, key steps, risks, and a first action. Use short bullet lines.'},{role:'user',content:t.content}],500);
    aiOut(id,'<b>Developed plan</b>\
'+esc(out));}catch(e){aiErr(id,e);}};

window.thSmartTag=async function(id){const s=load();const t=s.thoughts.find(x=>x.id===id);if(!t)return;
  aiLoading(id,'Suggesting tag…');
  try{const out=await groq([{role:'system',content:'Classify the note into ONE tag from: idea, project, question, todo, note. Reply with only the tag word.'},{role:'user',content:t.content}],10);
    const tag=(out.toLowerCase().match(/idea|project|question|todo|note/)||['note'])[0];
    t.tag=tag;t.modified=now();save(s);render();
  }catch(e){aiErr(id,e);}};

window.thConnect=async function(id){const s=load();const t=s.thoughts.find(x=>x.id===id);if(!t)return;
  aiLoading(id,'Finding related thoughts…');
  const others=s.thoughts.filter(x=>x.id!==id).slice(0,40).map((x,i)=>i+'. '+x.content.slice(0,120));
  if(!others.length){aiOut(id,'No other thoughts to connect yet.');return;}
  try{const out=await groq([{role:'system',content:'Given a target note and a numbered list of other notes, name up to 3 that are most related and why, in one short line each. If none relate, say so.'},{role:'user',content:'TARGET: '+t.content+'\
\
OTHERS:\
'+others.join('\
')}],300);
    aiOut(id,'<b>Related</b>\
'+esc(out));}catch(e){aiErr(id,e);}};

function weekKey(){const d=new Date();const o=(d.getDay()+6)%7;d.setDate(d.getDate()-o);return d.toISOString().slice(0,10);}
window.thWeekly=async function(){
  const s=load();
  if(s.weeklySummary&&s.weeklySummary.date===weekKey()){
    thOpenModal('<div class="th-modal-title">Weekly Summary</div><div style="font-size:14px;line-height:1.7;color:var(--t2);white-space:pre-wrap">'+esc(s.weeklySummary.text)+'</div><button class="th-mbtn sec" onclick="thCloseModal()" style="margin-top:14px">Close</button>');
    return;
  }
  thOpenModal('<div class="th-modal-title">Weekly Summary</div><div style="color:var(--t3)"><span class="th-spin"></span> Analyzing your thoughts…</div>');
  try{
    const recent=s.thoughts.slice(-50).map(t=>'['+tagOf(t.tag).label+(t.project?'/'+(projOf(s,t.project)||{}).name:'')+'] '+t.content.slice(0,150));
    const projs=(s.projects||[]).map(p=>p.name+' ('+p.status+')').join(', ');
    const out=await groq([{role:'system',content:'You are a productivity coach. Summarize this week of captured thoughts in 3-4 sentences and recommend which 1-2 projects to prioritize next week and why.'},
      {role:'user',content:'Projects: '+(projs||'none')+'\
\
Thoughts:\
'+recent.join('\
')}],400);
    s.weeklySummary={date:weekKey(),text:out};save(s);
    thOpenModal('<div class="th-modal-title">Weekly Summary</div><div style="font-size:14px;line-height:1.7;color:var(--t2);white-space:pre-wrap">'+esc(out)+'</div><button class="th-mbtn sec" onclick="thCloseModal()" style="margin-top:14px">Close</button>');
  }catch(e){thOpenModal('<div class="th-modal-title">Weekly Summary</div><div style="color:#f87171">'+(e.message==='NO_KEY'?'Add a Groq key in dashboard Settings.':(e.message||e))+'</div><button class="th-mbtn sec" onclick="thCloseModal()" style="margin-top:14px">Close</button>');}
};

// ── EXPORT ──
window.thExport=function(){
  const s=load();
  let txt='THOUGHTS & PROJECTS EXPORT\
'+new Date().toLocaleString()+'\
\
';
  (s.projects||[]).forEach(p=>{txt+='## PROJECT: '+p.name+' ['+p.status+']\
'+(p.description||'')+'\
\
';});
  txt+='## ALL THOUGHTS\
\
';
  sortThoughts(s.thoughts).forEach(t=>{const proj=projOf(s,t.project);txt+='['+tagOf(t.tag).label+'|'+prioOf(t.priority).label+(proj?'|'+proj.name:'')+'] '+new Date(t.created).toLocaleDateString()+'\
'+t.content+'\
'+(t.done?'(done)\
':'')+'\
';});
  const blob=new Blob([txt],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='thoughts-'+new Date().toISOString().slice(0,10)+'.txt';a.click();
};

// ── BOOT ──
window.thRender=render;
render();
window.addEventListener('storage',e=>{if(e.key===TK)render();});
if(window.initCloudSync){window.initCloudSync({appKey:'thoughts',syncedKeys:[TK],onApplied:render});}
})();

// ── OTHERS SUB-TAB SWITCHER ──
function otSwitch(pane){
  ['thoughts','bible','grades'].forEach(p=>{
    document.getElementById('otTab-'+p).classList.toggle('on',p===pane);
  });
  document.getElementById('thoughtsPane').classList.toggle('on',pane==='thoughts');
  document.getElementById('mainPage').classList.toggle('on',pane==='bible');
  document.getElementById('gradesPane').classList.toggle('on',pane==='grades');
  // Lazy-load School iframe on first visit
  if(pane==='grades'){
    var gp=document.getElementById('gradesPane');
    if(gp&&!gp.dataset.loaded){
      gp.dataset.loaded='1';
      Promise.all([
        fetch('modules/grades/grades.html').then(function(r){return r.text();}),
        fetch('modules/grades/grades.css').then(function(r){return r.text();})
      ]).then(function(res){
        var st=document.createElement('style');st.textContent=res[1];document.head.appendChild(st);
        gp.insertAdjacentHTML('beforeend',res[0]);
        var s=document.createElement('script');s.src='modules/grades/grades.js';document.head.appendChild(s);
      }).catch(function(e){console.warn('grades load',e);});
    }
  }
  try{localStorage.setItem('ot_subtab',pane);}catch(e){}
  window.scrollTo(0,0);
}
(function(){
  try{var sv=localStorage.getItem('ot_subtab');if(sv==='bible')otSwitch('bible');else if(sv==='grades')otSwitch('grades');}catch(e){}
})();

})();