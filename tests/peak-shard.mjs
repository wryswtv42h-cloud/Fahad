const BASE=process.env.BASE_URL||"https://discord-community-platform-production-9348.up.railway.app";
const concurrency=250,total=1500;
const out=[];let next=0;
async function one(){const t=performance.now(),c=new AbortController(),tm=setTimeout(()=>c.abort(),8000);try{const r=await fetch(BASE+"/health",{signal:c.signal});out.push({ok:r.status===200,status:r.status,ms:performance.now()-t});}catch(e){out.push({ok:false,status:0,ms:performance.now()-t});}finally{clearTimeout(tm)}}
async function worker(){while(true){const i=next++;if(i>=total)return;await one()}}
await Promise.all(Array.from({length:concurrency},worker));
out.sort((a,b)=>a.ms-b.ms);const p=n=>out[Math.floor((out.length-1)*n)].ms;const errors=out.filter(x=>!x.ok);const s={total:out.length,errors:errors.length,errorRate:Number((errors.length/out.length*100).toFixed(2)),p50:Number(p(.5).toFixed(1)),p95:Number(p(.95).toFixed(1)),p99:Number(p(.99).toFixed(1)),max:Number(out.at(-1).ms.toFixed(1))};console.log(JSON.stringify(s));if(s.errorRate>1||s.p95>7000)process.exit(1);