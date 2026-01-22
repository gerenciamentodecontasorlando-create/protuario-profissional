/* =========================================================
   AGENDA INTELIGENTE (offline-first)
   Preto + Verde | Agenda + Prontuário + Impressos
   Autosave + Backup JSON
   ========================================================= */

const $ = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));

/* ---------- util ---------- */
const uid = ()=> Math.random().toString(16).slice(2) + Date.now().toString(16);
const ymd = (d=new Date())=>{
  const x = new Date(d);
  const y = x.getFullYear();
  const m = String(x.getMonth()+1).padStart(2,"0");
  const da = String(x.getDate()).padStart(2,"0");
  return `${y}-${m}-${da}`;
};
const nowHm = ()=>{
  const d = new Date();
  return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
};
function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(()=>t.classList.remove("show"), 2200);
}

/* ---------- storage (localStorage) ---------- */
const KEY = "AI_DB_v1";
function loadDB(){
  try{
    const raw = localStorage.getItem(KEY);
    if(!raw) return null;
    return JSON.parse(raw);
  }catch(e){ return null; }
}
function saveDB(db){
  localStorage.setItem(KEY, JSON.stringify(db));
  $("#autosavePill").textContent = "Autosave ✓";
  setTimeout(()=> $("#autosavePill").textContent = "Autosave", 1200);
}

