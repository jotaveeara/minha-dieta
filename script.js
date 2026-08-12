/* =========================================================
   ROTINA — JOÃO
   App state, persistence (localStorage) e geração da rotina
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   1. STORAGE
--------------------------------------------------------- */
const STORAGE_KEY = "joaofit_state_v1";

const DEFAULT_STATE = {
  profile: {
    nome: "João",
    idade: 20,
    altura: 1.90,
    pesoInicial: 90,
    inicioTreinos: "2026-08-28",
    metaData: "2027-02-01"
  },
  metas: {
    kcal: 2500,
    proteinaMin: 170,
    proteinaMax: 180,
    gordura: 70,
    aguaMetaMl: 3000
  },
  segundaConfig: { inicio: "08:00", fim: "10:00" },
  reduzirFimDeSemana: false,
  // overrides por data ISO (YYYY-MM-DD), usado principalmente na segunda-feira
  dayOverrides: {},          // { "2026-08-17": { faculdade: true } }
  completions: {},           // { "2026-08-17": { "meal_almoco": true, "treino": true } }
  substitutions: {},         // { "2026-08-17": { "meal_almoco": "patinho" } }
  freeMealUse: {},           // { "2026-w34": { data:"2026-08-17", eventId:"meal_jantar" } }
  water: {},                 // { "2026-08-17": 1500 } (ml)
  weightLog: [],             // [{id,data,peso,cintura,braco,obs}]
  createdAt: todayISO()
};

function todayISO() {
  const d = new Date();
  return isoFromDate(d);
}
function isoFromDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredCloneSafe(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    // merge raso para tolerar novas chaves em versões futuras
    return Object.assign(structuredCloneSafe(DEFAULT_STATE), parsed, {
      profile: Object.assign({}, DEFAULT_STATE.profile, parsed.profile || {}),
      metas: Object.assign({}, DEFAULT_STATE.metas, parsed.metas || {}),
      segundaConfig: Object.assign({}, DEFAULT_STATE.segundaConfig, parsed.segundaConfig || {})
    });
  } catch (e) {
    console.error("Falha ao carregar estado, iniciando novo.", e);
    return structuredCloneSafe(DEFAULT_STATE);
  }
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj));
}

let saveTimer = null;
function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error("Falha ao salvar. Armazenamento pode estar cheio.", e);
      showToast("Não foi possível salvar — armazenamento cheio?");
    }
  }, 120);
}

