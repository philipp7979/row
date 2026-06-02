(function(){

'use strict';
// Plate/utensils placeholder icon for foods without an image
const FOOD_ICON = '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 3v7c0 1 1 2 2 2s2-1 2-2V3M5 12v9M19 3v18M16 3c-1 1-2 3-2 6 0 2 1 3 2 3h2"></path></svg>';
// ═══════════════════════════════════════════════════════
// STORAGE
// ═══════════════════════════════════════════════════════
const FL = {
  profile: () => { try{return JSON.parse(localStorage.getItem('fl_profile'))||null}catch{return null} },
  saveProfile: p => localStorage.setItem('fl_profile', JSON.stringify(p)),
  log: d => { try{return JSON.parse(localStorage.getItem('fl_log_'+d))||[]}catch{return[]} },
  saveLog: (d,l) => localStorage.setItem('fl_log_'+d, JSON.stringify(l)),
  lib: () => { try{return JSON.parse(localStorage.getItem('fl_lib'))||{recent:[],foods:[],recipes:[]}}catch{return{recent:[],foods:[],recipes:[]}} },
  saveLib: l => localStorage.setItem('fl_lib', JSON.stringify(l)),
  groq: () => localStorage.getItem('groq_api_key')||'',
};

function dateKey(d){ const y=d.getFullYear(),m=d.getMonth()+1,dd=d.getDate(); return `${y}-${String(m).padStart(2,'0')}-${String(dd).padStart(2,'0')}`}
function todayKey(){ return dateKey(new Date()) }
function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2) }

// ═══════════════════════════════════════════════════════
// TDEE + TARGETS
// ═══════════════════════════════════════════════════════
function calcTDEE(p){
  const dob=new Date(p.dob), age=Math.floor((Date.now()-dob)/(365.25*24*3600*1000));
  const bmr = p.sex==='m'
    ? 10*p.weight_kg + 6.25*p.height_cm - 5*age + 5
    : 10*p.weight_kg + 6.25*p.height_cm - 5*age - 161;
  const mult = {sedentary:1.2,moderate:1.55,active:1.725}[p.activity]||1.55;
  return Math.round(bmr*mult);
}
function calcTargets(p){
  const tdee = p.tdee||calcTDEE(p);
  let kcal = tdee;
  if(p.goal==='lose') kcal = Math.max(1200, Math.round(tdee - p.weight_kg*(p.goal_rate||0.5)*77));
  if(p.goal==='gain') kcal = tdee+300;
  const protein = Math.round(p.weight_kg*({low:1.6,moderate:2.0,high:2.4,very_high:2.8}[p.protein_pref||'moderate']));
  const fat = Math.round(kcal*0.28/9);
  const carbs = Math.max(0, Math.round((kcal-protein*4-fat*9)/4));
  return {kcal,protein,fat,carbs};
}

// ═══════════════════════════════════════════════════════
// ONBOARDING STATE MACHINE
// ═══════════════════════════════════════════════════════
let obState = {
  step: 0,
  sex: null,
  dob: null,
  height_unit: 'cm',
  height_cm: 175,
  weight_unit: 'kg',
  weight_kg: 80,
  activity: null,
  tdee_ok: null,
  goal: null,
  target_weight_kg: null,
  goal_rate: 0.5,
  diet: null,
  calorie_floor: 'standard',
  training: null,
  distribution: 'even',
  protein_pref: 'moderate',
};

const OB_STEPS = [
  'welcome','sex','dob','height','weight','activity','tdee','tdee_confirm','great_start',
  'goal_welcome','goal_type','goal_target','goal_summary',
  'program_welcome','diet','floor','training','distribution','protein','program_summary'
];

function obStep(){ return OB_STEPS[obState.step] }

function obNext(){
  const s = obStep();
  if(!obValidate(s)) return;
  obState.step = Math.min(obState.step+1, OB_STEPS.length-1);
  if(s==='great_start') obState.step = OB_STEPS.indexOf('goal_welcome');
  if(s==='goal_summary') obState.step = OB_STEPS.indexOf('program_welcome');
  if(s==='program_summary'){ obFinish(); return; }
  obRender();
}
function obPrev(){
  if(obState.step===0) return;
  obState.step--;
  obRender();
}
function obValidate(s){
  if(s==='sex') return !!obState.sex;
  if(s==='activity') return !!obState.activity;
  if(s==='goal_type') return !!obState.goal;
  if(s==='diet') return !!obState.diet;
  if(s==='floor') return !!obState.calorie_floor;
  if(s==='training') return !!obState.training;
  if(s==='distribution') return !!obState.distribution;
  return true;
}
function obFinish(){
  const p = {
    sex:obState.sex, dob:obState.dob,
    height_cm:obState.height_cm, weight_kg:obState.weight_kg,
    activity:obState.activity, goal:obState.goal,
    target_weight_kg:obState.target_weight_kg||obState.weight_kg,
    goal_rate:obState.goal_rate,
    diet:obState.diet, calorie_floor:obState.calorie_floor,
    training:obState.training, distribution:obState.distribution,
    protein_pref:obState.protein_pref,
    setup_done:true,
  };
  p.tdee = calcTDEE(p);
  const t = calcTargets(p);
  p.daily_kcal=t.kcal; p.daily_protein=t.protein; p.daily_fat=t.fat; p.daily_carbs=t.carbs;
  FL.saveProfile(p);
  document.getElementById('ob').classList.add('gone');
  document.getElementById('app').classList.add('vis');
  initApp();
}

function obRender(){
  const s = obStep();
  const btn = document.getElementById('obNext');
  const back = document.getElementById('obBack');
  const title = document.getElementById('obNavTitle');
  const body = document.getElementById('obBody');
  const fill = document.getElementById('obProgFill');
  const pct = Math.round((obState.step/OB_STEPS.length)*100);
  fill.style.width = pct+'%';
  back.style.display = obState.step===0 ? 'none' : '';
  btn.disabled = !obValidate(s);
  title.textContent = obState.step<9 ? 'Basics' : obState.step<13 ? 'Set New Goal' : 'Set New Program';
  btn.textContent = s==='program_summary' ? 'Done' : s==='welcome'||s==='goal_welcome'||s==='program_welcome' ? 'Get Started' : 'Next';
  body.innerHTML = OB_SCREENS[s]();
  body.scrollTop = 0;
  if(typeof window['obInit_'+s] === 'function') window['obInit_'+s]();
}