/* ---------- default db ---------- */
const DB = loadDB() || {
  meta: { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  settings: {
    clinicName: "Agenda Inteligente",
    professionalName: "",
    crocrm: "",
    phone: "",
    address: "",
    city: ""
  },
  ui: { activeView: "agenda", activePatientId: null },
  patients: [], // {id, name, phone, birth, notes, createdAt, updatedAt}
  appointments: [], // {id, date, time, patientId, title, status, notes, createdAt, updatedAt}
  encounters: [], // {id, patientId, date, chief, anamnesis, exam, diagnosis, plan, updatedAt, createdAt}
  budgets: [], // {id, patientId, date, text, updatedAt, createdAt}
  notes: { freeText: "" }
};

/* ---------- meds presets ---------- */
const MEDS = {
  analgesicos: [
    "Dipirona 500mg (1 comp 6/6h se dor)",
    "Paracetamol 750mg (1 comp 6/6h se dor)",
    "Ibuprofeno 400mg (1 comp 8/8h se dor) (avaliar contraindicações)"
  ],
  antiinflamatorios: [
    "Ibuprofeno 600mg (1 comp 8/8h por 3 dias)",
    "Nimesulida 100mg (1 comp 12/12h por 3 dias)",
    "Diclofenaco 50mg (1 comp 8/8h por 3 dias)"
  ],
  antibioticos: [
    "Amoxicilina 500mg (1 comp 8/8h por 7 dias)",
    "Clavulin® / Amoxicilina+Clavulanato 875/125mg (1 comp 12/12h por 7 dias)",
    "Cefalexina 500mg (1 comp 6/6h por 7 dias)"
  ],
  antihipertensivos: [
    "Losartana 50mg (1 comp 12/12h) — confirmar prescrição prévia",
    "Amlodipino 5mg (1 comp/dia) — confirmar prescrição prévia",
    "Hidroclorotiazida 25mg (1 comp/dia) — confirmar prescrição prévia"
  ],
  antifungicos: [
    "Nistatina suspensão (bochechar 4x/dia por 7–14 dias)",
    "Fluconazol 150mg (dose única) — avaliar indicação",
    "Miconazol gel oral (3x/dia por 7–14 dias)"
  ],
  antidiabeticos: [
    "Metformina 500mg (1 comp 12/12h) — confirmar prescrição prévia",
    "Glibenclamida 5mg (1 comp/dia) — confirmar prescrição prévia",
    "Insulina (conforme esquema) — confirmar prescrição prévia"
  ],
  antiparasitarios: [
    "Albendazol 400mg (dose única) — conforme indicação",
    "Ivermectina (dose conforme peso) — conforme indicação",
    "Metronidazol 250mg (1 comp 8/8h por 7 dias) — conforme indicação"
  ]
};

/* ---------- app state ---------- */
const state = {
  view: DB.ui.activeView || "agenda",
  activePatientId: DB.ui.activePatientId || null,
  search: ""
};

/* ---------- PWA ---------- */
if("serviceWorker" in navigator){
  navigator.serviceWorker.register("./sw.js").catch(()=>{});
}
function setStatus(){
  $("#statusPill").textContent = navigator.onLine ? "ONLINE" : "OFFLINE";
}
window.addEventListener("online", setStatus);
window.addEventListener("offline", setStatus);
setStatus();

/* ---------- navigation ---------- */
$$(".navBtn").forEach(btn=>{
  btn.addEventListener("click", ()=>{
    $$(".navBtn").forEach(b=>b.classList.remove("active"));
    btn.classList.add("active");
    state.view = btn.dataset.view;
    DB.ui.activeView = state.view;
    saveDB(Object.assign(DB,{ meta: { ...DB.meta, updatedAt: new Date().toISOString() } }));
    render();
    if(window.innerWidth < 980) $("#sidebar").classList.remove("open");
  });
});

$("#menuBtn").addEventListener("click", ()=> $("#sidebar").classList.toggle("open"));

$("#globalSearch").addEventListener("input", (e)=>{
  state.search = e.target.value.trim().toLowerCase();
  render();
});

/* ---------- backup ---------- */
$("#exportBtn").addEventListener("click", ()=>{
  DB.meta.updatedAt = new Date().toISOString();
  saveDB(DB);
  const payload = { app:"Agenda Inteligente", version:1, exportedAt:new Date().toISOString(), db: DB };
  const stamp = new Date().toISOString().slice(0,19).replace(/[:T]/g,"-");
  const blob = new Blob([JSON.stringify(payload,null,2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agenda-inteligente-backup-${stamp}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast("Backup exportado ✅");
});
$("#importBtn").addEventListener("click", ()=> $("#importFile").click());
$("#importFile").addEventListener("change", async (e)=>{
  const f = e.target.files && e.target.files[0];
  if(!f) return;
  try{
    const text = await f.text();
    const payload = JSON.parse(text);
    if(!payload || !payload.db) throw new Error("backup inválido");
    localStorage.setItem(KEY, JSON.stringify(payload.db));
    toast("Backup restaurado ✅");
    setTimeout(()=> location.reload(), 600);
  }catch(err){
    toast("Falha ao restaurar ❌");
  }finally{
    e.target.value = "";
  }
});

/* ---------- helpers ---------- */
function getPatient(id){ return DB.patients.find(p=>p.id===id) || null; }
function setActivePatient(id){
  state.activePatientId = id;
  DB.ui.activePatientId = id;
  saveDB(DB);
  render();
}
function filteredPatients(){
  if(!state.search) return DB.patients;
  return DB.patients.filter(p=>{
    const s = `${p.name||""} ${p.phone||""}`.toLowerCase();
    return s.includes(state.search);
  });
}
function filteredAppointments(){
  const items = DB.appointments.slice().sort((a,b)=>{
    const ak = `${a.date} ${a.time||"00:00"}`;
    const bk = `${b.date} ${b.time||"00:00"}`;
    return ak.localeCompare(bk);
  });
  if(!state.search) return items;
  return items.filter(a=>{
    const p = getPatient(a.patientId);
    const s = `${a.title||""} ${a.date||""} ${(p?.name)||""}`.toLowerCase();
    return s.includes(state.search);
  });
}
function upMeta(x){
  x.updatedAt = new Date().toISOString();
  DB.meta.updatedAt = x.updatedAt;
}

/* ---------- printing ---------- */
$("#printQuickBtn").addEventListener("click", ()=>{
  const html = buildPrintHTML();
  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(()=> w.print(), 400);
});

function buildPrintHTML(){
  const p = state.activePatientId ? getPatient(state.activePatientId) : null;
  const appts = filteredAppointments().filter(a=>!p || a.patientId===p.id).slice(-30);
  const encs = DB.encounters.filter(e=>!p || e.patientId===p.id).slice(-10);
  const bud = DB.budgets.filter(b=>!p || b.patientId===p.id).slice(-1)[0];

  const settings = DB.settings;
  const head = `
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width,initial-scale=1"/>
    <title>Impressão • Agenda Inteligente</title>
    <style>
      ${document.querySelector("style")?.innerHTML || ""}
      ${Array.from(document.styleSheets)
        .filter(ss=>ss.href===null)
        .map(ss=>{
          try{ return Array.from(ss.cssRules).map(r=>r.cssText).join("\n"); }catch(e){ return ""; }
        }).join("\n")
      }
      body{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; }
      .printSheet{ border:3px solid #12b955; border-radius:22px; padding:14px; }
      .printBlock{ border:2px solid rgba(18,185,85,.9); border-radius:18px; padding:12px; margin:10px 0; break-inside:avoid; page-break-inside:avoid; }
      .printTitle{ font-weight:900; margin:0 0 8px 0; }
      .small{ font-size:12px; opacity:.85; }
      table{ width:100%; border-collapse:collapse; }
      td,th{ border-bottom:1px solid rgba(18,185,85,.35); padding:8px; text-align:left; font-size:13px; }
      th{ font-weight:900; }
      @media print{ .noPrint{display:none} }
    </style>
  </head>`;

  const body = `
  <body>
    <div class="printSheet">
      <div class="printBlock">
        <div class="printTitle">${settings.clinicName || "Agenda Inteligente"}</div>
        <div class="small">
          Profissional: ${settings.professionalName || "—"} • Registro: ${settings.crocrm || "—"}<br/>
          Contato: ${settings.phone || "—"} • Endereço: ${settings.address || "—"} • Cidade: ${settings.city || "—"}<br/>
          Gerado em: ${new Date().toLocaleString("pt-BR")}
        </div>
      </div>

      <div class="printBlock">
        <div class="printTitle">Paciente</div>
        <div>Nome: <b>${p?.name || "— (nenhum selecionado)"}</b></div>
        <div>Telefone: ${p?.phone || "—"} • Nascimento: ${p?.birth || "—"}</div>
        <div>Observações: ${p?.notes || "—"}</div>
      </div>

      <div class="printBlock">
        <div class="printTitle">Agenda (últimos)</div>
        <table>
          <thead><tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Título</th><th>Status</th></tr></thead>
          <tbody>
            ${appts.map(a=>{
              const pp = getPatient(a.patientId);
              return `<tr><td>${a.date}</td><td>${a.time||""}</td><td>${pp?.name||""}</td><td>${a.title||""}</td><td>${a.status||""}</td></tr>`;
            }).join("") || `<tr><td colspan="5">—</td></tr>`}
          </tbody>
        </table>
      </div>

      <div class="printBlock">
        <div class="printTitle">Prontuário (últimos atendimentos)</div>
        ${encs.map(e=>`
          <div style="margin-bottom:10px; break-inside:avoid; page-break-inside:avoid;">
            <div><b>Data:</b> ${e.date}</div>
            <div><b>Queixa:</b> ${e.chief || "—"}</div>
            <div><b>Anamnese:</b> ${e.anamnesis || "—"}</div>
            <div><b>Exame:</b> ${e.exam || "—"}</div>
            <div><b>Diagnóstico:</b> ${e.diagnosis || "—"}</div>
            <div><b>Plano:</b> ${e.plan || "—"}</div>
          </div>
        `).join("") || "—"}
      </div>

      <div class="printBlock">
        <div class="printTitle">Orçamento</div>
        <div>${bud?.text ? bud.text.replace(/\n/g,"<br/>") : "—"}</div>
      </div>
    </div>
  </body>`;
  return `<!doctype html><html lang="pt-BR">${head}${body}</html>`;
}

/* ---------- views ---------- */
function setHeader(title, subtitle){
  $("#viewTitle").textContent = title;
  $("#viewSubtitle").textContent = subtitle || "";
}

function viewAgenda(){
  setHeader("Agenda", "marcar, confirmar e registrar retorno");

  const items = filteredAppointments();
  const today = ymd();

  return `
    <div class="grid two">
      <div class="card">
        <div class="cardTitle">
          <span>Novo agendamento</span>
          <span class="badge">${today}</span>
        </div>

        <div class="row">
          <div class="field">
            <label>Data</label>
            <input id="a_date" type="date" value="${today}">
          </div>
          <div class="field">
            <label>Hora</label>
            <input id="a_time" type="time" value="${nowHm()}">
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label>Paciente</label>
            <select id="a_patient">
              <option value="">— selecionar —</option>
              ${DB.patients.map(p=>`<option value="${p.id}" ${p.id===state.activePatientId?"selected":""}>${p.name}</option>`).join("")}
            </select>
          </div>

          <div class="field">
            <label>Título</label>
            <input id="a_title" placeholder="Ex: retorno / urgência / limpeza...">
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label>Status</label>
            <select id="a_status">
              <option>Agendado</option>
              <option>Confirmado</option>
              <option>Chegou</option>
              <option>Atendido</option>
              <option>Faltou</option>
              <option>Remarcado</option>
            </select>
          </div>
          <div class="field">
            <label>Observações</label>
            <input id="a_notes" placeholder="Ex: dor, medicação, alergia...">
          </div>
        </div>

        <div class="actions">
          <button class="smallBtn" id="addApptBtn">Salvar agendamento</button>
          <button class="smallBtn" id="goPatientBtn">Abrir paciente</button>
        </div>
      </div>

      <div class="card">
        <div class="cardTitle">
          <span>Agenda</span>
          <span class="muted">clique para selecionar paciente</span>
        </div>

        <table class="table">
          <thead>
            <tr><th>Data</th><th>Hora</th><th>Paciente</th><th>Título</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            ${
              items.map(a=>{
                const p = getPatient(a.patientId);
                return `
                  <tr>
                    <td>${a.date}</td>
                    <td>${a.time||""}</td>
                    <td><b>${p?.name||"—"}</b></td>
                    <td>${a.title||""}</td>
                    <td><span class="badge">${a.status||""}</span></td>
                    <td>
                      <button class="smallBtn" data-open="${a.patientId||""}">Selecionar</button>
                      <button class="smallBtn" data-delappt="${a.id}">Del</button>
                    </td>
                  </tr>
                `;
              }).join("") || `<tr><td colspan="6">—</td></tr>`
            }
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function viewPatients(){
  setHeader("Pacientes", "cadastro rápido + seleção para prontuário");

  const pts = filteredPatients().slice().sort((a,b)=> (a.name||"").localeCompare(b.name||""));

  const active = state.activePatientId ? getPatient(state.activePatientId) : null;

  return `
    <div class="grid two">
      <div class="card">
        <div class="cardTitle"><span>Novo paciente</span><span class="muted">autosave</span></div>

        <div class="row">
          <div class="field">
            <label>Nome</label>
            <input id="p_name" placeholder="Nome completo">
          </div>
          <div class="field">
            <label>Telefone</label>
            <input id="p_phone" placeholder="(xx) xxxxx-xxxx">
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label>Nascimento</label>
            <input id="p_birth" type="date">
          </div>
          <div class="field">
            <label>Observações</label>
            <input id="p_notes" placeholder="Ex: HAS, DM, alergia...">
          </div>
        </div>

        <div class="actions">
          <button class="smallBtn" id="addPatientBtn">Salvar</button>
        </div>

        <div style="margin-top:10px" class="muted">
          Selecionado: <b>${active?.name || "—"}</b>
        </div>
      </div>

      <div class="card">
        <div class="cardTitle"><span>Lista</span><span class="muted">${pts.length} paciente(s)</span></div>

        <table class="table">
          <thead><tr><th>Nome</th><th>Telefone</th><th></th></tr></thead>
          <tbody>
            ${pts.map(p=>`
              <tr>
                <td><b>${p.name}</b></td>
                <td>${p.phone||""}</td>
                <td class="actions">
                  <button class="smallBtn" data-sel="${p.id}">Selecionar</button>
                  <button class="smallBtn" data-delpat="${p.id}">Del</button>
                </td>
              </tr>
            `).join("") || `<tr><td colspan="3">—</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function viewChart(){
  setHeader("Ficha Clínica", "prontuário atualizado automaticamente a cada visita");

  const p = state.activePatientId ? getPatient(state.activePatientId) : null;
  const encs = DB.encounters.filter(e=>e.patientId===state.activePatientId).slice().sort((a,b)=> (a.date||"").localeCompare(b.date||""));

  if(!p){
    return `
      <div class="card">
        <div class="cardTitle">Nenhum paciente selecionado</div>
        <div class="muted">Vá em <b>Pacientes</b> e clique em <b>Selecionar</b>.</div>
      </div>
    `;
  }

  return `
    <div class="grid two">
      <div class="card">
        <div class="cardTitle">
          <span>Novo atendimento • ${p.name}</span>
          <span class="badge">${ymd()}</span>
        </div>

        <div class="row">
          <div class="field">
            <label>Data</label>
            <input id="e_date" type="date" value="${ymd()}">
          </div>
          <div class="field">
            <label>Queixa principal</label>
            <input id="e_chief" placeholder="Ex: dor em dente 36 há 2 dias">
          </div>
        </div>

        <div class="field">
          <label>Anamnese</label>
          <textarea id="e_anam" placeholder="História, alergias, comorbidades, medicações..."></textarea>
        </div>

        <div class="field">
          <label>Exame clínico</label>
          <textarea id="e_exam" placeholder="Achados..."></textarea>
        </div>

        <div class="field">
          <label>Diagnóstico</label>
          <textarea id="e_diag" placeholder="Hipótese / diagnóstico..."></textarea>
        </div>

        <div class="field">
          <label>Conduta / Plano</label>
          <textarea id="e_plan" placeholder="Procedimentos, orientações, retorno..."></textarea>
        </div>

        <div class="actions">
          <button class="smallBtn" id="saveEncounterBtn">Salvar atendimento</button>
          <button class="smallBtn" id="goDocsBtn">Ir para Impressos</button>
        </div>
      </div>

      <div class="card">
        <div class="cardTitle"><span>Histórico</span><span class="muted">${encs.length} registro(s)</span></div>

        <table class="table">
          <thead><tr><th>Data</th><th>Queixa</th><th></th></tr></thead>
          <tbody>
            ${
              encs.map(e=>`
                <tr>
                  <td>${e.date}</td>
                  <td>${(e.chief||"").slice(0,60)}</td>
                  <td>
                    <button class="smallBtn" data-openenc="${e.id}">Ver</button>
                    <button class="smallBtn" data-delenc="${e.id}">Del</button>
                  </td>
                </tr>
              `).join("") || `<tr><td colspan="3">—</td></tr>`
            }
          </tbody>
        </table>

        <div id="encPreview" style="margin-top:10px"></div>
      </div>
    </div>
  `;
}

function medsPickerBlock(idPrefix, title, list, allowTwo=false){
  const opts = list.map((x,i)=> `<option value="${x.replace(/"/g,'&quot;')}">${x}</option>`).join("");
  return `
  <div class="card" style="margin-bottom:12px">
    <div class="cardTitle"><span>${title}</span><span class="muted">selecionar + editar</span></div>

    <div class="row">
      <div class="field">
        <label>${allowTwo ? "Escolha 1" : "Escolha"}</label>
        <select id="${idPrefix}_1">
          <option value="">—</option>
          ${opts}
        </select>
      </div>

      ${allowTwo ? `
      <div class="field">
        <label>Escolha 2</label>
        <select id="${idPrefix}_2">
          <option value="">—</option>
          ${opts}
        </select>
      </div>` : ""}

      <div class="field">
        <label>Texto livre (se quiser escrever por conta)</label>
        <input id="${idPrefix}_free" placeholder="Escreva a prescrição aqui...">
      </div>
    </div>

    <div class="actions">
      <button class="smallBtn" data-addmed="${idPrefix}">Adicionar ao receituário</button>
    </div>
  </div>`;
}

function viewDocs(){
  setHeader("Impressos", "receituário inteligente • orçamento • atestado");

  const p = state.activePatientId ? getPatient(state.activePatientId) : null;
  const budget = DB.budgets.find(b=>b.patientId===state.activePatientId) || null;

  const patientLine = p ? `<span class="badge">${p.name}</span>` : `<span class="badge">Nenhum paciente</span>`;

  return `
    <div class="card">
      <div class="cardTitle">
        <span>Paciente</span>
        ${patientLine}
      </div>
      <div class="muted">Dica: selecione um paciente para preencher automaticamente.</div>
    </div>

    ${medsPickerBlock("med_analg", "Analgésicos (pode escolher 2)", MEDS.analgesicos, true)}
    ${medsPickerBlock("med_antiinfl", "Anti-inflamatórios (3 tipos)", MEDS.antiinflamatorios, false)}
    ${medsPickerBlock("med_atb", "Antibióticos (Amoxicilina • Clavulin • Cefalexina)", MEDS.antibioticos, false)}
    ${medsPickerBlock("med_ah", "Anti-hipertensivos", MEDS.antihipertensivos, false)}
    ${medsPickerBlock("med_af", "Antifúngicos", MEDS.antifungicos, false)}
    ${medsPickerBlock("med_ad", "Antidiabéticos", MEDS.antidiabeticos, false)}
    ${medsPickerBlock("med_ap", "Antiparasitários", MEDS.antiparasitarios, false)}

    <div class="grid two">
      <div class="card">
        <div class="cardTitle"><span>Receituário</span><span class="muted">texto final</span></div>
        <textarea id="rx_text" placeholder="A lista vai aparecendo aqui..."></textarea>
        <div class="actions" style="margin-top:10px">
          <button class="smallBtn" id="rx_clear">Limpar</button>
          <button class="smallBtn" id="rx_print">Imprimir Receituário</button>
        </div>
      </div>

      <div class="card">
        <div class="cardTitle"><span>Atestado</span><span class="muted">personalizável</span></div>

        <div class="row">
          <div class="field">
            <label>Data</label>
            <input id="att_date" type="date" value="${ymd()}">
          </div>
          <div class="field">
            <label>Dias</label>
            <input id="att_days" type="number" min="0" value="1">
          </div>
        </div>

        <div class="field">
          <label>Texto</label>
          <textarea id="att_text" placeholder="Declaro para os devidos fins que..."></textarea>
        </div>

        <div class="actions">
          <button class="smallBtn" id="att_print">Imprimir Atestado</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="cardTitle"><span>Orçamento</span><span class="muted">editável</span></div>
      <textarea id="budget_text" placeholder="Descreva procedimentos e valores...">${budget?.text||""}</textarea>
      <div class="actions" style="margin-top:10px">
        <button class="smallBtn" id="budget_save">Salvar orçamento</button>
        <button class="smallBtn" id="budget_print">Imprimir orçamento</button>
      </div>
    </div>
  `;
}

function viewNotes(){
  setHeader("Texto Livre", "um bloco pra escrever qualquer coisa");

  return `
    <div class="card">
      <div class="cardTitle"><span>Texto em branco</span><span class="muted">salva automático</span></div>
      <textarea id="freeText" placeholder="Escreva aqui...">${DB.notes.freeText||""}</textarea>
      <div class="muted" style="margin-top:10px">Dica: usa isso como rascunho de condutas, lembretes, protocolos, etc.</div>
    </div>
  `;
}

function viewSettings(){
  setHeader("Configurações", "dados do profissional para puxar nos impressos");

  const s = DB.settings;
  return `
    <div class="card">
      <div class="cardTitle"><span>Profissional</span><span class="muted">vai para os impressos</span></div>

      <div class="grid two">
        <div class="field">
          <label>Nome da clínica</label>
          <input id="set_clinic" value="${s.clinicName||""}">
        </div>
        <div class="field">
          <label>Nome do profissional</label>
          <input id="set_name" value="${s.professionalName||""}">
        </div>
      </div>

      <div class="grid two">
        <div class="field">
          <label>Registro (CRO/CRM)</label>
          <input id="set_reg" value="${s.crocrm||""}">
        </div>
        <div class="field">
          <label>Telefone</label>
          <input id="set_phone" value="${s.phone||""}">
        </div>
      </div>

      <div class="grid two">
        <div class="field">
          <label>Endereço</label>
          <input id="set_addr" value="${s.address||""}">
        </div>
        <div class="field">
          <label>Cidade</label>
          <input id="set_city" value="${s.city||""}">
        </div>
      </div>

      <div class="actions">
        <button class="smallBtn" id="saveSettingsBtn">Salvar</button>
      </div>
    </div>
  `;
}

function render(){
  const content = $("#content");
  if(state.view==="agenda") content.innerHTML = viewAgenda();
  else if(state.view==="patients") content.innerHTML = viewPatients();
  else if(state.view==="chart") content.innerHTML = viewChart();
  else if(state.view==="docs") content.innerHTML = viewDocs();
  else if(state.view==="notes") content.innerHTML = viewNotes();
  else if(state.view==="settings") content.innerHTML = viewSettings();
  else content.innerHTML = `<div class="card">Em construção</div>`;

  bindViewEvents();
}

/* ---------- binding events per view ---------- */
function bindViewEvents(){
  /* Agenda */
  const addApptBtn = $("#addApptBtn");
  if(addApptBtn){
    addApptBtn.onclick = ()=>{
      const date = $("#a_date").value;
      const time = $("#a_time").value;
      const patientId = $("#a_patient").value;
      const title = $("#a_title").value.trim();
      const status = $("#a_status").value;
      const notes = $("#a_notes").value.trim();

      if(!date) return toast("Data obrigatória");
      if(!patientId) return toast("Selecione um paciente");
      const ap = { id: uid(), date, time, patientId, title, status, notes, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      DB.appointments.push(ap);
      upMeta(ap);
      saveDB(DB);
      toast("Agendamento salvo ✅");
      setActivePatient(patientId);
    };
  }
  const goPatientBtn = $("#goPatientBtn");
  if(goPatientBtn){
    goPatientBtn.onclick = ()=>{
      const pid = $("#a_patient").value;
      if(pid) setActivePatient(pid);
      state.view = "patients";
      DB.ui.activeView = "patients";
      saveDB(DB);
      $$(".navBtn").forEach(b=>b.classList.toggle("active", b.dataset.view==="patients"));
      render();
    };
  }
  $$("[data-open]").forEach(btn=>{
    btn.onclick = ()=> setActivePatient(btn.getAttribute("data-open"));
  });
  $$("[data-delappt]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-delappt");
      DB.appointments = DB.appointments.filter(a=>a.id!==id);
      upMeta(DB.meta);
      saveDB(DB);
      render();
      toast("Agendamento removido");
    };
  });

  /* Patients */
  const addPatientBtn = $("#addPatientBtn");
  if(addPatientBtn){
    addPatientBtn.onclick = ()=>{
      const name = $("#p_name").value.trim();
      const phone = $("#p_phone").value.trim();
      const birth = $("#p_birth").value;
      const notes = $("#p_notes").value.trim();
      if(!name) return toast("Nome obrigatório");
      const p = { id: uid(), name, phone, birth, notes, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
      DB.patients.push(p);
      upMeta(p);
      saveDB(DB);
      toast("Paciente salvo ✅");
      setActivePatient(p.id);
    };
  }
  $$("[data-sel]").forEach(btn=>{
    btn.onclick = ()=> setActivePatient(btn.getAttribute("data-sel"));
  });
  $$("[data-delpat]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-delpat");
      DB.patients = DB.patients.filter(p=>p.id!==id);
      DB.appointments = DB.appointments.filter(a=>a.patientId!==id);
      DB.encounters = DB.encounters.filter(e=>e.patientId!==id);
      DB.budgets = DB.budgets.filter(b=>b.patientId!==id);
      if(state.activePatientId===id) setActivePatient(null);
      saveDB(DB);
      toast("Paciente removido");
      render();
    };
  });

  /* Chart */
  const saveEncounterBtn = $("#saveEncounterBtn");
  if(saveEncounterBtn){
    saveEncounterBtn.onclick = ()=>{
      if(!state.activePatientId) return toast("Selecione um paciente");
      const e = {
        id: uid(),
        patientId: state.activePatientId,
        date: $("#e_date").value || ymd(),
        chief: $("#e_chief").value.trim(),
        anamnesis: $("#e_anam").value.trim(),
        exam: $("#e_exam").value.trim(),
        diagnosis: $("#e_diag").value.trim(),
        plan: $("#e_plan").value.trim(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      DB.encounters.push(e);
      upMeta(e);
      saveDB(DB);
      toast("Atendimento salvo ✅ (prontuário atualizado)");
      render();
    };
  }
  $$("[data-openenc]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-openenc");
      const e = DB.encounters.find(x=>x.id===id);
      if(!e) return;
      $("#encPreview").innerHTML = `
        <div class="card" style="margin-top:10px">
          <div class="cardTitle"><span>Prévia • ${e.date}</span><span class="muted">${getPatient(e.patientId)?.name||""}</span></div>
          <div><b>Queixa:</b> ${e.chief||"—"}</div>
          <div><b>Anamnese:</b> ${e.anamnesis||"—"}</div>
          <div><b>Exame:</b> ${e.exam||"—"}</div>
          <div><b>Diagnóstico:</b> ${e.diagnosis||"—"}</div>
          <div><b>Plano:</b> ${e.plan||"—"}</div>
        </div>
      `;
    };
  });
  $$("[data-delenc]").forEach(btn=>{
    btn.onclick = ()=>{
      const id = btn.getAttribute("data-delenc");
      DB.encounters = DB.encounters.filter(e=>e.id!==id);
      saveDB(DB);
      toast("Registro removido");
      render();
    };
  });
  const goDocsBtn = $("#goDocsBtn");
  if(goDocsBtn){
    goDocsBtn.onclick = ()=>{
      state.view = "docs";
      DB.ui.activeView = "docs";
      saveDB(DB);
      $$(".navBtn").forEach(b=>b.classList.toggle("active", b.dataset.view==="docs"));
      render();
    };
  }

  /* Docs */
  $$("[data-addmed]").forEach(btn=>{
    btn.onclick = ()=>{
      const prefix = btn.getAttribute("data-addmed");
      const s1 = $(`#${prefix}_1`)?.value || "";
      const s2 = $(`#${prefix}_2`)?.value || "";
      const free = $(`#${prefix}_free`)?.value?.trim() || "";

      const lines = [];
      if(s1) lines.push(`• ${s1}`);
      if(s2) lines.push(`• ${s2}`);
      if(free) lines.push(`• ${free}`);

      if(!lines.length) return toast("Nada selecionado");

      const area = $("#rx_text");
      area.value = (area.value ? area.value.trim() + "\n" : "") + lines.join("\n") + "\n";
      // autosave simples: guarda no DB.notes também
      DB.notes.rxDraft = area.value;
      saveDB(DB);
      toast("Adicionado ao receituário ✅");
    };
  });

  const rx = $("#rx_text");
  if(rx){
    rx.value = DB.notes.rxDraft || rx.value || "";
    rx.addEventListener("input", ()=>{
      DB.notes.rxDraft = rx.value;
      saveDB(DB);
    });
  }
  const rx_clear = $("#rx_clear");
  if(rx_clear){
    rx_clear.onclick = ()=>{
      if(rx) rx.value = "";
      DB.notes.rxDraft = "";
      saveDB(DB);
      toast("Receituário limpo");
    };
  }
  const rx_print = $("#rx_print");
  if(rx_print){
    rx_print.onclick = ()=> printDoc("Receituário", buildRxHTML());
  }

  const budget_text = $("#budget_text");
  const budget_save = $("#budget_save");
  if(budget_save && budget_text){
    budget_save.onclick = ()=>{
      if(!state.activePatientId) return toast("Selecione um paciente");
      const existing = DB.budgets.find(b=>b.patientId===state.activePatientId);
      if(existing){
        existing.text = budget_text.value;
        upMeta(existing);
      }else{
        const b = { id: uid(), patientId: state.activePatientId, date: ymd(), text: budget_text.value, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        DB.budgets.push(b);
      }
      saveDB(DB);
      toast("Orçamento salvo ✅");
    };
  }
  const budget_print = $("#budget_print");
  if(budget_print){
    budget_print.onclick = ()=> printDoc("Orçamento", buildBudgetHTML());
  }

  const att_print = $("#att_print");
  if(att_print){
    att_print.onclick = ()=> printDoc("Atestado", buildAttHTML());
  }

  /* Notes */
  const freeText = $("#freeText");
  if(freeText){
    freeText.addEventListener("input", ()=>{
      DB.notes.freeText = freeText.value;
      saveDB(DB);
    });
  }

  /* Settings */
  const saveSettingsBtn = $("#saveSettingsBtn");
  if(saveSettingsBtn){
    saveSettingsBtn.onclick = ()=>{
      DB.settings.clinicName = $("#set_clinic").value.trim();
      DB.settings.professionalName = $("#set_name").value.trim();
      DB.settings.crocrm = $("#set_reg").value.trim();
      DB.settings.phone = $("#set_phone").value.trim();
      DB.settings.address = $("#set_addr").value.trim();
      DB.settings.city = $("#set_city").value.trim();
      saveDB(DB);
      toast("Configurações salvas ✅");
    };
  }
}

