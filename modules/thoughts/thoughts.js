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
window.thSearchInput=function(v){search=v;render();const si=document.getElementById('thSearch');if(si){si.focus();si.value=v;si.setSelectionRange(v.length,v.length);}};

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
    aiOut(id,'<b>Developed plan</b>\n'+esc(out));}catch(e){aiErr(id,e);}};

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
  try{const out=await groq([{role:'system',content:'Given a target note and a numbered list of other notes, name up to 3 that are most related and why, in one short line each. If none relate, say so.'},{role:'user',content:'TARGET: '+t.content+'\n\nOTHERS:\n'+others.join('\n')}],300);
    aiOut(id,'<b>Related</b>\n'+esc(out));}catch(e){aiErr(id,e);}};

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
      {role:'user',content:'Projects: '+(projs||'none')+'\n\nThoughts:\n'+recent.join('\n')}],400);
    s.weeklySummary={date:weekKey(),text:out};save(s);
    thOpenModal('<div class="th-modal-title">Weekly Summary</div><div style="font-size:14px;line-height:1.7;color:var(--t2);white-space:pre-wrap">'+esc(out)+'</div><button class="th-mbtn sec" onclick="thCloseModal()" style="margin-top:14px">Close</button>');
  }catch(e){thOpenModal('<div class="th-modal-title">Weekly Summary</div><div style="color:#f87171">'+(e.message==='NO_KEY'?'Add a Groq key in dashboard Settings.':(e.message||e))+'</div><button class="th-mbtn sec" onclick="thCloseModal()" style="margin-top:14px">Close</button>');}
};

// ── EXPORT ──
window.thExport=function(){
  const s=load();
  let txt='THOUGHTS & PROJECTS EXPORT\n'+new Date().toLocaleString()+'\n\n';
  (s.projects||[]).forEach(p=>{txt+='## PROJECT: '+p.name+' ['+p.status+']\n'+(p.description||'')+'\n\n';});
  txt+='## ALL THOUGHTS\n\n';
  sortThoughts(s.thoughts).forEach(t=>{const proj=projOf(s,t.project);txt+='['+tagOf(t.tag).label+'|'+prioOf(t.priority).label+(proj?'|'+proj.name:'')+'] '+new Date(t.created).toLocaleDateString()+'\n'+t.content+'\n'+(t.done?'(done)\n':'')+'\n';});
  const blob=new Blob([txt],{type:'text/plain'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='thoughts-'+new Date().toISOString().slice(0,10)+'.txt';a.click();
};

// ── BOOT ──
window.thRender=render;
render();
window.addEventListener('storage',e=>{if(e.key===TK)render();});
if(window.initCloudSync){window.initCloudSync({appKey:'thoughts',syncedKeys:[TK],onApplied:render});}
})();
