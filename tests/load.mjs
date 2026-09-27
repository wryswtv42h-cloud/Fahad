const BASE=process.env.BASE_URL||"https://discord-community-platform-production-9348.up.railway.app";
const ENV_CONCURRENCY=Number(process.env.LOAD_CONCURRENCY||1000);
const ENV_DURATION=Number(process.env.LOAD_DURATION_MS||0);
const stages=[
{name:"warmup",concurrency:25,total:250,paths:["/health","/api/games"]},
{name:"normal",concurrency:100,total:1000,paths:["/health","/api/public/server","/api/public/roles","/api/public/top","/api/games","/api/reviews","/api/announcements"]},
{name:"heavy",concurrency:250,total:2500,paths:["/health","/api/public/server","/api/public/roles","/api/public/top","/api/games"]},
{name:"peak",concurrency:ENV_CONCURRENCY,total:Math.max(5000,ENV_DURATION?Math.ceil(ENV_CONCURRENCY*ENV_DURATION/1000):5000),paths:["/health"]}
];
async function one(path){const started=performance.now(),c=new AbortController(),timer=setTimeout(()=>c.abort(),8000);try{const r=await fetch(BASE+path,{signal:c.signal,headers:{"cache-control":"no-cache"}});return{ok:r.status<500,status:r.status,ms:performance.now()-started,path};}catch(e){return{ok:false,status:0,ms:performance.now()-started,path,error:String(e)}}finally{clearTimeout(timer)}}
async function stage(s){const out=[];let next=0;async function worker(){while(true){const i=next++;if(i>=s.total)return;out.push(await one(s.paths[i%s.paths.length]));}}await Promise.all(Array.from({length:s.concurrency},worker));out.sort((a,b)=>a.ms-b.ms);const p=n=>out[Math.min(out.length-1,Math.floor(out.length*n))].ms;const errors=out.filter(x=>!x.ok||x.status>=500);const summary={stage:s.name,total:out.length,errors:errors.length,errorRate:Number((errors.length/out.length*100).toFixed(2)),p50:Number(p(.5).toFixed(1)),p95:Number(p(.95).toFixed(1)),p99:Number(p(.99).toFixed(1)),max:Number(out.at(-1).ms.toFixed(1)),statuses:Object.fromEntries([...new Set(out.map(x=>x.status))].map(code=>[code,out.filter(x=>x.status===code).length]))};console.log(JSON.stringify(summary));if(summary.errorRate>1)throw new Error(s.name+" error rate exceeded 1%");return summary}
for(const s of stages)await stage(s);console.log("LOAD_TEST_OK");