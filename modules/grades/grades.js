(function(){

(function(){
'use strict';

const SK = 'grades_v1';
const SUPA_URL = 'PASTE-YOUR-SUPABASE-PROJECT-URL-HERE';
const SUPA_KEY = 'PASTE-YOUR-SUPABASE-PUBLISHABLE-KEY-HERE';
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions';

const COLORS = ['#0A84FF','#30d158','#ffd60a','#ff9f0a','#ff3b30','#bf5af2',
                '#ff6b6b','#5ac8fa','#ff2d55','#34c759','#af52de','#ff8c00'];
const DEFAULT_TYPES = [
  {id:'klausur',name:'Klausur',weight:50},
  {id:'test',name:'Test',weight:25},
  {id:'referat',name:'Referat',weight:15},
  {id:'hausaufgaben',name:'Hausaufgaben',weight:10}
];

/* ── State ── */
let S = {subjects:[]};
let detailSubjId = null;
let editingGradeId = null;
let editingSubjId = null;
let gradeSheetSubjId = null;
let gradeGrouped = false;
let addToCal = false;
let whatIfGrade = 2;
let whatIfType = '';
let aiSubjId = null;
let tmpTypes = [];
let selColor = COLORS[0];

/* ── Storage ── */
function load(){try{const r=localStorage.getItem(SK);S=r?JSON.parse(r):{subjects:[]};}catch(e){S={subjects:[]};}}
function save(){
  try{localStorage.setItem(SK,JSON.stringify(S));}catch(e){}
  syncSupa();
}
async function syncSupa(){
  if(!SUPA_URL||SUPA_URL.includes('PASTE')||!window.supabase)return;
  try{const db=window.supabase.createClient(SUPA_URL,SUPA_KEY);
    await db.from('app_state').upsert({key:SK,data:S,updated_at:new Date().toISOString()},{onConflict:'key'});}catch(e){}
}
function groqKey(){return localStorage.getItem('groq_api_key')||''}

/* ── Utilities ── */
function uid(){return '_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function p2(n){return String(n).padStart(2,'0')}
function todayStr(){const d=new Date();return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())}
function parseDate(s){const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function daysUntil(ds){const d=parseDate(ds);d.setHours(0,0,0,0);const n=new Date();n.setHours(0,0,0,0);return Math.round((d-n)/86400000)}
function fmtDate(ds){if(!ds)return'';const d=parseDate(ds);return p2(d.getDate())+'.'+p2(d.getMonth()+1)+'.'+d.getFullYear()}
function avg(arr){return arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:null}
function round1(n){return Math.round(n*10)/10}
function round2(n){return Math.round(n*100)/100}
function clamp(n,a,b){return Math.max(a,Math.min(b,n))}

function gradeColor(g){
  if(g===null||g===undefined)return'var(--text3)';
  if(g<=1.5)return'var(--green)';
  if(g<=2.5)return'#34c759';
  if(g<=3.0)return'var(--yellow)';
  if(g<=4.0)return'var(--orange)';
  if(g<=5.0)return'#ff6b00';
  return'var(--red)';
}
function warnClass(g){
  if(g===null)return'';
  if(g<=2.5)return'warn-green';
  if(g<=3.0)return'warn-yellow';
  if(g<=4.0)return'warn-orange';
  return'warn-red';
}
function warnBoxClass(g){
  if(g===null)return'green';
  if(g<=2.5)return'green';
  if(g<=3.0)return'yellow';
  if(g<=4.0)return'orange';
  return'red';
}
function gradeBadgeClass(g){
  const n=Math.round(clamp(g,1,6));return'gb-'+n;
}

function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg;el.classList.add('show');
  clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2200);
}

/* ── Grade calculation ── */
function calcWrittenAvg(subj){
  const wgrades=subj.grades.filter(g=>g.category==='written');
  if(!wgrades.length)return null;
  const types=subj.writtenTypes||DEFAULT_TYPES;
  // Group by type
  const byType={};
  wgrades.forEach(g=>{if(!byType[g.type])byType[g.type]=[];byType[g.type].push(g);});
  let wSum=0,wTotal=0;
  types.forEach(t=>{
    const tg=byType[t.id]||[];if(!tg.length)return;
    // Handle groups: group grades by groupId, each group → one avg
    const groups={},solo=[];
    tg.forEach(g=>{
      if(g.groupId){if(!groups[g.groupId])groups[g.groupId]=[];groups[g.groupId].push(g.grade);}
      else solo.push(g.grade);
    });
    const effective=[...solo,...Object.values(groups).map(gs=>avg(gs))];
    const ta=avg(effective);
    wSum+=ta*t.weight;wTotal+=t.weight;
  });
  return wTotal>0?wSum/wTotal:null;
}
function calcOralAvg(subj){
  const og=subj.grades.filter(g=>g.category==='oral');
  if(!og.length)return null;
  return avg(og.map(g=>g.grade));
}
function calcSubjectAvg(subj,extraGrades){
  const s=extraGrades?{...subj,grades:[...subj.grades,...extraGrades]}:subj;
  const wa=calcWrittenAvg(s),oa=calcOralAvg(s);
  if(wa===null&&oa===null)return null;
  if(wa===null)return oa;
  if(oa===null)return wa;
  const tw=subj.writtenWeight||60,ow=subj.oralWeight||40;
  return(wa*tw+oa*ow)/(tw+ow);
}
function calcOverallGPA(){
  const avgs=S.subjects.map(s=>calcSubjectAvg(s)).filter(v=>v!==null);
  return avgs.length?avg(avgs):null;
}
function calcTrend(subj){
  const grades=subj.grades.filter(g=>g.date).sort((a,b)=>a.date.localeCompare(b.date));
  if(grades.length<2)return 0;
  const half=Math.floor(grades.length/2);
  const first=avg(grades.slice(0,half).map(g=>g.grade));
  const last=avg(grades.slice(half).map(g=>g.grade));
  return first-last; // positive = improving (lower grade = better)
}
function bestPossible(subj){
  const rem=remainingGrades(subj);
  if(!rem.length)return calcSubjectAvg(subj);
  const best=rem.map(r=>({...r,grade:1,id:uid()}));
  return calcSubjectAvg(subj,best);
}
function worstPossible(subj){
  const rem=remainingGrades(subj);
  if(!rem.length)return calcSubjectAvg(subj);
  const worst=rem.map(r=>({...r,grade:6,id:uid()}));
  return calcSubjectAvg(subj,worst);
}
function remainingGrades(subj){
  const planned=subj.plannedKlausuren||0,plannedT=subj.plannedTests||0,plannedO=subj.plannedOral||0;
  const doneK=subj.grades.filter(g=>g.type==='klausur').length;
  const doneT=subj.grades.filter(g=>g.type==='test').length;
  const doneO=subj.grades.filter(g=>g.category==='oral').length;
  const rem=[];
  for(let i=doneK;i<planned;i++)rem.push({category:'written',type:'klausur',grade:1,id:uid(),date:todayStr(),groupId:null});
  for(let i=doneT;i<plannedT;i++)rem.push({category:'written',type:'test',grade:1,id:uid(),date:todayStr(),groupId:null});
  for(let i=doneO;i<plannedO;i++)rem.push({category:'oral',type:'oral',grade:1,id:uid(),date:todayStr(),groupId:null});
  return rem;
}
function whatIfCalc(subj,grade,type){
  const cat=(type==='oral')?'oral':'written';
  return calcSubjectAvg(subj,[{category:cat,type:type,grade:parseFloat(grade),id:uid(),date:todayStr(),groupId:null}]);
}
function neededGrade(subj,target,type){
  for(let g=1.0;g<=6.0;g+=0.1){
    const r=whatIfCalc(subj,g,type);
    if(r!==null&&r<=target)return Math.round(g*10)/10;
  }
  return null;
}

/* ── Main render ── */
function renderApp(){
  const app=document.getElementById('gradesApp');
  const gpa=calcOverallGPA();
  const best=S.subjects.reduce((b,s)=>{const a=calcSubjectAvg(s);if(a===null)return b;return b===null||a<b.avg?{name:s.name,avg:a}:b;},null);
  const worst=S.subjects.reduce((w,s)=>{const a=calcSubjectAvg(s);if(a===null)return w;return w===null||a>w.avg?{name:s.name,avg:a}:w;},null);

  let html=`
  <div class="g-header">
    <div class="g-title">Grades</div>
    <div class="g-hdr-btns">
      <button class="g-icon-btn" id="aiGlobalBtn" title="AI Tutor">🤖</button>
      <button class="g-icon-btn" id="addSubjBtn" title="Add subject">＋</button>
    </div>
  </div>`;

  if(gpa!==null){
    html+=`<div class="gpa-card">
      <div>
        <div class="gpa-label">Overall GPA</div>
        <div class="gpa-num" style="color:${gradeColor(gpa)}">${round2(gpa).toFixed(1)}</div>
      </div>
      <div style="flex:1">
        <div class="gpa-stats">
          ${best?`<div class="gpa-stat">Best <span style="color:var(--green)">${best.name} (${round1(best.avg).toFixed(1)})</span></div>`:''}
          ${worst&&worst.avg>2.5?`<div class="gpa-stat">Needs work <span style="color:${gradeColor(worst.avg)}">${worst.name} (${round1(worst.avg).toFixed(1)})</span></div>`:''}
        </div>
      </div>
    </div>`;
  }

  if(!S.subjects.length){
    html+=`<div class="g-empty">
      <div class="g-empty-icon">📚</div>
      <div class="g-empty-title">No subjects yet</div>
      <div class="g-empty-sub">Add your first subject to start tracking grades.</div>
    </div>`;
  }else{
    S.subjects.forEach(subj=>{
      const a=calcSubjectAvg(subj);
      const wa=calcWrittenAvg(subj),oa=calcOralAvg(subj);
      const trend=calcTrend(subj);
      const wc=warnClass(a);
      const doneK=subj.grades.filter(g=>g.type==='klausur').length;
      const plannedK=subj.plannedKlausuren||0;
      const prog=plannedK>0?doneK/plannedK:0;

      // Next Klausur from life calendar
      let nextKlausur=null;
      try{
        const lc=JSON.parse(localStorage.getItem('life_calendar_v1'))||[];
        const today=todayStr();
        const upcoming=lc.filter(e=>e.type==='exam'&&e.date>=today&&(e.title||'').toLowerCase().includes((subj.name||'').toLowerCase())).sort((a,b)=>a.date.localeCompare(b.date));
        if(upcoming.length)nextKlausur=upcoming[0].date;
      }catch(e){}

      html+=`<div class="subj-card ${wc}" data-id="${subj.id}">
        <div class="subj-top">
          <div class="subj-dot" style="background:${subj.color||COLORS[0]}"></div>
          <div class="subj-name">${subj.name}</div>
          ${a!==null?`<div class="subj-avg-badge" style="background:rgba(${hexToRgb(subj.color||COLORS[0])},.15);color:${subj.color||COLORS[0]}">${round2(a).toFixed(1)}</div>`:'<div class="subj-avg-badge" style="background:var(--surface3);color:var(--text3)">—</div>'}
        </div>
        <div class="subj-meta">
          ${wa!==null?`<div class="subj-meta-item">✍ ${round2(wa).toFixed(1)}</div>`:''}
          ${oa!==null?`<div class="subj-meta-item">🗣 ${round2(oa).toFixed(1)}</div>`:''}
          ${trend>0.3?'<div class="subj-meta-item trend-up">↑ Improving</div>':trend<-0.3?'<div class="subj-meta-item trend-down">↓ Declining</div>':''}
          ${subj.grades.length?`<div class="subj-meta-item">${subj.grades.length} grade${subj.grades.length!==1?'s':''}</div>`:''}
          ${plannedK>0?`<div class="subj-meta-item">${doneK}/${plannedK} Klausuren</div>`:''}
          ${nextKlausur!==null?`<div class="countdown-pill">Klausur in ${daysUntil(nextKlausur)}d</div>`:''}
        </div>
        ${plannedK>0?`<div class="subj-mini-bar"><div class="subj-mini-bar-fill" style="width:${Math.round(prog*100)}%;background:${subj.color||COLORS[0]}"></div></div>`:''}
      </div>`;
    });
  }

  html+=`<button class="g-add-btn" id="addSubjBtn2">＋ Add Subject</button>`;
  app.innerHTML=html;

  // Events
  app.querySelectorAll('.subj-card').forEach(el=>{
    el.addEventListener('click',()=>openDetail(el.dataset.id));
  });
  app.querySelector('#addSubjBtn')?.addEventListener('click',()=>openSubjectSheet(null));
  app.querySelector('#addSubjBtn2')?.addEventListener('click',()=>openSubjectSheet(null));
  app.querySelector('#aiGlobalBtn')?.addEventListener('click',()=>openAiSheet(null));
}

function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return isNaN(r)?'10,132,255':`${r},${g},${b}`;
}

/* ── Detail view ── */
function openDetail(id){
  detailSubjId=id;
  renderDetail();
  document.getElementById('detailOverlay').classList.add('open');
}
function closeDetail(){
  document.getElementById('detailOverlay').classList.remove('open');
  detailSubjId=null;
}
document.getElementById('detailBack').addEventListener('click',closeDetail);
document.getElementById('detailEditBtn').addEventListener('click',()=>openSubjectSheet(detailSubjId));
document.getElementById('detailDeleteBtn').addEventListener('click',()=>{
  if(!detailSubjId)return;
  if(!confirm('Delete this subject and all its grades?'))return;
  S.subjects=S.subjects.filter(s=>s.id!==detailSubjId);
  save();closeDetail();renderApp();toast('Subject deleted');
});

function renderDetail(){
  const subj=S.subjects.find(s=>s.id===detailSubjId);
  if(!subj)return;
  document.getElementById('detailTitle').textContent=subj.name;

  const a=calcSubjectAvg(subj),wa=calcWrittenAvg(subj),oa=calcOralAvg(subj);
  const wc=warnBoxClass(a);
  const trend=calcTrend(subj);
  const best=bestPossible(subj),worst=worstPossible(subj);
  const rem=remainingGrades(subj);
  const doneK=subj.grades.filter(g=>g.type==='klausur').length;
  const doneT=subj.grades.filter(g=>g.type==='test').length;
  const doneO=subj.grades.filter(g=>g.category==='oral').length;
  const types=subj.writtenTypes||DEFAULT_TYPES;

  let html='';

  // Status warning
  if(a!==null){
    const warnMsgs={green:'On track 🟢',yellow:'Room for improvement 🟡',orange:'Below target 🟠',red:'Failing risk 🔴'};
    html+=`<div class="warn-box ${wc}">${warnMsgs[wc]||''} — Average ${round2(a).toFixed(1)}</div>`;
  }

  // Stats
  html+=`<div class="stats-row">
    <div class="stat-box"><div class="stat-num" style="color:${gradeColor(a)}">${a!==null?round2(a).toFixed(1):'—'}</div><div class="stat-lbl">Overall</div></div>
    <div class="stat-box"><div class="stat-num" style="color:${gradeColor(wa)}">${wa!==null?round2(wa).toFixed(1):'—'}</div><div class="stat-lbl">Written</div></div>
    <div class="stat-box"><div class="stat-num" style="color:${gradeColor(oa)}">${oa!==null?round2(oa).toFixed(1):'—'}</div><div class="stat-lbl">Oral</div></div>
  </div>`;

  // Progress
  html+=`<div class="sec-head">Progress</div>`;
  const progItems=[
    {label:`Klausuren`,done:doneK,planned:subj.plannedKlausuren||0,color:'var(--blue)'},
    {label:'Tests',done:doneT,planned:subj.plannedTests||0,color:'var(--orange)'},
    {label:'Oral',done:doneO,planned:subj.plannedOral||0,color:'var(--green)'}
  ];
  progItems.forEach(p=>{
    if(!p.planned)return;
    const pct=Math.round(p.done/p.planned*100);
    html+=`<div class="prog-row">
      <div class="prog-label">${p.label}</div>
      <div class="prog-bar"><div class="prog-fill" style="width:${pct}%;background:${p.color}"></div></div>
      <div class="prog-count">${p.done}/${p.planned}</div>
    </div>`;
  });
  if(rem.length){html+=`<div style="font-size:12px;color:var(--text3);margin-top:4px;margin-bottom:4px">${rem.length} grade${rem.length>1?'s':''} remaining this semester</div>`;}

  // What-If
  html+=`<div class="sec-head">What-If Simulator</div>
  <div class="whatif-card">
    <div class="whatif-title">Simulator</div>
    <div style="margin-bottom:10px">
      <div style="font-size:12px;color:var(--text2);margin-bottom:6px">Type:
        <select id="wiType" style="background:transparent;border:none;color:#0A84FF;font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer">
          ${types.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}
          <option value="oral">Oral</option>
        </select>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:4px">Hypothetical grade: <strong id="wiGradeLabel" style="color:#fff">2.0</strong></div>
      <div class="grade-slider-wrap">
        <input type="range" id="wiSlider" min="1" max="6" step="0.1" value="2">
        <div class="grade-slider-labels"><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span></div>
      </div>
    </div>
    <div class="whatif-result" id="wiResult" style="color:${gradeColor(a)}">—</div>
    <div class="whatif-sub" id="wiSub">New average</div>
    <div class="whatif-rows">
      <div class="whatif-mini"><span style="color:var(--text2)">Best possible final</span><span id="wiBest" style="color:var(--green)">—</span></div>
      <div class="whatif-mini"><span style="color:var(--text2)">Worst possible final</span><span id="wiWorst" style="color:var(--red)">—</span></div>
      <div class="whatif-mini"><span style="color:var(--text2)">For 2.0 average, next grade</span><span id="wiNeeded2" style="color:var(--yellow)">—</span></div>
      <div class="whatif-mini"><span style="color:var(--text2)">For 3.0 average, next grade</span><span id="wiNeeded3" style="color:var(--orange)">—</span></div>
    </div>
  </div>`;

  // Grades by type
  html+=`<div class="sec-head">Grades <button id="addGradeBtn" style="border:none;background:rgba(10,132,255,.15);color:#0A84FF;padding:3px 10px;border-radius:999px;font-size:12px;font-weight:600;cursor:pointer;margin-left:4px">+ Add</button></div>`;

  // Group grades by type
  const allTypes=[...types.map(t=>({...t,category:'written'})),{id:'oral',name:'Oral',weight:subj.oralWeight||40,category:'oral'}];
  allTypes.forEach(t=>{
    const tg=subj.grades.filter(g=>g.type===t.id||(t.id==='oral'&&g.category==='oral')).sort((a,b)=>(b.date||'').localeCompare(a.date||''));
    if(!tg.length)return;
    const ta=avg(tg.map(g=>g.grade));
    html+=`<div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;display:flex;align-items:center;gap:8px">
        ${t.name} <span style="color:${gradeColor(ta)};font-variant-numeric:tabular-nums">${round2(ta).toFixed(1)}</span>
      </div>
      ${tg.map(g=>`<div class="grade-row" data-gid="${g.id}">
        <div class="grade-badge ${gradeBadgeClass(g.grade)}">${g.grade}</div>
        <div class="grade-info">
          ${g.groupId?`<div class="grade-type-label">Group: ${g.groupId}</div>`:''}
          <div class="grade-date">${fmtDate(g.date)}</div>
          ${g.note?`<div class="grade-note">${g.note}</div>`:''}
        </div>
        <button class="grade-del" data-gid="${g.id}">✕</button>
      </div>`).join('')}
    </div>`;
  });

  if(!subj.grades.length){html+=`<div style="text-align:center;padding:20px;color:var(--text3);font-size:14px">No grades yet — tap + Add to log one.</div>`;}

  // AI & Study
  html+=`<div class="sec-head">AI & Tools</div>
  <button class="ai-btn" id="detailAiBtn"><span>🤖</span><span>AI Tutor for ${subj.name}</span></button>
  <div class="sec-head">Notes</div>
  <div class="f-group" style="margin-bottom:14px">
    <div class="f-row"><div style="font-size:14px;color:var(--text2);line-height:1.5">${subj.notes||'<span style="color:var(--text3)">No notes</span>'}</div></div>
  </div>`;

  document.getElementById('detailBody').innerHTML=html;

  // Wire up What-If
  function updateWI(){
    const slider=document.getElementById('wiSlider');
    const typeEl=document.getElementById('wiType');
    if(!slider||!typeEl)return;
    const g=parseFloat(slider.value);
    const t=typeEl.value;
    document.getElementById('wiGradeLabel').textContent=g.toFixed(1);
    const nr=whatIfCalc(subj,g,t);
    const r=document.getElementById('wiResult');
    if(r){r.textContent=nr!==null?round2(nr).toFixed(1):'—';r.style.color=gradeColor(nr);}
    const wiBest=best!==null?round2(best).toFixed(1):'—';
    const wiWorst=worst!==null?round2(worst).toFixed(1):'—';
    const n2=neededGrade(subj,2.0,t),n3=neededGrade(subj,3.0,t);
    document.getElementById('wiBest').textContent=wiBest;
    document.getElementById('wiWorst').textContent=wiWorst;
    document.getElementById('wiNeeded2').textContent=n2!==null?n2.toFixed(1):'Not possible';
    document.getElementById('wiNeeded3').textContent=n3!==null?n3.toFixed(1):'Not possible';
  }
  document.getElementById('wiSlider')?.addEventListener('input',updateWI);
  document.getElementById('wiType')?.addEventListener('change',updateWI);
  updateWI();

  // Grade delete
  document.getElementById('detailBody').querySelectorAll('.grade-del').forEach(btn=>{
    btn.addEventListener('click',e=>{
      e.stopPropagation();
      if(!confirm('Delete this grade?'))return;
      const subj=S.subjects.find(s=>s.id===detailSubjId);
      if(!subj)return;
      subj.grades=subj.grades.filter(g=>g.id!==btn.dataset.gid);
      save();renderDetail();renderApp();toast('Grade deleted');
    });
  });

  // Add grade btn
  document.getElementById('addGradeBtn')?.addEventListener('click',()=>openGradeSheet(detailSubjId,null));

  // Grade row tap to edit
  document.getElementById('detailBody').querySelectorAll('.grade-row').forEach(el=>{
    el.addEventListener('click',()=>{
      const gid=el.dataset.gid;
      if(gid)openGradeSheet(detailSubjId,gid);
    });
  });

  // AI button
  document.getElementById('detailAiBtn')?.addEventListener('click',()=>openAiSheet(detailSubjId));
}

/* ── Grade sheet ── */
function openGradeSheet(subjId,gradeId){
  gradeSheetSubjId=subjId;editingGradeId=gradeId;gradeGrouped=false;addToCal=false;
  const subj=S.subjects.find(s=>s.id===subjId);if(!subj)return;
  const types=subj.writtenTypes||DEFAULT_TYPES;
  const existing=gradeId?subj.grades.find(g=>g.id===gradeId):null;

  document.getElementById('gradeSheetTitle').textContent=gradeId?'Edit Grade':'Add Grade';
  document.getElementById('gradeDeleteBtn').style.display=gradeId?'block':'none';

  // Build type chips
  const chips=document.getElementById('gradeTypeChips');
  const allTypes=[...types,{id:'oral',name:'Oral / Mündlich'}];
  chips.innerHTML=allTypes.map((t,i)=>`<button class="type-chip${(existing?existing.type===t.id:i===0)?' sel':''}"
    data-type="${t.id}" style="${(existing?existing.type===t.id:i===0)?'background:'+((subj.color)||COLORS[0]):''}">
    ${t.name}</button>`).join('');
  chips.querySelectorAll('.type-chip').forEach(btn=>{
    btn.addEventListener('click',()=>{
      chips.querySelectorAll('.type-chip').forEach(b=>{b.classList.remove('sel');b.style.background='';});
      btn.classList.add('sel');btn.style.background=subj.color||COLORS[0];
      const isTest=btn.dataset.type==='test';
      document.getElementById('groupingOptions').style.display=isTest?'block':'none';
    });
    if(btn.classList.contains('sel')&&btn.dataset.type==='test')
      document.getElementById('groupingOptions').style.display='block';
  });

  document.getElementById('gradeValue').value=existing?.grade||'';
  document.getElementById('gradeDate').value=existing?.date||todayStr();
  document.getElementById('gradeNote').value=existing?.note||'';
  document.getElementById('gradeGroupId').value=existing?.groupId||'';
  document.getElementById('gradeGroupIcon').textContent=existing?.groupId?'●':'○';
  document.getElementById('gradeGroupIdRow').style.display=existing?.groupId?'flex':'none';
  gradeGrouped=!!existing?.groupId;
  document.getElementById('addToCalIcon').textContent='○';

  openSheet('gradeSheet');
}
document.getElementById('gradeSheetClose').addEventListener('click',()=>closeSheet('gradeSheet'));

document.getElementById('gradeGroupToggle').addEventListener('click',()=>{
  gradeGrouped=!gradeGrouped;
  document.getElementById('gradeGroupIcon').textContent=gradeGrouped?'●':'○';
  document.getElementById('gradeGroupIdRow').style.display=gradeGrouped?'flex':'none';
});

document.getElementById('addToCalToggle').addEventListener('click',()=>{
  addToCal=!addToCal;
  document.getElementById('addToCalIcon').textContent=addToCal?'●':'○';
});

document.getElementById('gradeSaveBtn').addEventListener('click',()=>{
  const subj=S.subjects.find(s=>s.id===gradeSheetSubjId);if(!subj)return;
  const type=document.querySelector('.type-chip.sel')?.dataset.type||'klausur';
  const gradeVal=parseFloat(document.getElementById('gradeValue').value);
  if(isNaN(gradeVal)||gradeVal<1||gradeVal>6){
    document.getElementById('gradeValue').style.outline='2px solid var(--red)';
    setTimeout(()=>document.getElementById('gradeValue').style.outline='',1500);return;
  }
  const cat=type==='oral'?'oral':'written';
  const gObj={
    id:editingGradeId||uid(),
    category:cat,type:type,
    grade:gradeVal,
    date:document.getElementById('gradeDate').value,
    note:document.getElementById('gradeNote').value.trim()||null,
    groupId:gradeGrouped?(document.getElementById('gradeGroupId').value.trim()||'group1'):null
  };

  if(editingGradeId){
    const idx=subj.grades.findIndex(g=>g.id===editingGradeId);
    if(idx>=0)subj.grades[idx]=gObj;
  }else{subj.grades.push(gObj);}

  if(addToCal&&gObj.date){
    addGradeToCalendar(`${subj.name} ${typeLabel(type,subj)}`,gObj.date,type);
  }

  save();closeSheet('gradeSheet');
  if(detailSubjId)renderDetail();
  renderApp();toast('Grade saved');
});

document.getElementById('gradeDeleteBtn').addEventListener('click',()=>{
  const subj=S.subjects.find(s=>s.id===gradeSheetSubjId);if(!subj||!editingGradeId)return;
  if(!confirm('Delete this grade?'))return;
  subj.grades=subj.grades.filter(g=>g.id!==editingGradeId);
  save();closeSheet('gradeSheet');
  if(detailSubjId)renderDetail();
  renderApp();toast('Grade deleted');
});

function typeLabel(type,subj){
  if(type==='oral')return'Mündlich';
  const t=(subj.writtenTypes||DEFAULT_TYPES).find(wt=>wt.id===type);
  return t?t.name:type;
}

/* ── Subject sheet ── */
function openSubjectSheet(id){
  editingSubjId=id;
  const existing=id?S.subjects.find(s=>s.id===id):null;
  document.getElementById('subjectSheetTitle').textContent=id?'Edit Subject':'New Subject';
  document.getElementById('subjectDeleteBtn').style.display=id?'block':'none';
  document.getElementById('subjName').value=existing?.name||'';
  document.getElementById('subjTeacher').value=existing?.teacher||'';
  document.getElementById('writtenW').value=existing?.writtenWeight||60;
  document.getElementById('oralW').value=existing?.oralWeight||40;
  document.getElementById('plannedKlausuren').value=existing?.plannedKlausuren||4;
  document.getElementById('plannedTests').value=existing?.plannedTests||6;
  document.getElementById('plannedOral').value=existing?.plannedOral||2;
  document.getElementById('subjNotes').value=existing?.notes||'';
  selColor=existing?.color||COLORS[0];
  tmpTypes=JSON.parse(JSON.stringify(existing?.writtenTypes||DEFAULT_TYPES));

  renderColorSwatches();renderWrittenTypes();
  document.getElementById('writtenW').addEventListener('input',updateWeightSum);
  document.getElementById('oralW').addEventListener('input',updateWeightSum);
  updateWeightSum();
  openSheet('subjectSheet');
}

function renderColorSwatches(){
  document.getElementById('colorSwatches').innerHTML=COLORS.map(c=>`<div class="color-swatch${c===selColor?' selected':''}" data-c="${c}" style="background:${c}"></div>`).join('');
  document.getElementById('colorSwatches').querySelectorAll('.color-swatch').forEach(el=>{
    el.addEventListener('click',()=>{selColor=el.dataset.c;renderColorSwatches();});
  });
}

function renderWrittenTypes(){
  const container=document.getElementById('writtenTypesList');
  container.innerHTML=tmpTypes.map((t,i)=>`<div class="f-group" style="margin-bottom:8px" data-idx="${i}">
    <div class="f-row">
      <input class="f-inp-full" value="${t.name}" placeholder="Type name"
        data-field="name" data-idx="${i}" style="font-weight:600">
    </div>
    <div class="f-sep"></div>
    <div class="f-row">
      <span class="f-label">Weight in written %</span>
      <input class="f-inp" type="number" min="0" max="100" value="${t.weight}"
        data-field="weight" data-idx="${i}" style="width:70px">
      <button data-del="${i}" style="border:none;background:transparent;color:rgba(255,59,48,.6);font-size:18px;cursor:pointer;padding:2px 6px;border-radius:6px">✕</button>
    </div>
  </div>`).join('');

  container.querySelectorAll('[data-field]').forEach(inp=>{
    inp.addEventListener('input',()=>{
      const idx=parseInt(inp.dataset.idx);
      if(inp.dataset.field==='name')tmpTypes[idx].name=inp.value;
      else tmpTypes[idx].weight=parseFloat(inp.value)||0;
    });
  });
  container.querySelectorAll('[data-del]').forEach(btn=>{
    btn.addEventListener('click',()=>{tmpTypes.splice(parseInt(btn.dataset.del),1);renderWrittenTypes();});
  });
}

document.getElementById('addWrittenTypeBtn').addEventListener('click',()=>{
  tmpTypes.push({id:uid(),name:'Custom',weight:0});renderWrittenTypes();
});

function updateWeightSum(){
  const w=parseInt(document.getElementById('writtenW').value)||0;
  const o=parseInt(document.getElementById('oralW').value)||0;
  const sum=w+o;
  const el=document.getElementById('weightSum');
  el.textContent=sum+'%';el.style.color=sum===100?'var(--green)':'var(--red)';
  document.getElementById('weightSumRow').style.background=sum===100?'transparent':'rgba(255,59,48,.08)';
}
document.getElementById('subjectSheetClose').addEventListener('click',()=>closeSheet('subjectSheet'));

document.getElementById('subjectSaveBtn').addEventListener('click',()=>{
  const name=document.getElementById('subjName').value.trim();
  if(!name){document.getElementById('subjName').style.outline='2px solid var(--red)';setTimeout(()=>document.getElementById('subjName').style.outline='',1500);return;}
  const subj={
    id:editingSubjId||uid(),
    name,teacher:document.getElementById('subjTeacher').value.trim(),
    color:selColor,writtenWeight:parseInt(document.getElementById('writtenW').value)||60,
    oralWeight:parseInt(document.getElementById('oralW').value)||40,
    writtenTypes:tmpTypes,
    plannedKlausuren:parseInt(document.getElementById('plannedKlausuren').value)||0,
    plannedTests:parseInt(document.getElementById('plannedTests').value)||0,
    plannedOral:parseInt(document.getElementById('plannedOral').value)||0,
    notes:document.getElementById('subjNotes').value.trim(),
    grades:editingSubjId?(S.subjects.find(s=>s.id===editingSubjId)?.grades||[]):[]
  };
  if(editingSubjId){const idx=S.subjects.findIndex(s=>s.id===editingSubjId);if(idx>=0)S.subjects[idx]=subj;}
  else{S.subjects.push(subj);}
  save();closeSheet('subjectSheet');
  if(detailSubjId===editingSubjId)renderDetail();
  renderApp();toast(editingSubjId?'Subject updated':'Subject added');
});

document.getElementById('subjectDeleteBtn').addEventListener('click',()=>{
  if(!editingSubjId||!confirm('Delete subject and all grades?'))return;
  S.subjects=S.subjects.filter(s=>s.id!==editingSubjId);
  save();closeSheet('subjectSheet');closeDetail();renderApp();toast('Subject deleted');
});

/* ── Life Calendar integration ── */
function addGradeToCalendar(title,date,type){
  try{
    let lc=JSON.parse(localStorage.getItem('life_calendar_v1'))||[];
    lc.push({id:'gc_'+uid(),type:'exam',title:title,date:date,endDate:null,
      startTime:null,endTime:null,notes:'Added from Grades',repeat:null,alert:'1440'});
    localStorage.setItem('life_calendar_v1',JSON.stringify(lc));
    toast('Added to Life Calendar ✓');
  }catch(e){toast('Could not add to calendar');}
}

/* ── AI Sheet ── */
function openAiSheet(subjId){
  aiSubjId=subjId;
  const subj=subjId?S.subjects.find(s=>s.id===subjId):null;
  document.getElementById('aiSubjectContext').textContent=subj?`Subject: ${subj.name} — Average: ${round2(calcSubjectAvg(subj)||0).toFixed(1)}`:'All subjects';
  document.getElementById('aiResult').classList.remove('show');
  document.getElementById('aiResult').textContent='';
  document.getElementById('aiTopicRow').style.display='none';
  openSheet('aiSheet');
}
document.getElementById('aiSheetClose').addEventListener('click',()=>closeSheet('aiSheet'));

async function callGroq(prompt,btnEl){
  const key=groqKey();
  if(!key){toast('No Groq API key — add it in Settings');return null;}
  if(btnEl){btnEl.disabled=true;btnEl.innerHTML=`<span class="ai-spinner"></span>${btnEl.textContent}`;}
  const res=document.getElementById('aiResult');
  res.textContent='';res.classList.add('show');res.style.display='block';
  try{
    const r=await fetch(GROQ_API,{method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:GROQ_MODEL,messages:[{role:'user',content:prompt}],temperature:.7,max_tokens:1200})});
    if(!r.ok)throw new Error('Groq error '+r.status);
    const data=await r.json();
    return data.choices[0].message.content;
  }catch(e){return'Error: '+e.message;}
  finally{if(btnEl){btnEl.disabled=false;btnEl.innerHTML=btnEl.innerHTML.replace(/<span class="ai-spinner"><\/span>/,'');}}
}