/* ---------------------------------------------------------
   2. DATE HELPERS
--------------------------------------------------------- */
function getISOWeekKey(d) {
  // retorna algo como "2026-w34"
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-w${weekNo}`;
}

function fmtDateBR(iso) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const WEEKDAY_NAMES = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

/* ---------------------------------------------------------
   3. BIBLIOTECA DE ALIMENTOS / REFEIÇÕES REUTILIZÁVEIS
   Valores de kcal/proteína são estimativas aproximadas,
   não prescrição médica — servem apenas de referência.
--------------------------------------------------------- */
const SUBS_PROTEINA = [
  { id: "frango", nome: "peito de frango (200 g)", kcal: 330, proteina: 62 },
  { id: "patinho", nome: "patinho moído (200 g)", kcal: 340, proteina: 58 },
  { id: "carne_magra", nome: "carne bovina magra (200 g)", kcal: 360, proteina: 56 },
  { id: "tilapia", nome: "tilápia (200 g)", kcal: 260, proteina: 52 }
];

const SUBS_CARBO = [
  { id: "arroz", nome: "arroz (180 g cozido)", kcal: 234, proteina: 4 },
  { id: "macarrao", nome: "macarrão (180 g cozido)", kcal: 270, proteina: 9 },
  { id: "batata", nome: "batata (250 g cozida)", kcal: 215, proteina: 4 },
  { id: "pao", nome: "pão francês (2 unid.)", kcal: 300, proteina: 8 }
];

const SUBS_POSTREINO = [
  { id: "ovos_pao_leite", nome: "3 ovos + 2 pães franceses (ou 4 fatias pão de forma) + 250 ml leite", kcal: 560, proteina: 34 },
  { id: "sanduiche_frango", nome: "sanduíche de pão + frango desfiado + queijo + 250 ml leite", kcal: 520, proteina: 38 }
];

const SUBS_CEIA = [
  { id: "leite_ovos", nome: "250 ml de leite + 2 ovos", kcal: 270, proteina: 20 },
  { id: "sanduiche_frango_ceia", nome: "sanduíche de frango", kcal: 320, proteina: 25 },
  { id: "iogurte_proteico", nome: "iogurte proteico (se disponível)", kcal: 150, proteina: 20 },
  { id: "leite_pao_queijo", nome: "leite + pequena quantidade de pão com queijo", kcal: 300, proteina: 15 }
];

const SUBS_JANTAR = [
  { id: "arroz_carne", nome: "180 g arroz + 180–200 g frango/carne + ovos se necessário", kcal: 680, proteina: 70 },
  { id: "macarrao_carne", nome: "macarrão com carne moída", kcal: 650, proteina: 40 }
];

/* ---------------------------------------------------------
   4. GERADOR DE EVENTOS-BASE (fábricas de refeição)
--------------------------------------------------------- */
function mkMeal({ id, time, title, desc, kcal, proteina, options, icon }) {
  return { id, time, type: "refeicao", title, desc, kcal, proteina, options: options || null, icon: icon || "meal" };
}
function mkTreino({ id, time, title, desc }) {
  return { id, time, type: "treino", title, desc };
}
function mkLembrete({ id, time, title, desc }) {
  return { id, time, type: "lembrete", title, desc };
}
function mkPeriodo({ id, time, title, desc }) {
  return { id, time, type: "periodo", title, desc };
}
function mkSono({ id, time, title, desc }) {
  return { id, time, type: "sono", title, desc };
}

function refeicaoPrincipal(id, time, titulo) {
  return mkMeal({
    id, time, title: titulo,
    desc: "180 g de arroz cozido + 200 g de peito de frango + caldo de feijão sem os caroços (se quiser) + 2 ovos. Água ou refrigerante zero.",
    kcal: 700, proteina: 78,
    options: [...SUBS_PROTEINA]
  });
}

function posTreino(id, time) {
  return mkMeal({
    id, time, title: "Pós-treino",
    desc: "3 ovos + 2 pães franceses (ou 4 fatias de pão de forma) + 250 ml de leite. Refeição com boa quantidade de proteína — é a última grande antes do período presencial.",
    kcal: 560, proteina: 34,
    options: [...SUBS_POSTREINO]
  });
}

function cafeManhaFaculdade(id, time) {
  return mkMeal({
    id, time, title: "Café da manhã",
    desc: "3 ovos + 2 pães franceses (ou 4 fatias de pão de forma) + 250 ml de leite. Alternativa: sanduíche com ovos/frango + leite.",
    kcal: 560, proteina: 34,
    options: [...SUBS_POSTREINO]
  });
}

function maca(id, time, numero) {
  return mkMeal({
    id, time, title: `Maçã ${numero}`,
    desc: "1 maçã + água.",
    kcal: 95, proteina: 0.5,
    icon: "apple"
  });
}

function jantar(id, time) {
  return mkMeal({
    id, time, title: "Jantar",
    desc: "180 g de arroz cozido + 180–200 g de frango ou carne + 1–2 ovos, se necessário para completar a proteína. Evite virar refeição livre só por ser tarde.",
    kcal: 680, proteina: 70,
    options: [...SUBS_JANTAR]
  });
}

function ceia(id, time) {
  return mkMeal({
    id, time, title: "Ceia",
    desc: "Escolha uma opção conforme as calorias que ainda faltam no dia.",
    kcal: 270, proteina: 20,
    options: [...SUBS_CEIA]
  });
}

/* ---------------------------------------------------------
   5. TEMPLATES POR DIA DA SEMANA
   0=domingo … 6=sábado
--------------------------------------------------------- */

// Rotina SEM faculdade (segunda sem aula) — treino 14h-15h
function gerarDiaSemFaculdade() {
  return {
    tipo: "normal",
    isTreino: true,
    eventos: [
      refeicaoPrincipal("meal_almoco", "12:00", "Primeira refeição / Almoço"),
      mkLembrete({ id: "lembrete_pretreino", time: "13:30", title: "Preparação para o treino", desc: "Hidrate-se e evite uma refeição muito pesada imediatamente antes do treino." }),
      mkTreino({ id: "treino", time: "14:00", title: "Academia", desc: "Treino de 14:00 até 15:00." }),
      posTreino("meal_postreino", "15:10"),
      maca("meal_maca1", "18:30", 1),
      maca("meal_maca2", "21:00", 2),
      jantar("meal_jantar", "22:30"),
      ceia("meal_ceia", "00:30"),
      mkLembrete({ id: "fim_trabalho", time: "02:00", title: "Fim do trabalho", desc: "Finalizar o dia, evitar ficar beliscando e preparar-se para dormir." }),
      mkSono({ id: "dormir", time: "02:30", title: "Dormir", desc: "Aproximadamente 4h de sono até às 06:30 caso acorde cedo amanhã — sem aula amanhã, aproveite para dormir mais se puder." })
    ]
  };
}

// Rotina genérica de dia de faculdade (segunda, quando marcado SIM) — horário configurável
function gerarDiaFaculdadeGenerico(inicio, fim) {
  return {
    tipo: "faculdade",
    isTreino: true,
    eventos: [
      cafeManhaFaculdade("meal_cafe", "06:30"),
      mkPeriodo({ id: "periodo_faculdade", time: `${inicio}–${fim}`, title: "Faculdade", desc: "Marque se levou maçã e se está se hidratando durante o período de aula." }),
      refeicaoPrincipal("meal_almoco", fim, "Almoço (após a faculdade)"),
      mkTreino({ id: "treino", time: "após o almoço", title: "Academia", desc: "Horário configurável conforme o fim da aula. Mantenha o treino antes das 16:00 sempre que possível." }),
      posTreino("meal_postreino", "15:00"),
      maca("meal_maca1", "18:30", 1),
      maca("meal_maca2", "21:00", 2),
      jantar("meal_jantar", "22:30"),
      ceia("meal_ceia", "00:30"),
      mkLembrete({ id: "fim_trabalho", time: "02:00", title: "Fim do trabalho", desc: "Finalizar o dia, evitar ficar beliscando e preparar-se para dormir." }),
      mkSono({ id: "dormir", time: "02:30", title: "Dormir", desc: "Sono reduzido nesse tipo de dia — tente compensar dormindo mais em dias sem aula presencial." })
    ]
  };
}

// Terça / Quarta / Quinta — faculdade presencial 07:30–10:20 (horário fixo)
function gerarDiaTerQuaQui() {
  return {
    tipo: "faculdade",
    isTreino: true,
    eventos: [
      mkLembrete({ id: "acordar", time: "06:30", title: "Acordar", desc: "" }),
      cafeManhaFaculdade("meal_cafe", "06:40"),
      mkPeriodo({ id: "periodo_faculdade", time: "07:30–10:20", title: "Faculdade", desc: "Aula presencial. Marque se levou maçã e se está bebendo água." }),
      refeicaoPrincipal("meal_almoco", "10:45–11:15", "Almoço"),
      mkTreino({ id: "treino", time: "12:00–13:15", title: "Academia", desc: "" }),
      posTreino("meal_postreino", "13:30–14:00"),
      mkLembrete({ id: "inicio_trabalho", time: "16:00", title: "Início do trabalho", desc: "" }),
      maca("meal_maca1", "18:30", 1),
      maca("meal_maca2", "21:00", 2),
      jantar("meal_jantar", "22:30"),
      ceia("meal_ceia", "00:30"),
      mkLembrete({ id: "fim_trabalho", time: "02:00", title: "Fim do trabalho", desc: "" }),
      mkSono({ id: "dormir", time: "02:30", title: "Dormir", desc: "Do trabalho (02:00) até a aula (06:30) restam poucas horas de sono — seu corpo sente isso na recuperação muscular, sem exagero." })
    ]
  };
}

// Sexta — EAD, acorda mais tarde
function gerarDiaSexta() {
  return {
    tipo: "ead",
    isTreino: true,
    eventos: [
      mkLembrete({ id: "acordar", time: "11:30–12:00", title: "Acordar", desc: "Aula EAD hoje — sem necessidade de acordar cedo." }),
      refeicaoPrincipal("meal_almoco", "12:00", "Primeira refeição"),
      mkTreino({ id: "treino", time: "13:30–14:45", title: "Academia", desc: "" }),
      posTreino("meal_postreino", "15:00"),
      mkLembrete({ id: "inicio_trabalho", time: "16:00", title: "Início do trabalho", desc: "" }),
      maca("meal_maca1", "18:30", 1),
      maca("meal_maca2", "21:00", 2),
      jantar("meal_jantar", "22:30"),
      ceia("meal_ceia", "00:30"),
      mkLembrete({ id: "fim_trabalho", time: "02:00", title: "Fim do trabalho", desc: "" }),
      mkSono({ id: "dormir", time: "02:30", title: "Dormir", desc: "Sem aula presencial amanhã — bom momento para dormir mais e compensar a semana." })
    ]
  };
}

// Sábado / Domingo — descanso
function gerarDiaDescanso(reduzir) {
  const nota = reduzir ? " (redução leve de carboidratos ativada nas configurações)" : "";
  return {
    tipo: "descanso",
    isTreino: false,
    eventos: [
      mkLembrete({ id: "descanso_info", time: "—", title: "Dia de descanso da academia", desc: "Sem treino hoje. Mantenha a proteína praticamente igual à dos outros dias" + nota + "." }),
      refeicaoPrincipal("meal_almoco", "12:00", "Almoço"),
      posTreino("meal_lanche_tarde", "16:00"),
      maca("meal_maca1", "18:30", 1),
      maca("meal_maca2", "21:00", 2),
      jantar("meal_jantar", "20:30"),
      ceia("meal_ceia", "23:00")
    ]
  };
}

/* ---------------------------------------------------------
   6. RESOLVER O PLANO DO DIA PARA UMA DATA
--------------------------------------------------------- */
function getDayOverride(iso) {
  return state.dayOverrides[iso] || null;
}

function getDayPlan(dateObj) {
  const iso = isoFromDate(dateObj);
  const wd = dateObj.getDay(); // 0=domingo

  if (wd === 1) { // segunda
    const ov = getDayOverride(iso);
    if (ov && ov.faculdade === true) {
      return gerarDiaFaculdadeGenerico(state.segundaConfig.inicio, state.segundaConfig.fim);
    }
    if (ov && ov.faculdade === false) {
      return gerarDiaSemFaculdade();
    }
    return { tipo: "pendente", isTreino: true, eventos: [] }; // aguardando resposta do usuário
  }
  if (wd === 2 || wd === 3 || wd === 4) return gerarDiaTerQuaQui();
  if (wd === 5) return gerarDiaSexta();
  if (wd === 0 || wd === 6) return gerarDiaDescanso(state.reduzirFimDeSemana);

  return gerarDiaSemFaculdade();
}

/* ---------------------------------------------------------
   7. CÁLCULO DE MACROS DO DIA
--------------------------------------------------------- */
function getCompletionsForDate(iso) {
  if (!state.completions[iso]) state.completions[iso] = {};
  return state.completions[iso];
}
function getSubstitutionsForDate(iso) {
  if (!state.substitutions[iso]) state.substitutions[iso] = {};
  return state.substitutions[iso];
}
function isFreeMealEvent(iso, eventId) {
  const wk = getISOWeekKey(new Date(iso + "T12:00:00"));
  const use = state.freeMealUse[wk];
  return !!(use && use.data === iso && use.eventId === eventId);
}
function freeMealUsedThisWeek(refDate) {
  const wk = getISOWeekKey(refDate);
  return state.freeMealUse[wk] || null;
}

function eventMacros(ev, iso) {
  if (ev.type !== "refeicao") return { kcal: 0, proteina: 0 };
  const subs = getSubstitutionsForDate(iso);
  const chosen = subs[ev.id];
  if (chosen && ev.options) {
    const opt = ev.options.find(o => o.id === chosen);
    if (opt) {
      // no almoço a opção substitui só a proteína (ex: peito de frango dentro da refeição),
      // então aproximamos trocando a base de frango pela proteína escolhida.
      if (ev.id === "meal_almoco") {
        const baseSemProteina = ev.kcal - 330; // remove frango-base (330kcal) da estimativa
        const baseProtSemProteina = ev.proteina - 62;
        return { kcal: Math.max(0, baseSemProteina) + opt.kcal, proteina: Math.max(0, baseProtSemProteina) + opt.proteina };
      }
      // jantar, pós-treino, ceia etc. usam opções de refeição completa — valor direto.
      return { kcal: opt.kcal, proteina: opt.proteina };
    }
  }
  return { kcal: ev.kcal, proteina: ev.proteina };
}

function calcDayTotals(dateObj) {
  const iso = isoFromDate(dateObj);
  const plan = getDayPlan(dateObj);
  const comp = getCompletionsForDate(iso);
  let kcal = 0, proteina = 0;
  plan.eventos.forEach(ev => {
    if (ev.type === "refeicao" && comp[ev.id]) {
      if (isFreeMealEvent(iso, ev.id)) return; // refeição livre não soma na meta
      const m = eventMacros(ev, iso);
      kcal += m.kcal;
      proteina += m.proteina;
    }
  });
  return { kcal: Math.round(kcal), proteina: Math.round(proteina) };
}

function getWaterMl(iso) { return state.water[iso] || 0; }
function addWaterMl(iso, ml) {
  state.water[iso] = Math.max(0, getWaterMl(iso) + ml);
  saveState();
}

/* ---------------------------------------------------------
   8. NAVEGAÇÃO ENTRE TELAS
--------------------------------------------------------- */
const views = document.querySelectorAll(".view");
const navBtns = document.querySelectorAll(".nav-btn");

function switchView(target) {
  views.forEach(v => v.hidden = v.dataset.view !== target);
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.target === target));
  if (target === "hoje") renderHoje();
  if (target === "semana") renderSemana();
  if (target === "evolucao") renderEvolucao();
  if (target === "perfil") renderPerfil();
  window.scrollTo({ top: 0 });
}

navBtns.forEach(btn => btn.addEventListener("click", () => switchView(btn.dataset.target)));
document.getElementById("btn-settings-shortcut").addEventListener("click", () => switchView("perfil"));

/* ---------------------------------------------------------
   9. TOAST
--------------------------------------------------------- */
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

/* ---------------------------------------------------------
   10. ÍCONES SVG (inline, pequenos, para o timeline)
--------------------------------------------------------- */
const ICON_CHECK = '<svg viewBox="0 0 24 24" width="12" height="12"><path d="M4 12l5 5L20 6" fill="none" stroke="#0b0d0f" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';


/* ---------------------------------------------------------
   11. RENDER — HOJE
--------------------------------------------------------- */
function daysBetween(a, b) {
  const toLocalDate = (value) => {
    if (value instanceof Date) return new Date(isoFromDate(value) + "T00:00:00");
    return new Date(String(value).slice(0, 10) + "T00:00:00");
  };
  const ms = toLocalDate(b) - toLocalDate(a);
  return Math.round(ms / 86400000);
}

function renderHoje() {
  const now = new Date();
  const iso = isoFromDate(now);
  const wd = now.getDay();

  document.getElementById("header-greeting").textContent = `Bom dia, ${state.profile.nome}`;
  document.getElementById("header-day-label").textContent = `${WEEKDAY_NAMES[wd]} · ${fmtDateBR(iso)}`;

  // dia do projeto
  const inicio = state.profile.inicioTreinos;
  const diff = daysBetween(inicio, now) + 1;
  document.getElementById("ps-day-count").textContent = diff > 0 ? `#${diff}` : "em breve";

  // toggle de segunda-feira
  const mondayBox = document.getElementById("monday-toggle");
  const ov = getDayOverride(iso);
  if (wd === 1 && (!ov || ov.faculdade === undefined)) {
    mondayBox.hidden = false;
  } else {
    mondayBox.hidden = true;
  }
  document.getElementById("mt-sim").classList.toggle("selected", !!(ov && ov.faculdade === true));
  document.getElementById("mt-nao").classList.toggle("selected", !!(ov && ov.faculdade === false));

  const plan = getDayPlan(now);

  // alerta de sono (ter/qua/qui — dias de faculdade com pouca janela de sono)
  const sleepBox = document.getElementById("sleep-alert");
  if (wd === 2 || wd === 3 || wd === 4) {
    sleepBox.hidden = false;
    document.getElementById("sleep-alert-text").textContent = "Seu sono hoje está abaixo do ideal para recuperação muscular.";
  } else if (wd === 1 && ov && ov.faculdade === true) {
    sleepBox.hidden = false;
    document.getElementById("sleep-alert-text").textContent = "Dia de aula + trabalho até tarde — durma assim que possível para ajudar na recuperação.";
  } else {
    sleepBox.hidden = true;
  }

  // macros
  const totals = calcDayTotals(now);
  const kcalMeta = state.metas.kcal;
  const protMeta = state.metas.proteinaMax;
  document.getElementById("kcal-atual").textContent = totals.kcal;
  document.getElementById("kcal-meta").textContent = kcalMeta;
  document.getElementById("kcal-bar").style.width = Math.min(100, (totals.kcal / kcalMeta) * 100) + "%";
  document.getElementById("proteina-atual").textContent = totals.proteina;
  document.getElementById("proteina-meta").textContent = protMeta;
  document.getElementById("proteina-bar").style.width = Math.min(100, (totals.proteina / protMeta) * 100) + "%";

  const waterMl = getWaterMl(iso);
  const waterMeta = state.metas.aguaMetaMl;
  document.getElementById("agua-atual").textContent = (waterMl / 1000).toFixed(1).replace(".", ",");
  document.getElementById("agua-meta").textContent = (waterMeta / 1000).toFixed(1).replace(".", ",");
  document.getElementById("agua-bar").style.width = Math.min(100, (waterMl / waterMeta) * 100) + "%";
  document.getElementById("water-current-label").textContent =
    `${(waterMl / 1000).toFixed(2).replace(".", ",")} / ${(waterMeta / 1000).toFixed(2).replace(".", ",")} L`;
  document.getElementById("water-bar-lg").style.width = Math.min(100, (waterMl / waterMeta) * 100) + "%";

  // checklist rápido
  renderChecklist(plan, iso);

  // timeline
  renderTimeline(plan, iso);
}