/* ---------- print templates ---------- */
function printDoc(title, innerHTML){
  const w = window.open("", "_blank");
  w.document.open();
  w.document.write(`
    <!doctype html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8"/>
      <meta name="viewport" content="width=device-width,initial-scale=1"/>
      <title>${title} • Agenda Inteligente</title>
      <style>
        ${Array.from(document.styleSheets).map(ss=>{
          try{ return Array.from(ss.cssRules).map(r=>r.cssText).join("\n"); }catch(e){ return ""; }
        }).join("\n")}
        body{ font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; margin:0; padding:0; }
        .printSheet{ border:3px solid #12b955; border-radius:22px; padding:14px; margin:0; }
        .printBlock{ border:2px solid rgba(18,185,85,.9); border-radius:18px; padding:12px; margin:10px 0; break-inside:avoid; page-break-inside:avoid; }
        .printTitle{ font-weight:900; margin:0 0 8px 0; }
        @media print{
          .noPrint{display:none}
          table, tr, td, th { break-inside: avoid; page-break-inside: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="printSheet">
        ${innerHTML}
      </div>
    </body>
    </html>
  `);
  w.document.close();
  w.focus();
  setTimeout(()=> w.print(), 450);
}

function headerPrintBlock(){
  const s = DB.settings;
  return `
    <div class="printBlock">
      <div class="printTitle">${s.clinicName || "Agenda Inteligente"}</div>
      <div style="font-size:12px; opacity:.9">
        Profissional: ${s.professionalName || "—"} • Registro: ${s.crocrm || "—"}<br/>
        Contato: ${s.phone || "—"} • Endereço: ${s.address || "—"} • Cidade: ${s.city || "—"}<br/>
        Gerado em: ${new Date().toLocaleString("pt-BR")}
      </div>
    </div>
  `;
}

