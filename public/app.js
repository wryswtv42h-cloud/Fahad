async function boot(){
 try{const d=await Promise.race([api("/api/auth/me"),new Promise((_,rej)=>setTimeout(()=>rej(Error("auth timeout")),5000))]);me=d.user||null}catch(e){console.warn("auth boot:",e.message)}
 setUser();menu();
 try{await Promise.race([api("/api/site/visit",{method:"POST"}),new Promise((_,rej)=>setTimeout(()=>rej(Error("visit timeout")),2500))])}catch(e){console.warn("visit:",e.message)}
 $("#boot").style.opacity="0";setTimeout(()=>$("#boot").remove(),350);
 const v=(location.hash||"#home").slice(1)||"home";await render(V[v]?v:"home");
}
async function render(v=(location.hash||"#home").slice(1)){
 if(!V[v])v="home";drawer(false);$$("#menu .menu-item").forEach(x=>x.classList.toggle("active",x.dataset.view===v));
 const root=$("#view");root.innerHTML='<div class="empty"><b>جاري التحميل…</b><span>نجهز لك الصفحة</span></div>';
 try{const fn=pages[v]||pages.home;root.innerHTML=await fn();bindPage(v)}catch(e){root.innerHTML='<div class="empty"><b>صار خطأ في تحميل القسم</b><span>'+esc(e.message)+'</span><div style="margin-top:14px"><button class="btn secondary" onclick="location.hash='#'+v;render(v)">إعادة المحاولة</button></div></div>';console.error(e)}
 window.scrollTo({top:0,behavior:"smooth"});
}
function bindPage(v){
 $$("#view [data-go]").forEach(x=>x.onclick=()=>go(x.dataset.go));
 $$("#view [data-action]").forEach(x=>x.onclick=()=>actions[x.dataset.action]?.(x));
}
const pages={};