function renderChecklist(plan, iso) {
  const comp = getCompletionsForDate(iso);
  const ul = document.getElementById("checklist-hoje");
  ul.innerHTML = "";

  if (plan.tipo === "pendente") {
    const li = document.createElement("li");
    li.className = "checklist-item";
    li.innerHTML = `<span>Responda acima se hoje tem aula presencial para ver sua rotina.</span>`;
    ul.appendChild(li);
    return;
  }

  plan.eventos.forEach(ev => {
    if (ev.type === "lembrete" || ev.type === "sono" || ev.type === "periodo") return;
    const done = !!comp[ev.id];
    const li = document.createElement("li");
    li.className = "checklist-item" + (done ? " done" : "");
    li.dataset.eventId = ev.id;
    li.innerHTML = `<span class="check-circle">${ICON_CHECK}</span><span>${ev.title}</span>`;
    li.addEventListener("click", () => toggleCompletion(iso, ev.id));
    ul.appendChild(li);
  });

  // água no checklist
  const waterDone = getWaterMl(iso) >= state.metas.aguaMetaMl;
  const liAgua = document.createElement("li");
  liAgua.className = "checklist-item" + (waterDone ? " done" : "");
  liAgua.innerHTML = `<span class="check-circle">${ICON_CHECK}</span><span>${(state.metas.aguaMetaMl/1000).toFixed(1).replace(".",",")} litros de água</span>`;
  ul.appendChild(liAgua);
}