function buildGradeContext(subjId){
  if(subjId){
    const subj=S.subjects.find(s=>s.id===subjId);
    if(!subj)return'';
    const a=calcSubjectAvg(subj),wa=calcWrittenAvg(subj),oa=calcOralAvg(subj);
    return`Subject: ${subj.name}\nOverall: ${a?round2(a).toFixed(1):'—'}\nWritten: ${wa?round2(wa).toFixed(1):'—'}\nOral: ${oa?round2(oa).toFixed(1):'—'}\nGrades: ${subj.grades.map(g=>`${g.type} ${g.grade} (${g.date||'?'})`).join(', ')||'none'}\nPlanned Klausuren: ${subj.plannedKlausuren||0}, done: ${subj.grades.filter(g=>g.type==='klausur').length}`;
  }
  return S.subjects.map(s=>`${s.name}: avg ${round2(calcSubjectAvg(s)||0).toFixed(1)}, ${s.grades.length} grades`).join('\n');
}

document.getElementById('aiAnalyzeBtn').addEventListener('click',async function(){
  const ctx=buildGradeContext(aiSubjId);
  const prompt=`You are a helpful school tutor. Analyze this student's grades and give specific, actionable advice.\n\n${ctx}\n\nGive 3-4 concrete recommendations. Be direct and encouraging. Use German if the subject names are German.`;
  const result=await callGroq(prompt,this);
  if(result){const r=document.getElementById('aiResult');r.textContent=result;r.classList.add('show');}
});