// ═══════════════════════════════════════════════════════
// SCREEN RENDERERS
// ═══════════════════════════════════════════════════════
const OB_SCREENS = {
  welcome: ()=>`
    <div class="ob-welcome-title">Welcome</div>
    <div class="ob-sub">A few steps to get you started</div>
    <div class="ob-steps">
      <div class="ob-step"><div class="ob-step-dot">1</div><div class="ob-step-body"><div class="ob-step-name">Basics</div><div class="ob-step-desc">We'll learn about your body and lifestyle to personalise your experience.</div></div></div>
      <div class="ob-step"><div class="ob-step-dot pending">2</div><div class="ob-step-body"><div class="ob-step-name">Goal</div><div class="ob-step-desc">Set your weight goal. Targets will be customised to keep you on track.</div></div></div>
      <div class="ob-step"><div class="ob-step-dot pending">3</div><div class="ob-step-body"><div class="ob-step-name">Program</div><div class="ob-step-desc">Choose your diet style and how to distribute calories throughout the week.</div></div></div>
    </div>`,

  sex: ()=>`
    <div class="ob-q">What is your sex?</div>
    <div class="ob-choices">
      <div class="ob-choice${obState.sex==='f'?' sel':''}" onclick="obSelect('sex','f');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Female</div></div>
        <div class="ob-choice-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="8" r="5"/><path d="M12 13v8M9 18h6"/></svg></div>
      </div>
      <div class="ob-choice${obState.sex==='m'?' sel':''}" onclick="obSelect('sex','m');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Male</div></div>
        <div class="ob-choice-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="10" cy="14" r="5"/><path d="M19 5l-6 6M14 5h5v5"/></svg></div>
      </div>
    </div>`,

  dob: ()=>`
    <div class="ob-q">When were you born?</div>
    <div class="wheel-wrap" id="dobWrap">
      <div class="wheel-grad top"></div>
      <div class="wheel-grad bot"></div>
      <div class="wheel-line top"></div>
      <div class="wheel-line bot"></div>
      <div class="wc" id="wMonth" style="width:90px"></div>
      <div class="wc" id="wDay" style="width:60px"></div>
      <div class="wc" id="wYear" style="width:80px"></div>
    </div>`,

  height: ()=>`
    <div class="ob-q">What is your height?</div>
    <div class="seg">
      <button class="seg-btn${obState.height_unit==='ft'?' on':''}" onclick="obState.height_unit='ft';document.getElementById('obBody').innerHTML=OB_SCREENS.height();obInit_height()">Feet and Inches</button>
      <button class="seg-btn${obState.height_unit==='cm'?' on':''}" onclick="obState.height_unit='cm';document.getElementById('obBody').innerHTML=OB_SCREENS.height();obInit_height()">Centimeters</button>
    </div>
    <div id="heightPickerWrap"></div>`,

  weight: ()=>`
    <div class="ob-q">What is your weight?</div>
    <div class="seg">
      <button class="seg-btn${obState.weight_unit==='lbs'?' on':''}" onclick="obState.weight_unit='lbs';obState.weight_kg=Math.round(obState.weight_kg*2.205);document.getElementById('obBody').innerHTML=OB_SCREENS.weight();obInit_weight()">Pounds</button>
      <button class="seg-btn${obState.weight_unit==='kg'?' on':''}" onclick="obState.weight_unit='kg';obState.weight_kg=Math.round(obState.weight_kg/2.205);document.getElementById('obBody').innerHTML=OB_SCREENS.weight();obInit_weight()">Kilograms</button>
    </div>
    <div class="ruler-wrap">
      <div class="ruler-val" id="rulerVal">${obState.weight_unit==='lbs'?Math.round(obState.weight_kg*2.205):obState.weight_kg} ${obState.weight_unit}</div>
      <div style="position:relative">
        <div class="ruler-outer" id="rulerOuter"><div class="ruler-track" id="rulerTrack"></div></div>
        <div class="ruler-cursor-line"></div>
      </div>
    </div>`,

  activity: ()=>`
    <div class="ob-q">How active are you?</div>
    <div class="ob-sub">Select your level of daily physical activity outside of exercise (during work, leisure time, etc).</div>
    <div class="ob-choices">
      <div class="ob-choice${obState.activity==='sedentary'?' sel':''}" onclick="obSelect('activity','sedentary');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Mostly Sedentary</div><div class="ob-choice-sub">In many cases, this would correspond to less than 5,000 steps a day.</div></div>
        <div class="ob-choice-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M4 21h16M5 21V10M19 21V10M9 21V10M15 21V10M3 10h18l-9-7z"/></svg></div>
      </div>
      <div class="ob-choice${obState.activity==='moderate'?' sel':''}" onclick="obSelect('activity','moderate');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Moderately Active</div><div class="ob-choice-sub">In many cases, this would correspond to 5,000 – 15,000 steps a day.</div></div>
        <div class="ob-choice-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="13" cy="4" r="2"/><path d="M11 21l1-7-2-2 1-6 3 2 2 2M10 12l-2 9M14 14l2 7"/></svg></div>
      </div>
      <div class="ob-choice${obState.activity==='active'?' sel':''}" onclick="obSelect('activity','active');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Very Active</div><div class="ob-choice-sub">In many cases, this would correspond to more than 15,000 steps a day.</div></div>
        <div class="ob-choice-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="14" cy="5" r="2"/><path d="M11 21l1.5-5-3-2 2-5 3 2 2 1M7 12l2-4M13 16l3 1 1 4M9 21l1-4"/></svg></div>
      </div>
    </div>`,

  tdee: ()=>{
    if(!obState.dob){const d=new Date();d.setFullYear(d.getFullYear()-25);obState.dob=dateKey(d)}
    const tmp={sex:obState.sex||'m',dob:obState.dob,height_cm:obState.height_cm,weight_kg:obState.weight_kg,activity:obState.activity||'moderate'};
    const t=calcTDEE(tmp); obState._tdee=t;
    return`<div class="ob-q">We estimated your initial expenditure</div>
    <div class="ob-tdee-big">${t} <span style="font-size:28px">kcal</span></div>
    <div class="ob-sub">Expenditure is the number of calories you would need to consume to maintain your current weight.</div>
    <div class="ob-infobox"><span style="font-size:18px">ℹ️</span><div>This is just an initial estimate based on your stats and typical activity factors. As you log food and weight, your personalised expenditure will be refined automatically.</div></div>`;
  },

  tdee_confirm: ()=>`
    <div class="ob-q">Does the initial expenditure of ${obState._tdee||2500} kcal look right to you?</div>
    <div class="ob-choices">
      <div class="ob-choice${obState.tdee_ok==='yes'?' sel':''}" onclick="obSelect('tdee_ok','yes');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Yes</div></div>
        <div class="ob-choice-icon" style="font-size:20px">${obState.tdee_ok==='yes'?'<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>':'○'}</div>
      </div>
      <div class="ob-choice${obState.tdee_ok==='no'?' sel':''}" onclick="obSelect('tdee_ok','no');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">No</div></div>
        <div class="ob-choice-icon">○</div>
      </div>
      <div class="ob-choice${obState.tdee_ok==='unsure'?' sel':''}" onclick="obSelect('tdee_ok','unsure');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Not sure</div></div>
        <div class="ob-choice-icon">?</div>
      </div>
    </div>`,

  great_start: ()=>`
    <div class="ob-q" style="font-size:28px">This is a great start!</div>
    <div class="ob-sub">Your expenditure is dynamic and constantly changes in response to a wide range of environmental, behavioral, and physiological factors.</div>
    <div class="ob-tl">
      <div class="ob-tl-item"><div class="ob-tl-dot">●</div><div><div class="ob-tl-title">Week 1</div><div class="ob-tl-desc">We'll use an expenditure estimate of ${obState._tdee||2500} kcal to create your first program.</div></div></div>
      <div class="ob-tl-item"><div class="ob-tl-dot">●</div><div><div class="ob-tl-title">Week 2</div><div class="ob-tl-desc">Our algorithm will start calibrating this estimate based on how your weight is responding to your caloric intake.</div></div></div>
      <div class="ob-tl-item"><div class="ob-tl-dot">●</div><div><div class="ob-tl-title">Week 3 and beyond</div><div class="ob-tl-desc">Your expenditure estimate gets dialled in without any need for activity tracking. It will continue to adjust to keep you on track.</div></div></div>
    </div>`,

  goal_welcome: ()=>`
    <div class="ob-welcome-title">Welcome</div>
    <div class="ob-sub">A few steps to get you started</div>
    <div class="ob-steps">
      <div class="ob-step"><div class="ob-step-dot"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div><div class="ob-step-body"><div class="ob-step-name">Basics</div></div></div>
      <div class="ob-step"><div class="ob-step-dot"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div><div class="ob-step-body"><div class="ob-step-name">Notice</div></div></div>
      <div class="ob-step"><div class="ob-step-dot">3</div><div class="ob-step-body"><div class="ob-step-name">Goal</div><div class="ob-step-desc">Your targets will be customised to keep you on track with the goal you specify. You can update your goal any time.</div></div></div>
      <div class="ob-step"><div class="ob-step-dot pending">4</div><div class="ob-step-body"><div class="ob-step-name">Program</div></div></div>
    </div>`,

  goal_type: ()=>`
    <div class="ob-q">What is your goal?</div>
    <div class="ob-choices">
      <div class="ob-choice${obState.goal==='lose'?' sel':''}" onclick="obSelect('goal','lose');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Lose Weight</div><div class="ob-choice-sub">Goal of losing weight</div></div>
        <div class="ob-choice-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 15-5-5-4 4-3-3"/></svg></div>
      </div>
      <div class="ob-choice${obState.goal==='maintain'?' sel':''}" onclick="obSelect('goal','maintain');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Maintain Weight</div><div class="ob-choice-sub">Goal of maintaining weight</div></div>
        <div class="ob-choice-icon">↔</div>
      </div>
      <div class="ob-choice${obState.goal==='gain'?' sel':''}" onclick="obSelect('goal','gain');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Gain Weight</div><div class="ob-choice-sub">Goal of gaining weight</div></div>
        <div class="ob-choice-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg></div>
      </div>
    </div>`,

  goal_target: ()=>{
    const tdee=obState._tdee||2500;
    const tw=obState.target_weight_kg||(obState.weight_kg-(obState.goal==='lose'?5:obState.goal==='gain'?5:0));
    const deficit=Math.round(obState.weight_kg*(obState.goal_rate||0.5)*77);
    const budget=obState.goal==='maintain'?tdee:obState.goal==='lose'?Math.max(1200,tdee-deficit):tdee+300;
    return`<div class="ob-sum-cards" style="margin:0 0 16px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="ob-sum-card hl"><div style="font-size:22px;font-weight:800">${budget} kcal</div><div style="font-size:13px;color:var(--t3)">initial daily budget</div></div>
        <div class="ob-sum-card"><div style="font-size:18px;font-weight:700">Estimated</div><div style="font-size:13px;color:var(--t3)">end date</div></div>
      </div>
    </div>
    ${obState.goal!=='maintain'?`<div class="ob-q">What is your target weight?</div>
    <div style="text-align:center;font-size:24px;font-weight:700;margin:10px 0">${tw} kg</div>
    <div class="ruler-wrap" id="targetRulerWrap">
      <div style="position:relative"><div class="ruler-outer" id="targetRulerOuter"><div class="ruler-track" id="targetRulerTrack"></div></div><div class="ruler-cursor-line"></div></div>
    </div>
    <div class="ob-q" style="margin-top:20px">What is your target goal rate?</div>
    <input type="range" min="0.3" max="1.0" step="0.1" value="${obState.goal_rate||0.5}" oninput="obState.goal_rate=parseFloat(this.value)" style="width:100%;accent-color:#000;margin:10px 0">
    <div style="font-size:14px;color:var(--t3);text-align:center;margin-bottom:8px">Standard (Recommended): ${obState.goal_rate||0.5}% BW / week</div>`:'<div class="ob-sub">Maintenance mode will dynamically adjust your targets to keep your weight stable.</div>'}`;
  },

  goal_summary: ()=>{
    const p={...obState,sex:obState.sex||'m',dob:obState.dob||'1994-01-01',height_cm:obState.height_cm,weight_kg:obState.weight_kg,activity:obState.activity||'moderate',protein_pref:'moderate'};
    p.tdee=obState._tdee||calcTDEE(p);
    const t=calcTargets(p);
    return`<div class="ob-q">Goal summary</div>
    <div class="ob-sum-cards">
      <div class="ob-sum-card${obState.goal==='maintain'?' hl2':' hl'}">
        <div class="ob-sum-top"><span class="ob-sum-title">${obState.goal==='lose'?'Weight Loss':obState.goal==='gain'?'Weight Gain':'Maintenance'}</span>
        <span class="ob-sum-val">${obState.goal!=='maintain'?(obState.weight_kg+' kg → '+(obState.target_weight_kg||obState.weight_kg)+' kg'):(obState.weight_kg+' kg')}</span></div>
      </div>
      <div class="ob-sum-card"><div class="ob-sum-top"><span class="ob-sum-title">Initial Daily Budget</span><span class="ob-sum-val">${t.kcal} kcal</span></div><div class="ob-sum-desc">This daily budget is estimated based on your current expenditure. It will adjust weekly based on your progress.</div></div>
    </div>`;
  },

  program_welcome: ()=>`
    <div class="ob-welcome-title">Welcome</div>
    <div class="ob-sub">A few steps to get you started</div>
    <div class="ob-steps">
      <div class="ob-step"><div class="ob-step-dot"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div><div class="ob-step-body"><div class="ob-step-name">Basics</div></div></div>
      <div class="ob-step"><div class="ob-step-dot"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div><div class="ob-step-body"><div class="ob-step-name">Notice</div></div></div>
      <div class="ob-step"><div class="ob-step-dot"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg></div><div class="ob-step-body"><div class="ob-step-name">Goal</div></div></div>
      <div class="ob-step"><div class="ob-step-dot">4</div><div class="ob-step-body"><div class="ob-step-name">Program</div><div class="ob-step-desc">Your targets will be customised to keep you on track with your goal.</div></div></div>
    </div>`,

  diet: ()=>`
    <div class="ob-q">What is your preferred diet?</div>
    <div class="ob-choices">
      ${[['balanced','Balanced','Standard distribution of carbs and fat.','<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 3v18M7 21h10M3 7h18M6.5 7L3 14h7zM17.5 7L14 14h7z"/></svg>️'],['low-fat','Low-fat','Fat will be reduced to prioritise carb and protein intake.','<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 3v18h18"/><path d="m19 15-5-5-4 4-3-3"/></svg>'],['low-carb','Low-carb','Carbs will be reduced to prioritise fat and protein intake.','<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M5 12a7 7 0 0 1 14 0c0 4-3 8-7 8s-7-4-7-8z"/><circle cx="10" cy="11" r="1.5"/></svg>'],['keto','Keto','Carbs will be very restricted to allow for higher fat intake.','<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M3 14h18l-7-9zM3 14v3a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3"/><circle cx="9" cy="16" r="1" fill="currentColor" stroke="none"/><circle cx="14" cy="16" r="1" fill="currentColor" stroke="none"/></svg>']].map(([v,n,d,i])=>`
    <div class="ob-choice${obState.diet===v?' sel':''}" onclick="obSelect('diet','${v}');obNext()">
      <div class="ob-choice-left"><div class="ob-choice-title">${n}</div><div class="ob-choice-sub">${d}</div></div>
      <div class="ob-choice-icon">${i}</div>
    </div>`).join('')}`,

  floor: ()=>`
    <div class="ob-q">What calorie floor do you prefer?</div>
    <div class="ob-choices">
      <div class="ob-choice${obState.calorie_floor==='standard'?' sel':''}" onclick="obSelect('calorie_floor','standard');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Standard Floor</div><div class="ob-choice-sub">Your recommendations will never go below ~1,235 Calories even if your TDEE adjusts over time.</div></div>
        <div class="ob-choice-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M12 2l2.9 6.3 6.9.6-5.2 4.6 1.6 6.8L12 17.3 5.8 20.9l1.6-6.8L2.2 8.9l6.9-.6z"/></svg></div>
      </div>
      <div class="ob-choice${obState.calorie_floor==='low'?' sel':''}" onclick="obSelect('calorie_floor','low');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Low Floor</div><div class="ob-choice-sub">Your recommendations will never go below ~823 Calories. Proceed with caution.</div></div>
        <div class="ob-choice-icon"><svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82L4.2 7.12a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>️</div>
      </div>
    </div>`,

  training: ()=>`
    <div class="ob-q">What training will you do during this program?</div>
    <div class="ob-choices">
      ${[['none','None or Relaxed Activity','<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="5" r="2"/><path d="M12 8v6M7 21c0-3 2-5 5-5s5 2 5 5M5 13l7-2 7 2"/></svg>'],['lifting','Lifting','<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M14.4 14.4 9.6 9.6M3 7l3-3 3 3-3 3zM15 15l3-3 3 3-3 3zM6.5 9.5 4 12M17.5 14.5 20 12"/></svg>️'],['cardio','Cardio','<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zM12 17.5 9 9l3-2 3 4h3M9 9l-3 1"/></svg>'],['both','Cardio & Lifting','<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>']].map(([v,n,i])=>`
    <div class="ob-choice${obState.training===v?' sel':''}" onclick="obSelect('training','${v}');obNext()">
      <div class="ob-choice-left"><div class="ob-choice-title">${n}</div></div>
      <div class="ob-choice-icon">${i}</div>
    </div>`).join('')}`,

  distribution: ()=>`
    <div class="ob-q">How would you like to distribute Calories throughout the week?</div>
    <div class="ob-choices">
      <div class="ob-choice${obState.distribution==='even'?' sel':''}" onclick="obSelect('distribution','even');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Distribute Evenly</div><div class="ob-choice-sub">Distribute Calories evenly across all days of the week.</div></div>
        <div class="ob-choice-icon">≡</div>
      </div>
      <div class="ob-choice${obState.distribution==='shift'?' sel':''}" onclick="obSelect('distribution','shift');obNext()">
        <div class="ob-choice-left"><div class="ob-choice-title">Shift Calories</div><div class="ob-choice-sub">Distribute Calories to increase Calorie targets on specific days.</div></div>
        <div class="ob-choice-icon">〜</div>
      </div>
    </div>`,

  protein: ()=>`
    <div class="ob-q">What is your preferred protein intake?</div>
    <div class="ob-choices">
      ${[['low','Low','On the low side of the optimal range.'],['moderate','Moderate','In the middle of the optimal range.'],['high','High','On the high end of the optimal range.'],['very_high','Extra High','Highest recommended intake.']].map(([v,n,d])=>`
    <div class="ob-choice${obState.protein_pref===v?' sel':''}" onclick="obSelect('protein_pref','${v}');obNext()">
      <div class="ob-choice-left"><div class="ob-choice-title">${n}</div><div class="ob-choice-sub">${d}</div></div>
      <div class="ob-choice-icon${v==='moderate'?' sel':''}"></div>
    </div>`).join('')}`,

  program_summary: ()=>{
    const p={sex:obState.sex||'m',dob:obState.dob||'1994-01-01',height_cm:obState.height_cm,weight_kg:obState.weight_kg,activity:obState.activity||'moderate',goal:obState.goal||'maintain',goal_rate:obState.goal_rate||0.5,protein_pref:obState.protein_pref||'moderate'};
    p.tdee=obState._tdee||calcTDEE(p); const t=calcTargets(p);
    const days=['M','T','W','T','F','S','S'];
    return`<div class="ob-q">Your macro program is ready</div>
    <div class="macro-chart">${days.map(d=>`<div class="mc-col"><div class="mc-bar-wrap">
      <div class="mc-seg" style="height:30%;background:#4285f4"></div>
      <div class="mc-seg" style="height:20%;background:#f59e0b"></div>
      <div class="mc-seg" style="height:40%;background:#22c55e"></div>
    </div><div style="font-size:13px;font-weight:600;margin-top:4px">${t.kcal}</div><div class="mc-day">${d}</div></div>`).join('')}</div>
    <div class="ob-q" style="margin-top:20px">How was your program designed?</div>
    <div class="ob-tl">
      <div class="ob-tl-item"><div class="ob-tl-dot" style="font-size:13px;font-weight:700">1</div><div><div class="ob-tl-title">Estimated Expenditure <span style="color:#4285f4">${p.tdee} kcal</span></div><div class="ob-tl-desc">Based on your stats and activity level.</div></div></div>
      <div class="ob-tl-item"><div class="ob-tl-dot" style="font-size:13px;font-weight:700">2</div><div><div class="ob-tl-title">Daily Budget <span style="color:#22c55e">${t.kcal} kcal</span></div><div class="ob-tl-desc">Adjusted for your ${obState.goal||'maintain'} goal at ${obState.goal_rate||0.5}% BW/week.</div></div></div>
      <div class="ob-tl-item"><div class="ob-tl-dot" style="font-size:13px;font-weight:700">3</div><div><div class="ob-tl-title">Target Protein <span style="color:#f59e0b">${t.protein}g</span></div><div class="ob-tl-desc">${obState.protein_pref||'moderate'} protein intake for your goal and body weight.</div></div></div>
      <div class="ob-tl-item"><div class="ob-tl-dot" style="font-size:13px;font-weight:700">4</div><div><div class="ob-tl-title">Diet Type <span style="color:#ff6b35">${obState.diet||'balanced'}</span></div><div class="ob-tl-desc">Remaining calories distributed as ${obState.diet||'balanced'} macros.</div></div></div>
    </div>`;
  },
};