function toggleCompletion(iso, eventId) {
  const comp = getCompletionsForDate(iso);
  comp[eventId] = !comp[eventId];
  saveState();
  renderHoje();
}

function typeIcon(type) {
  if (type === "treino") return '<path d="M4 12h2M18 12h2M7 8v8M17 8v8M9 12h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>';
  if (type === "sono") return '<path d="M17 12.5A6.5 6.5 0 1 1 10.5 6a5.2 5.2 0 0 0 6.5 6.5Z" fill="none" stroke="currentColor" stroke-width="1.6"/>';
  if (type === "periodo") return '<rect x="6" y="6" width="12" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>';
  return '';
}

function renderTimeline(plan, iso) {
  const box = document.getElementById("timeline-hoje");
  box.innerHTML = "";
  const comp = getCompletionsForDate(iso);
  const subs = getSubstitutionsForDate(iso);

  if (plan.tipo === "pendente") {
    box.innerHTML = `<p style="color:var(--text-muted); font-size:13.5px;">Assim que você responder sobre a aula de hoje, o cronograma completo aparece aqui.</p>`;
    return;
  }

  plan.eventos.forEach(ev => {
    const done = !!comp[ev.id];
    const item = document.createElement("div");
    item.className = `t-item type-${ev.type}` + (done ? " done" : "");

    let macrosHtml = "";
    if (ev.type === "refeicao") {
      const m = eventMacros(ev, iso);
      macrosHtml = `<div class="t-macros"><span><b>${Math.round(m.kcal)}</b> kcal</span><span><b>${Math.round(m.proteina)}</b> g proteína</span></div>`;
    }

    let tagHtml = "";
    if (ev.type === "refeicao" && subs[ev.id]) {
      const opt = ev.options.find(o => o.id === subs[ev.id]);
      tagHtml = `<span class="t-substituted-tag">substituído: ${opt ? opt.nome : subs[ev.id]}</span>`;
    }
    if (ev.type === "refeicao" && isFreeMealEvent(iso, ev.id)) {
      tagHtml += `<span class="t-free-tag">refeição livre da semana</span>`;
    }

    let actionsHtml = "";
    if (ev.type === "refeicao") {
      const freeUse = freeMealUsedThisWeek(new Date(iso + "T12:00:00"));
      const isThisFree = isFreeMealEvent(iso, ev.id);
      const canMarkFree = !freeUse || isThisFree;
      actionsHtml = `
        <div class="t-actions">
          <button class="t-btn primary" data-action="toggle" data-id="${ev.id}">${done ? "Concluída ✓" : "Marcar como comida"}</button>
          ${ev.options ? `<button class="t-btn" data-action="substituir" data-id="${ev.id}">Substituir</button>` : ""}
          ${canMarkFree ? `<button class="t-btn warn" data-action="livre" data-id="${ev.id}">${isThisFree ? "Desmarcar livre" : "Refeição livre"}</button>` : ""}
        </div>`;
    } else if (ev.type === "treino") {
      actionsHtml = `<div class="t-actions"><button class="t-btn primary" data-action="toggle" data-id="${ev.id}">${done ? "Treino concluído ✓" : "Treino concluído ✓ (marcar)"}</button></div>`;
    } else if (ev.type === "periodo") {
      const flags = comp[ev.id + "_maca"] ? "done" : "";
      actionsHtml = `<div class="t-actions">
        <button class="t-btn ${comp[ev.id+'_maca']?'primary':''}" data-action="toggle" data-id="${ev.id}_maca">${comp[ev.id+'_maca'] ? "Levei maçã ✓" : "Levei maçã"}</button>
        <button class="t-btn ${comp[ev.id+'_agua']?'primary':''}" data-action="toggle" data-id="${ev.id}_agua">${comp[ev.id+'_agua'] ? "Bebi água ✓" : "Bebi água"}</button>
      </div>`;
    }

    item.innerHTML = `
      <div class="t-dot">${done ? ICON_CHECK : ""}</div>
      <div class="t-card">
        <div class="t-top">
          <span class="t-title">${ev.title}</span>
          <span class="t-time">${ev.time}</span>
        </div>
        ${ev.desc ? `<p class="t-desc">${ev.desc}</p>` : ""}
        ${macrosHtml}
        ${tagHtml}
        ${actionsHtml}
      </div>`;
    box.appendChild(item);
  });

  box.querySelectorAll("[data-action='toggle']").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleCompletion(iso, btn.dataset.id); });
  });
  box.querySelectorAll("[data-action='substituir']").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openSubstituirModal(plan, iso, btn.dataset.id); });
  });
  box.querySelectorAll("[data-action='livre']").forEach(btn => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleFreeMeal(iso, btn.dataset.id); });
  });
}

