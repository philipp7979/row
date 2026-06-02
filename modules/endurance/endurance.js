(function(){
(function(){
'use strict';
const EK='endurance_v1', PO='po_coach_v1', CAL='calendar_v1';
function eload(){try{return JSON.parse(localStorage.getItem(EK))||edef();}catch{return edef();}}
function edef(){return{sessions:[],targets:{swim:5,bike:60,run:20,strength:12,hyrox:1,rest:2},metrics:{vo2max:[],ftp:[],css:[],threshold:[],maxhr:null},prs:{},prHistory:[],races:[],predictions:[],phase:null};}
function esave(s){localStorage.setItem(EK,JSON.stringify(s));}
function po(){try{return JSON.parse(localStorage.getItem(PO))||{};}catch{return{};}}
function cal(){try{return JSON.parse(localStorage.getItem(CAL))||{events:[]};}catch{return{events:[]};}}
function groqKey(){return localStorage.getItem('groq_api_key')||'';}
function todayK(){return new Date().toISOString().slice(0,10);}
function weekStart(d){d=d||new Date();const x=new Date(d);const dow=(x.getDay()+6)%7;x.setDate(x.getDate()-dow);x.setHours(0,0,0,0);return x;}
function inWeek(dateStr,offset){const d=new Date(dateStr);const ws=weekStart();ws.setDate(ws.getDate()+7*(offset||0));const we=new Date(ws);we.setDate(ws.getDate()+7);return d>=ws&&d<we;}

// ── STRAVA DATA BRIDGE ──
function stravaLoad(){try{return JSON.parse(localStorage.getItem('strava_data_v1'))||{activities:[]};}catch{return{activities:[]};}}
// Strava activities normalized to the endurance "session" shape
function stravaSessions(){
  return (stravaLoad().activities||[]).map(a=>({
    type:a.disc, date:a.date, distance:a.distanceKm||0, time:a.durationMin||0,
    avgHr:a.avgHr||null, maxHr:a.maxHr||null, pace:a.pace||'', elev:a.elevM||null,
    isRace:!!a.isRace, source:'strava', id:'sv_'+a.id, name:a.name
  }));
}
// Combined sessions: manual endurance_v1 logs + Strava activities
function allSessions(){ return (eload().sessions||[]).concat(stravaSessions()); }
// Easy/hard classification using HR vs 75% max HR (falls back to manual intensity)
function isEasy(sess){
  const maxhr=eload().metrics&&eload().metrics.maxhr;
  if(sess.avgHr&&maxhr) return sess.avgHr < 0.75*maxhr;
  if(sess.intensity) return sess.intensity==='easy';
  return null; // unknown
}

const AXES=['Swim','Bike','Run','Strength','Hyrox','Rest'];
const AXIS_KEY={Swim:'swim',Bike:'bike',Run:'run',Strength:'strength',Hyrox:'hyrox',Rest:'rest'};
const AXIS_COLORS={Swim:'#06b6d4',Bike:'#f59e0b',Run:'#22c55e',Strength:'#8b5cf6',Hyrox:'#ef4444',Rest:'#94a3b8'};
const AXIS_UNIT={Swim:'km',Bike:'km',Run:'km',Strength:'sets',Hyrox:'×',Rest:'d'};

// volume per axis for a given week offset (0=this week,-1=last)
function weekVolume(offset){
  const sessions=allSessions();const v={swim:0,bike:0,run:0,strength:0,hyrox:0,rest:0};
  sessions.forEach(ss=>{
    if(!ss.date||!inWeek(ss.date,offset))return;
    if(ss.type==='swim')v.swim+=(ss.distance||0);
    else if(ss.type==='bike')v.bike+=(ss.distance||0);
    else if(ss.type==='run')v.run+=(ss.distance||0);
    else if(ss.type==='hyrox')v.hyrox+=1;
    else if(ss.type==='strength')v.strength+=1; // Strava weight-training session
  });
  // strength sets from po_coach_v1 (logged lifts)
  const p=po();
  Object.values(p.logs||{}).forEach(arr=>arr.forEach(set=>{if(!set.warmup&&inWeek(set.date,offset))v.strength++;}));
  // rest days = days this week with no session/strength
  const active=new Set();
  sessions.forEach(ss=>{if(ss.date&&inWeek(ss.date,offset))active.add(ss.date.slice(0,10));});
  Object.values(p.logs||{}).forEach(arr=>arr.forEach(set=>{if(inWeek(set.date,offset))active.add(set.date.slice(0,10));}));
  const ws=weekStart();ws.setDate(ws.getDate()+7*(offset||0));
  let rest=0;for(let i=0;i<7;i++){const d=new Date(ws);d.setDate(ws.getDate()+i);if(d>new Date())continue;if(!active.has(d.toISOString().slice(0,10)))rest++;}
  v.rest=rest;
  return v;
}

// ════════ RENDER ════════
let enSub='log';
function enRender(){
  const root=document.getElementById('enRoot');if(!root)return;
  const s=eload();const tgt=s.targets;
  const cur=weekVolume(0),last=weekVolume(-1);

  // on-target count
  const hit=AXES.filter(a=>{const k=AXIS_KEY[a];return(cur[k]||0)>=(tgt[k]||1);}).length;
  const flagCol=hit>=5?'#6ee7b7':hit>=3?'#fbbf24':'#ff8a8a';

  // overtraining detection
  const curTotal=cur.swim+cur.bike+cur.run, lastTotal=last.swim+last.bike+last.run;
  let otWarn='';
  if(lastTotal>5&&curTotal>lastTotal*1.1){
    const pct=Math.round((curTotal/lastTotal-1)*100);
    otWarn=`<div class="en-warn orange"><span><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>️</span><div><b>Volume up ${pct}% vs last week.</b> Rapid increases raise injury risk — keep weekly jumps under 10%.</div></div>`;
  }
  // taper detection from calendar race
  const taper=enTaperCheck();
  let taperWarn='';
  if(taper)taperWarn=`<div class="en-warn blue"><span><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span><div><b>Taper time.</b> Race "${taper.title}" in ${taper.days} days — reduce volume ${taper.days<=7?'40-50%':'20-30%'}, keep some intensity.</div></div>`;

  root.innerHTML=`
    <div class="en-card">
      <div class="en-title">Endurance · This Week <span class="en-flag" style="background:${flagCol}22;color:${flagCol}">${hit}/6 on target</span></div>
      ${enRadarSVG(cur,last,tgt)}
      <div class="en-overlay-key">
        <span><span class="en-okline" style="background:#6ee7b7"></span>This week</span>
        <span><span class="en-okline" style="background:rgba(255,255,255,.4)"></span>Last week</span>
        <span><span class="en-okline" style="background:transparent;border-top:2px dashed rgba(255,255,255,.5);height:0"></span>Target</span>
      </div>
      <div class="en-legend">${AXES.map(a=>{
        const k=AXIS_KEY[a],v=cur[k]||0,t=tgt[k]||1;
        const ratio=v/t;const col=ratio>=1?'#6ee7b7':ratio>=0.7?'#fbbf24':'#ff8a8a';
        return`<div class="en-leg"><span class="en-leg-dot" style="background:${AXIS_COLORS[a]}"></span><span class="en-leg-name">${a}</span><span class="en-leg-val" style="color:${col}">${v%1?v.toFixed(1):v}/${t}${AXIS_UNIT[a]}</span></div>`;
      }).join('')}</div>
      ${otWarn}${taperWarn}
      <div style="text-align:right;margin-top:10px"><span style="font-size:12px;color:rgba(255,255,255,.4);cursor:pointer;text-decoration:underline" onclick="enOpenTargets()">Edit targets</span></div>
    </div>

    <div class="en-card">
      <div class="en-title">Log Endurance Session</div>
      <div class="en-disc-btns">
        <button class="en-disc-btn" onclick="enOpenLog('swim')"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="17" cy="7" r="2"/><path d="M2 16c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1M5.5 13l4-3 3 2 3.5-2.5"/></svg></span>Swim</button>
        <button class="en-disc-btn" onclick="enOpenLog('bike')"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5 9 9l3-2 3 4h3M9 9l-3 1"/></svg></span>Bike</button>
        <button class="en-disc-btn" onclick="enOpenLog('run')"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-3-2 2-5 3 2 2 1M7 12l2-4M13 16l3 1 1 4M9 21l1-4"/></svg></span>Run</button>
        <button class="en-disc-btn" onclick="enOpenLog('hyrox')"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg></span>Hyrox</button>
      </div>
    </div>

    <div class="en-card">
      <div class="en-sub-tabs">
        <button class="en-sub-tab ${enSub==='log'?'on':''}" onclick="enSetSub('log')">Week</button>
        <button class="en-sub-tab ${enSub==='metrics'?'on':''}" onclick="enSetSub('metrics')">Metrics</button>
        <button class="en-sub-tab ${enSub==='prs'?'on':''}" onclick="enSetSub('prs')">PRs</button>
        <button class="en-sub-tab ${enSub==='races'?'on':''}" onclick="enSetSub('races')">Races</button>
        <button class="en-sub-tab ${enSub==='ai'?'on':''}" onclick="enSetSub('ai')">AI</button>
        <button class="en-sub-tab ${enSub==='plan'?'on':''}" onclick="enSetSub('plan')">Plan</button>
      </div>
      <div class="en-pane ${enSub==='log'?'on':''}">${enRenderWeek(cur,tgt)}</div>
      <div class="en-pane ${enSub==='metrics'?'on':''}">${enRenderMetrics(s)}</div>
      <div class="en-pane ${enSub==='prs'?'on':''}">${enRenderPRs(s)}</div>
      <div class="en-pane ${enSub==='races'?'on':''}">${enRenderRaces(s)}</div>
      <div class="en-pane ${enSub==='ai'?'on':''}">${enRenderAI()}</div>
      <div class="en-pane ${enSub==='plan'?'on':''}">${enRenderPlan(s)}</div>
    </div>`;
}

window.enSetSub=function(t){enSub=t;enRender();};

// Radar with 2 overlays + target dashed
function enRadarSVG(cur,last,tgt){
  const cx=150,cy=145,R=105,n=6;
  function maxFor(a){const k=AXIS_KEY[a];return Math.max((tgt[k]||1)*1.3,cur[k]||0,last[k]||0,1);}
  function pt(i,r){const ang=(Math.PI*2*i/n)-Math.PI/2;return[cx+r*Math.cos(ang),cy+r*Math.sin(ang)];}
  let grid='';[0.25,0.5,0.75,1].forEach(f=>{grid+=`<polygon points="${AXES.map((a,i)=>pt(i,R*f).join(',')).join(' ')}" fill="none" stroke="rgba(255,255,255,.06)"/>`;});
  let axes='',labels='';
  AXES.forEach((a,i)=>{const[x,y]=pt(i,R);axes+=`<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="rgba(255,255,255,.06)"/>`;const[lx,ly]=pt(i,R+16);labels+=`<text x="${lx}" y="${ly}" fill="rgba(255,255,255,.6)" font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="middle">${a}</text>`;});
  const norm=(a,val)=>R*Math.min(1,val/maxFor(a));
  const tgtPts=AXES.map((a,i)=>pt(i,norm(a,tgt[AXIS_KEY[a]]||1)).join(',')).join(' ');
  const lastPts=AXES.map((a,i)=>pt(i,norm(a,last[AXIS_KEY[a]]||0)).join(',')).join(' ');
  const curPts=AXES.map((a,i)=>pt(i,norm(a,cur[AXIS_KEY[a]]||0)).join(',')).join(' ');
  let dots='';AXES.forEach((a,i)=>{const[x,y]=pt(i,norm(a,cur[AXIS_KEY[a]]||0));dots+=`<circle cx="${x}" cy="${y}" r="3" fill="${AXIS_COLORS[a]}"/>`;});
  return`<svg class="en-radar" viewBox="0 0 300 300">${grid}${axes}
    <polygon points="${tgtPts}" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.5" stroke-dasharray="4 3"/>
    <polygon points="${lastPts}" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.4)" stroke-width="1.5"/>
    <polygon points="${curPts}" fill="rgba(110,231,183,.2)" stroke="#6ee7b7" stroke-width="2"/>
    ${dots}${labels}</svg>`;
}

// Week analysis pane
function enRenderWeek(cur,tgt){
  const sessions=allSessions();
  const enduranceMin=sessions.filter(x=>x.date&&inWeek(x.date,0)&&['swim','bike','run'].includes(x.type)).reduce((a,x)=>a+(x.time||0),0);
  const strengthSets=cur.strength;
  const sbr=`${cur.swim%1?cur.swim.toFixed(1):cur.swim} : ${cur.bike%1?cur.bike.toFixed(1):cur.bike} : ${cur.run%1?cur.run.toFixed(1):cur.run}`;
  // 80/20 split — HR-based (avg HR vs 75% max), falls back to manual intensity
  const wkSessions=sessions.filter(x=>x.date&&inWeek(x.date,0)&&['swim','bike','run'].includes(x.type));
  let easy=0,hard=0;
  wkSessions.forEach(x=>{const e=isEasy(x);if(e===true)easy++;else if(e===false)hard++;});
  const totalI=easy+hard;
  const easyPct=totalI?Math.round(easy/totalI*100):0;
  // longest per discipline (all-time, combined)
  const longest={};['swim','bike','run'].forEach(t=>{const m=Math.max(0,...sessions.filter(x=>x.type===t).map(x=>x.distance||0));if(m>0)longest[t]=Math.round(m*10)/10;});
  return`
    <div class="en-row"><span class="en-row-name">Swim : Bike : Run (km)</span><span class="en-row-val">${sbr}</span></div>
    <div class="en-row"><span class="en-row-name">Endurance hours</span><span class="en-row-val">${(enduranceMin/60).toFixed(1)}h</span></div>
    <div class="en-row"><span class="en-row-name">Strength sets</span><span class="en-row-val">${strengthSets}</span></div>
    <div class="en-row"><span class="en-row-name">80/20 split (easy/hard)</span><span class="en-row-val" style="color:${easyPct>=75?'#6ee7b7':'#fbbf24'}">${easyPct}% / ${100-easyPct}%</span></div>
    ${Object.keys(longest).length?`<div style="margin-top:12px;font-size:12px;color:rgba(255,255,255,.5);margin-bottom:6px">Longest ever</div>${['swim','bike','run'].filter(t=>longest[t]).map(t=>`<div class="en-row"><span class="en-row-name" style="text-transform:capitalize">${t}</span><span class="en-row-val">${longest[t]} km</span></div>`).join('')}`:''}
    ${totalI&&easyPct<75?`<div class="en-warn orange" style="margin-top:10px"><span><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 15-5-5-4 4-3-3"/></svg></span><div>Only ${easyPct}% easy. The 80/20 rule suggests ~80% of sessions should be easy/aerobic.</div></div>`:''}`;
}

// Metrics pane
function enRenderMetrics(s){
  const m=s.metrics;
  function metricRow(key,name,unit){
    const arr=m[key]||[];const last=arr[arr.length-1];
    return`<div class="en-metric">
      <span class="en-metric-name">${name}</span>
      <span class="en-metric-val">${last?last.val:'—'}<span style="font-size:11px;color:rgba(255,255,255,.4)">${last?unit:''}</span></span>
      ${enSparkline(arr.map(x=>x.val))}
      <button class="en-metric-add" onclick="enOpenMetric('${key}','${name}')">+</button>
    </div>`;
  }
  let zones='';
  if(m.maxhr){
    const z=[[.5,.6,'Z1 Recovery','#94a3b8'],[.6,.7,'Z2 Aerobic','#22c55e'],[.7,.8,'Z3 Tempo','#fbbf24'],[.8,.9,'Z4 Threshold','#f59e0b'],[.9,1,'Z5 VO2max','#ef4444']];
    zones=`<div style="font-size:12px;color:rgba(255,255,255,.5);margin:14px 0 4px">HR Zones (Max ${m.maxhr})</div><div class="en-zones">`+
      z.map(([lo,hi,n,c])=>`<div class="en-zone"><span style="width:90px;color:${c};font-weight:600">${n}</span><div class="en-zone-bar" style="background:${c}"></div><span class="en-zone-range">${Math.round(m.maxhr*lo)}–${Math.round(m.maxhr*hi)}</span></div>`).join('')+`</div>`;
  }
  return metricRow('vo2max','VO₂max','')+metricRow('ftp','FTP','W')+metricRow('css','CSS','/100m')+metricRow('threshold','Run Thr','/km')
    +`<div class="en-metric"><span class="en-metric-name">Max HR</span><span class="en-metric-val">${m.maxhr||'—'}</span><span style="flex:1"></span><button class="en-metric-add" onclick="enOpenMetric('maxhr','Max HR')">+</button></div>`
    +zones;
}
function enSparkline(vals){
  if(!vals||vals.length<2)return'<span style="flex:1"></span>';
  const min=Math.min(...vals),max=Math.max(...vals),r=max-min||1;
  const pts=vals.map((v,i)=>`${(i/(vals.length-1)*78+1).toFixed(1)},${(22-((v-min)/r)*20).toFixed(1)}`).join(' ');
  const up=vals[vals.length-1]>=vals[0];
  return`<svg class="en-spark" viewBox="0 0 80 24"><polyline points="${pts}" fill="none" stroke="${up?'#6ee7b7':'#ff8a8a'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

// PRs pane
const PR_DEFS={
  swim:[['swim400','400m'],['swim1500','1500m'],['swim3800','3.8km']],
  bike:[['bike20','20km'],['bike40','40km'],['bike90','90km'],['bike180','180km']],
  run:[['run1','1km'],['run5','5km'],['run10','10km'],['run21','21km'],['run42','42km']],
  hyrox:[['hyroxTotal','Total']]
};
function enRenderPRs(s){
  let html='';
  const icons={swim:'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="17" cy="7" r="2"/><path d="M2 16c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1M5.5 13l4-3 3 2 3.5-2.5"/></svg>',bike:'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5 9 9l3-2 3 4h3M9 9l-3 1"/></svg>',run:'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-3-2 2-5 3 2 2 1M7 12l2-4M13 16l3 1 1 4M9 21l1-4"/></svg>',hyrox:'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>'};
  const star='<svg viewBox="0 0 24 24" width="1em" height="1em" fill="#FFD700" stroke="none" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z"/></svg>';
  const svPrs=(stravaLoad().prs)||{}; // auto run PRs from Strava best_efforts
  const recent=Date.now()-14*864e5;
  Object.keys(PR_DEFS).forEach(disc=>{
    html+=`<div style="font-size:12px;color:rgba(255,255,255,.5);margin:12px 0 4px">${icons[disc]} ${disc.charAt(0).toUpperCase()+disc.slice(1)}${disc==='run'&&Object.keys(svPrs).length?' <span style="color:#FC4C02">· Strava</span>':''}</div>`;
    PR_DEFS[disc].forEach(([key,label])=>{
      const sv=svPrs[key]; const manual=s.prs[key];
      const pr=sv||manual; // Strava-derived takes precedence for runs
      const isRecent=sv&&sv.date&&new Date(sv.date).getTime()>=recent;
      const valHtml=pr
        ?`${isRecent?star+' ':''}${pr.value}${pr.date?` <span style="font-size:11px;color:rgba(255,255,255,.4)">${pr.date}</span>`:''}${sv?'':''}`
        :'<span style="color:rgba(255,255,255,.3)">—</span>';
      html+=`<div class="en-row"><span class="en-row-name">${label}</span><span class="en-row-val">${valHtml}</span>${sv?'':`<button class="en-metric-add" style="margin-left:10px" onclick="enSetPR('${key}','${label}')">+</button>`}</div>`;
    });
  });
  if(Object.keys(svPrs).length)html+=`<div style="font-size:11px;color:rgba(255,255,255,.35);margin-top:10px"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="#FFD700" stroke="none" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z"/></svg> = set in the last 14 days · run PRs auto-detected from Strava</div>`;
  return html;
}
window.enSetPR=function(key,label){
  const v=prompt(`New PR for ${label} (time mm:ss or value):`);
  if(!v)return;
  const s=eload();s.prs[key]={value:v,date:todayK()};
  s.prHistory.unshift({discipline:key,value:v,date:todayK()});
  esave(s);enPrStar(`${label}: ${v}`);enRender();
};
function enPrStar(txt){
  const t=document.getElementById('gxPrToast');
  if(!t)return;document.getElementById('gxPrText').textContent='PR! '+txt;t.classList.add('show');
  if(navigator.vibrate)navigator.vibrate([100,50,100,50,200]);setTimeout(()=>t.classList.remove('show'),3500);
}

// Races pane — manual triathlon races + auto-detected Strava races
function enRenderRaces(s){
  let html=`<button class="gx-mbtn pri" onclick="enOpenRace()" style="margin-bottom:14px">+ Log Race</button>`;
  // Strava activities flagged as race (workout_type 1/11)
  const svRaces=stravaSessions().filter(x=>x.isRace).sort((a,b)=>new Date(b.date)-new Date(a.date));
  if(svRaces.length){
    html+=`<div style="font-size:12px;color:#FC4C02;font-weight:700;margin:4px 0 6px">Strava Races</div>`;
    svRaces.forEach(r=>{
      const sv=stravaLoad().activities.find(a=>('sv_'+a.id)===r.id)||{};
      const meta=[r.distance?r.distance+'km':null, sv.durationS?fmtTimeEn(sv.durationS):null, r.pace||null, r.avgHr?Math.round(r.avgHr)+'bpm':null].filter(Boolean).join(' · ');
      html+=`<div class="en-race-row">
        <span class="en-race-type" style="background:rgba(252,76,2,.15);color:#FC4C02;text-transform:capitalize">${r.type}</span>
        <div style="flex:1"><div style="font-size:14px;font-weight:700">${r.name||'Race'}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">${meta} · ${r.date.slice(0,10)}</div></div>
      </div>`;
    });
  }
  if(s.races.length){
    html+=`<div style="font-size:12px;color:rgba(255,255,255,.5);font-weight:700;margin:14px 0 6px">Triathlon Races</div>`;
    html+=s.races.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(r=>`
      <div class="en-race-row">
        <span class="en-race-type">${r.type}</span>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700">${r.total||'—'}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5)">S ${r.swim||'–'} · T1 ${r.t1||'–'} · Bike ${r.bike||'–'} · T2 ${r.t2||'–'} · R ${r.run||'–'} · ${r.date}</div>
        </div>
        <button class="en-metric-add" onclick="enDelRace('${r.id}')" style="background:rgba(248,113,113,.12);color:#f87171;border:none"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      </div>`).join('');
  }
  if(!svRaces.length&&!s.races.length)html+=`<div class="en-empty">No races yet. Strava activities marked as a race appear here automatically.</div>`;
  return html;
}
function fmtTimeEn(sec){sec=Math.round(sec);const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return(h>0?h+':'+String(m).padStart(2,'0'):m)+':'+String(s).padStart(2,'0');}
window.enDelRace=function(id){const s=eload();s.races=s.races.filter(r=>r.id!==id);esave(s);enRender();};

// AI pane
function enRenderAI(){
  return`<div class="en-ai-btns">
    <button class="en-ai-btn" onclick="enAiPredict()"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg></span>Performance Predictor</button>
    <button class="en-ai-btn" onclick="enAiCoach()"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>Weekly Coaching</button>
    <button class="en-ai-btn" onclick="enAiPace()"><span class="ico">⏱️</span>Pace Calculator</button>
    <button class="en-ai-btn" onclick="enAiStrategy()"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/></svg>️</span>Race Strategy</button>
    <button class="en-ai-btn" onclick="enAiRaceDay()"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 21V4M4 4h13l-2 4 2 4H4"/></svg></span>Race Day Protocol</button>
    <button class="en-ai-btn" onclick="enAiOvertraining()"><span class="ico"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 3v6a4 4 0 0 0 8 0V3M8 13v3a5 5 0 0 0 10 0v-1M2 3h4M16 3h4"/><circle cx="18" cy="15" r="2"/></svg></span>Overtraining Check</button>
  </div>
  <div class="en-ai-out" id="enAiOut"></div>
  ${enPredHistory()}`;
}
function enPredHistory(){
  const s=eload();if(!s.predictions.length)return'';
  return`<div style="font-size:12px;color:rgba(255,255,255,.4);margin:16px 0 6px">Prediction History</div>`+
    s.predictions.slice(0,4).map(p=>`<div style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13px"><div style="color:rgba(255,255,255,.7);font-weight:600">${p.q}</div><div style="color:rgba(255,255,255,.45);font-size:12px;margin-top:2px">${p.date}</div></div>`).join('');
}

// Plan pane
function enRenderPlan(s){
  const phases=['Base','Build','Peak','Taper'];
  const cur=s.phase?s.phase.type:null;
  const taper=enTaperCheck();
  const active=taper?'Taper':cur;
  return`
    <div class="en-phase-timeline">${phases.map(p=>`<div class="en-phase ${p===active?'on':''}">${p}</div>`).join('')}</div>
    <div style="font-size:13px;color:rgba(255,255,255,.6);line-height:1.6;margin-bottom:12px">
      <b>Base</b> — build aerobic volume. <b>Build</b> — add intensity & race-specific work. <b>Peak</b> — sharpen at race pace. <b>Taper</b> — cut volume, stay fresh.
    </div>
    ${taper?`<div class="en-warn blue"><span><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg></span><div>Auto-taper active — race in ${taper.days} days. Volume targets reduced.</div></div>`:''}
    <div class="gx-field" style="margin-top:12px"><label>Set current phase</label>
      <select id="enPhaseSel" onchange="enSetPhase(this.value)">
        <option value="">— none —</option>
        ${phases.map(p=>`<option value="${p}" ${cur===p?'selected':''}>${p}</option>`).join('')}
      </select>
    </div>`;
}
window.enSetPhase=function(v){const s=eload();s.phase=v?{type:v,start:todayK()}:null;esave(s);enRender();};

// taper auto-detect from calendar races
function enTaperCheck(){
  const c=cal();const td=new Date(todayK());
  const races=(c.events||[]).filter(e=>e.type==='race'&&e.date>=todayK()).sort((a,b)=>a.date.localeCompare(b.date));
  if(!races.length)return null;
  const r=races[0];const days=Math.round((new Date(r.date)-td)/864e5);
  if(days>=0&&days<=14)return{title:r.title||'Race',days};
  return null;
}

// ════════ LOG SESSION ════════
let enLogType='run';
window.enOpenLog=function(type){
  enLogType=type;
  document.getElementById('enLogTitle').innerHTML={swim:'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="17" cy="7" r="2"/><path d="M2 16c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1M5.5 13l4-3 3 2 3.5-2.5"/></svg> Swim',bike:'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5 9 9l3-2 3 4h3M9 9l-3 1"/></svg> Bike',run:'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-3-2 2-5 3 2 2 1M7 12l2-4M13 16l3 1 1 4M9 21l1-4"/></svg> Run',hyrox:'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg> Hyrox'}[type];
  const f=document.getElementById('enLogFields');
  const common=`<div class="gx-field"><label>Date</label><input type="date" id="enLogDate" value="${todayK()}"></div>
    <div class="gx-field"><label>Intensity</label><select id="enLogIntensity"><option value="easy">Easy / Aerobic</option><option value="moderate">Moderate</option><option value="hard">Hard / Threshold</option></select></div>`;
  if(type==='swim'){
    f.innerHTML=`<div class="gx-field"><label>Distance (km)</label><input type="number" id="enLogDist" step="0.05" placeholder="2.0"></div>
      <div class="gx-field"><label>Time (min)</label><input type="number" id="enLogTime" step="1" placeholder="45"></div>
      <div class="gx-field"><label>Water</label><select id="enLogWater"><option value="pool">Pool</option><option value="open">Open Water</option></select></div>${common}`;
  } else if(type==='bike'){
    f.innerHTML=`<div class="gx-field"><label>Distance (km)</label><input type="number" id="enLogDist" step="0.1" placeholder="40"></div>
      <div class="gx-field"><label>Time (min)</label><input type="number" id="enLogTime" step="1" placeholder="80"></div>
      <div class="gx-field"><label>Avg cadence (RPM)</label><input type="number" id="enLogCadence" placeholder="90"></div>
      <div class="gx-field"><label><input type="checkbox" id="enLogBrick" style="width:16px;height:16px;accent-color:#6ee7b7;vertical-align:-2px"> Brick (Bike→Run)</label></div>${common}`;
  } else if(type==='run'){
    f.innerHTML=`<div class="gx-field"><label>Distance (km)</label><input type="number" id="enLogDist" step="0.1" placeholder="10"></div>
      <div class="gx-field"><label>Time (min)</label><input type="number" id="enLogTime" step="1" placeholder="50"></div>
      <div class="gx-field"><label>Elevation gain (m)</label><input type="number" id="enLogElev" placeholder="120"></div>
      <div class="gx-field"><label><input type="checkbox" id="enLogBrick" style="width:16px;height:16px;accent-color:#6ee7b7;vertical-align:-2px"> Brick (off the bike)</label></div>${common}`;
  } else {
    const stations=['SkiErg','Sled Push','Sled Pull','Burpee Broad Jump','Row','Farmers Carry','Sandbag Lunges','Wall Balls'];
    f.innerHTML=`<div class="gx-field"><label>Total time (mm:ss)</label><input id="enLogTotal" placeholder="65:00"></div>
      <div style="font-size:12px;color:rgba(255,255,255,.5);margin:6px 0 4px">Station times (mm:ss)</div>
      <div class="en-stations">${stations.map((st,i)=>`<div class="en-station"><label>${st}</label><input id="enSt${i}" placeholder="mm:ss"></div>`).join('')}</div>
      <div class="gx-field" style="margin-top:10px"><label>Time (min, for volume)</label><input type="number" id="enLogTime" placeholder="65"></div>${common}`;
  }
  document.getElementById('enLogModal').classList.add('open');
};
window.enSaveSession=function(){
  const s=eload();const type=enLogType;
  const sess={id:'en_'+Date.now(),type,date:document.getElementById('enLogDate')?.value||todayK(),
    time:parseFloat(document.getElementById('enLogTime')?.value)||0,
    intensity:document.getElementById('enLogIntensity')?.value||'moderate'};
  if(type!=='hyrox'){
    sess.distance=parseFloat(document.getElementById('enLogDist')?.value)||0;
    if(sess.distance&&sess.time){
      if(type==='swim')sess.pace=(sess.time/(sess.distance*10)).toFixed(2)+'/100m';
      else if(type==='run')sess.pace=(sess.time/sess.distance).toFixed(2)+'/km';
      else sess.speed=(sess.distance/(sess.time/60)).toFixed(1)+'km/h';
    }
  }
  if(type==='swim')sess.water=document.getElementById('enLogWater')?.value;
  if(type==='bike')sess.cadence=parseFloat(document.getElementById('enLogCadence')?.value)||null;
  if(type==='run')sess.elevation=parseFloat(document.getElementById('enLogElev')?.value)||null;
  if(type==='bike'||type==='run')sess.brick=document.getElementById('enLogBrick')?.checked||false;
  if(type==='hyrox'){
    sess.total=document.getElementById('enLogTotal')?.value||'';
    sess.stations=[];for(let i=0;i<8;i++){sess.stations.push(document.getElementById('enSt'+i)?.value||'');}
  }
  s.sessions.push(sess);
  // auto-PR check for distance bests
  enAutoPR(s,sess);
  esave(s);gxCloseModal('enLogModal');enRender();
};
function enAutoPR(s,sess){
  // longest distance auto-tracking handled in week view; explicit time PRs are manual
}

// ════════ METRICS ════════
let enMetricKey='vo2max';
window.enOpenMetric=function(key,name){
  enMetricKey=key;
  document.getElementById('enMetricTitle').textContent='Log '+name;
  document.getElementById('enMetricLabel').textContent=name;
  document.getElementById('enMetricInput').value='';
  document.getElementById('enMetricModal').classList.add('open');
};
window.enSaveMetric=function(){
  const v=parseFloat(document.getElementById('enMetricInput').value);
  if(isNaN(v))return;
  const s=eload();
  if(enMetricKey==='maxhr')s.metrics.maxhr=v;
  else{if(!s.metrics[enMetricKey])s.metrics[enMetricKey]=[];s.metrics[enMetricKey].push({date:todayK(),val:v});}
  esave(s);gxCloseModal('enMetricModal');enRender();
};

// ════════ RACES ════════
window.enOpenRace=function(){document.getElementById('enRaceDate').value=todayK();document.getElementById('enRaceModal').classList.add('open');};
window.enSaveRace=function(){
  const s=eload();
  s.races.push({id:'r_'+Date.now(),type:document.getElementById('enRaceType').value,date:document.getElementById('enRaceDate').value||todayK(),
    swim:document.getElementById('enRaceSwim').value,t1:document.getElementById('enRaceT1').value,bike:document.getElementById('enRaceBike').value,
    t2:document.getElementById('enRaceT2').value,run:document.getElementById('enRaceRun').value,total:document.getElementById('enRaceTotal').value});
  esave(s);gxCloseModal('enRaceModal');enRender();
};

// ════════ TARGETS ════════
window.enOpenTargets=function(){
  const t=eload().targets;
  document.getElementById('enTgtSwim').value=t.swim;document.getElementById('enTgtBike').value=t.bike;
  document.getElementById('enTgtRun').value=t.run;document.getElementById('enTgtStrength').value=t.strength;
  document.getElementById('enTgtHyrox').value=t.hyrox;document.getElementById('enTgtRest').value=t.rest;
  document.getElementById('enTargetModal').classList.add('open');
};
window.enSaveTargets=function(){
  const s=eload();
  s.targets={swim:+document.getElementById('enTgtSwim').value||0,bike:+document.getElementById('enTgtBike').value||0,
    run:+document.getElementById('enTgtRun').value||0,strength:+document.getElementById('enTgtStrength').value||0,
    hyrox:+document.getElementById('enTgtHyrox').value||0,rest:+document.getElementById('enTgtRest').value||0};
  esave(s);gxCloseModal('enTargetModal');enRender();
};

// ════════ GROQ AI ════════
async function groq(prompt,sys){
  const key=groqKey();if(!key)throw new Error('NO_KEY');
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'system',content:sys||'You are an expert triathlon and endurance coach. Be concise, specific, and practical.'},{role:'user',content:prompt}],max_tokens:700,temperature:0.5})});
  const d=await r.json();if(!r.ok)throw new Error(d?.error?.message||'Groq error');
  return(d?.choices?.[0]?.message?.content||'').trim();
}
function enOut(html){const o=document.getElementById('enAiOut');o.innerHTML=html;o.classList.add('show');}
function enLoad(label){enOut(`<div style="display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.6)"><span style="width:16px;height:16px;border:2px solid rgba(255,255,255,.2);border-top-color:#fff;border-radius:50%;display:inline-block;animation:gxSpin .7s linear infinite"></span>${label}</div>`);}
function enErr(e){enOut(e.message==='NO_KEY'?`<div style="color:#ff8a8a">Add your Groq API key in Settings (<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82L4.2 7.12a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>) to use AI features.</div>`:`<div style="color:#ff8a8a">AI failed: ${e.message}</div>`);}
function esc(s){return(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

function dataSummary(){
  const s=eload();const cur=weekVolume(0),last=weekVolume(-1);
  const m=s.metrics;
  // Last 30 real activities (Strava + manual), most recent first, with HR/pace/elevation
  const recent=allSessions()
    .filter(x=>x.date)
    .sort((a,b)=>new Date(b.date)-new Date(a.date))
    .slice(0,30)
    .map(x=>{
      const parts=[x.date.slice(0,10),x.type];
      if(x.distance)parts.push(x.distance+'km');
      if(x.time)parts.push(Math.round(x.time)+'min');
      if(x.pace)parts.push(x.pace);
      if(x.avgHr)parts.push(Math.round(x.avgHr)+'bpm');
      if(x.elev)parts.push(x.elev+'m elev');
      return parts.join(' ');
    }).join('; ');
  return`This week: swim ${cur.swim.toFixed?cur.swim.toFixed(1):cur.swim}km, bike ${cur.bike.toFixed?cur.bike.toFixed(1):cur.bike}km, run ${cur.run.toFixed?cur.run.toFixed(1):cur.run}km, ${cur.strength} strength sessions, ${cur.hyrox} hyrox.
Last week: swim ${last.swim.toFixed?last.swim.toFixed(1):last.swim}km, bike ${last.bike}km, run ${last.run}km.
Metrics: VO2max ${m.vo2max.at?.(-1)?.val||'?'}, FTP ${m.ftp.at?.(-1)?.val||'?'}W, CSS ${m.css.at?.(-1)?.val||'?'}/100m, run threshold ${m.threshold.at?.(-1)?.val||'?'}/km, maxHR ${m.maxhr||'?'}.
Recent activities (most recent first): ${recent||'none logged — connect Strava or log sessions'}.`;
}
window.enAiCoach=async function(){enLoad('Reviewing your last 2 weeks…');try{
  const out=await groq(`Give a short weekly coaching message based on this endurance athlete's data. Note what's going well and the single most important thing to change.\n\n${dataSummary()}`);
  enOut(`<h4><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> Weekly Coaching</h4>${esc(out)}`);}catch(e){enErr(e);}};
window.enAiOvertraining=async function(){enLoad('Checking training load…');try{
  const out=await groq(`Analyze for overtraining risk. Flag if weekly volume jumped >10%, intensity distribution is off, or recovery looks insufficient.\n\n${dataSummary()}`);
  enOut(`<h4><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 3v6a4 4 0 0 0 8 0V3M8 13v3a5 5 0 0 0 10 0v-1M2 3h4M16 3h4"/><circle cx="18" cy="15" r="2"/></svg> Overtraining Check</h4>${esc(out)}`);}catch(e){enErr(e);}};
// Average pace from the last 5 Strava/manual activities of a discipline
function avgPace(disc){
  const acts=allSessions().filter(x=>x.type===disc&&x.pace).slice(-5);
  if(!acts.length)return null;
  return acts[acts.length-1].pace; // most recent real pace as the reference
}
window.enAiPace=async function(){
  const refs=['run','bike','swim'].map(d=>{const p=avgPace(d);return p?d+' '+p:null;}).filter(Boolean).join(', ');
  const dist=prompt('Target distance (e.g. "10km run", "1500m swim", "40km bike"):'+(refs?'\n\nYour recent paces: '+refs:''));if(!dist)return;
  const time=prompt('Goal time (e.g. "45:00"):');if(!time)return;
  enLoad('Calculating pace…');try{
    const out=await groq(`For a target of ${dist} in ${time}, give the required pace (per km for run/bike, per 100m for swim), plus 2-3 split checkpoints. ${refs?'Their recent actual paces are: '+refs+'. Note whether the goal is realistic vs their current pace.':''} Be precise with numbers.`);
    enOut(`<h4>⏱️ Pace for ${esc(dist)} in ${esc(time)}</h4>${esc(out)}`);}catch(e){enErr(e);}};
window.enAiStrategy=async function(){
  const race=prompt('Race (e.g. "Olympic triathlon", "70.3", "Marathon"):');if(!race)return;
  const goal=prompt('Goal time (e.g. "2:30:00"):');if(!goal)return;
  enLoad('Building race strategy…');try{
    const out=await groq(`Create a split strategy for a ${race} with goal time ${goal}. Break down target time/pace per discipline (and transitions if triathlon), plus pacing advice for each leg.\n\nAthlete data:\n${dataSummary()}`);
    enOut(`<h4><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="m9 4-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/></svg>️ ${esc(race)} Strategy · ${esc(goal)}</h4>${esc(out)}`);}catch(e){enErr(e);}};
window.enAiRaceDay=async function(){
  const race=prompt('Race type (Sprint / Olympic / 70.3 / Ironman / Marathon):','70.3');if(!race)return;
  const startTime=prompt('Race start time (e.g. "07:00"):','07:00');
  enLoad('Generating race-day protocol…');try{
    const out=await groq(`Create a detailed race-day protocol for a ${race} starting at ${startTime}. Include: wake-up time, breakfast (what & when), warm-up routine, nutrition per hour during the race, and hydration plan. Be specific with timings and amounts.`);
    enOut(`<h4><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 21V4M4 4h13l-2 4 2 4H4"/></svg> ${esc(race)} Race-Day Protocol</h4>${esc(out)}`);}catch(e){enErr(e);}};
window.enAiPredict=async function(){
  const q=prompt('What do you want to predict?\n(e.g. "When will I run sub-45min 10km?" or "How long to cycle 3000km total?")');
  if(!q)return;
  enLoad('Analyzing all your data…');try{
    const s=eload();
    const sys='You are an elite endurance performance analyst. Analyze the athlete\'s data and give a realistic, numbers-based prediction. Structure your answer with: ESTIMATE (a concrete time/date), CONFIDENCE (low/medium/high — based on how much data exists), KEY LIMITERS (what is holding them back), NEXT STEPS (2-3 actionable items), WEEKLY VOLUME NEEDED. If there is not enough logged data to predict well, clearly say what specific data is still needed.';
    const svCount=stravaSessions().length;
    const out=await groq(`Athlete question: "${q}"\n\nData available:\n${dataSummary()}\nTotal activities: ${allSessions().length} (${svCount} from Strava). Races: ${s.races.length}.`,sys);
    // confidence badge
    let conf='medium';const lo=/confidence[:\s]*low/i.test(out),hi=/confidence[:\s]*high/i.test(out);
    if(lo)conf='low';else if(hi)conf='high';
    const cc={low:'#ff8a8a',medium:'#fbbf24',high:'#6ee7b7'}[conf];
    enOut(`<h4><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg> Prediction <span class="en-conf" style="background:${cc}22;color:${cc}">${conf} confidence</span></h4>${esc(out)}`);
    s.predictions.unshift({q,answer:out,date:todayK()});if(s.predictions.length>20)s.predictions.length=20;esave(s);
  }catch(e){enErr(e);}};

// ════════ BOOT ════════
window.enRender=enRender; // allow the Strava module to refresh this panel
enRender();
window.addEventListener('storage',e=>{if(e.key===EK||e.key===PO||e.key===CAL||e.key==='strava_data_v1')enRender();});
const _es=localStorage.setItem.bind(localStorage);
localStorage.setItem=function(k,v){_es(k,v);if(k===PO||k===CAL||k==='strava_data_v1'){try{enRender();}catch(e){}}};
if(window.initCloudSync){window.initCloudSync({appKey:'endurance',syncedKeys:[EK],onApplied:enRender});}
})();
})();