(function(){
  (function(){
  'use strict';
  const CAL_KEY='calendar_v1';
  function load(){try{return JSON.parse(localStorage.getItem(CAL_KEY))||{events:[]};}catch{return{events:[]};}}
  function save(s){localStorage.setItem(CAL_KEY,JSON.stringify(s));}
  function whoop(){try{return JSON.parse(localStorage.getItem('whoop_data_v1'))||{};}catch{return{};}}
  function strava(){try{return JSON.parse(localStorage.getItem('strava_data_v1'))||{activities:[]};}catch{return{activities:[]};}}
  function groqKey(){return localStorage.getItem('groq_api_key')||'';}
  function uid(){return Date.now().toString(36)+Math.random().toString(36).slice(2,6);}
  function pad(n){return String(n).padStart(2,'0');}
  function dk(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());}
  function todayK(){return dk(new Date());}
  function parseD(s){return new Date(s+'T12:00:00');}
  const DOW=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const MONTHS=['January','February','March','April','May','June','July','August','September','October','November','December'];

  function svg(p){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;display:inline-block;vertical-align:-.14em">'+p+'</svg>';}
  const ICON={
    swim:svg('<circle cx="17" cy="7" r="2"/><path d="M2 16c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1M5.5 13l4-3 3 2 3.5-2.5"/>'),
    bike:svg('<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5 9 9l3-2 3 4h3M9 9l-3 1"/>'),
    run:svg('<circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-3-2 2-5 3 2 2 1M7 12l2-4M13 16l3 1 1 4M9 21l1-4"/>'),
    strength:svg('<path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/>'),
    hyrox:svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
    race:svg('<path d="M4 21V4M4 4h13l-2 4 2 4H4"/>'),
    rest:svg('<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>'),
    birthday:svg('<path d="M4 21v-8h16v8zM4 13a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2M12 11V8M12 21v-8"/>'),
    appointment:svg('<path d="M3 21V8l9-5 9 5v13M3 21h18M12 9v6M9 12h6"/>'),
    travel:svg('<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>'),
    school:svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
    general:svg('<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>')
  };
  const TYPES={
    swim:{l:'Swim',c:'#38bdf8',train:1},bike:{l:'Bike',c:'#f59e0b',train:1},run:{l:'Run',c:'#6ee7b7',train:1},
    strength:{l:'Strength',c:'#a78bfa',train:1},hyrox:{l:'Hyrox',c:'#fb923c',train:1},
    race:{l:'Race',c:'#f43f5e'},rest:{l:'Rest',c:'#6b7280'},birthday:{l:'Birthday',c:'#ec4899',yearly:1},
    appointment:{l:'Appt',c:'#2dd4bf'},travel:{l:'Travel',c:'#818cf8',span:1},school:{l:'School',c:'#fbbf24'},general:{l:'General',c:'#9ca3af'}
  };
  const PRIO={high:{l:'High',c:'#f43f5e'},medium:{l:'Med',c:'#f59e0b'},low:{l:'Low',c:'#34d399'}};
  function T(id){return TYPES[id]||TYPES.general;}

  function occursOn(e,dateStr){
    if(e.endDate&&e.date){return dateStr>=e.date&&dateStr<=e.endDate;}
    if(e.recurring==='yearly'||T(e.type).yearly){return e.date.slice(5)===dateStr.slice(5);}
    if(e.recurring==='monthly'){return e.date.slice(8)===dateStr.slice(8)&&dateStr>=e.date;}
    if(e.recurring==='weekly'){return parseD(e.date).getDay()===parseD(dateStr).getDay()&&dateStr>=e.date;}
    if(e.recurring==='daily'){return dateStr>=e.date;}
    return e.date===dateStr;
  }
  function stravaOn(dateStr){
    return (strava().activities||[]).filter(a=>(a.date||'').slice(0,10)===dateStr).map(a=>({
      id:'sv_'+a.id,type:a.disc,title:a.name||T(a.disc).l,date:dateStr,
      time:(a.date||'').slice(11,16)||'',duration:a.durationMin||0,strava:true,done:true,
      meta:(a.distanceKm?a.distanceKm+'km ':'')+(a.durationMin?a.durationMin+'min ':'')+(a.pace||''),priority:'low'
    }));
  }
  function eventsOn(dateStr){
    const s=load();
    return (s.events||[]).filter(e=>occursOn(e,dateStr)).concat(stravaOn(dateStr));
  }
  function recovery(dateStr){const h=whoop().history||{};return h[dateStr]?h[dateStr].recovery:null;}
  function recColor(r){return r==null?'rgba(255,255,255,.15)':r>=67?'#6ee7b7':r>=34?'#f59e0b':'#f43f5e';}
  function trainLoad(dateStr){return eventsOn(dateStr).filter(e=>T(e.type).train).reduce((a,e)=>a+(e.duration||0),0);}
  function nextRaces(n){const s=load();const td=todayK();return (s.events||[]).filter(e=>e.type==='race'&&e.date>=td).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,n||2);}
  function daysUntil(d){return Math.round((parseD(d)-parseD(todayK()))/864e5);}
  function taperDay(dateStr){const r=nextRaces(1)[0];if(!r)return false;const du=Math.round((parseD(r.date)-parseD(dateStr))/864e5);return du>0&&du<=14;}

  let view='week', cur=new Date(), sel=todayK();
  function weekStartOf(d){const x=new Date(d);const o=(x.getDay()+6)%7;x.setDate(x.getDate()-o);x.setHours(12,0,0,0);return x;}

  function render(dir){
    const root=document.getElementById('cal-root');if(!root)return;
    let title='',sub='';
    if(view==='month'){title=MONTHS[cur.getMonth()];sub=String(cur.getFullYear());}
    else if(view==='week'){const ws=weekStartOf(cur);const we=new Date(ws);we.setDate(ws.getDate()+6);title=MONTHS[ws.getMonth()].slice(0,3)+' '+ws.getDate()+'–'+we.getDate();sub=String(ws.getFullYear());}
    else{const d=parseD(sel);title=d.toLocaleDateString('en',{weekday:'long'});sub=d.toLocaleDateString('en',{month:'long',day:'numeric'});}
    let races='';const rs=nextRaces(2).filter(r=>daysUntil(r.date)<=120);
    if(rs.length)races='<div class="pc-race-strip">'+rs.map(r=>{const du=daysUntil(r.date);return '<div class="pc-race-chip"><span class="d">'+(du===0?'•':du)+'</span><div><div class="n">'+esc(r.title||'Race')+'</div><div class="l">'+(du===0?'Race day':du+' days · '+r.date)+'</div></div></div>';}).join('')+'</div>';
    let body=view==='month'?renderMonth():view==='week'?renderWeek():renderDay();
    const anim=dir==='l'?'pc-slideL':dir==='r'?'pc-slideR':'';
    root.innerHTML='<div class="pc-wrap">'
      +'<div class="pc-head"><div><div class="pc-title">'+title+'</div><div class="pc-sub">'+sub+'</div></div>'
        +'<div class="pc-nav"><button class="pc-today-btn" onclick="pcToday()">Today</button>'
        +'<button class="pc-nav-btn" onclick="pcPrev()">‹</button><button class="pc-nav-btn" onclick="pcNext()">›</button></div></div>'
      +'<div class="pc-views">'+['month','week','day'].map(v=>'<button class="pc-view-btn '+(view===v?'on':'')+'" onclick="pcView(\''+v+'\')">'+v.charAt(0).toUpperCase()+v.slice(1)+'</button>').join('')+'</div>'
      +races+'<div class="pc-card '+anim+'" id="pcCard">'+body+'</div></div>';
    bindSwipe();
    if(view!=='month')setTimeout(scrollToNow,30);
    if(view==='day')genReco();
  }

  function renderMonth(){
    const y=cur.getFullYear(),m=cur.getMonth();
    const first=new Date(y,m,1),fd=(first.getDay()+6)%7;
    const dim=new Date(y,m+1,0).getDate(),pdim=new Date(y,m,0).getDate();
    let cells=[];
    for(let i=fd-1;i>=0;i--)cells.push({d:new Date(y,m-1,pdim-i),other:1});
    for(let i=1;i<=dim;i++)cells.push({d:new Date(y,m,i)});
    while(cells.length%7)cells.push({d:new Date(y,m+1,cells.length-fd-dim+1),other:1});
    const td=todayK();
    function cell(c){
      const ds=dk(c.d),evs=eventsOn(ds),rec=recovery(ds);
      const isToday=ds===td,isRace=evs.some(e=>e.type==='race'),isPast=ds<td&&!isToday;
      let cls='pc-cell';if(c.other)cls+=' other';if(isPast)cls+=' past';if(isToday)cls+=' today';if(isRace)cls+=' race';else if(taperDay(ds))cls+=' taper';
      const dots=evs.slice(0,3).map(e=>'<span class="pc-cell-dot" style="background:'+T(e.type).c+'"></span>').join('');
      return '<div class="'+cls+'" onclick="pcOpenDay(\''+ds+'\')">'
        +(rec!=null?'<span class="pc-cell-rec" style="background:'+recColor(rec)+'"></span>':'')
        +'<div class="pc-cell-num">'+c.d.getDate()+'</div>'
        +'<div class="pc-cell-dots">'+dots+(evs.length>3?'<span class="pc-cell-more">+'+(evs.length-3)+'</span>':'')+'</div></div>';
    }
    let h='<div class="pc-dow">'+['M','T','W','T','F','S','S'].map(x=>'<span>'+x+'</span>').join('')+'</div>';
    // weeks with a per-week training-load bar underneath
    for(let w=0;w<cells.length;w+=7){
      const week=cells.slice(w,w+7);
      let loads=week.map(c=>trainLoad(dk(c.d)));
      const maxL=Math.max(60,...loads);
      h+='<div class="pc-grid">'+week.map(cell).join('')+'</div>';
      h+='<div class="pc-wload">'+loads.map(l=>'<div class="pc-wload-c"><div class="pc-wload-bar" style="height:'+Math.round(l/maxL*100)+'%;background:'+(l?'#a78bfa':'transparent')+'"></div></div>').join('')+'</div>';
    }
    return h;
  }

  function renderWeek(){
    const ws=weekStartOf(cur),td=todayK();
    let strip='<div class="pc-strip">';
    for(let i=0;i<7;i++){
      const d=new Date(ws);d.setDate(ws.getDate()+i);const ds=dk(d);
      const evs=eventsOn(ds),rec=recovery(ds),ld=trainLoad(ds);
      let cls='pc-sd';if(ds===sel)cls+=' sel';if(ds===td)cls+=' today';
      const dots=evs.slice(0,4).map(e=>'<span class="pc-sd-dot" style="background:'+T(e.type).c+'"></span>').join('');
      strip+='<div class="'+cls+'" onclick="pcSelDay(\''+ds+'\')">'
        +'<span class="pc-sd-dow">'+DOW[i].slice(0,2)+'</span><div class="pc-sd-num">'+d.getDate()+'</div>'
        +'<span class="pc-sd-rec" style="background:'+recColor(rec)+'"></span>'
        +'<div class="pc-sd-dots">'+dots+'</div><span class="pc-sd-load">'+(ld?(ld/60).toFixed(1)+'h':'')+'</span></div>';
    }
    strip+='</div>';
    return strip+'<div style="height:1px;background:rgba(255,255,255,.06);margin:6px 0 4px"></div>'+timeline(sel);
  }

  function renderDay(){
    const evs=eventsOn(sel);
    let reco='<div class="pc-reco" onclick="genReco(1)">'+ICON.hyrox+'<span id="pcRecoText">'+(recoCached()||'Tap for today\'s AI recommendation…')+'</span></div>';
    const hard=evs.some(e=>T(e.type).train&&e.intensity==='hard');
    const hiPrio=evs.some(e=>e.priority==='high'&&!T(e.type).train);
    let warn=(hard&&hiPrio)?'<div class="pc-warn"><span>⚠</span><div>Hard training clashes with a high-priority event today — consider easing the session.</div></div>':'';
    return reco+warn+timeline(sel);
  }

  const HH=58; // px per hour
  function timeline(ds){
    const evs0=eventsOn(ds);
    const timed=evs0.filter(e=>e.time).map(e=>{const[h,m]=e.time.split(':').map(Number);const s=h*60+m;return Object.assign({},e,{_s:s,_e:s+Math.max(20,e.duration||45)});}).sort((a,b)=>a._s-b._s||a._e-b._e);
    const allday=evs0.filter(e=>!e.time);
    // dynamic visible window
    let startH=7,endH=21;
    if(timed.length){let mn=24*60,mx=0;timed.forEach(e=>{mn=Math.min(mn,e._s);mx=Math.max(mx,e._e);});startH=Math.max(0,Math.min(Math.floor(mn/60),7));endH=Math.min(24,Math.max(Math.ceil(mx/60),startH+9));}
    if(ds===todayK()){const nh=new Date().getHours();startH=Math.min(startH,Math.max(0,nh-1));endH=Math.max(endH,Math.min(24,nh+2));}
    // hour grid
    let rows='';
    for(let hr=startH;hr<endH;hr++){rows+='<div class="pc-hour" style="height:'+HH+'px"><div class="pc-hour-lbl">'+fmtHr(hr)+'</div><div class="pc-hour-line" style="min-height:'+HH+'px" onclick="pcAddAt(\''+ds+'\','+hr+')"></div></div>';}
    // overlap layout → columns
    layoutEvents(timed);
    let blocks='';
    timed.forEach(e=>{
      if(e._e<=startH*60||e._s>=endH*60)return;
      const top=(e._s-startH*60)/60*HH;
      const height=Math.max(24,(e._e-e._s)/60*HH-3);
      const c=T(e.type).c;
      const lf=(e.col/e.cols).toFixed(4);
      blocks+='<div class="pc-evt" style="top:'+top.toFixed(1)+'px;height:'+height.toFixed(1)+'px;left:calc(48px + (100% - 50px)*'+lf+');width:calc((100% - 50px)/'+e.cols+' - 3px);background:'+c+'22;box-shadow:0 0 16px '+c+'2e inset'+(e.strava?';outline:1.5px solid #f59e0b':'')+'" onclick="pcOpenEvt(\''+e.id+'\',\''+ds+'\')">'
        +'<div class="pc-evt-t" style="color:'+c+'"><span class="pc-evt-prio" style="background:'+(PRIO[e.priority]||PRIO.low).c+'"></span>'+(height>34?'<span style="opacity:.85;font-size:.9em">'+(ICON[e.type]||'')+'</span> ':'')+esc(e.title)+((e.strava||e.done)?' '+ok():'')+'</div>'
        +(height>40?'<div class="pc-evt-m" style="color:'+c+'">'+e.time+(e.duration?' · '+e.duration+'m':'')+(e.meta?' · '+esc(e.meta):'')+'</div>':'')+'</div>';
    });
    let now='';if(ds===todayK()){const n=new Date();const cm=n.getHours()*60+n.getMinutes();if(cm>=startH*60&&cm<endH*60)now='<div class="pc-nowline" style="top:'+((cm-startH*60)/60*HH)+'px"></div>';}
    let head=allday.length?'<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">'+allday.map(e=>pill(e,ds)).join('')+'</div>':'';
    const total=(endH-startH)*HH;
    return head+'<div class="pc-tl-scroll" id="pcTLScroll"><div style="position:relative;height:'+total+'px"><div class="pc-tl" style="margin:0">'+rows+'</div><div style="position:absolute;top:0;left:0;right:0">'+blocks+now+'</div></div></div>';
  }
  function scrollToNow(){
    const sc=document.getElementById('pcTLScroll');if(!sc)return;
    const nl=sc.querySelector('.pc-nowline');
    if(nl){const top=parseFloat(nl.style.top)||0;sc.scrollTop=Math.max(0,top-sc.clientHeight*0.4);}
  }
  // assign each timed event a column index + total columns for its overlap cluster
  function layoutEvents(list){
    let cur=[],curEnd=-1;const clusters=[];
    list.forEach(ev=>{if(cur.length&&ev._s>=curEnd){clusters.push(cur);cur=[];curEnd=-1;}cur.push(ev);curEnd=Math.max(curEnd,ev._e);});
    if(cur.length)clusters.push(cur);
    clusters.forEach(cl=>{const cols=[];cl.forEach(ev=>{let i=0;for(;i<cols.length;i++){if(cols[i]<=ev._s)break;}cols[i]=ev._e;ev.col=i;});const n=cols.length;cl.forEach(ev=>ev.cols=n);});
  }
  function ok(){return '<svg viewBox="0 0 24 24" style="width:.85em;height:.85em;display:inline-block;vertical-align:-.1em" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';}
  function pill(e,ds){return '<span style="display:inline-flex;align-items:center;gap:5px;padding:5px 11px;border-radius:20px;font-size:12px;font-weight:700;color:'+T(e.type).c+';background:'+T(e.type).c+'1e" onclick="pcOpenEvt(\''+e.id+'\',\''+ds+'\')"><span class="pc-evt-prio" style="background:'+(PRIO[e.priority]||PRIO.low).c+'"></span>'+esc(e.title)+'</span>';}
  function fmtHr(h){return h===12?'12p':h>12?(h-12)+'p':h+'a';}
  function fmtT(t){if(!t)return'';const[h,m]=t.split(':').map(Number);return (h%12||12)+':'+pad(m)+(h<12?'am':'pm');}
  function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  window.pcView=function(v){view=v;render();};
  window.pcToday=function(){cur=new Date();sel=todayK();render();};
  window.pcPrev=function(){shift(-1);};window.pcNext=function(){shift(1);};
  function shift(n){
    if(view==='month')cur.setMonth(cur.getMonth()+n);
    else if(view==='week')cur.setDate(cur.getDate()+7*n);
    else{const d=parseD(sel);d.setDate(d.getDate()+n);sel=dk(d);cur=new Date(d);}
    render(n>0?'l':'r');
  }
  window.pcSelDay=function(ds){sel=ds;render();};
  function bindSwipe(){
    const c=document.getElementById('pcCard');if(!c)return;let sx=0,sy=0;
    c.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;},{passive:true});
    c.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy)*1.6){dx<0?shift(1):shift(-1);}},{passive:true});
  }

  window.pcOpenDay=function(ds){
    sel=ds;const d=parseD(ds),evs=eventsOn(ds),rec=recovery(ds);
    let h='<div class="pc-handle"></div><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">'
      +'<div class="pc-sheet-title" style="margin:0">'+d.toLocaleDateString('en',{weekday:'long',month:'short',day:'numeric'})+'</div>'
      +(rec!=null?'<span style="font-size:12px;font-weight:700;color:'+recColor(rec)+'">'+rec+'% rec</span>':'')+'</div>';
    h+=evs.length?evs.slice().sort((a,b)=>(a.time||'99').localeCompare(b.time||'99')).map(e=>deRow(e,ds)).join(''):'<div class="pc-empty">No events.</div>';
    h+='<button class="pc-btn pri" style="margin-top:12px" onclick="pcCloseDaySheet();pcAddAt(\''+ds+'\',9)">+ Add Event</button>';
    document.getElementById('pcDayPanel').innerHTML=h;document.getElementById('pcDaySheet').classList.add('open');
  };
  window.pcCloseDaySheet=function(){document.getElementById('pcDaySheet').classList.remove('open');render();};
  function deRow(e,ds){
    const c=T(e.type).c;const meta=[fmtT(e.time),e.duration?e.duration+'min':null,e.meta||null].filter(Boolean).join(' · ');
    return '<div class="pc-de" onclick="pcOpenEvt(\''+e.id+'\',\''+ds+'\')"><div class="pc-de-bar" style="background:'+c+';box-shadow:0 0 10px '+c+'"></div>'
      +'<div class="pc-de-b"><div class="pc-de-t" style="color:'+c+'"><span class="pc-evt-prio" style="background:'+(PRIO[e.priority]||PRIO.low).c+'"></span>'+esc(e.title)+(e.strava?' '+ok():'')+'</div>'+(meta?'<div class="pc-de-m">'+meta+'</div>':'')+'</div>'
      +(T(e.type).train&&!e.strava?'<button class="pc-de-check '+(e.done?'done':'')+'" onclick="event.stopPropagation();pcToggleDone(\''+e.id+'\')">'+(e.done?ok():'')+'</button>':'')+'</div>';
  }
  window.pcToggleDone=function(id){const s=load();const e=s.events.find(x=>x.id===id);if(e){e.done=!e.done;save(s);document.getElementById('pcDaySheet').classList.contains('open')?pcOpenDay(sel):render();}};

  let editId=null,formType='run',formPrio='medium';
  window.pcQuickAdd=function(){openForm(null,sel,null);};
  window.pcAddAt=function(ds,hr){openForm(null,ds,hr!=null?pad(hr)+':00':null);};
  window.pcOpenEvt=function(id,ds){
    if(String(id).indexOf('sv_')===0){
      const a=(strava().activities||[]).find(x=>'sv_'+x.id===id);if(!a)return;const c=T(a.disc).c;
      document.getElementById('pcSheetPanel').innerHTML='<div class="pc-handle"></div><div class="pc-sheet-title" style="color:'+c+'">'+esc(a.name||T(a.disc).l)+'</div>'
        +'<div style="font-size:13px;color:rgba(255,255,255,.6);line-height:1.9">'+[a.distanceKm?a.distanceKm+' km':'',a.durationMin?a.durationMin+' min':'',a.pace||'',a.avgHr?Math.round(a.avgHr)+' bpm avg':'',a.elevM?a.elevM+' m elev':''].filter(Boolean).join('<br>')+'</div>'
        +'<div style="margin-top:10px;font-size:12px;color:#f59e0b;font-weight:700">Completed · Strava</div><button class="pc-btn sec" onclick="pcCloseSheet()">Close</button>';
      document.getElementById('pcSheet').classList.add('open');return;
    }
    openForm(id,ds,null);
  };
  function openForm(id,ds,time){
    const s=load();const e=id?s.events.find(x=>x.id===id):null;
    editId=id;formType=e?e.type:'run';formPrio=e?(e.priority||'medium'):'medium';
    const p=document.getElementById('pcSheetPanel');
    p.innerHTML='<div class="pc-handle"></div><div class="pc-sheet-title">'+(id?'Edit':'New')+' Event</div>'
      +'<div class="pc-type-grid" id="pcTypeGrid">'+Object.keys(TYPES).map(k=>'<div class="pc-type'+(k===formType?' sel':'')+'" style="color:'+TYPES[k].c+'" onclick="pcSelType(\''+k+'\')"><span class="pc-type-ic" style="color:'+TYPES[k].c+'">'+ICON[k]+'</span><span class="pc-type-l">'+TYPES[k].l+'</span></div>').join('')+'</div>'
      +'<div class="pc-f"><label>Title</label><input id="pcfTitle" placeholder="Name" value="'+esc(e?e.title:'')+'"></div>'
      +'<div id="pcfBody"></div>'
      +'<button class="pc-btn pri" onclick="pcSaveEvt()">Save</button>'
      +(id?'<button class="pc-btn del" onclick="pcDelEvt()">Delete</button>':'')
      +'<button class="pc-btn sec" onclick="pcCloseSheet()">Cancel</button>';
    document.getElementById('pcSheet').classList.add('open');
    renderFormBody(e,ds,time);
  }
  window.pcSelType=function(k){formType=k;document.querySelectorAll('#pcTypeGrid .pc-type').forEach((el,i)=>el.classList.toggle('sel',Object.keys(TYPES)[i]===k));renderFormBody(editId?load().events.find(x=>x.id===editId):null,null,null);};
  function renderFormBody(e,ds,time){
    const body=document.getElementById('pcfBody');if(!body)return;
    const date=e?e.date:(ds||sel),tm=time||(e?e.time:'');const t=T(formType);
    function f(label,inner){return '<div class="pc-f"><label>'+label+'</label>'+inner+'</div>';}
    let h='';
    if(formType==='birthday'){h=f('Date','<input type="date" id="pcfDate" value="'+date+'">');}
    else if(t.train){
      h='<div class="pc-f-row">'+f('Date','<input type="date" id="pcfDate" value="'+date+'">')+f('Time','<input type="time" id="pcfTime" value="'+tm+'">')+'</div>'
        +'<div class="pc-f-row">'+f('Duration (min)','<input type="number" id="pcfDur" value="'+((e&&e.duration)||60)+'">')
        +f('Intensity','<select id="pcfInt"><option value="easy">Easy</option><option value="moderate"'+(e&&e.intensity==='moderate'?' selected':'')+'>Moderate</option><option value="hard"'+(e&&e.intensity==='hard'?' selected':'')+'>Hard</option></select>')+'</div>';
    } else {
      h='<div class="pc-f-row">'+f('Date','<input type="date" id="pcfDate" value="'+date+'">')+f('Time','<input type="time" id="pcfTime" value="'+tm+'">')+'</div>';
      if(t.span)h+=f('End date (optional)','<input type="date" id="pcfEnd" value="'+((e&&e.endDate)||'')+'">');
      h+='<div class="pc-f"><label>Priority</label><div class="pc-prio">'+Object.keys(PRIO).map(k=>'<div class="pc-prio-opt'+(k===formPrio?' sel':'')+'" style="color:'+PRIO[k].c+'" onclick="pcSelPrio(\''+k+'\')"><span class="pc-prio-dot" style="background:'+PRIO[k].c+'"></span>'+PRIO[k].l+'</div>').join('')+'</div></div>';
    }
    h+='<div class="pc-f-row">'
      +f('Reminder','<select id="pcfRem"><option value="">None</option><option value="15"'+(e&&e.reminder=='15'?' selected':'')+'>15 min</option><option value="30"'+(e&&e.reminder=='30'?' selected':'')+'>30 min</option><option value="60"'+(e&&e.reminder=='60'?' selected':'')+'>1 hr</option><option value="120"'+(e&&e.reminder=='120'?' selected':'')+'>2 hr</option></select>')
      +f('Repeat','<select id="pcfRep"><option value="">Never</option><option value="daily"'+(e&&e.recurring==='daily'?' selected':'')+'>Daily</option><option value="weekly"'+(e&&e.recurring==='weekly'?' selected':'')+'>Weekly</option><option value="monthly"'+(e&&e.recurring==='monthly'?' selected':'')+'>Monthly</option><option value="yearly"'+(e&&e.recurring==='yearly'?' selected':'')+'>Yearly</option></select>')+'</div>';
    body.innerHTML=h;
  }
  window.pcSelPrio=function(k){formPrio=k;document.querySelectorAll('.pc-prio-opt').forEach((el,i)=>el.classList.toggle('sel',Object.keys(PRIO)[i]===k));};
  window.pcSaveEvt=function(){
    const s=load();const g=id=>document.getElementById(id);
    const ev={id:editId||uid(),type:formType,title:(g('pcfTitle').value||T(formType).l),
      date:g('pcfDate')?g('pcfDate').value:sel,time:g('pcfTime')?g('pcfTime').value:'',
      duration:g('pcfDur')?parseInt(g('pcfDur').value)||null:null,intensity:g('pcfInt')?g('pcfInt').value:null,
      endDate:(g('pcfEnd')&&g('pcfEnd').value)?g('pcfEnd').value:null,priority:formPrio,
      reminder:g('pcfRem')?g('pcfRem').value:'',recurring:g('pcfRep')?g('pcfRep').value:'',
      done:editId?((s.events.find(x=>x.id===editId)||{}).done||false):false};
    if(T(formType).yearly)ev.recurring='yearly';
    const i=s.events.findIndex(x=>x.id===editId);if(i>=0)s.events[i]=ev;else s.events.push(ev);
    save(s);sel=ev.date;cur=parseD(ev.date);pcCloseSheet();scheduleNotif(ev);render();
  };
  window.pcDelEvt=function(){const s=load();s.events=s.events.filter(x=>x.id!==editId);save(s);pcCloseSheet();render();};
  window.pcCloseSheet=function(){document.getElementById('pcSheet').classList.remove('open');};

  function scheduleNotif(ev){if(!ev.reminder||Notification.permission!=='granted'||!ev.time||!ev.date)return;const t=new Date(ev.date+'T'+ev.time)-ev.reminder*60000-Date.now();if(t>0&&t<864e5)setTimeout(()=>new Notification(ev.title,{body:'in '+ev.reminder+' min'}),t);}
  function morningSummary(){if(Notification.permission!=='granted')return;const k='cal_morn_'+todayK();if(localStorage.getItem(k))return;if(new Date().getHours()<7)return;const evs=eventsOn(todayK());if(!evs.length)return;new Notification('Today: '+evs.length+' events',{body:evs.map(e=>e.title).join(', ')});localStorage.setItem(k,'1');}

  function recoCached(){try{const c=JSON.parse(localStorage.getItem('cal_reco_v1'));return c&&c.date===todayK()?c.text:null;}catch{return null;}}
  window.genReco=async function(force){
    const el=document.getElementById('pcRecoText');
    if(!force&&recoCached()){if(el)el.textContent=recoCached();return;}
    if(!groqKey()){if(force&&el)el.textContent='Add a Groq key in Settings for AI recommendations.';return;}
    if(force&&el)el.textContent='Thinking…';
    const evs=eventsOn(todayK()).map(e=>e.title+'('+e.type+(e.priority?'/'+e.priority:'')+')').join(', ');
    const rec=recovery(todayK());
    const ctx='Today recovery: '+(rec!=null?rec+'%':'unknown')+'. Today events: '+(evs||'none')+'.';
    try{
      const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+groqKey()},
        body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'system',content:'You are a training & schedule coach. Give ONE concise sentence recommendation for today based on recovery and events. No preamble.'},{role:'user',content:ctx}],max_tokens:60,temperature:0.5})});
      const d=await r.json();if(!r.ok)throw 0;
      const text=(d.choices&&d.choices[0]&&d.choices[0].message&&d.choices[0].message.content||'').trim();
      if(text){localStorage.setItem('cal_reco_v1',JSON.stringify({date:todayK(),text}));if(el)el.textContent=text;}
    }catch(e){if(force&&el)el.textContent='Could not generate recommendation.';}
  };

  window.pcRender=render;
  function boot(){render();morningSummary();}
  if(document.getElementById('cal-root'))boot();else document.addEventListener('DOMContentLoaded',boot);
  window.addEventListener('storage',e=>{if(['calendar_v1','whoop_data_v1','strava_data_v1'].includes(e.key))render();});
  if(window.initCloudSync){window.initCloudSync({appKey:'calendar',syncedKeys:[CAL_KEY],onApplied:render});}
  })();
})();