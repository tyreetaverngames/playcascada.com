const { chromium } = require('/opt/npm-tools/node_modules/playwright');
(async()=>{
  const b = await chromium.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});
  const p = await b.newPage({viewport:{width:1400,height:850}});
  const errs=[]; p.on('pageerror',e=>errs.push(String(e).slice(0,300)));
  await p.goto('file://'+process.argv[2]); await p.waitForTimeout(2500);
  const res = await p.evaluate(()=>{
    const out=[]; const ids=(window.__CASCADA_SONGS__||[]).map(s=>s.id);
    for(const id of ids){ const row={id,lv:{}};
      for(const L of [0,1,2,3,4,5]){ try{
        loadBakedSong(id); applyLevel(L);
        const N=Song.notes.length, yours=new Set(Song.activeNotes.filter(n=>!n.skip));
        // rough reference: top note per 50ms onset bucket
        const by=new Map(); for(const n of Song.notes){ const k=Math.round(n.startSec*20); const c=by.get(k); if(!c||n.midi>c.midi) by.set(k,n); }
        let top=0,topY=0; for(const n of by.values()){ top++; if(yours.has(n)) topY++; }
        const mel=Song.notes.filter(n=>n.isMelody); const melY=mel.filter(n=>yours.has(n)).length;
        const ts=[...yours].map(n=>n.startSec).sort((a,b)=>a-b); let gap=0; for(let i=1;i<ts.length;i++) gap=Math.max(gap,ts[i]-ts[i-1]);
        row.lv[L]={pct:Math.round(100*yours.size/N), top:Math.round(100*topY/top), mel: mel.length?Math.round(100*melY/mel.length):null, gap:+gap.toFixed(1), n:yours.size, N};
      }catch(e){ row.lv[L]={err:String(e).slice(0,120)}; } }
      out.push(row); }
    return out; });
  for(const r of res){ console.log(r.id.padEnd(26), Object.entries(r.lv).map(([L,v])=>v.err?`L${L}:ERR ${v.err}`:`L${L} ${String(v.pct).padStart(3)}% top${String(v.top).padStart(3)} mel${String(v.mel).padStart(4)} gap${v.gap}`).join(' | ')); }
  if(errs.length) console.log('ERRORS', errs.slice(0,5));
  await b.close();
})();