function toggleFreeMeal(iso, eventId) {
  const refDate = new Date(iso + "T12:00:00");
  const wk = getISOWeekKey(refDate);
  const already = isFreeMealEvent(iso, eventId);
  if (already) {
    delete state.freeMealUse[wk];
    showToast("Refeição livre desmarcada.");
  } else {
    if (state.freeMealUse[wk]) {
      showToast("Você já usou a refeição livre desta semana.");
      return;
    }
    state.freeMealUse[wk] = { data: iso, eventId };
    showToast("Marcada como refeição livre. Depois dela, volte à dieta normalmente.");
  }
  saveState();
  renderHoje();
}

/* ---------------------------------------------------------
   12. MODAL SUBSTITUIR
--------------------------------------------------------- */
function openSubstituirModal(plan, iso, eventId) {
  const ev = plan.eventos.find(e => e.id === eventId);
  if (!ev || !ev.options) return;
  const modal = document.getElementById("modal-substituir");
  document.getElementById("modal-substituir-title").textContent = `Substituir — ${ev.title}`;
  const box = document.getElementById("modal-substituir-options");
  box.innerHTML = "";

  const original = document.createElement("button");
  original.className = "modal-option";
  original.innerHTML = `<span>Opção original</span><small>${ev.kcal} kcal · ${ev.proteina} g prot.</small>`;
  original.addEventListener("click", () => {
    const subs = getSubstitutionsForDate(iso);
    delete subs[ev.id];
    saveState();
    modal.hidden = true;
    renderHoje();
  });
  box.appendChild(original);

  ev.options.forEach(opt => {
    const b = document.createElement("button");
    b.className = "modal-option";
    b.innerHTML = `<span>${opt.nome}</span><small>${opt.kcal} kcal · ${opt.proteina} g prot.</small>`;
    b.addEventListener("click", () => {
      const subs = getSubstitutionsForDate(iso);
      subs[ev.id] = opt.id;
      saveState();
      modal.hidden = true;
      renderHoje();
    });
    box.appendChild(b);
  });

  modal.hidden = false;
}
document.getElementById("modal-substituir-cancel").addEventListener("click", () => {
  document.getElementById("modal-substituir").hidden = true;
});
document.getElementById("modal-substituir").addEventListener("click", (e) => {
  if (e.target.id === "modal-substituir") e.currentTarget.hidden = true;
});