document.getElementById('aiStudyPlanBtn').addEventListener('click',async function(){
  const ctx=buildGradeContext(aiSubjId);
  // Get upcoming Klausuren from life calendar
  let upcoming='';
  try{
    const lc=JSON.parse(localStorage.getItem('life_calendar_v1'))||[];
    const today=todayStr();
    upcoming=lc.filter(e=>e.type==='exam'&&e.date>=today).slice(0,5).map(e=>`${e.title} on ${e.date}`).join(', ');
  }catch(e){}
  const prompt=`You are a school tutor. Create a day-by-day study plan.\n\nGrade context:\n${ctx}\n\nUpcoming exams: ${upcoming||'none listed'}\n\nCreate a practical study plan for the next 7-10 days. Include specific topics to study each day. Keep it concise and motivating.`;
  const result=await callGroq(prompt,this);
  if(result){const r=document.getElementById('aiResult');r.textContent=result;r.classList.add('show');}
});

document.getElementById('aiExplainBtn').addEventListener('click',function(){
  const row=document.getElementById('aiTopicRow');
  row.style.display=row.style.display==='none'?'block':'none';
  if(row.style.display==='block')setTimeout(()=>document.getElementById('aiTopicInput').focus(),100);
});

document.getElementById('aiTopicInput').addEventListener('keydown',async function(e){
  if(e.key!=='Enter')return;
  const topic=this.value.trim();if(!topic)return;
  const ctx=buildGradeContext(aiSubjId);
  const prompt=`You are a school tutor. Explain this topic clearly for a student:\n\nTopic: ${topic}\n\nStudent's subject context:\n${ctx}\n\nGive a clear explanation with examples. Use simple language. If relevant, mention how this topic might appear in an exam.`;
  const result=await callGroq(prompt,null);
  if(result){const r=document.getElementById('aiResult');r.textContent=result;r.classList.add('show');}
});

