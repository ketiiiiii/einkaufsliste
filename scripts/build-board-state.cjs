const fs = require('fs');
const plan = JSON.parse(fs.readFileSync('docs/master-thesis-plan-v4.json', 'utf8'));
const phases = plan.phases;
const PHASE_COLORS = ['amber','sky','rose','emerald','violet','orange','teal','indigo'];
let seq = 0;
const mid = (p) => `${p}-${++seq}-${Date.now()}`;

function compPos(ids, edges) {
  const W=300,GX=60,H=140,GY=30,P=40;
  const s=new Set(ids),ch=new Map(ids.map(i=>[i,[]])),dg=new Map(ids.map(i=>[i,0]));
  for(const{from:f,to:t}of edges){if(!s.has(f)||!s.has(t))continue;ch.get(f).push(t);dg.set(t,(dg.get(t)||0)+1)}
  const col=new Map(),q=ids.filter(i=>(dg.get(i)||0)===0);
  for(const i of q)col.set(i,0);
  while(q.length){const i=q.shift();for(const c of ch.get(i)||[]){col.set(c,Math.max(col.get(c)||0,(col.get(i)||0)+1));q.push(c)}}
  for(const i of ids)if(!col.has(i))col.set(i,0);
  const g=new Map();for(const i of ids){const c=col.get(i);if(!g.has(c))g.set(c,[]);g.get(c).push(i)}
  const pos=new Map();for(const[c,gi]of g)gi.forEach((i,r)=>pos.set(i,{x:P+c*(W+GX),y:P+r*(H+GY)}));
  return pos;
}

function buildSub(subs,clr){
  if(!subs||!subs.length)return null;
  const ids=subs.map(s=>s.id),iS=new Set(ids),ed=[],co=[];
  for(const st of subs)for(const pr of(st.predecessors||[])){const l=pr.split(':').pop();if(iS.has(l)){ed.push({from:l,to:st.id});const c={id:mid('sc'),from:l,to:st.id};if(st.lag_h>0){c.lag=st.lag_h;c.lagUnit='h'}co.push(c)}}
  const pos=compPos(ids,ed);
  return{tasks:subs.map(s=>{const p=pos.get(s.id)||{x:40,y:40};return{id:s.id,title:s.title,note:s.description||undefined,color:clr,duration:s.duration_h,unit:'h',x:p.x,y:p.y}}),connections:co};
}

function buildPhSub(ph,clr){
  const ch=ph.children||[];if(!ch.length)return{tasks:[],connections:[]};
  const ids=ch.map(c=>c.id),iS=new Set(ids),ed=[],co=[];
  for(const t of ch)for(const pr of(t.predecessors||[])){const l=pr.startsWith(ph.id+':')?pr.slice(ph.id.length+1):null;if(l&&iS.has(l)){ed.push({from:l,to:t.id});const c={id:mid('tc'),from:l,to:t.id};if(t.lag_h>0){c.lag=t.lag_h;c.lagUnit='h'}co.push(c)}}
  // Loop-Back-Connections (iterative Zyklen) — nach Position, stören topo-sort nicht
  for(const loop of(ph.loopConnections||[])){const c={id:mid('lc'),from:loop.from,to:loop.to};if(loop.loopDuration){c.loopDuration=loop.loopDuration;c.loopDurationUnit=loop.loopDurationUnit||'h'}co.push(c)}
  const pos=compPos(ids,ed);
  return{tasks:ch.map(t=>{const p=pos.get(t.id)||{x:40,y:40};const r={id:t.id,title:t.title,note:t.description||t.note||undefined,color:clr,duration:t.duration_h,unit:'h',x:p.x,y:p.y};if(t.children&&t.children.length)r.subBoard=buildSub(t.children,clr);return r}),connections:co};
}

const pIS=new Set(phases.map(p=>p.id));
// PS is parallel — skip root-level edges involving PS to avoid cycles
const PARALLEL_PHASES = new Set(['PS']);

// Determine entry tasks per phase (those without intra-phase predecessors)
const entryTasks = new Map(); // phaseId → Set<taskId>
for(const ph of phases){
  const intraIds = new Set((ph.children||[]).map(c=>c.id));
  const entries = new Set();
  for(const t of(ph.children||[])){
    const hasIntraPred = (t.predecessors||[]).some(pr=>{const l=pr.startsWith(ph.id+':')?pr.slice(ph.id.length+1):null;return l&&intraIds.has(l)});
    if(!hasIntraPred) entries.add(t.id);
  }
  entryTasks.set(ph.id, entries);
}

const rE=[],rC=[],ap=new Set(),apLayout=new Set();
for(const ph of phases)for(const t of(ph.children||[]))for(const pr of(t.predecessors||[])){const pp=pr.split(':')[0];if(pp!==ph.id&&pIS.has(pp)){
  // Cross-phase task connection (always add for drill-in)
  const c={id:mid('xc'),from:pr,to:`${ph.id}:${t.id}`};if(t.lag_h>0){c.lag=t.lag_h;c.lagUnit='h'}rC.push(c);
  // Root phase-to-phase edge: always add as connection for arrows
  if(!PARALLEL_PHASES.has(pp)&&!PARALLEL_PHASES.has(ph.id)){const pk=`${pp}->${ph.id}`;if(!ap.has(pk)){ap.add(pk);rC.push({id:mid('pc'),from:pp,to:ph.id})}}
  // Layout edge: only if this is an entry task (determines when the phase CAN start)
  const isEntry = entryTasks.get(ph.id)?.has(t.id);
  if(isEntry&&!PARALLEL_PHASES.has(pp)&&!PARALLEL_PHASES.has(ph.id)){const pk=`${pp}->${ph.id}`;if(!apLayout.has(pk)){apLayout.add(pk);rE.push({from:pp,to:ph.id})}}
}}
const pE=rE.filter(e=>pIS.has(e.from)&&pIS.has(e.to));
const pP=compPos(phases.map(p=>p.id),pE);
const pT=phases.map((ph,i)=>{const p=pP.get(ph.id)||{x:40,y:40};const clr=ph.color||PHASE_COLORS[i%8];return{id:ph.id,title:ph.title,color:clr,duration:ph.duration_h,unit:'h',x:p.x,y:p.y,subBoard:buildPhSub(ph,clr)}});

// Derive crossConnections from composite-ID connections for Board drill-in view
const crossConns = rC
  .filter(c => c.from.includes(':') && c.to.includes(':'))
  .map(c => {
    const [fromPhaseId, ...fromRest] = c.from.split(':');
    const [toPhaseId, ...toRest] = c.to.split(':');
    return { id: c.id, fromPhaseId, fromTaskId: fromRest.join(':'), toPhaseId, toTaskId: toRest.join(':') };
  });

const productId=plan.product.id;
const product={id:productId,name:plan.product.name,groups:[{id:'grp-ms',name:'MS',boardState:{tasks:pT,connections:rC,crossConnections:crossConns},children:[],phasesEnabled:true}],activeGroupId:'grp-ms'};
const state={products:[product],activeProductId:productId};
fs.writeFileSync('docs/board-state-v4.json', JSON.stringify(state));
console.log('Board state written to docs/board-state-v4.json');
console.log('Phases:', pT.length, '| Root conns:', rC.length);