function obSelect(field, val){ obState[field]=val; document.getElementById('obNext').disabled=false }

// ── WHEEL / RULER INITS ──
window.obInit_dob = function(){
  const months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now = new Date();
  const curYear=now.getFullYear(), curMonth=now.getMonth(), curDay=now.getDate();
  let selY=obState.dob?parseInt(obState.dob.split('-')[0]):curYear-25;
  let selM=obState.dob?parseInt(obState.dob.split('-')[1])-1:curMonth;
  let selD=obState.dob?parseInt(obState.dob.split('-')[2]):curDay;
  function saveDob(){const d=`${selY}-${String(selM+1).padStart(2,'0')}-${String(selD).padStart(2,'0')}`;obState.dob=d}
  buildWheel('wMonth',months.map((m,i)=>({label:m,val:i})),v=>{selM=v.val;saveDob()},selM);
  buildWheel('wDay',Array.from({length:31},(_,i)=>({label:String(i+1),val:i+1})),v=>{selD=v.val;saveDob()},selD-1);
  const years=Array.from({length:80},(_,i)=>({label:String(curYear-15-i),val:curYear-15-i}));
  buildWheel('wYear',years,v=>{selY=v.val;saveDob()},Math.max(0,years.findIndex(y=>y.val===selY)));
};
window.obInit_height = function(){
  const wrap=document.getElementById('heightPickerWrap');
  if(obState.height_unit==='cm'){
    const items=Array.from({length:81},(_,i)=>({label:`${130+i} cm`,val:130+i}));
    wrap.innerHTML='<div class="wheel-wrap"><div class="wheel-grad top"></div><div class="wheel-grad bot"></div><div class="wheel-line top"></div><div class="wheel-line bot"></div><div class="wc" id="wHeightCm" style="width:160px"></div></div>';
    const idx=Math.max(0,items.findIndex(it=>it.val===obState.height_cm));
    buildWheel('wHeightCm',items,v=>{obState.height_cm=v.val},idx);
  } else {
    wrap.innerHTML='<div class="wheel-wrap"><div class="wheel-grad top"></div><div class="wheel-grad bot"></div><div class="wheel-line top"></div><div class="wheel-line bot"></div><div class="wc" id="wFt" style="width:70px"></div><div class="wc" id="wIn" style="width:90px"></div></div>';
    const curFt=Math.floor(obState.height_cm/30.48),curIn=Math.round((obState.height_cm-curFt*30.48)/2.54);
    buildWheel('wFt',Array.from({length:5},(_,i)=>({label:`${3+i} ft`,val:3+i})),v=>{const ft=v.val,inEl=document.getElementById('wIn');obState.height_cm=Math.round(ft*30.48+getWheelVal(inEl)*2.54)},curFt-3);
    buildWheel('wIn',Array.from({length:12},(_,i)=>({label:`${i} in`,val:i})),v=>{const ft=getWheelValById('wFt');obState.height_cm=Math.round(ft*30.48+v.val*2.54)},curIn);
  }
};
window.obInit_weight = function(){
  const lo=obState.weight_unit==='lbs'?80:40, hi=obState.weight_unit==='lbs'?400:200, step=obState.weight_unit==='lbs'?1:0.5;
  const initVal=obState.weight_unit==='lbs'?Math.round(obState.weight_kg*2.205):obState.weight_kg;
  buildRuler('rulerOuter','rulerTrack',lo,hi,step,initVal,'rulerVal',obState.weight_unit,v=>{
    obState.weight_kg=obState.weight_unit==='lbs'?Math.round(v/2.205*10)/10:v;
  });
};
window.obInit_goal_target = function(){
  if(obState.goal==='maintain') return;
  const lo=obState.weight_unit==='lbs'?80:40, hi=obState.weight_unit==='lbs'?400:200, step=1;
  const curTW=obState.target_weight_kg||Math.max(lo,obState.weight_kg-10);
  buildRuler('targetRulerOuter','targetRulerTrack',lo,hi,step,curTW,null,obState.weight_unit,v=>{
    obState.target_weight_kg=v;
    document.querySelectorAll('.ob-body [style*="text-align:center"]').forEach(el=>{if(el.textContent.includes('kg')||el.textContent.includes('lbs'))el.textContent=v+' '+(obState.weight_unit||'kg')});
  });
};