/* ---------------------------------------------------------
   13. ÁGUA — botões
--------------------------------------------------------- */
document.querySelectorAll(".water-btn[data-ml]").forEach(btn => {
  btn.addEventListener("click", () => {
    addWaterMl(todayISO(), parseInt(btn.dataset.ml, 10));
    renderHoje();
  });
});
document.getElementById("water-reset").addEventListener("click", () => {
  state.water[todayISO()] = 0;
  saveState();
  renderHoje();
});

/* ---------------------------------------------------------
   14. TOGGLE SEGUNDA-FEIRA
--------------------------------------------------------- */
document.getElementById("mt-sim").addEventListener("click", () => setMondayOverride(true));
document.getElementById("mt-nao").addEventListener("click", () => setMondayOverride(false));
function setMondayOverride(faculdade) {
  const iso = todayISO();
  state.dayOverrides[iso] = { faculdade };
  saveState();
  renderHoje();
}

/* ---------------------------------------------------------
   15. RENDER — SEMANA
--------------------------------------------------------- */
function getMondayOfWeek(d) {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday;
}

const WEEK_META = [
  null, // índice 0 não usado (segunda = 1)
  { nome: "Segunda-feira", badge: "faculdade", info: "Aula presencial a cada 15 dias — responda na tela Hoje se hoje tem aula." },
  { nome: "Terça-feira", badge: "faculdade", info: "Faculdade 07:30–10:20 · treino 12:00–13:15." },
  { nome: "Quarta-feira", badge: "faculdade", info: "Faculdade 07:30–10:20 · treino 12:00–13:15." },
  { nome: "Quinta-feira", badge: "faculdade", info: "Faculdade 07:30–10:20 · treino 12:00–13:15." },
  { nome: "Sexta-feira", badge: "treino", info: "Aula EAD — acorda mais tarde. Treino 13:30–14:45." },
  { nome: "Sábado", badge: "descanso", info: "Descanso da academia. Proteína mantida." },
  { nome: "Domingo", badge: "descanso", info: "Descanso da academia. Proteína mantida." }
];

function renderSemana() {
  const grid = document.getElementById("week-grid");
  grid.innerHTML = "";
  const today = new Date();
  const monday = getMondayOfWeek(today);

  for (let i = 1; i <= 7; i++) {
    const wdIndex = i === 7 ? 0 : i; // 1..6 seg-sáb, 7->0 domingo
    const meta = WEEK_META[i];
    const dateForDay = new Date(monday);
    dateForDay.setDate(monday.getDate() + (i - 1));
    const isoDay = isoFromDate(dateForDay);
    const isToday = isoDay === todayISO();

    const card = document.createElement("div");
    card.className = "week-day-card" + (isToday ? " today" : "");
    const badgeLabel = meta.badge === "faculdade" ? "faculdade + treino" : meta.badge === "treino" ? "treino" : "descanso";

    let toggleHtml = "";
    if (i === 1) { // segunda
      const ov = getDayOverride(isoDay);
      const checked = ov && ov.faculdade === true ? "checked" : "";
      toggleHtml = `
        <div class="wd-toggle-row">
          <span>Aula presencial nesta segunda (${fmtDateBR(isoDay)})</span>
          <label class="switch">
            <input type="checkbox" data-monday-iso="${isoDay}" ${checked}>
            <span class="switch-track"></span><span class="switch-thumb"></span>
          </label>
        </div>`;
    }

    card.innerHTML = `
      <div class="wd-top">
        <span class="wd-name">${meta.nome}${isToday ? " · hoje" : ""}</span>
        <span class="wd-badge ${meta.badge}">${badgeLabel}</span>
      </div>
      <p class="wd-sub">${meta.info}</p>
      ${toggleHtml}
    `;
    grid.appendChild(card);
  }

  grid.querySelectorAll("[data-monday-iso]").forEach(input => {
    input.addEventListener("change", () => {
      const iso = input.dataset.mondayIso;
      state.dayOverrides[iso] = { faculdade: input.checked };
      saveState();
      renderSemana();
      showToast("Segunda-feira atualizada.");
    });
  });

  renderFreeMealStatus();
}

function renderFreeMealStatus() {
  const box = document.getElementById("freemeal-status");
  const wk = getISOWeekKey(new Date());
  const use = state.freeMealUse[wk];
  if (!use) {
    box.innerHTML = `Você ainda não usou a refeição livre desta semana.`;
    return;
  }
  box.innerHTML = `Usada em <b>${fmtDateBR(use.data)}</b>. Para trocar, desmarque a refeição correspondente na tela Hoje.`;
}