/* ── Sheet helpers ── */
function openSheet(id){
  document.getElementById(id).classList.add('open');
  document.getElementById('mainOverlay').classList.add('open');
}
function closeSheet(id){
  document.getElementById(id).classList.remove('open');
  // Close overlay only if no other sheet open
  const anyOpen=['gradeSheet','subjectSheet','aiSheet'].some(sid=>document.getElementById(sid).classList.contains('open')&&sid!==id);
  if(!anyOpen)document.getElementById('mainOverlay').classList.remove('open');
}
document.getElementById('mainOverlay').addEventListener('click',()=>{
  ['gradeSheet','subjectSheet','aiSheet'].forEach(id=>{document.getElementById(id).classList.remove('open');});
  document.getElementById('mainOverlay').classList.remove('open');
});

/* ── FAB ── */
document.getElementById('mainFab').addEventListener('click',()=>{
  if(detailSubjId){openGradeSheet(detailSubjId,null);}
  else{openSubjectSheet(null);}
});

/* ── Keyboard ── */
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    ['gradeSheet','subjectSheet','aiSheet'].forEach(id=>document.getElementById(id).classList.remove('open'));
    document.getElementById('mainOverlay').classList.remove('open');
    closeDetail();
  }
});

/* ── Boot ── */
load();renderApp();

})();

})();