function getWheelValById(id){
  const el=document.getElementById(id);
  return el?Math.round(el.scrollTop/44):0;
}
function getWheelVal(el){return el?Math.round(el.scrollTop/44):0}

function buildWheel(id,items,onChange,initIdx){
  const el=document.getElementById(id); if(!el)return;
  el.innerHTML=`<div class="wc-pad"></div>${items.map(it=>`<div class="wi">${it.label||it}</div>`).join('')}<div class="wc-pad"></div>`;
  el.scrollTop=(initIdx||0)*44;
  let debounce;
  el.addEventListener('scroll',()=>{
    clearTimeout(debounce);
    debounce=setTimeout(()=>{
      const idx=Math.round(el.scrollTop/44);
      if(items[idx]) onChange(items[idx]);
    },80);
  });
}

function buildRuler(outerId,trackId,lo,hi,step,initVal,valId,unit,onChange){
  const outer=document.getElementById(outerId);
  const track=document.getElementById(trackId);
  if(!outer||!track)return;
  const tickW=8,tickGap=8;
  let html='';
  for(let v=lo;v<=hi;v+=step){
    const major=Number.isInteger(v/5);
    html+=`<div class="rtick${major?' major':''}" style="width:${tickW}px;height:${major?40:24}px;margin-right:${tickGap}px"></div>`;
  }
  track.innerHTML=html;
  const steps=(hi-lo)/step;
  const totalW=steps*(tickW+tickGap);
  function scrollTo(val){
    const idx=(val-lo)/step;
    outer.scrollLeft=idx*(tickW+tickGap)-outer.offsetWidth/2+(tickW/2);
  }
  function getVal(){
    const left=outer.scrollLeft+outer.offsetWidth/2-tickW/2;
    const idx=Math.round(left/(tickW+tickGap));
    return Math.min(hi,Math.max(lo,lo+idx*step));
  }
  scrollTo(initVal);
  let debounce;
  outer.addEventListener('scroll',()=>{
    clearTimeout(debounce);
    debounce=setTimeout(()=>{
      const v=getVal();
      if(valId)document.getElementById(valId).textContent=`${v} ${unit}`;
      onChange(v);
    },50);
  });
}