/* ---------------------------------------------------------
   16. RENDER — EVOLUÇÃO (peso, medidas, gráfico, fotos)
--------------------------------------------------------- */
function renderEvolucao() {
  document.getElementById("evo-peso-inicial").textContent = state.profile.pesoInicial + " kg";

  const log = [...state.weightLog].sort((a, b) => a.data.localeCompare(b.data));
  const last = log[log.length - 1];
  document.getElementById("evo-peso-atual").textContent = last ? last.peso.toFixed(1).replace(".", ",") + " kg" : "—";

  if (last) {
    const delta = last.peso - state.profile.pesoInicial;
    const sign = delta > 0 ? "+" : "";
    document.getElementById("evo-peso-delta").textContent = `${sign}${delta.toFixed(1).replace(".", ",")} kg`;
  } else {
    document.getElementById("evo-peso-delta").textContent = "—";
  }

  drawWeightChart(log);
  document.getElementById("chart-hint").hidden = log.length > 0;

  const list = document.getElementById("evo-list");
  list.innerHTML = "";
  [...state.weightLog].sort((a, b) => b.data.localeCompare(a.data)).forEach(entry => {
    const li = document.createElement("li");
    li.className = "evo-list-item";
    const medidas = [];
    if (entry.cintura) medidas.push(`cintura ${entry.cintura} cm`);
    if (entry.braco) medidas.push(`braço ${entry.braco} cm`);
    li.innerHTML = `
      <div>
        <div class="eli-date">${fmtDateBR(entry.data)}</div>
        <div class="eli-weight">${entry.peso.toFixed(1).replace(".", ",")} kg</div>
        ${medidas.length ? `<div class="eli-measures">${medidas.join(" · ")}</div>` : ""}
        ${entry.obs ? `<div class="eli-measures">${entry.obs}</div>` : ""}
      </div>
      <button class="eli-del" data-id="${entry.id}" aria-label="Remover">✕</button>
    `;
    list.appendChild(li);
  });
  list.querySelectorAll(".eli-del").forEach(btn => {
    btn.addEventListener("click", () => {
      state.weightLog = state.weightLog.filter(e => e.id !== btn.dataset.id);
      saveState();
      renderEvolucao();
    });
  });

  // valor padrão da data no form = hoje
  const dateInput = document.querySelector('#form-peso input[name="data"]');
  if (dateInput && !dateInput.value) dateInput.value = todayISO();

  renderFotos();
}

function drawWeightChart(log) {
  const canvas = document.getElementById("chart-peso");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 320;
  const cssH = 200;
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  if (log.length === 0) return;

  const pad = { l: 34, r: 14, t: 16, b: 22 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;

  const pesos = log.map(e => e.peso);
  let min = Math.min(...pesos), max = Math.max(...pesos);
  if (min === max) { min -= 1; max += 1; }
  const margin = (max - min) * 0.15 || 1;
  min -= margin; max += margin;

  ctx.strokeStyle = "#2c3036";
  ctx.lineWidth = 1;
  ctx.font = "10px -apple-system, sans-serif";
  ctx.fillStyle = "#5b6068";
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = pad.t + (h / gridLines) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
    const val = max - ((max - min) / gridLines) * i;
    ctx.fillText(val.toFixed(1), 2, y + 3);
  }

  const pts = log.map((e, i) => {
    const x = pad.l + (log.length === 1 ? w / 2 : (w / (log.length - 1)) * i);
    const y = pad.t + h - ((e.peso - min) / (max - min)) * h;
    return { x, y };
  });

  // linha
  ctx.beginPath();
  pts.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
  ctx.strokeStyle = "#e8a33d";
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  // área sob a linha
  ctx.lineTo(pts[pts.length - 1].x, pad.t + h);
  ctx.lineTo(pts[0].x, pad.t + h);
  ctx.closePath();
  ctx.fillStyle = "rgba(232,163,61,0.10)";
  ctx.fill();

  // pontos
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = "#0b0d0f";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#e8a33d";
    ctx.stroke();
  });
}

document.getElementById("form-peso").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const entry = {
    id: "w_" + Date.now(),
    data: fd.get("data") || todayISO(),
    peso: parseFloat(fd.get("peso")),
    cintura: fd.get("cintura") ? parseFloat(fd.get("cintura")) : null,
    braco: fd.get("braco") ? parseFloat(fd.get("braco")) : null,
    obs: (fd.get("obs") || "").trim()
  };
  if (isNaN(entry.peso)) { showToast("Informe um peso válido."); return; }
  state.weightLog.push(entry);
  saveState();
  e.target.reset();
  document.querySelector('#form-peso input[name="data"]').value = todayISO();
  showToast("Registro salvo.");
  renderEvolucao();
});

/* --- Fotos via IndexedDB ---
   localStorage tem limite baixo (geralmente ~5MB) e fotos em base64 o esgotam
   rapidamente. Por isso as fotos ficam em IndexedDB, disponível neste navegador/
   aparelho. Elas NÃO entram no backup JSON (que usa localStorage) por causa do
   tamanho — o app continua funcionando normalmente mesmo sem essa função. */
let photosDB = null;
let photosSupported = "indexedDB" in window;

function openPhotosDB() {
  return new Promise((resolve, reject) => {
    if (!photosSupported) return reject(new Error("IndexedDB indisponível"));
    if (photosDB) return resolve(photosDB);
    const req = indexedDB.open("joaofit_fotos", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("fotos")) {
        db.createObjectStore("fotos", { keyPath: "id" });
      }
    };
    req.onsuccess = () => { photosDB = req.result; resolve(photosDB); };
    req.onerror = () => reject(req.error);
  });
}

