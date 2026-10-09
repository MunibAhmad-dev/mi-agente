"""Embedded Brain Dashboard HTML — with memory split + i18n."""

DASHBOARD_HTML = r"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>🧠 Brain Dashboard</title>
    <style>
        *{margin:0;padding:0;box-sizing:border-box}
        :root{--bg:#0a0a0f;--s:#12121a;--s2:#1a1a25;--b:#2a2a3a;--t:#e0e0f0;--td:#8888aa;--a:#6366f1;--a2:#818cf8;--g:#22c55e;--r:#ef4444;--bl:#3b82f6;--or:#f97316;--cy:#06b6d4}
        body{font-family:Inter,-apple-system,sans-serif;background:var(--bg);color:var(--t);height:100vh;overflow:hidden}
        .app{display:grid;grid-template-columns:240px 1fr;grid-template-rows:52px 1fr;height:100vh}
        .hd{grid-column:1/-1;background:var(--s);border-bottom:1px solid var(--b);display:flex;align-items:center;padding:0 20px;gap:16px}
        .hd h1{font-size:17px;font-weight:700;white-space:nowrap}.hd h1 span{color:var(--a)}
        .hd .st{margin-left:auto;display:flex;align-items:center;gap:10px;font-size:12px;color:var(--td)}
        .hd .st .d{width:7px;height:7px;border-radius:50%;background:var(--g)}
        .lang-sel{display:flex;gap:2px;background:var(--s2);border:1px solid var(--b);border-radius:6px;padding:2px;margin-left:12px}
        .lang-btn{padding:3px 8px;border:none;background:transparent;color:var(--td);font-size:11px;font-weight:600;border-radius:4px;cursor:pointer;transition:all .15s}
        .lang-btn.active{background:var(--a);color:#fff}
        .sb{background:var(--s);border-right:1px solid var(--b);padding:10px 0;overflow-y:auto}
        .sb a{display:flex;align-items:center;gap:9px;padding:9px 16px;color:var(--td);text-decoration:none;font-size:13px;transition:all .15s;cursor:pointer}
        .sb a:hover{background:var(--s2);color:var(--t)}
        .sb a.ac{color:var(--a2);background:rgba(99,102,241,.1);border-right:2px solid var(--a)}
        .sb .s{padding:8px 16px 4px;font-size:10px;text-transform:uppercase;color:var(--td);letter-spacing:.06em;font-weight:600}
        .mn{overflow-y:auto;padding:20px}
        .pg{display:none}.pg.ac{display:block}
        .cds{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;margin-bottom:16px}
        .cd{background:var(--s);border:1px solid var(--b);border-radius:8px;padding:14px}
        .cd .lb{font-size:11px;color:var(--td);margin-bottom:3px;text-transform:uppercase;letter-spacing:.03em}
        .cd .vl{font-size:22px;font-weight:700}
        .cd .vl.ac{color:var(--a)}.cd .vl.g{color:var(--g)}.cd .vl.r{color:var(--r)}.cd .vl.bl{color:var(--bl)}.cd .vl.cy{color:var(--cy)}.cd .vl.or{color:var(--or)}
        .tw{background:var(--s);border:1px solid var(--b);border-radius:8px;overflow:hidden}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{text-align:left;padding:8px 10px;background:var(--s2);color:var(--td);font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.03em}
        td{padding:8px 10px;border-top:1px solid var(--b)}
        tr:hover td{background:rgba(99,102,241,.05)}
        .bt{padding:7px 14px;border-radius:6px;border:none;font-size:12px;font-weight:600;cursor:pointer;transition:all .15s}
        .bp{background:var(--a);color:#fff}.bp:hover{background:var(--a2)}
        .bs{padding:3px 8px;font-size:11px}
        .bd{background:var(--r);color:#fff}
        input,textarea,select{background:var(--s2);border:1px solid var(--b);color:var(--t);padding:7px 10px;border-radius:6px;font-size:12px;width:100%}
        input:focus,textarea:focus{outline:none;border-color:var(--a)}
        textarea{min-height:70px;resize:vertical}
        .fg{margin-bottom:10px}.fg label{display:block;font-size:11px;color:var(--td);margin-bottom:3px;text-transform:uppercase;letter-spacing:.03em}
        .sbr{display:flex;gap:6px;margin-bottom:16px}.sbr input{flex:1;font-size:14px;padding:10px 14px}
        .sr{background:var(--s);border:1px solid var(--b);border-radius:8px;padding:12px;margin-bottom:6px;transition:border-color .15s}
        .sr:hover{border-color:var(--a)}
        .sr .sc{color:var(--a);font-size:11px;font-weight:600}.sr .ct{margin-top:4px;font-size:12px;line-height:1.5}.sr .mt{margin-top:4px;font-size:10px;color:var(--td)}
        .gc{background:var(--s);border:1px solid var(--b);border-radius:8px;height:450px;position:relative;overflow:hidden}
        .ge{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);text-align:center;color:var(--td)}
        .ge .i{font-size:42px;margin-bottom:10px}
        .cp{background:var(--s);border:1px solid var(--b);border-radius:8px;display:flex;flex-direction:column;height:calc(100vh - 160px)}
        .cm{flex:1;overflow-y:auto;padding:14px}
        .mg{margin-bottom:10px;max-width:80%}.mg.usr{margin-left:auto}
        .mg .bb{padding:8px 12px;border-radius:10px;font-size:12px;line-height:1.5}
        .mg.usr .bb{background:var(--a);color:#fff;border-bottom-right-radius:4px}
        .mg.as .bb{background:var(--s2);border:1px solid var(--b);border-bottom-left-radius:4px}
        .mg .src{font-size:10px;color:var(--td);margin-top:3px}
        .ci{display:flex;gap:6px;padding:10px 14px;border-top:1px solid var(--b)}.ci input{flex:1}
        .sp{display:inline-block;width:14px;height:14px;border:2px solid var(--b);border-top-color:var(--a);border-radius:50%;animation:sp .6s linear infinite}
        @keyframes sp{to{transform:rotate(360deg)}}
        .tst{position:fixed;bottom:16px;right:16px;background:var(--s);border:1px solid var(--g);border-radius:8px;padding:10px 14px;font-size:12px;z-index:1000;animation:si .3s ease}
        @keyframes si{from{transform:translateY(16px);opacity:0}to{transform:translateY(0);opacity:1}}
        .tabs{display:flex;gap:2px;margin-bottom:14px;background:var(--s);border:1px solid var(--b);border-radius:8px;padding:3px;width:fit-content}
        .tab{padding:6px 14px;border:none;background:transparent;color:var(--td);font-size:12px;font-weight:600;border-radius:6px;cursor:pointer;transition:all .15s}
        .tab.active{background:var(--a);color:#fff}
        .tab:hover:not(.active){background:var(--s2);color:var(--t)}
        .badge{display:inline-block;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;margin-left:6px}
        .badge.ai{background:rgba(99,102,241,.2);color:var(--a2)}
        .badge.kb{background:rgba(6,182,212,.2);color:var(--cy)}
    </style>
</head>
<body>
<div class="app">
    <header class="hd">
        <h1>🧠 <span>Brain</span></h1>
        <div class="lang-sel">
            <button class="lang-btn active" onclick="setLang('en')">EN</button>
            <button class="lang-btn" onclick="setLang('es')">ES</button>
        </div>
        <div class="st" id="st"><div class="d"></div> <span data-i18n="connecting">Connecting...</span></div>
    </header>
    <nav class="sb">
        <div class="s" data-i18n="nav_overview">Overview</div>
        <a class="ac" data-page="dash"><span>📊</span> <span data-i18n="nav_dashboard">Dashboard</span></a>
        <div class="s" data-i18n="nav_knowledge">Knowledge</div>
        <a data-page="ai"><span>🤖</span> <span data-i18n="nav_ai_learning">AI Learning</span></a>
        <a data-page="kb"><span>📚</span> <span data-i18n="nav_knowledge_ram">Knowledge RAM</span></a>
        <a data-page="graph"><span>🕸️</span> <span data-i18n="nav_graph">Graph</span></a>
        <a data-page="search"><span>🔍</span> <span data-i18n="nav_search">Search</span></a>
        <div class="s" data-i18n="nav_tools">Tools</div>
        <a data-page="ingest"><span>📥</span> <span data-i18n="nav_ingest">Ingest</span></a>
        <a data-page="chat"><span>💬</span> <span data-i18n="nav_chat">Chat</span></a>
        <div class="s" data-i18n="nav_system">System</div>
        <a href="/docs" target="_blank"><span>📖</span> <span data-i18n="nav_apidocs">API Docs</span></a>
    </nav>
    <main class="mn">
        <!-- DASHBOARD -->
        <div class="pg ac" id="pg-dash">
            <h2 style="margin-bottom:14px" data-i18n="title_dashboard">Dashboard</h2>
            <div class="cds" id="sc"></div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
                <div>
                    <h3 style="margin-bottom:8px">🤖 <span data-i18n="title_ai_learning">AI Learning</span></h3>
                    <div class="tw" id="ai-recent"></div>
                </div>
                <div>
                    <h3 style="margin-bottom:8px">📚 <span data-i18n="title_knowledge_ram">Knowledge RAM</span></h3>
                    <div class="tw" id="kb-recent"></div>
                </div>
            </div>
        </div>

        <!-- AI LEARNING -->
        <div class="pg" id="pg-ai">
            <h2 style="margin-bottom:14px">🤖 <span data-i18n="title_ai_learning">AI Learning</span> <span class="badge ai" data-i18n="badge_ai_desc">Conversations & Patterns</span></h2>
            <div class="cds" id="ai-stats"></div>
            <div class="sbr"><input type="text" id="ai-filter" data-i18n-placeholder="ph_filter_learning" placeholder="Filter AI memories..." /><button class="bt bp" onclick="loadAI()" data-i18n="btn_refresh">Refresh</button></div>
            <div class="tw" id="ai-list"></div>
        </div>

        <!-- KNOWLEDGE RAM -->
        <div class="pg" id="pg-kb">
            <h2 style="margin-bottom:14px">📚 <span data-i18n="title_knowledge_ram">Knowledge RAM</span> <span class="badge kb" data-i18n="badge_kb_desc">Documents & Facts</span></h2>
            <div class="cds" id="kb-stats"></div>
            <div class="sbr"><input type="text" id="kb-filter" data-i18n-placeholder="ph_filter_knowledge" placeholder="Filter knowledge..." /><button class="bt bp" onclick="loadKB()" data-i18n="btn_refresh">Refresh</button></div>
            <div class="tw" id="kb-list"></div>
        </div>

        <!-- GRAPH -->
        <div class="pg" id="pg-graph">
            <h2 style="margin-bottom:14px">🕸️ <span data-i18n="title_graph">Knowledge Graph</span></h2>
            <div class="gc" id="gcon"><canvas id="gcv" style="width:100%;height:100%"></canvas>
                <div class="ge" id="ge"><div class="i">🕸️</div><div data-i18n="graph_empty">No entities yet</div><div style="font-size:11px;margin-top:4px" data-i18n="graph_hint">Ingest content to build the graph</div></div>
            </div>
        </div>

        <!-- SEARCH -->
        <div class="pg" id="pg-search">
            <h2 style="margin-bottom:14px">🔍 <span data-i18n="title_search">Search</span></h2>
            <div class="sbr"><input type="text" id="si" data-i18n-placeholder="ph_search" placeholder="Search the Brain..." /><button class="bt bp" onclick="doS()" data-i18n="btn_search">Search</button></div>
            <div id="sres"></div>
        </div>

        <!-- INGEST -->
        <div class="pg" id="pg-ingest">
            <h2 style="margin-bottom:14px">📥 <span data-i18n="title_ingest">Ingest Content</span></h2>
            <div class="cd">
                <div class="fg"><label data-i18n="lbl_content">Content</label><textarea id="ic" data-i18n-placeholder="ph_ingest" placeholder="Paste text to ingest..."></textarea></div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">
                    <div class="fg"><label data-i18n="lbl_source">Source</label><input type="text" id="isn" value="manual" /></div>
                    <div class="fg"><label data-i18n="lbl_space">Space</label>
                        <select id="isp">
                            <option value="ai_learning">🤖 AI Learning</option>
                            <option value="knowledge_ram">📚 Knowledge RAM</option>
                            <option value="default">Default</option>
                        </select>
                    </div>
                    <div class="fg"><label data-i18n="lbl_category">Category</label>
                        <select id="icat">
                            <option value="fact">Fact</option>
                            <option value="lesson">Lesson</option>
                            <option value="conversation">Conversation</option>
                            <option value="pattern">Pattern</option>
                            <option value="document">Document</option>
                        </select>
                    </div>
                </div>
                <button class="bt bp" onclick="doI()" data-i18n="btn_ingest">📥 Ingest</button>
                <div id="ires" style="margin-top:10px"></div>
            </div>
        </div>

        <!-- CHAT -->
        <div class="pg" id="pg-chat">
            <h2 style="margin-bottom:14px">💬 <span data-i18n="title_chat">Brain Chat</span></h2>
            <div class="cp">
                <div class="cm" id="cmsg"><div class="mg as"><div class="bb" data-i18n="chat_welcome">Hello! I am Brain. Ask me anything — I have knowledge from all the memories stored in me.</div></div></div>
                <div class="ci"><input type="text" id="cin" data-i18n-placeholder="ph_ask" placeholder="Ask Brain anything..." onkeydown="if(event.key==='Enter')doC()" /><button class="bt bp" onclick="doC()" data-i18n="btn_send">Send</button></div>
            </div>
        </div>
    </main>
</div>

<script>
// === I18N ===
const T={
    en:{
        connecting:"Connecting...",connected:"Connected (v",disconnected:"Disconnected",
        nav_overview:"Overview",nav_dashboard:"Dashboard",nav_knowledge:"Knowledge",
        nav_ai_learning:"AI Learning",nav_knowledge_ram:"Knowledge RAM",nav_graph:"Graph",
        nav_search:"Search",nav_tools:"Tools",nav_ingest:"Ingest",nav_chat:"Chat",
        nav_system:"System",nav_apidocs:"API Docs",
        title_dashboard:"Dashboard",title_ai_learning:"AI Learning",title_knowledge_ram:"Knowledge RAM",
        title_graph:"Knowledge Graph",title_search:"Search",title_ingest:"Ingest Content",title_chat:"Brain Chat",
        badge_ai_desc:"Conversations & Patterns",badge_kb_desc:"Documents & Facts",
        ph_filter_learning:"Filter AI memories...",ph_filter_knowledge:"Filter knowledge...",
        ph_search:"Search the Brain...",ph_ingest:"Paste text to ingest...",ph_ask:"Ask Brain anything...",
        lbl_content:"Content",lbl_source:"Source",lbl_space:"Space",lbl_category:"Category",
        btn_refresh:"Refresh",btn_search:"Search",btn_ingest:"📥 Ingest",btn_send:"Send",
        btn_forget:"Forget",
        graph_empty:"No entities yet",graph_hint:"Ingest content to build the graph",
        chat_welcome:"Hello! I am Brain. Ask me anything — I have knowledge from all the memories stored in me.",
        dash_total_mem:"Total Memories",dash_ai_learn:"AI Learning",dash_know_ram:"Knowledge RAM",
        dash_active:"Active",dash_spaces:"Spaces",dash_entities:"Entities",
        th_content:"Content",th_category:"Category",th_importance:"Importance",th_space:"Space",
        th_state:"State",th_action:"Action",th_source:"Source",th_score:"Score",
        th_mentions:"Mentions",th_type:"Type",th_name:"Name",
        no_memories:"No memories yet. Go to Ingest.",no_ai:"No AI learning memories yet.",
        no_kb:"No knowledge memories yet.",ingested:"Ingested:",
        search_no_results:"No results.",search_scoring:"Score:",
        loading:"Loading...",
        mem_total:"Total",mem_active:"Active",mem_forgotten:"Forgotten",
    },
    es:{
        connecting:"Conectando...",connected:"Conectado (v",disconnected:"Desconectado",
        nav_overview:"Resumen",nav_dashboard:"Panel",nav_knowledge:"Conocimiento",
        nav_ai_learning:"Aprendizaje IA",nav_knowledge_ram:"RAM Conocimiento",nav_graph:"Grafo",
        nav_search:"Buscar",nav_tools:"Herramientas",nav_ingest:"Ingestar",nav_chat:"Chat",
        nav_system:"Sistema",nav_apidocs:"Documentos API",
        title_dashboard:"Panel",title_ai_learning:"Aprendizaje IA",title_knowledge_ram:"RAM de Conocimiento",
        title_graph:"Grafo de Conocimiento",title_search:"Buscar",title_ingest:"Ingestar Contenido",title_chat:"Chat del Cerebro",
        badge_ai_desc:"Conversaciones y Patrones",badge_kb_desc:"Documentos y Hechos",
        ph_filter_learning:"Filtrar memorias IA...",ph_filter_knowledge:"Filtrar conocimiento...",
        ph_search:"Buscar en el Cerebro...",ph_ingest:"Pega texto para ingerir...",ph_ask:"Pregunta al Cerebro...",
        lbl_content:"Contenido",lbl_source:"Fuente",lbl_space:"Espacio",lbl_category:"Categoría",
        btn_refresh:"Actualizar",btn_search:"Buscar",btn_ingest:"📥 Ingestar",btn_send:"Enviar",
        btn_forget:"Olvidar",
        graph_empty:"Sin entidades aún",graph_hint:"Ingesta contenido para construir el grafo",
        chat_welcome:"¡Hola! Soy Brain. Pregúntame lo que quiera — tengo conocimiento de todas las memorias almacenadas.",
        dash_total_mem:"Memorias Totales",dash_ai_learn:"Aprendizaje IA",dash_know_ram:"RAM Conocimiento",
        dash_active:"Activos",dash_spaces:"Espacios",dash_entities:"Entidades",
        th_content:"Contenido",th_category:"Categoría",th_importance:"Importancia",th_space:"Espacio",
        th_state:"Estado",th_action:"Acción",th_source:"Fuente",th_score:"Puntuación",
        th_mentions:"Menciones",th_type:"Tipo",th_name:"Nombre",
        no_memories:"Sin memorias aún. Ve a Ingestar.",no_ai:"Sin memorias de aprendizaje IA aún.",
        no_kb:"Sin memorias de conocimiento aún.",ingested:"Ingestado:",
        search_no_results:"Sin resultados.",search_scoring:"Puntuación:",
        loading:"Cargando...",
        mem_total:"Total",mem_active:"Activas",mem_forgotten:"Olvidadas",
    }
};
let lang=localStorage.getItem('brain_lang')||'en';
function t(k){return(T[lang]||T.en)[k]||k}
function applyLang(){
    document.querySelectorAll('[data-i18n]').forEach(el=>{const k=el.getAttribute('data-i18n');if(T[lang]&&T[lang][k])el.textContent=T[lang][k]});
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{const k=el.getAttribute('data-i18n-placeholder');if(T[lang]&&T[lang][k])el.placeholder=T[lang][k]});
    document.querySelectorAll('.lang-btn').forEach(b=>{b.classList.toggle('active',b.textContent.toLowerCase()===lang)});
    document.title=lang==='es'?'🧠 Panel del Cerebro':'🧠 Brain Dashboard';
}
function setLang(l){lang=l;localStorage.setItem('brain_lang',l);applyLang();loadCurrentPage()}
document.querySelectorAll('.lang-btn').forEach(b=>b.addEventListener('click',()=>setLang(b.textContent.toLowerCase())));

// === NAVIGATION ===
document.querySelectorAll('.sb a[data-page]').forEach(a=>{a.addEventListener('click',()=>{document.querySelectorAll('.sb a').forEach(x=>x.classList.remove('ac'));a.classList.add('ac');document.querySelectorAll('.pg').forEach(p=>p.classList.remove('ac'));document.getElementById('pg-'+a.dataset.page).classList.add('ac');loadCurrentPage()})});
function loadCurrentPage(){const a=document.querySelector('.sb a.ac');if(a){const p=a.dataset.page;if(p==='dash')loadDash();if(p==='ai')loadAI();if(p==='kb')loadKB();if(p==='graph')loadGr()}}

// === API HELPERS ===
const A=window.location.origin;let cH=[];
async function api(p,o={}){const r=await fetch(A+p,o);if(!r.ok)throw new Error('API '+r.status);return r.json()}
function tst(m){const t2=document.createElement('div');t2.className='tst';t2.textContent=m;document.body.appendChild(t2);setTimeout(()=>t2.remove(),3000)}

// === DASHBOARD ===
async function loadDash(){
    try{
        const s=await api('/api/memory/stats');
        // Count by space
        const all=await api('/api/memory?limit=200');
        let aiCount=0,kbCount=0;
        all.memories.forEach(m=>{if(m.space==='ai_learning')aiCount++;else if(m.space==='knowledge_ram')kbCount++;});
        document.getElementById('sc').innerHTML=`
            <div class="cd"><div class="lb">${t('dash_total_mem')}</div><div class="vl ac">${s.total}</div></div>
            <div class="cd"><div class="lb">${t('dash_ai_learn')}</div><div class="vl bl">${aiCount}</div></div>
            <div class="cd"><div class="lb">${t('dash_know_ram')}</div><div class="vl cy">${kbCount}</div></div>
            <div class="cd"><div class="lb">${t('dash_active')}</div><div class="vl g">${s.active}</div></div>
            <div class="cd"><div class="lb">${t('dash_spaces')}</div><div class="vl">${s.spaces}</div></div>`;
        // AI Learning recent
        const ai=await api('/api/memory?limit=5&space=ai_learning');
        document.getElementById('ai-recent').innerHTML=ai.memories.length?`<table><tr><th>${t('th_content')}</th><th>${t('th_category')}</th></tr>${ai.memories.map(m=>`<tr><td>${m.content.slice(0,70)}${m.content.length>70?'...':''}</td><td>${m.category}</td></tr>`).join('')}</table>`:`<div style="padding:14px;color:var(--td);font-size:12px">${t('no_ai')}</div>`;
        // Knowledge RAM recent
        const kb=await api('/api/memory?limit=5&space=knowledge_ram');
        document.getElementById('kb-recent').innerHTML=kb.memories.length?`<table><tr><th>${t('th_content')}</th><th>${t('th_category')}</th></tr>${kb.memories.map(m=>`<tr><td>${m.content.slice(0,70)}${m.content.length>70?'...':''}</td><td>${m.category}</td></tr>`).join('')}</table>`:`<div style="padding:14px;color:var(--td);font-size:12px">${t('no_kb')}</div>`;
    }catch(e){console.error(e)}
}

// === AI LEARNING ===
async function loadAI(){
    try{
        const all=await api('/api/memory?limit=200&space=ai_learning');
        let aiCount=all.memories.length;
        document.getElementById('ai-stats').innerHTML=`<div class="cd"><div class="lb">${t('mem_total')}</div><div class="vl bl">${aiCount}</div></div><div class="cd"><div class="lb">${t('mem_active')}</div><div class="vl g">${aiCount}</div></div>`;
        if(!all.memories.length){document.getElementById('ai-list').innerHTML=`<div style="padding:20px;color:var(--td);font-size:13px">${t('no_ai')}</div>`;return}
        document.getElementById('ai-list').innerHTML=`<table><tr><th>${t('th_content')}</th><th>${t('th_category')}</th><th>${t('th_importance')}</th><th>${t('th_space')}</th><th>${t('th_action')}</th></tr>${all.memories.map(m=>`<tr><td>${m.content.slice(0,60)}${m.content.length>60?'...':''}</td><td>${m.category}</td><td>${m.importance.toFixed(2)}</td><td>${m.space}</td><td><button class="bt bd bs" onclick="fgM('${m.id}','ai')">${t('btn_forget')}</button></td></tr>`).join('')}</table>`;
    }catch(e){console.error(e)}
}

// === KNOWLEDGE RAM ===
async function loadKB(){
    try{
        const all=await api('/api/memory?limit=200&space=knowledge_ram');
        let kbCount=all.memories.length;
        document.getElementById('kb-stats').innerHTML=`<div class="cd"><div class="lb">${t('mem_total')}</div><div class="vl cy">${kbCount}</div></div><div class="cd"><div class="lb">${t('mem_active')}</div><div class="vl g">${kbCount}</div></div>`;
        if(!all.memories.length){document.getElementById('kb-list').innerHTML=`<div style="padding:20px;color:var(--td);font-size:13px">${t('no_kb')}</div>`;return}
        document.getElementById('kb-list').innerHTML=`<table><tr><th>${t('th_content')}</th><th>${t('th_category')}</th><th>${t('th_importance')}</th><th>${t('th_space')}</th><th>${t('th_action')}</th></tr>${all.memories.map(m=>`<tr><td>${m.content.slice(0,60)}${m.content.length>60?'...':''}</td><td>${m.category}</td><td>${m.importance.toFixed(2)}</td><td>${m.space}</td><td><button class="bt bd bs" onclick="fgM('${m.id}','kb')">${t('btn_forget')}</button></td></tr>`).join('')}</table>`;
    }catch(e){console.error(e)}
}

async function fgM(id,from){
    try{await api('/api/memory/'+id+'/forget',{method:'POST'});tst(lang==='es'?'Memoria olvidada':'Memory forgotten');if(from==='ai')loadAI();else if(from==='kb')loadKB();else loadMem()}catch(e){tst('Error: '+e.message)}
}

// === SEARCH ===
async function doS(){
    const q=document.getElementById('si').value;if(!q)return;
    document.getElementById('sres').innerHTML='<div style="padding:16px"><div class="sp"></div> '+t('loading')+'</div>';
    try{
        const d=await api('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,limit:10})});
        if(!d.results.length){document.getElementById('sres').innerHTML=`<div style="padding:16px;color:var(--td)">${t('search_no_results')}</div>`;return}
        document.getElementById('sres').innerHTML=d.results.map(r=>`<div class="sr"><div class="sc">${t('th_score')}: ${r.similarity.toFixed(4)} | ${t('th_space')}: ${r.space}</div><div class="ct">${r.content}</div><div class="mt">${t('th_source')}: ${r.source_name||'?'} | ${d.latency_ms}ms</div></div>`).join('');
    }catch(e){document.getElementById('sres').innerHTML=`<div style="color:var(--r)">Error: ${e.message}</div>`}
}
document.getElementById('si')?.addEventListener('keydown',e=>{if(e.key==='Enter')doS()});

// === INGEST ===
async function doI(){
    const c=document.getElementById('ic').value;if(!c)return;
    const fd=new FormData();
    fd.append('content',c);
    fd.append('source_name',document.getElementById('isn').value);
    fd.append('space',document.getElementById('isp').value);
    document.getElementById('ires').innerHTML='<div class="sp"></div> '+t('loading');
    try{
        const d=await api('/api/documents/ingest/text',{method:'POST',body:fd});
        document.getElementById('ires').innerHTML=`<div style="color:var(--g)">${t('ingested')} ${d.chunks_created} ${lang==='es'?'fragmentos':'chunks'}, ${d.entities_found} ${lang==='es'?'entidades':'entities'}</div>`;
        document.getElementById('ic').value='';tst(lang==='es'?'¡Contenido ingerido!':'Content ingested!');
    }catch(e){document.getElementById('ires').innerHTML=`<div style="color:var(--r)">Error: ${e.message}</div>`}
}

// === CHAT ===
async function doC(){
    const inp=document.getElementById('cin');const q=inp.value.trim();if(!q)return;inp.value='';
    const u=document.createElement('div');u.className='mg usr';u.innerHTML=`<div class="bb">${q}</div>`;document.getElementById('cmsg').appendChild(u);
    const r=document.createElement('div');r.className='mg as';r.innerHTML='<div class="bb"><div class="sp"></div> '+t('loading')+'</div>';document.getElementById('cmsg').appendChild(r);
    try{
        const d=await api('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q,history:cH})});
        let src='';if(d.sources&&d.sources.length){src='<div class="src">'+(lang==='es'?'Fuentes:':'Sources: ')+d.sources.map(s=>`[${s.index}] ${s.source_name||'?'}`).join(', ')+'</div>'}
        r.innerHTML=`<div class="bb">${d.answer||'No answer.'}</div>${src}`;
        cH.push({role:'user',content:q},{role:'assistant',content:d.answer||''});
    }catch(e){r.innerHTML=`<div class="bb" style="color:var(--r)">Error: ${e.message}</div>`}
    document.getElementById('cmsg').scrollTop=document.getElementById('cmsg').scrollHeight;
}

// === GRAPH ===
async function loadGr(){
    try{
        const d=await api('/api/graph/visualize?limit=100&min_mentions=1');
        if(!d.nodes.length){document.getElementById('ge').style.display='block';return}
        document.getElementById('ge').style.display='none';drawGr(d);
    }catch(e){console.error(e)}
}
function drawGr(data){
    const cv=document.getElementById('gcv');const cx2=cv.getContext('2d');const con=document.getElementById('gcon');
    cv.width=con.clientWidth;cv.height=con.clientHeight;
    const cx=cv.width/2,cy=cv.height/2;
    const cl={Person:'#22c55e',Organization:'#3b82f6',Technology:'#6366f1',Concept:'#eab308',Tool:'#f97316',Event:'#ef4444',Location:'#06b6d4',Other:'#888'};
    const ns=data.nodes.map((n,i)=>{const a=(2*Math.PI*i)/data.nodes.length;const r2=130+Math.random()*40;return{...n,x:cx+r2*Math.cos(a),y:cy+r2*Math.sin(a),vx:0,vy:0}});
    const nm={};ns.forEach(n=>nm[n.id]=n);
    const es=data.edges.filter(e=>nm[e.source]&&nm[e.target]);
    for(let it=0;it<80;it++){
        for(let i=0;i<ns.length;i++){for(let j=i+1;j<ns.length;j++){let dx=ns[j].x-ns[i].x,dy=ns[j].y-ns[i].y,di=Math.sqrt(dx*dx+dy*dy)||1,f=1800/(di*di);ns[i].vx-=(dx/di)*f;ns[i].vy-=(dy/di)*f;ns[j].vx+=(dx/di)*f;ns[j].vy+=(dy/di)*f}}
        es.forEach(e=>{const a=nm[e.source],b=nm[e.target];if(!a||!b)return;let dx=b.x-a.x,dy=b.y-a.y,di=Math.sqrt(dx*dx+dy*dy)||1,f=(di-90)*.01;a.vx+=(dx/di)*f;a.vy+=(dy/di)*f;b.vx-=(dx/di)*f;b.vy-=(dy/di)*f});
        ns.forEach(n=>{n.vx+=(cx-n.x)*.001;n.vy+=(cy-n.y)*.001;n.x+=n.vx*.3;n.y+=n.vy*.3;n.vx*=.8;n.vy*=.8})
    }
    cx2.clearRect(0,0,cv.width,cv.height);
    es.forEach(e=>{const a=nm[e.source],b=nm[e.target];if(!a||!b)return;cx2.beginPath();cx2.moveTo(a.x,a.y);cx2.lineTo(b.x,b.y);cx2.strokeStyle='rgba(99,102,241,.2)';cx2.lineWidth=1;cx2.stroke()});
    ns.forEach(n=>{const r2=Math.max(4,Math.min(14,n.mentions*2));const co=cl[n.type]||cl.Other;cx2.beginPath();cx2.arc(n.x,n.y,r2,0,Math.PI*2);cx2.fillStyle=co;cx2.fill();cx2.strokeStyle='rgba(255,255,255,.3)';cx2.lineWidth=1;cx2.stroke();cx2.fillStyle='#ccc';cx2.font='9px Inter,sans-serif';cx2.textAlign='center';cx2.fillText(n.name,n.x,n.y+r2+11)});
}

// === INIT ===
async function init(){
    try{
        const h=await api('/health');
        document.getElementById('st').innerHTML=`<div class="d"></div> <span>${t('connected')}${h.version})</span>`;
        applyLang();loadDash();
    }catch(e){document.getElementById('st').innerHTML=`<div class="d" style="background:var(--r)"></div> <span>${t('disconnected')}</span>`}
}
init();
</script>
</body>
</html>"""