function patientPrintBlock(){
  const p = state.activePatientId ? getPatient(state.activePatientId) : null;
  return `
    <div class="printBlock">
      <div class="printTitle">Paciente</div>
      <div>Nome: <b>${p?.name || "—"}</b></div>
      <div>Telefone: ${p?.phone || "—"} • Nascimento: ${p?.birth || "—"}</div>
      <div>Observações: ${p?.notes || "—"}</div>
    </div>
  `;
}

function buildRxHTML(){
  const txt = (DB.notes.rxDraft || $("#rx_text")?.value || "").trim();
  return `
    ${headerPrintBlock()}
    ${patientPrintBlock()}
    <div class="printBlock">
      <div class="printTitle">Receituário</div>
      <div>${(txt || "—").replace(/\n/g,"<br/>")}</div>
    </div>
  `;
}
function buildBudgetHTML(){
  const p = state.activePatientId ? getPatient(state.activePatientId) : null;
  const bud = DB.budgets.find(b=>b.patientId===state.activePatientId);
  return `
    ${headerPrintBlock()}
    ${patientPrintBlock()}
    <div class="printBlock">
      <div class="printTitle">Orçamento</div>
      <div>${((bud?.text)||"—").replace(/\n/g,"<br/>")}</div>
    </div>
  `;
}
function buildAttHTML(){
  const p = state.activePatientId ? getPatient(state.activePatientId) : null;
  const date = $("#att_date")?.value || ymd();
  const days = $("#att_days")?.value || "0";
  const text = ($("#att_text")?.value || "").trim() ||
    `Declaro para os devidos fins que ${p?.name || "o(a) paciente"} esteve sob atendimento odontológico nesta data, necessitando afastamento por ${days} dia(s).`;

  return `
    ${headerPrintBlock()}
    ${patientPrintBlock()}
    <div class="printBlock">
      <div class="printTitle">Atestado</div>
      <div><b>Data:</b> ${date}</div>
      <div style="margin-top:8px">${text.replace(/\n/g,"<br/>")}</div>
      <div style="margin-top:18px">Assinatura: _________________________________</div>
    </div>
  `;
}

/* ---------- boot ---------- */
(function init(){
  // ajusta nav active
  $$(".navBtn").forEach(b=>b.classList.toggle("active", b.dataset.view===state.view));
  render();
  toast("Pronto ✅ (offline-first)");
})();