async function addPhoto(dataURL) {
  const db = await openPhotosDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("fotos", "readwrite");
    tx.objectStore("fotos").put({ id: "f_" + Date.now(), dataURL, data: todayISO() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
async function getAllPhotos() {
  const db = await openPhotosDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("fotos", "readonly");
    const req = tx.objectStore("fotos").getAll();
    req.onsuccess = () => resolve(req.result.sort((a, b) => b.id.localeCompare(a.id)));
    req.onerror = () => reject(req.error);
  });
}
async function deletePhoto(id) {
  const db = await openPhotosDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("fotos", "readwrite");
    tx.objectStore("fotos").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function renderFotos() {
  const desc = document.getElementById("fotos-desc");
  const grid = document.getElementById("fotos-grid");
  if (!photosSupported) {
    desc.textContent = "Este navegador não oferece armazenamento local para fotos. O restante do app funciona normalmente.";
    document.getElementById("btn-add-foto").disabled = true;
    return;
  }
  desc.textContent = "Fotos ficam salvas apenas neste aparelho (não entram no backup JSON por serem grandes).";
  try {
    const fotos = await getAllPhotos();
    grid.innerHTML = "";
    fotos.forEach(f => {
      const div = document.createElement("div");
      div.className = "foto-thumb";
      div.innerHTML = `<img src="${f.dataURL}" alt="foto de progresso"><span class="foto-date">${fmtDateBR(f.data)}</span><button class="foto-del" data-id="${f.id}">✕</button>`;
      grid.appendChild(div);
    });
    grid.querySelectorAll(".foto-del").forEach(btn => {
      btn.addEventListener("click", async () => { await deletePhoto(btn.dataset.id); renderFotos(); });
    });
  } catch (e) {
    desc.textContent = "Não foi possível carregar as fotos salvas.";
  }
}

document.getElementById("btn-add-foto").addEventListener("click", () => {
  document.getElementById("foto-input").click();
});
document.getElementById("foto-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      await addPhoto(reader.result);
      showToast("Foto adicionada.");
      renderFotos();
    } catch (err) {
      showToast("Não foi possível salvar a foto.");
    }
  };
  reader.readAsDataURL(file);
  e.target.value = "";
});

/* ---------------------------------------------------------
   17. RENDER — PERFIL / CONFIGURAÇÕES
--------------------------------------------------------- */
function renderPerfil() {
  document.getElementById("p-nome").textContent = state.profile.nome;
  document.getElementById("p-idade").textContent = state.profile.idade + " anos";

  const f = document.getElementById("form-metas");
  f.kcal.value = state.metas.kcal;
  f.proteinaMin.value = state.metas.proteinaMin;
  f.proteinaMax.value = state.metas.proteinaMax;
  f.gordura.value = state.metas.gordura;
  f.aguaMeta.value = (state.metas.aguaMetaMl / 1000);

  const fs = document.getElementById("form-segunda");
  fs.inicio.value = state.segundaConfig.inicio;
  fs.fim.value = state.segundaConfig.fim;

  document.getElementById("toggle-reduzir-fds").checked = state.reduzirFimDeSemana;
}

document.getElementById("form-metas").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  state.metas.kcal = parseFloat(fd.get("kcal")) || state.metas.kcal;
  state.metas.proteinaMin = parseFloat(fd.get("proteinaMin")) || state.metas.proteinaMin;
  state.metas.proteinaMax = parseFloat(fd.get("proteinaMax")) || state.metas.proteinaMax;
  state.metas.gordura = parseFloat(fd.get("gordura")) || state.metas.gordura;
  const aguaL = parseFloat(fd.get("aguaMeta"));
  if (aguaL) state.metas.aguaMetaMl = Math.round(aguaL * 1000);
  saveState();
  showToast("Metas atualizadas.");
});

document.getElementById("form-segunda").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  if (fd.get("inicio")) state.segundaConfig.inicio = fd.get("inicio");
  if (fd.get("fim")) state.segundaConfig.fim = fd.get("fim");
  saveState();
  showToast("Horário da segunda-feira salvo.");
});

document.getElementById("toggle-reduzir-fds").addEventListener("change", (e) => {
  state.reduzirFimDeSemana = e.target.checked;
  saveState();
});

/* ---------------------------------------------------------
   18. BACKUP — EXPORTAR / IMPORTAR JSON
--------------------------------------------------------- */
document.getElementById("btn-export").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `rotina-joao-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  document.getElementById("backup-status").textContent = "Backup exportado. Guarde o arquivo em local seguro.";
});

document.getElementById("btn-import").addEventListener("click", () => {
  document.getElementById("import-input").click();
});
document.getElementById("import-input").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (!parsed || typeof parsed !== "object") throw new Error("formato inválido");
      state = Object.assign(structuredCloneSafe(DEFAULT_STATE), parsed, {
        profile: Object.assign({}, DEFAULT_STATE.profile, parsed.profile || {}),
        metas: Object.assign({}, DEFAULT_STATE.metas, parsed.metas || {}),
        segundaConfig: Object.assign({}, DEFAULT_STATE.segundaConfig, parsed.segundaConfig || {})
      });
      saveState();
      document.getElementById("backup-status").textContent = "Backup importado com sucesso.";
      showToast("Dados restaurados.");
      switchView("hoje");
    } catch (err) {
      document.getElementById("backup-status").textContent = "Arquivo inválido — não foi possível importar.";
    }
  };
  reader.readAsText(file);
  e.target.value = "";
});

document.getElementById("btn-reset-all").addEventListener("click", () => {
  if (!confirm("Isso vai apagar todos os dados salvos neste aparelho (checklist, água, peso, fotos, configurações). Deseja continuar?")) return;
  localStorage.removeItem(STORAGE_KEY);
  if (photosSupported) {
    indexedDB.deleteDatabase("joaofit_fotos");
  }
  state = structuredCloneSafe(DEFAULT_STATE);
  saveState();
  showToast("Todos os dados foram apagados.");
  switchView("hoje");
});

/* ---------------------------------------------------------
   19. SERVICE WORKER (PWA offline)
--------------------------------------------------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(err => {
      console.error("Falha ao registrar service worker:", err);
    });
  });
}

/* ---------------------------------------------------------
   20. INIT
--------------------------------------------------------- */
function init() {
  const dateInput = document.querySelector('#form-peso input[name="data"]');
  if (dateInput) dateInput.value = todayISO();
  renderHoje();
}
init();