// ═══════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════
let curDate = todayKey();
let editingEntry = null;

function applyEmbedLayout(){
  // Contained fixed-height layout: header fixed at top, scroll in the
  // middle, search/add bar pinned at bottom — all within the iframe.
  const style = document.createElement('style');
  style.textContent = `
    html, body { height: 100% !important; overflow: hidden !important; overscroll-behavior: contain !important; }
    #app { position: absolute !important; inset: 0 !important; height: 100% !important; display: flex !important; flex-direction: column !important; }
    .app-header { flex-shrink: 0 !important; }
    .app-scroll { flex: 1 1 auto !important; overflow-y: auto !important; height: auto !important; padding-bottom: 12px !important; }
    .app-sbar { position: relative !important; flex-shrink: 0 !important; }
    .app-back { display: none !important; }
    .app-nav { justify-content: center !important; }
  `;
  document.head.appendChild(style);
}

function initApp(){
  if(IS_EMBED) applyEmbedLayout();
  renderWeekStrip();
  renderMacroBars();
  renderFoodLog();
}

function shiftDay(d){
  const dt=new Date(curDate+'T12:00:00');
  dt.setDate(dt.getDate()+d);
  curDate=dateKey(dt);
  renderWeekStrip();
  renderMacroBars();
  renderFoodLog();
}

function renderWeekStrip(){
  const strip=document.getElementById('weekStrip'); if(!strip)return;
  const dt=new Date(curDate+'T12:00:00');
  const mon=new Date(dt); mon.setDate(dt.getDate()-dt.getDay()+1);
  const days=['M','T','W','T','F','S','S'];
  let html='';
  for(let i=0;i<7;i++){
    const d=new Date(mon); d.setDate(mon.getDate()+i);
    const k=dateKey(d), today=k===todayKey(), sel=k===curDate;
    const logged=FL.log(k).length>0;
    html+=`<div class="wday${sel?' cur':''}${logged?' logged':''}" onclick="selectDay('${k}')">
      <div class="wday-name">${days[i]}</div>
      <div class="wday-num">${d.getDate()}</div>
      <div class="wday-dot"></div>
    </div>`;
  }
  strip.innerHTML=html;
  // update header title
  const title=document.getElementById('appDateTitle');
  if(title){
    const today=todayKey(); const yesterday=dateKey(new Date(Date.now()-86400000));
    title.textContent = curDate===today?'Today':curDate===yesterday?'Yesterday':curDate;
  }
}

function selectDay(k){ curDate=k; renderWeekStrip(); renderMacroBars(); renderFoodLog(); }

function renderMacroBars(){
  const p=FL.profile(); const bars=document.getElementById('macroBars'); if(!bars)return;
  if(!p){bars.innerHTML='';return;}
  const tgt={kcal:p.daily_kcal||2000,protein:p.daily_protein||150,fat:p.daily_fat||65,carbs:p.daily_carbs||200};
  const log=FL.log(curDate);
  const tot=log.reduce((a,e)=>({kcal:a.kcal+(e.kcal||0),protein:a.protein+(e.protein||0),fat:a.fat+(e.fat||0),carbs:a.carbs+(e.carbs||0)}),{kcal:0,protein:0,fat:0,carbs:0});

  // Circular ring helper
  function ring(key,label,color,size){
    const cur=Math.round(tot[key]), goal=tgt[key];
    const pct=Math.min(1,goal>0?tot[key]/goal:0);
    const over=tot[key]>goal;
    const r=size/2-6, circ=2*Math.PI*r;
    const off=circ*(1-pct);
    const numFont=size>=92?22:16, labFont=11;
    return`<div class="mring">
      <div class="mring-svg-wrap" style="width:${size}px;height:${size}px">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
          <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="6"/>
          <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${over?'#f87171':color}" stroke-width="6" stroke-linecap="round"
            stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
            transform="rotate(-90 ${size/2} ${size/2})" style="transition:stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)"/>
        </svg>
        <div class="mring-center">
          <div class="mring-num" style="font-size:${numFont}px;color:${over?'#f87171':'#fff'}">${cur}</div>
          <div class="mring-goal" style="font-size:${size>=92?11:9}px">/ ${goal}</div>
        </div>
      </div>
      <div class="mring-label" style="color:${color}">${label}</div>
    </div>`;
  }

  bars.innerHTML=`
    <div class="mrings">
      <div class="mrings-main">${ring('kcal','Calories','#3b82f6',104)}</div>
      <div class="mrings-side">
        ${ring('protein','Protein','#f87171',72)}
        ${ring('carbs','Carbs','#34d399',72)}
        ${ring('fat','Fat','#fbbf24',72)}
      </div>
    </div>`;
}

function renderFoodLog(){
  const log=document.getElementById('foodLog'); if(!log)return;
  const entries=FL.log(curDate);
  // update add sheet macro bar
  updateAddSheetMacros(entries);
  if(entries.length===0){
    log.innerHTML=`<div class="empty-log"><h3>No food logged</h3><p>Tap the search bar or + button to add food.</p></div>`;
    return;
  }
  // Group by hour
  const groups={};
  entries.forEach(e=>{
    const h=e.time?e.time.split(':')[0]:'12';
    const label=formatHour(h);
    if(!groups[label])groups[label]={hour:parseInt(h),items:[]};
    groups[label].items.push(e);
  });
  let html='';
  Object.values(groups).sort((a,b)=>a.hour-b.hour).forEach(g=>{
    const tKcal=g.items.reduce((a,e)=>a+(e.kcal||0),0);
    const tPro=g.items.reduce((a,e)=>a+(e.protein||0),0);
    const tFat=g.items.reduce((a,e)=>a+(e.fat||0),0);
    const tCarb=g.items.reduce((a,e)=>a+(e.carbs||0),0);
    html+=`<div class="meal-grp">
      <div class="meal-grp-header">
        <span style="font-size:13px;color:#fff;font-weight:600">${formatHour(g.hour)}</span>
        <div class="meal-grp-macros" style="font-size:12px">
          <span style="color:#3b82f6">${Math.round(tKcal)}</span><span style="color:#8e8e93">kcal</span>
          <span style="color:#f87171;margin-left:6px">${Math.round(tPro)}</span><span style="color:#8e8e93">P</span>
          <span style="color:#fbbf24;margin-left:6px">${Math.round(tFat)}</span><span style="color:#8e8e93">F</span>
          <span style="color:#34d399;margin-left:6px">${Math.round(tCarb)}</span><span style="color:#8e8e93">C</span>
        </div>
      </div>
      ${g.items.map(e=>`
      <div class="food-row" onclick="openFoodDetail('${e.id}')">
        <div class="food-row-img">${e.image?`<img src="${e.image}" style="width:100%;height:100%;object-fit:cover;border-radius:10px" onerror="this.style.display='none'">` : FOOD_ICON}</div>
        <div class="food-row-body">
          <div class="food-row-name">${e.name}</div>
          <div class="food-row-meta">
            <span style="color:#3b82f6;font-weight:600">${Math.round(e.kcal||0)}</span><span style="color:#8e8e93"> kcal</span>
            &nbsp;<span style="color:#f87171;font-weight:600">${Math.round(e.protein||0)}</span><span style="color:#8e8e93">P</span>
            &nbsp;<span style="color:#fbbf24;font-weight:600">${Math.round(e.fat||0)}</span><span style="color:#8e8e93">F</span>
            &nbsp;<span style="color:#34d399;font-weight:600">${Math.round(e.carbs||0)}</span><span style="color:#8e8e93">C</span>
            <span style="color:#8e8e93"> · ${e.qty||1}${e.unit||'g'}</span>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8e8e93" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </div>`).join('')}
    </div>`;
  });
  log.innerHTML=html;
}

function formatHour(h){
  const n=parseInt(h);
  if(n<12)return n===0?'12 AM':`${n} AM`;
  if(n===12)return'12 PM';
  return`${n-12} PM`;
}

function updateAddSheetMacros(entries){
  const t=entries.reduce((a,e)=>({kcal:a.kcal+(e.kcal||0),pro:a.pro+(e.protein||0),fat:a.fat+(e.fat||0),carb:a.carb+(e.carbs||0)}),{kcal:0,pro:0,fat:0,carb:0});
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=Math.round(v)};
  set('asMkcal',t.kcal);set('asMpro',t.pro);set('asMfat',t.fat);set('asMcarb',t.carb);
}

function addEntry(entry){
  const log=FL.log(curDate);
  log.push({...entry,id:uid(),time:new Date().toTimeString().slice(0,5),date:curDate});
  FL.saveLog(curDate,log);
  // add to library recents
  const lib=FL.lib();
  lib.recent=lib.recent.filter(r=>r.name!==entry.name);
  lib.recent.unshift({name:entry.name,kcal:entry.kcal,protein:entry.protein,fat:entry.fat,carbs:entry.carbs,qty:entry.qty,unit:entry.unit,image:entry.image});
  if(lib.recent.length>30)lib.recent=lib.recent.slice(0,30);
  FL.saveLib(lib);
  renderMacroBars();
  renderFoodLog();
  renderLibrary();
}

// ═══════════════════════════════════════════════════════
// ADD SHEET
// ═══════════════════════════════════════════════════════
let scanStream=null, scanMode='barcode', scanData=null;

const IS_EMBED = new URLSearchParams(location.search).get('embed')==='1';
function goBack(){
  if(window.self!==window.top){
    window.top.postMessage({type:'switchTab',tab:'health'},'*');
  } else {
    history.back();
  }
}
function openAddSheet(tab,query){
  document.getElementById('add-sheet').classList.add('open');
  switchAddTab(tab||'scan');
  if(query&&tab==='search'){
    const inp=document.getElementById('srchInput');
    if(inp){inp.value=query;handleSearch(query)}
  }
  if(tab==='library') renderLibrary();
}
function closeAddSheet(){
  document.getElementById('add-sheet').classList.remove('open');
  stopCamera();
}
const ADD_TABS=['scan','search','quickadd','library','aidesc'];
function switchAddTab(tab){
  ADD_TABS.forEach((t,i)=>{
    document.querySelectorAll('.add-tab')[i]?.classList.toggle('on',t===tab);
  });
  document.querySelectorAll('.add-panel').forEach(el=>el.classList.remove('on'));
  const panel=document.getElementById('panel-'+tab);
  if(panel)panel.classList.add('on');
  if(tab==='scan'){
    // auto-start camera immediately
    if(!scanStream) setTimeout(()=>handleScanCapture(),100);
  } else {
    stopCamera();
  }
  if(tab==='library')renderLibrary();
  if(tab==='search'){
    setTimeout(()=>document.getElementById('srchInput')?.focus(),150);
    renderSearchHistory();
  }
}

// ── SCAN ──
function setScanMode(mode){
  scanMode=mode;
  document.getElementById('scanModeBarcode').classList.toggle('on',mode==='barcode');
  document.getElementById('scanModeLabel').classList.toggle('on',mode==='label');
  document.getElementById('scanModeMeal').classList.toggle('on',mode==='meal');
  document.getElementById('scanResult').style.display='none';
  scanData=null;
  const btn=document.getElementById('scanCaptureBtn');
  if(scanStream){btn.textContent=mode==='barcode'?'Stop Camera':'Capture';
  }else{btn.textContent='Start Camera';}
}

async function handleScanCapture(){
  const btn=document.getElementById('scanCaptureBtn');
  if(!scanStream){
    try{
      scanStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment',width:{ideal:1280},height:{ideal:720}},audio:false});
      const video=document.getElementById('scanVideo');
      video.srcObject=scanStream; video.style.display='block';
      document.getElementById('vfPlaceholder').style.display='none';
      document.getElementById('scanOverlay').style.display=scanMode==='barcode'?'flex':'none';
      btn.style.display='block';
      btn.textContent=scanMode==='barcode'?'Stop Scan':'Capture Photo';
      if(scanMode==='barcode') startBarcodeDetect();
    }catch(e){
      document.getElementById('scanStatus').textContent='Camera access denied — please allow in browser settings.';
      btn.style.display='block'; btn.textContent='Retry';
    }
    return;
  }
  if(scanMode==='barcode'){stopCamera();return;}
  // capture photo for label or meal
  const video=document.getElementById('scanVideo');
  const canvas=document.getElementById('scanCanvas');
  canvas.width=video.videoWidth||640; canvas.height=video.videoHeight||480;
  canvas.getContext('2d').drawImage(video,0,0);
  const base64=canvas.toDataURL('image/jpeg',.8).split(',')[1];
  btn.textContent='Analysing…'; btn.disabled=true;
  const status=document.getElementById('scanStatus');
  status.textContent='AI is analysing your '+scanMode+'…';
  try{
    const result=scanMode==='label'?await geminiLabel(base64):await geminiMeal(base64);
    scanData=result;
    showScanResult(result);
    status.textContent='';
  }catch(e){
    status.textContent='Analysis failed: '+(e.message||'try again');
  }
  btn.textContent='Capture Photo'; btn.disabled=false;
}

let barcodeInterval=null;
function startBarcodeDetect(){
  if(!('BarcodeDetector' in window)){
    document.getElementById('scanStatus').textContent='Barcode detection not supported on this browser. Use Chrome on Android.';
    return;
  }
  const bd=new BarcodeDetector({formats:['ean_13','ean_8','upc_a','upc_e','code_128','code_39','qr_code']});
  const video=document.getElementById('scanVideo');
  const status=document.getElementById('scanStatus');
  barcodeInterval=setInterval(async()=>{
    if(!scanStream)return;
    try{
      const barcodes=await bd.detect(video);
      if(barcodes.length>0){
        const code=barcodes[0].rawValue;
        clearInterval(barcodeInterval);
        status.textContent='Found barcode: '+code+'. Looking up…';
        const result=await lookupBarcode(code);
        if(result){scanData=result;showScanResult(result);status.textContent='';}
        else status.textContent='Product not found in database. Try searching by name.';
      }
    }catch{}
  },300);
}

function stopCamera(){
  if(barcodeInterval){clearInterval(barcodeInterval);barcodeInterval=null;}
  if(scanStream){scanStream.getTracks().forEach(t=>t.stop());scanStream=null;}
  const video=document.getElementById('scanVideo');
  if(video){video.style.display='none';video.srcObject=null;}
  const ph=document.getElementById('vfPlaceholder');if(ph)ph.style.display='';
  const ov=document.getElementById('scanOverlay');if(ov)ov.style.display='none';
  const btn=document.getElementById('scanCaptureBtn');if(btn){btn.style.display='none';btn.textContent='Stop Scan';}
}

function showScanResult(data){
  scanData=data;
  document.getElementById('scanResult').style.display='block';
  document.getElementById('scanResultName').textContent=data.name||'Unknown Food';
  const m=document.getElementById('scanResultMacros');
  m.innerHTML=[['<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>','kcal','kcal'],['P','protein','g'],['F','fat','g'],['C','carbs','g']].map(([ico,k,u])=>
    `<div class="srm"><div class="srm-val">${Math.round(data[k]||0)}</div><div class="srm-label">${ico} ${u}</div></div>`
  ).join('');
  const qtyIn=document.getElementById('scanResultQty');
  if(qtyIn)qtyIn.value=data.qty||100;
  document.getElementById('scanResultUnit').textContent=data.unit||'g';
}

function addScanResult(){
  if(!scanData)return;
  const qty=parseFloat(document.getElementById('scanResultQty').value)||100;
  const base=scanData.qty||100;
  const ratio=qty/base;
  addEntry({
    name:scanData.name,
    kcal:Math.round((scanData.kcal||0)*ratio),
    protein:Math.round((scanData.protein||0)*ratio*10)/10,
    fat:Math.round((scanData.fat||0)*ratio*10)/10,
    carbs:Math.round((scanData.carbs||0)*ratio*10)/10,
    qty,unit:scanData.unit||'g',image:scanData.image||null
  });
  document.getElementById('scanResult').style.display='none';
  scanData=null;
  closeAddSheet();
}

// ── SEARCH ──
let searchTimeout=null;
function handleSearch(query){
  clearTimeout(searchTimeout);
  if(!query||query.length<2){renderSearchHistory();return;}
  const res=document.getElementById('srchResults');
  res.innerHTML=`<div class="srch-loading"><span class="spinner-inline"></span> Searching…</div>`;
  searchTimeout=setTimeout(async()=>{
    try{
      const items=await searchOFF(query);
      if(items.length===0){res.innerHTML=`<div class="srch-empty">No results for "${query}"</div>`;return;}
      res.innerHTML=items.map(item=>srchItemHTML(item)).join('');
    }catch(e){res.innerHTML=`<div class="srch-empty">Search failed. Check connection.</div>`;}
  },400);
}

function renderSearchHistory(){
  const lib=FL.lib();
  const res=document.getElementById('srchResults'); if(!res)return;
  if(!lib.recent||lib.recent.length===0){res.innerHTML='<div class="srch-empty">No recent foods</div>';return;}
  res.innerHTML=`<div class="srch-sec-title">From History</div>`+lib.recent.slice(0,10).map(item=>srchItemHTML(item)).join('');
}

function srchItemHTML(item){
  const esc=s=>(s||'').replace(/'/g,"&#39;").replace(/"/g,'&quot;');
  return`<div class="srch-item">
    <div class="srch-item-img">${item.image?`<img src="${item.image}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'">` : FOOD_ICON}</div>
    <div class="srch-item-body">
      <div class="srch-item-name">${item.name}</div>
      <div class="srch-item-meta">${Math.round(item.kcal||0)}<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg> ${Math.round(item.protein||0)}P ${Math.round(item.fat||0)}F ${Math.round(item.carbs||0)}C · ${item.qty||100}${item.unit||'g'}</div>
    </div>
    <button class="srch-item-add" onclick='quickAddFromSearch(${JSON.stringify(item).replace(/'/g,"&#39;")})'>+</button>
  </div>`;
}

function quickAddFromSearch(item){
  addEntry({name:item.name,kcal:item.kcal||0,protein:item.protein||0,fat:item.fat||0,carbs:item.carbs||0,qty:item.qty||100,unit:item.unit||'g',image:item.image||null});
  closeAddSheet();
}

// ── QUICK ADD ──
function updateQaEst(){
  const p=+document.getElementById('qaPro').value||0;
  const f=+document.getElementById('qaFat').value||0;
  const c=+document.getElementById('qaCarb').value||0;
  const est=Math.round(p*4+f*9+c*4);
  document.getElementById('qaEst').textContent='Macro Calories Estimate: '+est+' kcal';
}
function clearQa(){['qaKcal','qaPro','qaFat','qaCarb','qaName'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});updateQaEst();}
function logQuickAdd(){
  const kcal=+document.getElementById('qaKcal').value||0;
  const pro=+document.getElementById('qaPro').value||0;
  const fat=+document.getElementById('qaFat').value||0;
  const carb=+document.getElementById('qaCarb').value||0;
  const name=document.getElementById('qaName').value||'Quick Add';
  if(kcal===0&&pro===0&&fat===0&&carb===0)return;
  addEntry({name,kcal,protein:pro,fat,carbs:carb,qty:1,unit:'serving'});
  clearQa();
  closeAddSheet();
}

// ── LIBRARY ──
function switchLibTab(tab){
  document.getElementById('libTabRecipes').classList.toggle('on',tab==='recipes');
  document.getElementById('libTabFoods').classList.toggle('on',tab==='foods');
  document.getElementById('libRecipes').classList.toggle('on',tab==='recipes');
  document.getElementById('libFoods').classList.toggle('on',tab==='foods');
}
function renderLibrary(){
  const lib=FL.lib();
  const foods=document.getElementById('libFoods');
  const recipes=document.getElementById('libRecipes');
  if(!foods||!recipes)return;
  foods.innerHTML=lib.recent&&lib.recent.length>0
    ?`<div class="srch-sec-title">Recent Foods</div>`+lib.recent.map(item=>srchItemHTML(item)).join('')
    :'<div class="srch-empty">No saved foods yet.<br>Foods you log appear here.</div>';
  recipes.innerHTML='<div class="srch-empty">No recipes yet.</div>';
}

// ── AI DESCRIBE ──
function checkAiKey(){
  const btn=document.getElementById('aiFindBtn');if(!btn)return;
  const hasKey=!!FL.groq(), hasText=!!(document.getElementById('aiDescText')||{}).value?.trim();
  btn.classList.toggle('active-key', hasKey&&hasText);
}
async function runAiDescribe(){
  const text=document.getElementById('aiDescText').value.trim();
  if(!text)return;
  const key=FL.groq();
  if(!key){document.getElementById('aiDescResult').innerHTML='<div style="color:#f87171;font-size:14px;padding:12px;background:#2c2c2e;border-radius:10px">Add your Groq API key in Settings <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82L4.2 7.12a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg> to use AI features.<br><br>Free key at <strong>console.groq.com</strong></div>';return;}
  const btn=document.getElementById('aiFindBtn');
  btn.textContent='Analysing… '; btn.classList.add('loading');
  btn.insertAdjacentHTML('beforeend','<span class="spinner-inline"></span>');
  try{
    const data=await geminiDescribe(text);
    const div=document.getElementById('aiDescResult');
    div.innerHTML=`<div style="padding:16px;background:#1c1c1e;border-radius:12px;border:.5px solid rgba(255,255,255,.08)">
      <div style="font-size:17px;font-weight:700;margin-bottom:12px;color:#fff">${data.name}</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">
        ${[['<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>','kcal','kcal','#3b82f6'],['P','protein','g','#f87171'],['F','fat','g','#fbbf24'],['C','carbs','g','#34d399']].map(([i,k,u,c])=>`<div class="srm"><div class="srm-val" style="color:${c}">${Math.round(data[k]||0)}</div><div class="srm-label">${i} ${u}</div></div>`).join('')}
      </div>
      <button class="scan-add-btn" onclick='addAndClose(${JSON.stringify(data)})'>Add to Log</button>
    </div>`;
  }catch(e){document.getElementById('aiDescResult').innerHTML='<div style="color:#ef4444;font-size:14px">Failed: '+(e.message||'try again')+'</div>';}
  btn.textContent='Find Foods'; btn.classList.remove('loading');
}

function addAndClose(data){
  addEntry({name:data.name,kcal:data.kcal||0,protein:data.protein||0,fat:data.fat||0,carbs:data.carbs||0,qty:data.qty||1,unit:data.unit||'serving'});
  closeAddSheet();
}

// ── FOOD DETAIL ──
function openFoodDetail(id){
  const log=FL.log(curDate);
  const entry=log.find(e=>e.id===id);
  if(!entry)return;
  editingEntry={id,base:entry};
  document.getElementById('food-detail').classList.add('open');
  document.getElementById('fdName').textContent=entry.name;
  document.getElementById('fdQty').value=entry.qty||100;
  document.getElementById('fdQtyUnit').textContent=entry.unit||'g';
  updateFdMacros();
}
function closeFoodDetail(){
  document.getElementById('food-detail').classList.remove('open');
  editingEntry=null;
}
function updateFdMacros(){
  if(!editingEntry)return;
  const base=editingEntry.base;
  const origQty=base.qty||100;
  const newQty=parseFloat(document.getElementById('fdQty').value)||origQty;
  const ratio=newQty/origQty;
  const m=document.getElementById('fdMacros'); if(!m)return;
  const colors={kcal:'#3b82f6',protein:'#f87171',fat:'#fbbf24',carbs:'#34d399'};
  m.innerHTML=[['<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg> kcal','kcal','kcal'],['P','protein','g'],['F','fat','g'],['C','carbs','g']].map(([lbl,k,u])=>
    `<div class="fdm"><div class="fdm-val" style="color:${colors[k]}">${Math.round((base[k]||0)*ratio)}</div><div class="fdm-label">${lbl} ${u}</div></div>`
  ).join('');
}
function saveFoodEntry(){
  if(!editingEntry)return;
  const log=FL.log(curDate);
  const idx=log.findIndex(e=>e.id===editingEntry.id);
  if(idx<0)return;
  const base=editingEntry.base;
  const origQty=base.qty||100;
  const newQty=parseFloat(document.getElementById('fdQty').value)||origQty;
  const ratio=newQty/origQty;
  log[idx]={...base,qty:newQty,kcal:Math.round((base.kcal||0)*ratio),protein:Math.round((base.protein||0)*ratio*10)/10,fat:Math.round((base.fat||0)*ratio*10)/10,carbs:Math.round((base.carbs||0)*ratio*10)/10};
  FL.saveLog(curDate,log);
  closeFoodDetail();
  renderMacroBars();
  renderFoodLog();
}
function deleteFoodEntry(){
  if(!editingEntry)return;
  const log=FL.log(curDate).filter(e=>e.id!==editingEntry.id);
  FL.saveLog(curDate,log);
  closeFoodDetail();
  renderMacroBars();
  renderFoodLog();
}

// ═══════════════════════════════════════════════════════
// APIs
// ═══════════════════════════════════════════════════════
async function searchOFF(q){
  const url=`https://world.openfoodfacts.org/cgi/search.pl?action=process&search_terms=${encodeURIComponent(q)}&json=1&page_size=15&fields=product_name,brands,nutriments,image_small_url`;
  const r=await fetch(url);
  const data=await r.json();
  return(data.products||[]).filter(p=>p.product_name&&p.nutriments).map(parseOFF);
}
async function lookupBarcode(code){
  const r=await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}?fields=product_name,brands,nutriments,image_small_url`);
  const data=await r.json();
  if(data.status===1&&data.product)return parseOFF(data.product);
  return null;
}
function parseOFF(p){
  const n=p.nutriments||{};
  return{name:[p.product_name,p.brands].filter(Boolean).join(' – '),kcal:Math.round(n['energy-kcal_100g']||n['energy_100g']/4.18||0),protein:Math.round((n['proteins_100g']||0)*10)/10,fat:Math.round((n['fat_100g']||0)*10)/10,carbs:Math.round((n['carbohydrates_100g']||0)*10)/10,qty:100,unit:'g',image:p.image_small_url||null};
}

async function groqText(prompt){
  const key=FL.groq();
  if(!key)throw new Error('No Groq API key — add it in Settings <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82L4.2 7.12a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>');
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({model:'llama-3.3-70b-versatile',messages:[{role:'user',content:prompt}],max_tokens:300,temperature:0.3})
  });
  const data=await r.json();
  if(!r.ok)throw new Error(data?.error?.message||'Groq error '+r.status);
  const text=(data?.choices?.[0]?.message?.content||'').trim();
  if(!text)throw new Error('Empty response');
  return JSON.parse(text.replace(/```json|```/g,'').trim());
}
async function groqVision(b64,prompt){
  const key=FL.groq();
  if(!key)throw new Error('No Groq API key — add it in Settings <svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;vertical-align:-0.14em;display:inline-block" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82L4.2 7.12a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>');
  const r=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
    body:JSON.stringify({
      model:'meta-llama/llama-4-scout-17b-16e-instruct',
      messages:[{role:'user',content:[
        {type:'image_url',image_url:{url:'data:image/jpeg;base64,'+b64}},
        {type:'text',text:prompt}
      ]}],
      max_tokens:300,temperature:0.3
    })
  });
  const data=await r.json();
  if(!r.ok)throw new Error(data?.error?.message||'Groq error '+r.status);
  const text=(data?.choices?.[0]?.message?.content||'').trim();
  if(!text)throw new Error('Empty response');
  return JSON.parse(text.replace(/```json|```/g,'').trim());
}
async function geminiMeal(b64){
  return groqVision(b64,'Analyze this food photo. Estimate macros for what you see.\nReturn ONLY valid JSON (no markdown): {"name":"Food Name","kcal":0,"protein":0,"fat":0,"carbs":0,"qty":1,"unit":"serving"}');
}
async function geminiLabel(b64){
  return groqVision(b64,'Read this nutrition label photo. Extract per-serving nutrition.\nReturn ONLY valid JSON (no markdown): {"name":"Product Name","kcal":0,"protein":0,"fat":0,"carbs":0,"qty":100,"unit":"g"}');
}
async function geminiDescribe(desc){
  return groqText(`Estimate macronutrients for this meal: "${desc}"\nReturn ONLY valid JSON (no markdown): {"name":"Meal Name","kcal":0,"protein":0,"fat":0,"carbs":0,"qty":1,"unit":"serving"}`);
}

// ═══════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════
// ── SETTINGS ──
function openSettings(){
  document.getElementById('settings-modal').style.display='block';
}
function closeSettings(){
  document.getElementById('settings-modal').style.display='none';
}
function restartOnboarding(){
  closeSettings();
  obState={step:0,sex:null,dob:null,height_unit:'cm',height_cm:175,weight_unit:'kg',weight_kg:80,activity:null,tdee_ok:null,goal:null,target_weight_kg:null,goal_rate:0.5,diet:null,calorie_floor:'standard',training:null,distribution:'even',protein_pref:'moderate'};
  document.getElementById('app').classList.remove('vis');
  document.getElementById('ob').classList.remove('gone');
  obRender();
}
function clearFoodLog(){
  if(!confirm('Clear all food entries for today?')) return;
  FL.saveLog(curDate,[]);
  closeSettings();
  renderMacroBars();
  renderFoodLog();
}

(function boot(){
  // Set up cloud sync for food logger data. sync.js is deferred, so wait
  // until it's available (this inline boot runs before deferred scripts).
  function startSync(){
    if(!window.initCloudSync)return;
    window.initCloudSync({
      appKey:'food-logger',
      syncedKeys:['fl_profile'],
      syncedPrefixes:['fl_log_','fl_lib'],
      onApplied:()=>{
        const p=FL.profile();
        if(p&&p.setup_done){
          renderMacroBars();
          renderFoodLog();
        }
      }
    });
  }
  if(window.initCloudSync) startSync();
  else window.addEventListener('load', startSync, {once:true});

  let p=FL.profile();

  // Ensure profile has all required default fields
  if(p&&!p.daily_kcal){
    const targets=calcTargets(p);
    p.daily_kcal=targets.kcal;
    p.daily_protein=targets.protein;
    p.daily_fat=targets.fat;
    p.daily_carbs=targets.carbs;
    FL.saveProfile(p);
  }

  if(p&&p.setup_done){
    document.getElementById('ob').classList.add('gone');
    document.getElementById('app').classList.add('vis');
    initApp();
  } else {
    obRender();
  }

  // Set up add button (FAB via search bar)
  document.getElementById('srchInput')&&document.getElementById('srchInput').addEventListener('focus',()=>openAddSheet('search',''));

  // External "open Add Food" command (from the dashboard topbar button).
  // Same-origin storage event fires here when the shell writes fl_open_add.
  function handleOpenAddCmd(raw){
    try{
      const c=JSON.parse(raw||'{}');
      if(!c.ts || Date.now()-c.ts > 5000) return; // only act on fresh commands
      // only meaningful once the app is set up
      const pr=FL.profile();
      if(pr&&pr.setup_done) openAddSheet(c.tab||'scan','');
    }catch(e){}
  }
  window.addEventListener('storage',e=>{ if(e.key==='fl_open_add') handleOpenAddCmd(e.newValue); });
  // also honor a command that was set just before this frame finished loading
  try{ handleOpenAddCmd(localStorage.getItem('fl_open_add')); }catch(e){}
})();

})();