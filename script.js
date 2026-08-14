/* =========================================================
   MINHA DIETA
   App state, persistence (localStorage) e geração da rotina
   ========================================================= */

"use strict";

/* ---------------------------------------------------------
   1. STORAGE
--------------------------------------------------------- */
const LEGACY_STORAGE_KEY = "joaofit_state_v1";
let STORAGE_KEY = LEGACY_STORAGE_KEY;
let ACTIVE_USER_ID = null;

const DEFAULT_STATE = {
  profile: {
    nome: "Usuário",
    idade: null,
    altura: null,
    pesoInicial: null,
    inicioTreinos: null,
    metaData: null
  },
  metas: {
    kcal: 2500,
    proteinaMin: 170,
    proteinaMax: 180,
    gordura: 70,
    aguaMetaMl: 3000
  },
  segundaConfig: { inicio: "08:00", fim: "10:00" },
  onboardingComplete: false,
  customRoutine: {
    enabled: false, wakeTime: "07:00", sleepTime: "23:00", mealCount: 4,
    trainingDays: [], trainingTime: "18:00", freeMealDay: null,
    commitment: { enabled: false, name: "", days: [], start: "08:00", end: "12:00" }
  },
  workoutPlan: { source: "", parsedAt: null, days: {} },
  dietPlan: { source: "", parsedAt: null, parserVersion: 4, meals: [], generalNotes: [], warnings: [] },
  appearance: { theme: "amber" },
  reduzirFimDeSemana: false,
  // overrides por data ISO (YYYY-MM-DD), usado principalmente na segunda-feira
  dayOverrides: {},          // { "2026-08-17": { faculdade: true } }
  completions: {},           // { "2026-08-17": { "meal_almoco": true, "treino": true } }
  substitutions: {},         // { "2026-08-17": { "meal_almoco": "patinho" } }
  freeMealUse: {},           // { "2026-w34": { data:"2026-08-17", eventId:"meal_jantar" } }
  water: {},                 // { "2026-08-17": 1500 } (ml)
  foodLog: {},               // { "2026-08-17": [{id,nome,gramas,kcal100,proteina100,carboidrato100,gordura100,fonte}] }
  foodLibrary: { favorites: [], recent: [] },
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

const APP_THEMES = {
  amber: { label: "Preto + roxo", themeColor: "#0c0a12" },
  ocean: { label: "Espresso + cobre", themeColor: "#100b08" },
  emerald: { label: "Carbono + azul elétrico", themeColor: "#080b10" }
};

function applyAppearanceTheme(theme = state.appearance?.theme || "amber") {
  const selected = APP_THEMES[theme] ? theme : "amber";
  if (!state.appearance) state.appearance = { theme: selected };
  state.appearance.theme = selected;
  document.documentElement.dataset.theme = selected;
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) themeMeta.content = APP_THEMES[selected].themeColor;
}

window.applyAppearanceTheme = applyAppearanceTheme;
applyAppearanceTheme();

window.activateUserStorage = function(userId, allowLegacyMigration = false) {
  ACTIVE_USER_ID = userId;
  STORAGE_KEY = `joaofit_state_v2_${userId}`;
  const userState = localStorage.getItem(STORAGE_KEY);
  if (userState) {
    state = parseStoredState(userState);
    return { state, migrated: false };
  }
  const migrationOwner = localStorage.getItem("joaofit_legacy_owner");
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (allowLegacyMigration && legacy && !migrationOwner) {
    state = parseStoredState(legacy);
    localStorage.setItem("joaofit_legacy_owner", userId);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return { state, migrated: true };
  }
  state = structuredCloneSafe(DEFAULT_STATE);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  return { state, migrated: false };
};

function parseStoredState(raw) {
  const parsed = JSON.parse(raw);
  return Object.assign(structuredCloneSafe(DEFAULT_STATE), parsed, {
    profile: Object.assign({}, DEFAULT_STATE.profile, parsed.profile || {}),
    metas: Object.assign({}, DEFAULT_STATE.metas, parsed.metas || {}),
    segundaConfig: Object.assign({}, DEFAULT_STATE.segundaConfig, parsed.segundaConfig || {})
  });
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredCloneSafe(DEFAULT_STATE);
    return parseStoredState(raw);
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
      if (window.scheduleCloudSave) window.scheduleCloudSave(state);
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

function genericMeal(id, time, title, desc = "Registre abaixo os alimentos e quantidades consumidos nesta refeição.", macros = null) {
  return mkMeal({ id, time, title, desc, kcal: Number(macros?.kcal) || 0, proteina: Number(macros?.proteina) || 0 });
}

function minutesToTime(total) {
  const normalized = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function timeToMinutes(value, fallback = 420) {
  if (!/^\d{2}:\d{2}$/.test(value || "")) return fallback;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function gerarDiaPersonalizado(dateObj) {
  const cfg = state.customRoutine || DEFAULT_STATE.customRoutine;
  const wd = dateObj.getDay();
  const events = [];
  events.push(mkLembrete({ id: "acordar", time: cfg.wakeTime, title: "Início do dia", desc: "Horário habitual informado no seu perfil." }));

  const importedMeals = ensureDietPlanNutrition().meals || [];
  const mealCount = importedMeals.length || Math.max(3, Math.min(6, Number(cfg.mealCount) || 4));
  const wake = timeToMinutes(cfg.wakeTime);
  const sleep = timeToMinutes(cfg.sleepTime, 1380);
  const awakeDuration = sleep > wake ? sleep - wake : sleep + 1440 - wake;
  const mealTitles = importedMeals.length ? importedMeals.map(meal => meal.title) : mealCount === 3 ? ["Café da manhã", "Almoço", "Jantar"] :
    mealCount === 4 ? ["Café da manhã", "Almoço", "Lanche", "Jantar"] :
    mealCount === 5 ? ["Café da manhã", "Lanche da manhã", "Almoço", "Lanche da tarde", "Jantar"] :
    ["Café da manhã", "Lanche da manhã", "Almoço", "Lanche da tarde", "Jantar", "Ceia"];
  mealTitles.forEach((title, index) => {
    const position = mealCount === 1 ? 0 : index / (mealCount - 1);
    const minute = wake + 45 + position * Math.max(120, awakeDuration - 120);
    const isPlannedFreeMeal = cfg.freeMealDay !== null && cfg.freeMealDay !== undefined && Number(cfg.freeMealDay) === wd && index === mealTitles.length - 1;
    const imported = importedMeals[index];
    const importedMacros = imported ? dietMealTotals(imported) : null;
    events.push(genericMeal(
      imported?.id || `custom_meal_${index + 1}`,
      imported?.time || minutesToTime(minute),
      isPlannedFreeMeal ? "Refeição livre planejada" : title,
      isPlannedFreeMeal
        ? "Dia escolhido no seu perfil para a refeição livre. Registre normalmente o que consumir."
        : imported?.items?.map(dietItemText).join(" · ") || undefined,
      importedMacros
    ));
  });

  if (cfg.commitment?.enabled && (cfg.commitment.days || []).map(Number).includes(wd)) {
    events.push(mkPeriodo({ id: "custom_commitment", time: `${cfg.commitment.start}–${cfg.commitment.end}`, title: cfg.commitment.name || "Compromisso", desc: "Horário configurado no seu perfil." }));
  }
  const isTraining = (cfg.trainingDays || []).map(Number).includes(wd);
  const workout = state.workoutPlan?.days?.[wd];
  if (isTraining) events.push(mkTreino({
    id: "treino",
    time: cfg.trainingTime,
    title: workout?.focus ? `Treino — ${workout.focus}` : "Treino",
    desc: workout?.exercises?.length ? workout.exercises.join(" · ") : "Envie seu PDF/DOCX ou monte o plano para adicionar os exercícios."
  }));
  events.push(mkSono({ id: "dormir", time: cfg.sleepTime, title: "Encerrar o dia", desc: "Horário habitual informado no seu perfil." }));
  events.sort((a, b) => timeToMinutes(String(a.time).slice(0, 5), 9999) - timeToMinutes(String(b.time).slice(0, 5), 9999));
  return { tipo: "personalizado", isTreino: isTraining, eventos: events };
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
  if (state.customRoutine?.enabled) return gerarDiaPersonalizado(dateObj);
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
  let kcal = 0, proteina = 0, carboidrato = 0, gordura = 0;
  plan.eventos.forEach(ev => {
    if (ev.type === "refeicao" && comp[ev.id]) {
      if (isFreeMealEvent(iso, ev.id)) return; // refeição livre não soma na meta
      const m = eventMacros(ev, iso);
      kcal += m.kcal;
      proteina += m.proteina;
    }
  });
  getFoodLogForDate(iso).forEach(item => {
    const factor = Number(item.gramas) / 100;
    kcal += Number(item.kcal100) * factor;
    proteina += Number(item.proteina100) * factor;
    carboidrato += (Number(item.carboidrato100) || 0) * factor;
    gordura += (Number(item.gordura100) || 0) * factor;
  });
  return {
    kcal: Math.round(kcal),
    proteina: Math.round(proteina * 10) / 10,
    carboidrato: Math.round(carboidrato * 10) / 10,
    gordura: Math.round(gordura * 10) / 10
  };
}

/* ---------------------------------------------------------
   7A. GAMIFICAÇÃO E DESEMPENHO
--------------------------------------------------------- */
const GAMIFICATION_POINTS = { water: 20, meal: 5, mealDailyCap: 20, workout: 30, evolution: 10 };
const GAMIFICATION_LEVEL_SIZE = 300;

function isValidISODate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function dateFromISO(iso) {
  return new Date(`${iso}T12:00:00`);
}

function completedMealsForDate(iso) {
  const completion = state.completions?.[iso] || {};
  return Object.entries(completion).filter(([key, done]) => done && /meal|refei[cç][aã]o/i.test(key)).length;
}

function firstEvolutionDateInWeek(iso) {
  const week = getISOWeekKey(dateFromISO(iso));
  return (state.weightLog || [])
    .map(entry => entry.data)
    .filter(date => isValidISODate(date) && getISOWeekKey(dateFromISO(date)) === week)
    .sort()[0] || null;
}

function gamificationPointsForDate(iso) {
  const completion = state.completions?.[iso] || {};
  const waterPoints = Number(state.water?.[iso] || 0) >= Number(state.metas?.aguaMetaMl || 3000) ? GAMIFICATION_POINTS.water : 0;
  const completedMeals = completedMealsForDate(iso);
  const mealPoints = Math.min(GAMIFICATION_POINTS.mealDailyCap, completedMeals * GAMIFICATION_POINTS.meal);
  const workoutPoints = completion.treino ? GAMIFICATION_POINTS.workout : 0;
  const evolutionPoints = firstEvolutionDateInWeek(iso) === iso ? GAMIFICATION_POINTS.evolution : 0;
  return {
    total: waterPoints + mealPoints + workoutPoints + evolutionPoints,
    core: waterPoints + mealPoints + workoutPoints,
    waterPoints, mealPoints, workoutPoints, evolutionPoints, completedMeals
  };
}

function gamificationDateKeys() {
  const keys = new Set([
    ...Object.keys(state.water || {}),
    ...Object.keys(state.completions || {}),
    ...(state.weightLog || []).map(entry => entry.data)
  ]);
  return [...keys].filter(isValidISODate).sort();
}

function gamificationSummary(referenceDate = new Date()) {
  const referenceISO = isoFromDate(referenceDate);
  const weekKey = getISOWeekKey(referenceDate);
  const dateKeys = gamificationDateKeys();
  const breakdowns = dateKeys.map(iso => ({ iso, ...gamificationPointsForDate(iso) }));
  const totalPoints = breakdowns.reduce((sum, day) => sum + day.total, 0);
  const weekPoints = breakdowns.filter(day => getISOWeekKey(dateFromISO(day.iso)) === weekKey).reduce((sum, day) => sum + day.total, 0);
  const today = gamificationPointsForDate(referenceISO);
  const hydrationDays = breakdowns.filter(day => day.waterPoints > 0).length;
  const workoutDays = breakdowns.filter(day => day.workoutPoints > 0).length;
  const nutritionDays = breakdowns.filter(day => day.mealPoints >= GAMIFICATION_POINTS.mealDailyCap).length;
  const evolutionWeeks = breakdowns.filter(day => day.evolutionPoints > 0).length;

  let cursor = new Date(`${referenceISO}T12:00:00`);
  if (gamificationPointsForDate(referenceISO).core < 20) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  for (let index = 0; index < 365; index++) {
    const iso = isoFromDate(cursor);
    if (gamificationPointsForDate(iso).core < 20) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const level = Math.floor(totalPoints / GAMIFICATION_LEVEL_SIZE) + 1;
  const levelPoints = totalPoints % GAMIFICATION_LEVEL_SIZE;
  const achievements = [
    { id: "start", label: "Primeiros pontos", unlocked: totalPoints >= 20 },
    { id: "water", label: "7 metas de água", unlocked: hydrationDays >= 7 },
    { id: "workout", label: "5 treinos concluídos", unlocked: workoutDays >= 5 },
    { id: "nutrition", label: "5 dias de refeições", unlocked: nutritionDays >= 5 },
    { id: "evolution", label: "4 semanas de evolução", unlocked: evolutionWeeks >= 4 },
    { id: "weekly", label: "200 pontos na semana", unlocked: weekPoints >= 200 }
  ];
  return { referenceISO, totalPoints, weekPoints, today, streak, level, levelPoints, achievements, hydrationDays, workoutDays, nutritionDays, evolutionWeeks };
}

function gamificationInsight(summary) {
  const water = Number(state.water?.[summary.referenceISO] || 0);
  const waterGoal = Number(state.metas?.aguaMetaMl || 3000);
  if (water < waterGoal) {
    const remaining = Math.max(0, waterGoal - water);
    return `Faltam ${(remaining / 1000).toFixed(2).replace(".", ",")} L para atingir a meta de água e ganhar 20 pontos.`;
  }
  const trainingToday = (state.customRoutine?.trainingDays || []).map(Number).includes(dateFromISO(summary.referenceISO).getDay());
  if (trainingToday && !summary.today.workoutPoints) return "O treino de hoje ainda não foi concluído. Ao marcar, você ganha 30 pontos.";
  if (summary.today.mealPoints < GAMIFICATION_POINTS.mealDailyCap) {
    const remainingMeals = Math.ceil((GAMIFICATION_POINTS.mealDailyCap - summary.today.mealPoints) / GAMIFICATION_POINTS.meal);
    return `Marque mais ${remainingMeals} refeição(ões) concluída(s) para atingir o limite diário de pontos da alimentação.`;
  }
  return "As principais metas de hoje foram registradas. Continue mantendo a consistência durante a semana.";
}

function renderGamification() {
  const summary = gamificationSummary(new Date());
  document.getElementById("performance-level").textContent = `Nível ${summary.level}`;
  document.getElementById("performance-total").textContent = `${summary.totalPoints} pontos`;
  document.getElementById("performance-level-fill").style.width = `${summary.levelPoints / GAMIFICATION_LEVEL_SIZE * 100}%`;
  document.getElementById("performance-next").textContent = `Faltam ${GAMIFICATION_LEVEL_SIZE - summary.levelPoints} pontos para o próximo nível.`;
  document.getElementById("performance-week").textContent = summary.weekPoints;
  document.getElementById("performance-streak").textContent = `${summary.streak} ${summary.streak === 1 ? "dia" : "dias"}`;
  document.getElementById("performance-today").textContent = summary.today.total;
  document.getElementById("performance-insight").textContent = gamificationInsight(summary);
  const achievements = document.getElementById("achievement-list");
  achievements.innerHTML = "";
  summary.achievements.forEach(achievement => {
    const chip = document.createElement("span");
    chip.className = `achievement-chip${achievement.unlocked ? "" : " locked"}`;
    chip.textContent = `${achievement.unlocked ? "Conquista: " : "Bloqueado: "}${achievement.label}`;
    achievements.appendChild(chip);
  });
  return summary;
}

window.gamificationSummary = gamificationSummary;

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
  if (target === "dieta") renderDieta();
  if (target === "treino") renderTreino();
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
  document.getElementById("home-goal").textContent = state.profile.objetivo || "Definir objetivo";
  document.getElementById("home-target-date").textContent = state.profile.metaData ? fmtDateBR(state.profile.metaData) : "Definir data";

  // toggle de segunda-feira
  const mondayBox = document.getElementById("monday-toggle");
  const ov = getDayOverride(iso);
  if (!state.customRoutine?.enabled && wd === 1 && (!ov || ov.faculdade === undefined)) {
    mondayBox.hidden = false;
  } else {
    mondayBox.hidden = true;
  }
  document.getElementById("mt-sim").classList.toggle("selected", !!(ov && ov.faculdade === true));
  document.getElementById("mt-nao").classList.toggle("selected", !!(ov && ov.faculdade === false));

  const plan = getDayPlan(now);

  // alerta de sono (ter/qua/qui — dias de faculdade com pouca janela de sono)
  const sleepBox = document.getElementById("sleep-alert");
  if (!state.customRoutine?.enabled && (wd === 2 || wd === 3 || wd === 4)) {
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

  const dietSummary = document.getElementById("today-diet-summary");
  const dietPlan = ensureDietPlanNutrition();
  const planned = dietPlanTotals(dietPlan);
  dietSummary.hidden = !dietPlan.meals.length;
  if (dietPlan.meals.length) {
    document.getElementById("today-diet-plan-macros").textContent = `${Math.round(planned.kcal)} kcal · P ${Math.round(planned.proteina)} · C ${Math.round(planned.carboidrato)} · G ${Math.round(planned.gordura)} g`;
    document.getElementById("today-diet-plan-status").textContent = `${planned.calculated} de ${planned.items} item(ns) calculado(s). Os cartões acima somam somente refeições marcadas como comidas.`;
  }

  const waterMl = getWaterMl(iso);
  const waterMeta = state.metas.aguaMetaMl;
  document.getElementById("agua-atual").textContent = (waterMl / 1000).toFixed(1).replace(".", ",");
  document.getElementById("agua-meta").textContent = (waterMeta / 1000).toFixed(1).replace(".", ",");
  document.getElementById("agua-bar").style.width = Math.min(100, (waterMl / waterMeta) * 100) + "%";
  document.getElementById("water-current-label").textContent =
    `${(waterMl / 1000).toFixed(2).replace(".", ",")} / ${(waterMeta / 1000).toFixed(2).replace(".", ",")} L`;
  document.getElementById("water-bar-lg").style.width = Math.min(100, (waterMl / waterMeta) * 100) + "%";

  renderFoodLog(iso);

  // checklist rápido
  renderChecklist(plan, iso);

  // timeline
  renderTimeline(plan, iso);

  // pontos, nível, sequência e recomendações da semana
  renderGamification();
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
    if (ev.type === "lembrete" || ev.type === "sono" || ev.type === "periodo" || ev.type === "treino") return;
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
    if (ev.type === "treino") return;
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
      actionsHtml = `<div class="t-actions">
        <button class="t-btn primary" data-action="toggle" data-id="${ev.id}">${done ? "Compromisso concluído ✓" : "Marcar como concluído"}</button>
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
   12B. REGISTRO LIVRE DE ALIMENTOS
--------------------------------------------------------- */
let editingFoodId = null;

// Valores por 100 g. Fonte principal: TACO/NEPA-Unicamp, 4ª edição.
const LEGACY_FOOD_PRESETS = [
  { nome: "Arroz branco cozido", kcal: 128, proteina: 2.5 },
  { nome: "Arroz integral cozido", kcal: 124, proteina: 2.6 },
  { nome: "Feijão carioca cozido", kcal: 76, proteina: 4.8 },
  { nome: "Feijão preto cozido", kcal: 77, proteina: 4.5 },
  { nome: "Peito de frango sem pele grelhado", kcal: 159, proteina: 32.0 },
  { nome: "Patinho sem gordura grelhado", kcal: 219, proteina: 35.9 },
  { nome: "Carne bovina moída cozida (acém)", kcal: 212, proteina: 26.7 },
  { nome: "Tilápia grelhada", kcal: 128, proteina: 26.0 },
  { nome: "Ovo de galinha cozido", kcal: 146, proteina: 13.3 },
  { nome: "Batata-doce cozida", kcal: 77, proteina: 0.6 },
  { nome: "Mandioca cozida", kcal: 125, proteina: 0.6 },
  { nome: "Aveia em flocos crua", kcal: 394, proteina: 13.9 },
  { nome: "Pão de forma integral", kcal: 253, proteina: 9.4 },
  { nome: "Leite integral", kcal: 61, proteina: 2.9 },
  { nome: "Iogurte natural", kcal: 51, proteina: 4.1 },
  { nome: "Banana-prata crua", kcal: 98, proteina: 1.3 },
  { nome: "Maçã Fuji com casca", kcal: 56, proteina: 0.3 },
  { nome: "Mamão Formosa cru", kcal: 45, proteina: 0.8 },
  { nome: "Laranja-pera crua", kcal: 37, proteina: 1.0 },
  { nome: "Brócolis cozido", kcal: 25, proteina: 2.1 },
  { nome: "Cenoura cozida", kcal: 30, proteina: 0.8 },
  { nome: "Tomate cru", kcal: 15, proteina: 1.1 },
  { nome: "Pão francês", kcal: 300, proteina: 8.0 },
  { nome: "Mel", kcal: 309, proteina: 0.0 },
  { nome: "Café infusão sem açúcar", kcal: 9, proteina: 0.7 },
  { nome: "Whey protein (estimativa; confira o rótulo)", kcal: 400, proteina: 80.0 }
];

// Base local para interpretar automaticamente itens escritos no plano.
// Valores por 100 g/ml; porções unitárias são estimativas de peso comestível.
const LEGACY_DIET_NUTRITION_TABLE = [
  { key: "ovo", name: "Ovo de galinha cozido", kcal100: 146, protein100: 13.3, aliases: ["ovos inteiros", "ovo inteiro", "ovos", "ovo"], unitGrams: 50 },
  { key: "arroz_integral", name: "Arroz integral cozido", kcal100: 124, protein100: 2.6, aliases: ["arroz integral"] },
  { key: "arroz", name: "Arroz branco cozido", kcal100: 128, protein100: 2.5, aliases: ["arroz branco", "arroz"] },
  { key: "feijao_preto", name: "Feijão preto cozido", kcal100: 77, protein100: 4.5, aliases: ["feijao preto"] },
  { key: "feijao", name: "Feijão carioca cozido", kcal100: 76, protein100: 4.8, aliases: ["feijao carioca", "feijao"] },
  { key: "frango", name: "Peito de frango grelhado", kcal100: 159, protein100: 32, aliases: ["peito de frango", "frango"] },
  { key: "patinho", name: "Patinho grelhado", kcal100: 219, protein100: 35.9, aliases: ["patinho"] },
  { key: "carne", name: "Carne bovina magra (estimativa)", kcal100: 219, protein100: 35.9, aliases: ["carne bovina", "carne moida", "carne"], approximate: true },
  { key: "tilapia", name: "Tilápia grelhada", kcal100: 128, protein100: 26, aliases: ["tilapia"] },
  { key: "pao_forma", name: "Pão de forma integral", kcal100: 253, protein100: 9.4, aliases: ["pao de forma integral", "pao de forma"], unitGrams: 25 },
  { key: "pao_frances", name: "Pão francês", kcal100: 300, protein100: 8, aliases: ["pao frances", "paes franceses", "pao"], unitGrams: 50 },
  { key: "iogurte", name: "Iogurte natural", kcal100: 51, protein100: 4.1, aliases: ["iogurte natural", "iogurte"] },
  { key: "leite", name: "Leite integral", kcal100: 61, protein100: 2.9, aliases: ["leite integral", "leite"] },
  { key: "mamao", name: "Mamão Formosa", kcal100: 45, protein100: 0.8, aliases: ["mamao formosa", "mamao"] },
  { key: "banana", name: "Banana-prata", kcal100: 98, protein100: 1.3, aliases: ["banana prata", "banana"], unitGrams: 80 },
  { key: "maca", name: "Maçã Fuji com casca", kcal100: 56, protein100: 0.3, aliases: ["maca fuji", "maca"], unitGrams: 130 },
  { key: "laranja", name: "Laranja-pera", kcal100: 37, protein100: 1, aliases: ["laranja pera", "laranja"], unitGrams: 140 },
  { key: "aveia", name: "Aveia em flocos", kcal100: 394, protein100: 13.9, aliases: ["aveia em flocos", "aveia"] },
  { key: "batata_doce", name: "Batata-doce cozida", kcal100: 77, protein100: 0.6, aliases: ["batata doce"] },
  { key: "mandioca", name: "Mandioca cozida", kcal100: 125, protein100: 0.6, aliases: ["mandioca", "aipim", "macaxeira"] },
  { key: "brocolis", name: "Brócolis cozido", kcal100: 25, protein100: 2.1, aliases: ["brocolis"] },
  { key: "cenoura", name: "Cenoura cozida", kcal100: 30, protein100: 0.8, aliases: ["cenoura"] },
  { key: "legumes", name: "Legumes cozidos (estimativa)", kcal100: 35, protein100: 1.8, aliases: ["legumes", "vegetais"], approximate: true },
  { key: "mel", name: "Mel", kcal100: 309, protein100: 0, aliases: ["mel"], spoonGrams: 15 },
  { key: "whey", name: "Whey protein (estimativa)", kcal100: 400, protein100: 80, aliases: ["whey protein", "whey"], scoopGrams: 30, approximate: true },
  { key: "cafe", name: "Café sem açúcar", kcal100: 9, protein100: 0.7, aliases: ["cafe sem acucar", "cafe"], approximate: true }
];

const FOOD_PRESETS = Array.isArray(window.FOOD_CATALOG) ? window.FOOD_CATALOG : LEGACY_FOOD_PRESETS.map((food, index) => ({
  key: `legacy_${index}`,
  nome: food.nome,
  categoria: "Outros",
  preparo: "Não informado",
  kcal: food.kcal,
  proteina: food.proteina,
  carboidrato: 0,
  gordura: 0,
  aliases: [food.nome]
}));

const DIET_NUTRITION_TABLE = FOOD_PRESETS.map(food => ({
  key: food.key,
  name: food.nome,
  kcal100: Number(food.kcal) || 0,
  protein100: Number(food.proteina) || 0,
  carb100: Number(food.carboidrato) || 0,
  fat100: Number(food.gordura) || 0,
  aliases: [...new Set([...(food.aliases || []), food.nome])],
  unitGrams: food.unitGrams,
  spoonGrams: food.spoonGrams,
  scoopGrams: food.scoopGrams,
  approximate: Boolean(food.approximate)
}));

function normalizeDietSearch(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9.,]+/g, " ").replace(/\s+/g, " ").trim();
}

function findDietFood(text) {
  const normalized = normalizeDietSearch(text);
  let best = null;
  DIET_NUTRITION_TABLE.forEach(food => food.aliases.forEach(alias => {
    const normalizedAlias = normalizeDietSearch(alias);
    if (normalized.includes(normalizedAlias) && (!best || normalizedAlias.length > best.alias.length)) best = { food, alias: normalizedAlias };
  }));
  return best?.food || null;
}

function parseDietQuantity(text, food) {
  const normalized = normalizeDietSearch(text);
  const number = value => Number(String(value).replace(",", "."));
  let match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|quilo|quilos)\b/);
  if (match) return { grams: number(match[1]) * 1000, label: `${match[1]} kg`, approximate: false };
  match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|grama|gramas)\b/);
  if (match) return { grams: number(match[1]), label: `${match[1]} g`, approximate: false };
  match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:ml|mililitro|mililitros)\b/);
  if (match) return { grams: number(match[1]), label: `${match[1]} ml`, approximate: true };
  match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:fatias?|slices?)\b/);
  if (match && food?.unitGrams) return { grams: number(match[1]) * food.unitGrams, label: `${match[1]} fatia(s)`, count: number(match[1]), approximate: true };
  match = normalized.match(/(\d+(?:[.,]\d+)?)\s*(?:colheres?|cs)\b/);
  if (match && food?.spoonGrams) return { grams: number(match[1]) * food.spoonGrams, label: `${match[1]} colher(es)`, approximate: true };
  match = normalized.match(/(\d+(?:[.,]\d+)?)\s*scoops?\b/);
  if (match && food?.scoopGrams && number(match[1]) <= 5) return { grams: number(match[1]) * food.scoopGrams, label: `${match[1]} scoop(s)`, approximate: true };
  match = normalized.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(?:unidades?|unid\.?|unds?\.?|ovos?|bananas?|macas?|laranjas?|paes?)\b/);
  if (match && food?.unitGrams) return { grams: number(match[1]) * food.unitGrams, label: `${match[1]} unidade(s)`, count: number(match[1]), approximate: true };
  match = normalized.match(/^(\d+(?:[.,]\d+)?)\s+/);
  if (match && food?.unitGrams) return { grams: number(match[1]) * food.unitGrams, label: `${match[1]} unidade(s)`, count: number(match[1]), approximate: true };
  return null;
}

function parseDietNutritionItem(raw, index = 0) {
  const text = typeof raw === "string" ? raw : String(raw?.text || raw?.name || "");
  const food = findDietFood(text);
  const quantity = parseDietQuantity(text, food);
  const item = { id: typeof raw === "object" && raw?.id ? raw.id : `diet_item_${Date.now()}_${index}`, text, matched: false, nutritionVersion: 2 };
  if (!food) return { ...item, issue: "Alimento não reconhecido na tabela." };
  if (!quantity) return { ...item, foodKey: food.key, foodName: food.name, issue: "Informe a quantidade em g, ml ou unidades." };
  const factor = quantity.grams / 100;
  return {
    ...item, matched: true, foodKey: food.key, foodName: food.name,
    grams: Math.round(quantity.grams * 10) / 10, quantityLabel: quantity.label,
    kcal100: food.kcal100, protein100: food.protein100, carb100: food.carb100, fat100: food.fat100,
    kcal: Math.round(food.kcal100 * factor), protein: Math.round(food.protein100 * factor * 10) / 10,
    carbs: Math.round(food.carb100 * factor * 10) / 10, fat: Math.round(food.fat100 * factor * 10) / 10,
    perUnitKcal: quantity.count ? Math.round(food.kcal100 * food.unitGrams / 100) : null,
    perUnitProtein: quantity.count ? Math.round(food.protein100 * food.unitGrams / 10) / 10 : null,
    approximate: Boolean(food.approximate || quantity.approximate)
  };
}

function dietItemText(item) {
  return typeof item === "string" ? item : String(item?.text || item?.foodName || "");
}

function enrichDietPlan(plan = state.dietPlan) {
  const safePlan = plan && typeof plan === "object" ? plan : structuredCloneSafe(DEFAULT_STATE.dietPlan);
  safePlan.meals = Array.isArray(safePlan.meals) ? safePlan.meals : [];
  safePlan.generalNotes = Array.isArray(safePlan.generalNotes) ? safePlan.generalNotes : [];
  safePlan.warnings = Array.isArray(safePlan.warnings) ? safePlan.warnings : [];
  safePlan.meals = safePlan.meals.map((meal, mealIndex) => ({
    ...meal,
    id: meal.id || `diet_meal_${mealIndex + 1}`,
    title: meal.title || `Refeição ${mealIndex + 1}`,
    items: (Array.isArray(meal.items) ? meal.items : []).map((item, itemIndex) => parseDietNutritionItem(item, `${mealIndex}_${itemIndex}`))
  }));
  safePlan.parserVersion = 4;
  safePlan.nutritionUpdatedAt = new Date().toISOString();
  return safePlan;
}

function ensureDietPlanNutrition() {
  if (!state.dietPlan || state.dietPlan.parserVersion < 4 || (state.dietPlan.meals || []).some(meal => (meal.items || []).some(item => typeof item === "string" || (item.matched && item.carbs === undefined)))) {
    state.dietPlan = enrichDietPlan(state.dietPlan);
    saveState();
  }
  return state.dietPlan || structuredCloneSafe(DEFAULT_STATE.dietPlan);
}

function dietMealTotals(meal) {
  return (meal?.items || []).reduce((totals, item) => {
    if (typeof item === "object" && item.matched) {
      totals.kcal += Number(item.kcal) || 0;
      totals.proteina += Number(item.protein) || 0;
      totals.carboidrato += Number(item.carbs) || 0;
      totals.gordura += Number(item.fat) || 0;
      totals.calculated += 1;
    }
    totals.items += 1;
    return totals;
  }, { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0, calculated: 0, items: 0 });
}

function dietPlanTotals(plan = state.dietPlan) {
  return (plan?.meals || []).reduce((totals, meal) => {
    const mealTotals = dietMealTotals(meal);
    totals.kcal += mealTotals.kcal;
    totals.proteina += mealTotals.proteina;
    totals.carboidrato += mealTotals.carboidrato;
    totals.gordura += mealTotals.gordura;
    totals.calculated += mealTotals.calculated;
    totals.items += mealTotals.items;
    return totals;
  }, { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0, calculated: 0, items: 0 });
}

window.enrichDietPlan = enrichDietPlan;

const FOOD_MEAL_LABELS = {
  cafe: "Café da manhã", lanche_manha: "Lanche da manhã", almoco: "Almoço",
  lanche_tarde: "Lanche da tarde", jantar: "Jantar", ceia: "Ceia", outro: "Outro"
};
let selectedFoodKey = null;
let selectedFoodSource = "Preenchimento manual";

function ensureFoodLibrary() {
  if (!state.foodLibrary || typeof state.foodLibrary !== "object") state.foodLibrary = { favorites: [], recent: [] };
  if (!Array.isArray(state.foodLibrary.favorites)) state.foodLibrary.favorites = [];
  if (!Array.isArray(state.foodLibrary.recent)) state.foodLibrary.recent = [];
  return state.foodLibrary;
}

function foodIdentity(item) {
  return item.foodKey || normalizeDietSearch(item.nome);
}

function foodSnapshot(item) {
  return {
    foodKey: item.foodKey || null, nome: item.nome, gramas: Number(item.gramas) || 100,
    kcal100: Number(item.kcal100) || 0, proteina100: Number(item.proteina100) || 0,
    carboidrato100: Number(item.carboidrato100) || 0, gordura100: Number(item.gordura100) || 0,
    fonte: item.fonte || "Preenchimento manual", refeicao: item.refeicao || "outro"
  };
}

function initFoodPresets() {
  const select = document.getElementById("food-preset");
  const categories = new Map();
  FOOD_PRESETS.forEach(food => {
    const category = food.categoria || "Outros";
    if (!categories.has(category)) categories.set(category, []);
    categories.get(category).push(food);
  });
  [...categories.entries()].forEach(([category, foods]) => {
    const group = document.createElement("optgroup");
    group.label = category;
    foods.forEach(food => {
      const option = document.createElement("option");
      option.value = food.key;
      option.textContent = `${food.nome} — ${food.preparo || "não informado"}`;
      group.appendChild(option);
    });
    select.appendChild(group);
  });
}

function getFoodLogForDate(iso) {
  if (!state.foodLog) state.foodLog = {};
  if (!state.foodLog[iso]) state.foodLog[iso] = [];
  return state.foodLog[iso];
}

function foodTotals(item) {
  const factor = Number(item.gramas) / 100;
  return {
    kcal: Math.round((Number(item.kcal100) || 0) * factor),
    proteina: Math.round((Number(item.proteina100) || 0) * factor * 10) / 10,
    carboidrato: Math.round((Number(item.carboidrato100) || 0) * factor * 10) / 10,
    gordura: Math.round((Number(item.gordura100) || 0) * factor * 10) / 10
  };
}

function formatMacro(value) {
  return Number(value || 0).toFixed(1).replace(".", ",");
}

function setFoodFormValues(food) {
  selectedFoodKey = food.foodKey || food.key || null;
  selectedFoodSource = food.fonte || "TACO/NEPA-Unicamp";
  document.getElementById("food-name").value = food.nome;
  document.getElementById("food-grams").value = Number(food.gramas) || Number(food.unitGrams) || 100;
  document.getElementById("food-kcal100").value = Number(food.kcal100 ?? food.kcal ?? 0);
  document.getElementById("food-protein100").value = Number(food.proteina100 ?? food.proteina ?? 0);
  document.getElementById("food-carb100").value = Number(food.carboidrato100 ?? food.carboidrato ?? 0);
  document.getElementById("food-fat100").value = Number(food.gordura100 ?? food.gordura ?? 0);
  document.getElementById("food-meal").value = food.refeicao || "outro";
  document.getElementById("food-favorite").checked = ensureFoodLibrary().favorites.some(item => foodIdentity(item) === foodIdentity({ foodKey: selectedFoodKey, nome: food.nome }));
  document.getElementById("food-search-results").innerHTML = "";
  updateFoodPreview();
}

function renderFoodSearchResults(query) {
  const results = document.getElementById("food-search-results");
  const status = document.getElementById("food-search-status");
  results.innerHTML = "";
  const normalized = normalizeDietSearch(query);
  if (normalized.length < 2) {
    status.textContent = "Digite para pesquisar primeiro na base local. Use Internet para produtos industrializados.";
    return;
  }
  const matches = FOOD_PRESETS.map(food => {
    const fields = [food.nome, ...(food.aliases || [])].map(normalizeDietSearch);
    const exact = fields.some(value => value === normalized);
    const starts = fields.some(value => value.startsWith(normalized));
    const contains = fields.some(value => value.includes(normalized));
    return { food, score: exact ? 3 : starts ? 2 : contains ? 1 : 0 };
  }).filter(match => match.score).sort((a, b) => b.score - a.score || a.food.nome.localeCompare(b.food.nome, "pt-BR")).slice(0, 8);
  if (!matches.length) {
    status.textContent = "Não encontrado na base local. Use Internet ou informe os dados do rótulo.";
    return;
  }
  status.textContent = `${matches.length} resultado(s) na base local. Selecione o preparo correto:`;
  matches.forEach(({ food }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "food-result";
    button.innerHTML = `<span>${food.nome}</span><small>${food.preparo || "Preparo não informado"} · ${food.kcal} kcal · P ${formatMacro(food.proteina)} · C ${formatMacro(food.carboidrato)} · G ${formatMacro(food.gordura)} por 100 g</small>`;
    button.addEventListener("click", () => {
      setFoodFormValues(food);
      document.getElementById("food-preset").value = food.key;
      status.textContent = `${food.approximate ? "Valor aproximado" : "Tabela TACO"}. Confira o preparo e informe a quantidade consumida.`;
    });
    results.appendChild(button);
  });
}

function renderFoodShortcuts() {
  const library = ensureFoodLibrary();
  const items = [...library.favorites, ...library.recent].filter((item, index, all) => all.findIndex(other => foodIdentity(other) === foodIdentity(item)) === index).slice(0, 8);
  const targets = [
    [document.getElementById("food-modal-shortcuts"), document.getElementById("food-modal-shortcut-list")],
    [document.getElementById("food-quick-add"), document.getElementById("food-quick-list")]
  ];
  targets.forEach(([wrapper, list]) => {
    if (!wrapper || !list) return;
    wrapper.hidden = !items.length;
    list.innerHTML = "";
    items.forEach(item => {
      const favorite = library.favorites.some(saved => foodIdentity(saved) === foodIdentity(item));
      const button = document.createElement("button");
      button.type = "button";
      button.className = "food-shortcut";
      button.textContent = `${favorite ? "★ " : ""}${item.nome}`;
      button.addEventListener("click", () => {
        if (document.getElementById("modal-food").hidden) openFoodModal();
        setFoodFormValues(item);
      });
      list.appendChild(button);
    });
  });
}

function renderFoodLog(iso) {
  const list = document.getElementById("food-log-list");
  const empty = document.getElementById("food-log-empty");
  const foods = getFoodLogForDate(iso);
  const summary = document.getElementById("food-log-summary");
  list.innerHTML = "";
  empty.hidden = foods.length > 0;
  const daily = foods.reduce((total, item) => {
    const macros = foodTotals(item);
    Object.keys(total).forEach(key => { total[key] += macros[key]; });
    return total;
  }, { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0 });
  summary.hidden = !foods.length;
  summary.innerHTML = foods.length ? `<b>${Math.round(daily.kcal)} kcal</b><span>P ${formatMacro(daily.proteina)} g</span><span>C ${formatMacro(daily.carboidrato)} g</span><span>G ${formatMacro(daily.gordura)} g</span>` : "";
  foods.forEach(item => {
    const totals = foodTotals(item);
    const row = document.createElement("div");
    row.className = "food-entry";
    const main = document.createElement("div");
    main.className = "food-entry-main";
    const name = document.createElement("span");
    name.className = "food-entry-name";
    name.textContent = item.nome;
    const meal = document.createElement("small");
    meal.className = "food-entry-meal";
    meal.textContent = FOOD_MEAL_LABELS[item.refeicao] || "Outro";
    const info = document.createElement("p");
    info.className = "food-entry-info";
    info.textContent = `${Number(item.gramas).toLocaleString("pt-BR")} g · ${totals.kcal} kcal · P ${formatMacro(totals.proteina)} · C ${formatMacro(totals.carboidrato)} · G ${formatMacro(totals.gordura)}`;
    main.append(name, meal, info);
    const actions = document.createElement("div");
    actions.className = "food-entry-actions";
    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Editar";
    edit.addEventListener("click", () => openFoodModal(item));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Excluir";
    remove.addEventListener("click", () => {
      state.foodLog[iso] = foods.filter(food => food.id !== item.id);
      saveState();
      renderHoje();
    });
    actions.append(edit, remove);
    row.append(main, actions);
    list.appendChild(row);
  });
  renderFoodShortcuts();
}

function updateFoodPreview() {
  const grams = Number(document.getElementById("food-grams").value);
  const kcal100 = Number(document.getElementById("food-kcal100").value);
  const protein100 = Number(document.getElementById("food-protein100").value);
  const carb100 = Number(document.getElementById("food-carb100").value);
  const fat100 = Number(document.getElementById("food-fat100").value);
  const preview = document.getElementById("food-preview");
  if (!(grams > 0) || [kcal100, protein100, carb100, fat100].some(value => value < 0 || !Number.isFinite(value))) {
    preview.textContent = "Informe o peso e os valores nutricionais.";
    return;
  }
  const factor = grams / 100;
  preview.textContent = `${Math.round(kcal100 * factor)} kcal · P ${formatMacro(protein100 * factor)} g · C ${formatMacro(carb100 * factor)} g · G ${formatMacro(fat100 * factor)} g`;
}

function openFoodModal(item = null) {
  editingFoodId = item ? item.id : null;
  const form = document.getElementById("form-food");
  form.reset();
  selectedFoodKey = null;
  selectedFoodSource = "Preenchimento manual";
  document.getElementById("food-preset").value = "";
  document.getElementById("food-manual-values").open = false;
  document.getElementById("food-search-results").innerHTML = "";
  document.getElementById("food-search-status").textContent = "Digite para pesquisar primeiro na base local. Use Internet para produtos industrializados.";
  document.getElementById("modal-food-title").textContent = item ? "Editar alimento" : "Adicionar alimento";
  if (item) {
    setFoodFormValues(item);
  } else {
    document.getElementById("food-meal").value = "outro";
    document.getElementById("food-carb100").value = 0;
    document.getElementById("food-fat100").value = 0;
  }
  renderFoodShortcuts();
  updateFoodPreview();
  document.getElementById("modal-food").hidden = false;
}

function closeFoodModal() {
  document.getElementById("modal-food").hidden = true;
  editingFoodId = null;
}

document.getElementById("btn-add-food").addEventListener("click", () => openFoodModal());
document.getElementById("food-preset").addEventListener("change", (e) => {
  if (e.target.value === "") return;
  const food = FOOD_PRESETS.find(item => item.key === e.target.value);
  if (!food) return;
  setFoodFormValues(food);
  document.getElementById("food-search-status").textContent = `${food.approximate ? "Valor aproximado" : "Valores da tabela TACO"}. Confira o preparo e informe o peso consumido.`;
});
document.getElementById("food-name").addEventListener("input", event => {
  selectedFoodKey = null;
  selectedFoodSource = "Preenchimento manual";
  renderFoodSearchResults(event.target.value);
});
document.getElementById("modal-food-cancel").addEventListener("click", closeFoodModal);
document.getElementById("modal-food").addEventListener("click", (e) => {
  if (e.target.id === "modal-food") closeFoodModal();
});
["food-grams", "food-kcal100", "food-protein100", "food-carb100", "food-fat100"].forEach(id => {
  document.getElementById(id).addEventListener("input", updateFoodPreview);
});

document.getElementById("food-search").addEventListener("click", async () => {
  const query = document.getElementById("food-name").value.trim();
  const status = document.getElementById("food-search-status");
  const results = document.getElementById("food-search-results");
  if (query.length < 2) {
    status.textContent = "Digite pelo menos 2 letras para pesquisar.";
    return;
  }
  status.textContent = "Consultando a base nutricional…";
  results.innerHTML = "";
  try {
    const params = new URLSearchParams({
      search_terms: query, search_simple: "1", action: "process", json: "1",
      page_size: "12", fields: "code,product_name,brands,nutriments"
    });
    const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`);
    if (!response.ok) throw new Error("Falha na consulta");
    const data = await response.json();
    const products = (data.products || []).map(product => {
      const n = product.nutriments || {};
      const kcal = Number(n["energy-kcal_100g"] ?? (Number(n["energy-kj_100g"]) / 4.184));
      const protein = Number(n.proteins_100g);
      const carbs = Number(n.carbohydrates_100g);
      const fat = Number(n.fat_100g);
      return { key: product.code ? `off_${product.code}` : null, nome: product.product_name || query, marca: product.brands || "", kcal, protein, carbs, fat };
    }).filter(p => [p.kcal, p.protein, p.carbs, p.fat].every(Number.isFinite));
    if (!products.length) {
      status.textContent = "Nenhum resultado completo. Informe os valores do rótulo manualmente.";
      return;
    }
    status.textContent = "Selecione o resultado correspondente ao alimento consumido:";
    products.forEach(product => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "food-result";
      const title = document.createElement("span");
      title.textContent = product.marca ? `${product.nome} — ${product.marca}` : product.nome;
      const nutrition = document.createElement("small");
      nutrition.textContent = `${Math.round(product.kcal)} kcal · P ${formatMacro(product.protein)} · C ${formatMacro(product.carbs)} · G ${formatMacro(product.fat)} por 100 g`;
      button.append(title, nutrition);
      button.addEventListener("click", () => {
        setFoodFormValues({
          foodKey: product.key, nome: product.marca ? `${product.nome} — ${product.marca}` : product.nome,
          kcal100: product.kcal, proteina100: product.protein, carboidrato100: product.carbs,
          gordura100: product.fat, gramas: 100, fonte: "Open Food Facts"
        });
        results.innerHTML = "";
        status.textContent = "Valores preenchidos pela Open Food Facts. Confira o produto antes de salvar.";
        updateFoodPreview();
      });
      results.appendChild(button);
    });
  } catch (error) {
    status.textContent = "Consulta indisponível. Você ainda pode informar os valores do rótulo manualmente.";
  }
});

document.getElementById("form-food").addEventListener("submit", (e) => {
  e.preventDefault();
  const iso = todayISO();
  const item = {
    id: editingFoodId || `food_${Date.now()}`,
    nome: document.getElementById("food-name").value.trim(),
    gramas: Number(document.getElementById("food-grams").value),
    kcal100: Number(document.getElementById("food-kcal100").value),
    proteina100: Number(document.getElementById("food-protein100").value),
    carboidrato100: Number(document.getElementById("food-carb100").value),
    gordura100: Number(document.getElementById("food-fat100").value),
    refeicao: document.getElementById("food-meal").value,
    foodKey: selectedFoodKey,
    fonte: selectedFoodSource
  };
  const foods = getFoodLogForDate(iso);
  const index = foods.findIndex(food => food.id === editingFoodId);
  if (index >= 0) foods[index] = item;
  else foods.push(item);
  const library = ensureFoodLibrary();
  const identity = foodIdentity(item);
  library.recent = [foodSnapshot(item), ...library.recent.filter(saved => foodIdentity(saved) !== identity)].slice(0, 8);
  if (document.getElementById("food-favorite").checked) {
    library.favorites = [foodSnapshot(item), ...library.favorites.filter(saved => foodIdentity(saved) !== identity)].slice(0, 20);
  } else {
    library.favorites = library.favorites.filter(saved => foodIdentity(saved) !== identity);
  }
  saveState();
  closeFoodModal();
  renderHoje();
  showToast("Alimento salvo e somado às metas.");
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
  const custom = !!state.customRoutine?.enabled;
  document.getElementById("week-subtitle").textContent = custom
    ? "Treinos, compromissos e refeição livre conforme sua configuração."
    : "Sua programação semanal.";

  for (let i = 1; i <= 7; i++) {
    const wdIndex = i === 7 ? 0 : i; // 1..6 seg-sáb, 7->0 domingo
    const dateForDay = new Date(monday);
    dateForDay.setDate(monday.getDate() + (i - 1));
    const isoDay = isoFromDate(dateForDay);
    const isToday = isoDay === todayISO();
    const plan = getDayPlan(dateForDay);
    const dayName = WEEKDAY_NAMES[wdIndex].charAt(0) + WEEKDAY_NAMES[wdIndex].slice(1).toLowerCase();
    const training = plan.eventos.some(event => event.type === "treino");
    const commitment = plan.eventos.find(event => event.type === "periodo");
    const configuredFreeDay = state.customRoutine?.freeMealDay;
    const plannedFree = configuredFreeDay !== null && configuredFreeDay !== undefined && configuredFreeDay !== "" && Number(configuredFreeDay) === wdIndex;
    const badge = training ? "treino" : "descanso";
    const badgeLabel = training ? "treino" : "descanso";
    const details = [];
    if (commitment) details.push(`${commitment.title} ${commitment.time}`);
    if (training) {
      const workout = plan.eventos.find(event => event.type === "treino");
      details.push(`Treino ${workout.time}`);
      const imported = state.workoutPlan?.days?.[wdIndex];
      if (imported?.focus) details.push(imported.focus);
    } else details.push("Sem treino programado");
    if (plannedFree) details.push("dia preferido para refeição livre");

    const card = document.createElement("div");
    card.className = "week-day-card" + (isToday ? " today" : "");
    const weekUse = state.freeMealUse[getISOWeekKey(dateForDay)];
    const isMarkedFree = !!weekUse && weekUse.data === isoDay;

    card.innerHTML = `
      <div class="wd-top">
        <span class="wd-name">${dayName}${isToday ? " · hoje" : ""}</span>
        <span class="wd-badge ${badge}">${badgeLabel}</span>
      </div>
      <p class="wd-sub">${details.join(" · ")}.</p>
      ${plannedFree || isMarkedFree ? `<button class="week-free-btn ${isMarkedFree ? "selected" : ""}" data-free-date="${isoDay}">${isMarkedFree ? "Refeição livre marcada ✓" : "Marcar refeição livre neste dia"}</button>` : ""}
    `;
    grid.appendChild(card);
  }

  grid.querySelectorAll("[data-free-date]").forEach(button => {
    button.addEventListener("click", () => {
      const iso = button.dataset.freeDate;
      const date = new Date(iso + "T12:00:00");
      const meal = [...getDayPlan(date).eventos].reverse().find(event => event.type === "refeicao");
      if (!meal) return showToast("Não existe refeição programada nesse dia.");
      toggleFreeMeal(iso, meal.id);
      renderSemana();
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
   16. RENDER — DIETA IMPORTADA
--------------------------------------------------------- */
function renderDieta() {
  const plan = ensureDietPlanNutrition();
  const source = document.getElementById("diet-source-card");
  const summary = document.getElementById("diet-plan-summary");
  const mealsBox = document.getElementById("diet-meal-list");
  const notesSection = document.getElementById("diet-notes-section");
  const notesBox = document.getElementById("diet-note-list");
  const warningSection = document.getElementById("diet-warning-section");
  const warningBox = document.getElementById("diet-warning-list");
  source.hidden = !plan.source;
  source.innerHTML = "";
  if (plan.source) {
    const sourceInfo = document.createElement("div");
    const sourceTitle = document.createElement("b");
    sourceTitle.textContent = plan.source;
    const sourceMeta = document.createElement("span");
    sourceMeta.textContent = `${plan.meals.length} refeição(ões) · valores nutricionais estimados`;
    sourceInfo.append(sourceTitle, sourceMeta);
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remover plano";
    remove.addEventListener("click", () => {
      if (!window.confirm("Remover o plano alimentar importado desta conta?")) return;
      state.dietPlan = structuredCloneSafe(DEFAULT_STATE.dietPlan);
      saveState();
      renderDieta();
      renderHoje();
      showToast("Plano alimentar removido.");
    });
    source.append(sourceInfo, remove);
  }
  const planTotals = dietPlanTotals(plan);
  summary.hidden = !plan.meals.length;
  summary.innerHTML = plan.meals.length ? `
    <div><span>Total planejado</span><b>${Math.round(planTotals.kcal)} kcal</b></div>
    <div><span>Macronutrientes</span><b>P ${Math.round(planTotals.proteina)} · C ${Math.round(planTotals.carboidrato)} · G ${Math.round(planTotals.gordura)} g</b></div>
    <small>${planTotals.calculated} de ${planTotals.items} item(ns) calculado(s). Valores aproximados; confira marcas e modos de preparo.</small>` : "";
  mealsBox.innerHTML = "";
  plan.meals.forEach((meal, index) => {
    const card = document.createElement("article");
    card.className = "diet-meal-card";
    const head = document.createElement("div");
    head.className = "diet-meal-head";
    const number = document.createElement("span");
    number.className = "diet-meal-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const heading = document.createElement("div");
    heading.className = "diet-meal-heading";
    const title = document.createElement("b");
    title.textContent = meal.title;
    const time = document.createElement("small");
    time.textContent = meal.time || "Horário flexível";
    heading.append(title, time);
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "diet-meal-edit";
    edit.textContent = "Editar";
    edit.addEventListener("click", () => openDietEditor(meal.id));
    head.append(number, heading, edit);
    const list = document.createElement("div");
    list.className = "diet-item-list";
    meal.items.forEach(item => {
      const row = document.createElement("div");
      row.className = "diet-item-row";
      const copy = document.createElement("div");
      copy.className = "diet-item-copy";
      const itemText = document.createElement("span");
      itemText.textContent = dietItemText(item);
      const detail = document.createElement("small");
      detail.textContent = item.matched
        ? `${item.foodName} · ${item.quantityLabel}${item.perUnitKcal ? ` · ≈ ${item.perUnitKcal} kcal/unid.` : ""}${item.approximate ? " · estimativa" : ""}`
        : item.issue || "Cálculo pendente";
      copy.append(itemText, detail);
      const macros = document.createElement("div");
      macros.className = `diet-item-macros${item.matched ? "" : " pending"}`;
      macros.innerHTML = item.matched
        ? `${Math.round(item.kcal)} kcal<br>P ${formatMacro(item.protein)} · C ${formatMacro(item.carbs)} · G ${formatMacro(item.fat)} g`
        : "conferir";
      row.append(copy, macros);
      list.appendChild(row);
    });
    const mealTotals = dietMealTotals(meal);
    const total = document.createElement("div");
    total.className = "diet-meal-total";
    total.innerHTML = `<span>${mealTotals.calculated}/${mealTotals.items} item(ns) calculado(s)</span><b>${Math.round(mealTotals.kcal)} kcal · P ${Math.round(mealTotals.proteina)} · C ${Math.round(mealTotals.carboidrato)} · G ${Math.round(mealTotals.gordura)} g</b>`;
    card.append(head, list, total);
    mealsBox.appendChild(card);
  });
  if (!plan.meals.length) {
    const empty = document.createElement("div");
    empty.className = "diet-empty";
    empty.innerHTML = "<b>Nenhum plano importado</b><span>Use o botão Importar plano para enviar seu PDF ou DOCX.</span>";
    mealsBox.appendChild(empty);
  }
  notesSection.hidden = !plan.generalNotes.length;
  notesBox.innerHTML = "";
  plan.generalNotes.forEach(note => {
    const li = document.createElement("li");
    li.textContent = note;
    notesBox.appendChild(li);
  });
  const nutritionWarnings = [];
  plan.meals.forEach(meal => meal.items.filter(item => !item.matched).forEach(item => nutritionWarnings.push(`${meal.title}: ${dietItemText(item)} — ${item.issue || "cálculo pendente"}`)));
  const allWarnings = [...new Set([...(plan.warnings || []), ...nutritionWarnings])];
  warningSection.hidden = !allWarnings.length;
  warningBox.innerHTML = "";
  allWarnings.forEach(warning => {
    const li = document.createElement("li");
    li.textContent = warning;
    warningBox.appendChild(li);
  });
}

let editingDietMealId = null;

function openDietEditor(mealId = null) {
  const plan = ensureDietPlanNutrition();
  const meal = plan.meals.find(item => item.id === mealId) || null;
  editingDietMealId = meal?.id || null;
  document.getElementById("diet-editor-heading").textContent = meal ? "Editar refeição" : "Adicionar refeição";
  document.getElementById("diet-editor-id").value = meal?.id || "";
  document.getElementById("diet-editor-title").value = meal?.title || "";
  document.getElementById("diet-editor-time").value = meal?.time || "";
  document.getElementById("diet-editor-items").value = (meal?.items || []).map(dietItemText).join("\n");
  document.getElementById("diet-editor-notes").value = (plan.generalNotes || []).join("\n");
  document.getElementById("diet-editor-delete").hidden = !meal;
  document.getElementById("modal-diet-editor").hidden = false;
}

function closeDietEditor() {
  editingDietMealId = null;
  document.getElementById("modal-diet-editor").hidden = true;
}

document.getElementById("btn-add-diet-meal").addEventListener("click", () => openDietEditor());
document.getElementById("diet-editor-cancel").addEventListener("click", closeDietEditor);
document.getElementById("modal-diet-editor").addEventListener("click", event => {
  if (event.target.id === "modal-diet-editor") closeDietEditor();
});
document.getElementById("form-diet-editor").addEventListener("submit", event => {
  event.preventDefault();
  const plan = ensureDietPlanNutrition();
  const rawItems = document.getElementById("diet-editor-items").value.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
  if (!rawItems.length) return showToast("Adicione pelo menos um alimento.");
  const currentIndex = plan.meals.findIndex(meal => meal.id === editingDietMealId);
  const meal = {
    id: editingDietMealId || `diet_meal_${Date.now()}`,
    title: document.getElementById("diet-editor-title").value.trim(),
    time: document.getElementById("diet-editor-time").value || null,
    items: rawItems
  };
  if (currentIndex >= 0) plan.meals[currentIndex] = meal;
  else plan.meals.push(meal);
  plan.generalNotes = document.getElementById("diet-editor-notes").value.split(/\r?\n/).map(note => note.trim()).filter(Boolean);
  plan.source = plan.source || "Plano criado no aplicativo";
  plan.parsedAt = new Date().toISOString();
  state.dietPlan = enrichDietPlan(plan);
  state.customRoutine.mealCount = state.dietPlan.meals.length;
  saveState();
  window.persistRoutineConfig?.(state.customRoutine);
  closeDietEditor();
  renderDieta();
  renderHoje();
  renderSemana();
  showToast("Dieta atualizada e recalculada.");
});
document.getElementById("diet-editor-delete").addEventListener("click", () => {
  if (!editingDietMealId || !window.confirm("Excluir esta refeição do plano?")) return;
  const plan = ensureDietPlanNutrition();
  plan.meals = plan.meals.filter(meal => meal.id !== editingDietMealId);
  state.dietPlan = enrichDietPlan(plan);
  state.customRoutine.mealCount = Math.max(3, state.dietPlan.meals.length || 3);
  saveState();
  window.persistRoutineConfig?.(state.customRoutine);
  closeDietEditor();
  renderDieta();
  renderHoje();
  renderSemana();
  showToast("Refeição excluída.");
});

/* ---------------------------------------------------------
   16A. GERADOR DE PLANO ALIMENTAR BASE
--------------------------------------------------------- */
const baseDietModal = document.getElementById("modal-base-diet");
const baseDietForm = document.getElementById("form-base-diet");
const BASE_DIET_MEAL_TYPES = {
  3: ["breakfast", "lunch", "dinner"],
  4: ["breakfast", "lunch", "snack", "dinner"],
  5: ["breakfast", "snack", "lunch", "snack", "dinner"],
  6: ["breakfast", "snack", "lunch", "snack", "dinner", "supper"]
};
const BASE_DIET_TITLES = {
  breakfast: "Café da manhã", lunch: "Almoço", snack: "Lanche",
  dinner: "Jantar", supper: "Ceia"
};
const BASE_DIET_DAIRY = new Set(["iogurte_natural", "iogurte_desnatado", "leite_integral", "queijo_minas", "mucarela", "ricota"]);
const BASE_DIET_GLUTEN = new Set(["pao_frances", "pao_integral", "macarrao_cozido", "aveia_flocos_crua"]);
const BASE_DIET_MEATS = new Set(["frango_peito_grelhado", "frango_peito_cozido", "frango_sobrecoxa_assada", "patinho_grelhado", "acem_moido_cozido", "hamburguer_grelhado", "lombo_assado", "tilapia_grelhada", "atum_oleo"]);
const BASE_DIET_RED_MEATS = new Set(["patinho_grelhado", "acem_moido_cozido", "hamburguer_grelhado", "lombo_assado"]);

function baseDietFood(key) {
  return FOOD_PRESETS.find(food => food.key === key) || null;
}

function clockToMinutes(value, fallback = 0) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : fallback;
}

function minutesToClock(value) {
  const normalized = ((Math.round(value) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, "0")}:${String(normalized % 60).padStart(2, "0")}`;
}

function baseDietTimes(count) {
  const wake = clockToMinutes(state.customRoutine?.wakeTime, 7 * 60);
  let sleep = clockToMinutes(state.customRoutine?.sleepTime, 23 * 60);
  if (sleep <= wake) sleep += 1440;
  const start = wake + 30;
  const end = Math.max(start + (count - 1) * 120, sleep - 90);
  const interval = count > 1 ? (end - start) / (count - 1) : 0;
  return Array.from({ length: count }, (_, index) => minutesToClock(start + interval * index));
}

function baseDietConfigFromForm() {
  return {
    goal: baseDietForm.goal.value,
    targetKcal: Number(baseDietForm.target_kcal.value),
    targetProtein: Number(baseDietForm.target_protein.value),
    mealCount: Number(baseDietForm.meal_count.value),
    style: baseDietForm.style.value,
    budget: baseDietForm.budget.value,
    cooking: baseDietForm.cooking.value,
    primaryCarb: baseDietForm.primary_carb.value,
    trainingTime: baseDietForm.training_time.value || "",
    restrictions: [...baseDietForm.querySelectorAll('[name="restrictions"]:checked')].map(input => input.value),
    avoid: baseDietForm.avoid.value.split(/[,;\n]+/).map(value => normalizeDietSearch(value)).filter(value => value.length > 1)
  };
}

function baseDietFoodAllowed(food, config) {
  if (!food) return false;
  const restrictions = new Set(config.restrictions || []);
  if (restrictions.has("lactose") && BASE_DIET_DAIRY.has(food.key)) return false;
  if (restrictions.has("egg") && food.key.startsWith("ovo_")) return false;
  if (restrictions.has("gluten") && BASE_DIET_GLUTEN.has(food.key)) return false;
  if (restrictions.has("peanut") && food.key === "amendoim_torrado") return false;
  if (config.style === "vegetarian" && BASE_DIET_MEATS.has(food.key)) return false;
  if (config.style === "no_red_meat" && BASE_DIET_RED_MEATS.has(food.key)) return false;
  const searchable = [food.nome, ...(food.aliases || [])].map(normalizeDietSearch).join(" ");
  return !(config.avoid || []).some(term => searchable.includes(term));
}

function pickBaseDietFood(keys, config, offset = 0) {
  const available = keys.map(baseDietFood).filter(food => baseDietFoodAllowed(food, config));
  return available.length ? available[offset % available.length] : null;
}

function addBaseDietComponent(components, food, grams) {
  if (!food || !(grams > 0)) return;
  const existing = components.find(component => component.food.key === food.key);
  if (existing) existing.grams += grams;
  else components.push({ food, grams });
}

function createBaseDietMeal(type, index, config) {
  const components = [];
  const fruit = pickBaseDietFood(["banana_prata", "maca_fuji", "mamao_formosa", "laranja_pera", "manga_palmer", "abacaxi_cru"], config, index);
  const vegetable = pickBaseDietFood(["brocolis_cozido", "cenoura_cozida", "abobora_cabotia", "tomate_cru", "abobrinha_cozida"], config, index);
  const carb = pickBaseDietFood([config.primaryCarb, "arroz_branco_cozido", "batata_doce_cozida", "mandioca_cozida", "polenta"], config, index);
  const legume = pickBaseDietFood(["feijao_carioca_cozido", "lentilha_cozida", "feijao_preto_cozido", "ervilha_conserva"], config, index);
  const mainProteinKeys = config.style === "vegetarian"
    ? ["ovo_cozido", "lentilha_cozida", "feijao_carioca_cozido", "ricota"]
    : config.budget === "economy"
      ? ["frango_peito_grelhado", "ovo_cozido", "acem_moido_cozido", "tilapia_grelhada"]
      : ["tilapia_grelhada", "frango_peito_grelhado", "patinho_grelhado", "atum_oleo", "ovo_cozido"];
  const protein = pickBaseDietFood(mainProteinKeys, config, index);
  const breakfastCarb = pickBaseDietFood(["pao_integral", "aveia_flocos_crua", "pao_frances", "batata_doce_cozida"], config, index);
  const lightProtein = pickBaseDietFood(
    config.style === "vegetarian"
      ? ["iogurte_natural", "ovo_cozido", "ricota", "lentilha_cozida", "amendoim_torrado"]
      : ["iogurte_natural", "ovo_cozido", "leite_integral", "atum_oleo", "frango_peito_cozido", "amendoim_torrado"],
    config,
    index
  );

  if (type === "breakfast") {
    addBaseDietComponent(components, breakfastCarb, breakfastCarb?.key.includes("pao") ? 50 : 40);
    addBaseDietComponent(components, lightProtein, BASE_DIET_DAIRY.has(lightProtein?.key) ? (lightProtein?.key === "leite_integral" ? 200 : 170) : lightProtein?.key === "amendoim_torrado" ? 25 : 100);
    addBaseDietComponent(components, fruit, fruit?.unitGrams || 100);
  } else if (type === "lunch" || type === "dinner") {
    const dinnerFactor = type === "dinner" ? 0.85 : 1;
    addBaseDietComponent(components, carb, 150 * dinnerFactor);
    addBaseDietComponent(components, legume, 100 * dinnerFactor);
    addBaseDietComponent(components, protein, 140 * dinnerFactor);
    addBaseDietComponent(components, vegetable, 100);
  } else if (type === "snack") {
    addBaseDietComponent(components, fruit, fruit?.unitGrams || 100);
    addBaseDietComponent(components, lightProtein, BASE_DIET_DAIRY.has(lightProtein?.key) ? (lightProtein?.key === "leite_integral" ? 200 : 170) : lightProtein?.key === "amendoim_torrado" ? 25 : 80);
    if (config.cooking === "normal") addBaseDietComponent(components, breakfastCarb, breakfastCarb?.key.includes("pao") ? 25 : 25);
  } else {
    addBaseDietComponent(components, lightProtein, BASE_DIET_DAIRY.has(lightProtein?.key) ? (lightProtein?.key === "leite_integral" ? 200 : 170) : lightProtein?.key === "amendoim_torrado" ? 20 : 80);
    addBaseDietComponent(components, fruit, fruit?.unitGrams || 100);
  }
  return components;
}

function baseDietComponentTotals(components) {
  return components.reduce((totals, component) => {
    const factor = component.grams / 100;
    totals.kcal += Number(component.food.kcal) * factor;
    totals.proteina += Number(component.food.proteina) * factor;
    totals.carboidrato += Number(component.food.carboidrato) * factor;
    totals.gordura += Number(component.food.gordura) * factor;
    return totals;
  }, { kcal: 0, proteina: 0, carboidrato: 0, gordura: 0 });
}

function buildBaseDietPlan(config) {
  const types = BASE_DIET_MEAL_TYPES[config.mealCount] || BASE_DIET_MEAL_TYPES[4];
  const times = baseDietTimes(types.length);
  const rawMeals = types.map((type, index) => ({ type, time: times[index], components: createBaseDietMeal(type, index, config) }));
  const baseTotals = baseDietComponentTotals(rawMeals.flatMap(meal => meal.components));
  if (baseTotals.kcal < 500) throw new Error("As restrições eliminaram alimentos demais. Revise as opções informadas");
  const factor = Math.min(2.4, Math.max(0.55, config.targetKcal / baseTotals.kcal));
  rawMeals.forEach(meal => meal.components.forEach(component => {
    component.grams = Math.max(5, Math.round(component.grams * factor / 5) * 5);
  }));

  const trainingMinutes = clockToMinutes(config.trainingTime, -1);
  if (trainingMinutes >= 0) {
    const indexedTimes = times.map((time, index) => ({ index, minutes: clockToMinutes(time) }));
    const before = indexedTimes.filter(item => item.minutes <= trainingMinutes).pop();
    const after = indexedTimes.find(item => item.minutes > trainingMinutes);
    if (before && types[before.index] === "snack") rawMeals[before.index].customTitle = "Pré-treino";
    if (after && types[after.index] === "snack") rawMeals[after.index].customTitle = "Pós-treino";
  }

  const repeatedTitles = {};
  const meals = rawMeals.map((meal, index) => {
    const defaultTitle = meal.customTitle || BASE_DIET_TITLES[meal.type];
    repeatedTitles[defaultTitle] = (repeatedTitles[defaultTitle] || 0) + 1;
    const title = repeatedTitles[defaultTitle] > 1 ? `${defaultTitle} ${repeatedTitles[defaultTitle]}` : defaultTitle;
    return {
      id: `base_diet_meal_${index + 1}`,
      title,
      time: meal.time,
      items: meal.components.map(component => `${Math.round(component.grams)} g de ${component.food.nome}`)
    };
  });
  const goalLabels = { lose: "redução de peso", maintain: "manutenção de peso", gain: "ganho de massa" };
  const warnings = [];
  rawMeals.forEach((meal, index) => {
    if (meal.components.length < 2) warnings.push(`${meals[index].title}: poucas opções compatíveis com as restrições informadas.`);
  });
  const plan = enrichDietPlan({
    source: "Plano alimentar base criado no aplicativo",
    parsedAt: new Date().toISOString(),
    parserVersion: 4,
    baseConfig: { ...config, avoid: [...config.avoid], restrictions: [...config.restrictions] },
    meals,
    generalNotes: [
      `Objetivo informado: ${goalLabels[config.goal] || "organização alimentar"}.`,
      `Metas usadas no cálculo: ${config.targetKcal} kcal e pelo menos ${config.targetProtein} g de proteína por dia. Altere as metas no Perfil quando necessário.`,
      "Sugestão baseada principalmente em alimentos in natura ou minimamente processados. Todas as refeições podem ser editadas."
    ],
    warnings
  });
  const totals = dietPlanTotals(plan);
  if (Math.abs(totals.kcal - config.targetKcal) / config.targetKcal > 0.12) {
    plan.warnings.push(`O plano chegou a ${Math.round(totals.kcal)} kcal. Ajuste as porções manualmente para se aproximar da meta de ${config.targetKcal} kcal.`);
  }
  if (totals.proteina < config.targetProtein * 0.85) {
    plan.warnings.push(`A combinação selecionada chegou a ${Math.round(totals.proteina)} g de proteína, abaixo da meta de ${config.targetProtein} g. Revise as restrições ou edite as fontes proteicas.`);
  }
  return plan;
}

function updateBaseDietPreview() {
  const preview = document.getElementById("base-diet-preview");
  const safety = document.getElementById("base-diet-safety");
  const submit = baseDietForm.querySelector('[type="submit"]');
  const age = Number(state.profile?.idade);
  if (age > 0 && age < 18) {
    preview.innerHTML = '<div class="base-diet-preview-warning">O gerador automático não é disponibilizado para menores de 18 anos.</div>';
    safety.textContent = "Menores de 18 anos devem organizar a alimentação com o responsável e um profissional habilitado.";
    submit.disabled = true;
    return;
  }
  submit.disabled = false;
  safety.textContent = "Em caso de alergia grave, doença, gestação, uso de medicação ou necessidade clínica, não use o gerador sem orientação profissional.";
  try {
    const plan = buildBaseDietPlan(baseDietConfigFromForm());
    const totals = dietPlanTotals(plan);
    preview.innerHTML = `
      <div class="base-diet-preview-summary">
        <div><b>${Math.round(totals.kcal)}</b><span>kcal</span></div>
        <div><b>${Math.round(totals.proteina)} g</b><span>proteína</span></div>
        <div><b>${Math.round(totals.carboidrato)} g</b><span>carboidrato</span></div>
        <div><b>${Math.round(totals.gordura)} g</b><span>gordura</span></div>
      </div>
      <div class="base-diet-preview-meals">${plan.meals.map(meal => `<b>${meal.time}</b> ${meal.title}`).join(" · ")}</div>
      ${plan.warnings.length ? `<div class="base-diet-preview-warning">${plan.warnings.join(" ")}</div>` : ""}`;
  } catch (error) {
    preview.innerHTML = `<div class="base-diet-preview-warning">${error.message}.</div>`;
    submit.disabled = true;
  }
}

function inferredBaseDietGoal() {
  const objective = normalizeDietSearch(state.profile?.objetivo);
  if (/emagre|reduzir|perder/.test(objective)) return "lose";
  if (/ganhar|massa|hipertrofia/.test(objective)) return "gain";
  return "maintain";
}

function openBaseDietModal() {
  baseDietForm.reset();
  const previous = state.dietPlan?.baseConfig || {};
  const savedMealCount = Number(previous.mealCount || state.customRoutine?.mealCount || 4);
  const savedTarget = Number(previous.targetKcal || state.metas?.kcal || 2000);
  const savedProtein = Number(previous.targetProtein || state.metas?.proteinaMin || 100);
  baseDietForm.goal.value = previous.goal || inferredBaseDietGoal();
  baseDietForm.target_kcal.value = Math.min(4000, Math.max(1200, savedTarget));
  baseDietForm.target_protein.value = Math.min(300, Math.max(40, savedProtein));
  baseDietForm.meal_count.value = String([3, 4, 5, 6].includes(savedMealCount) ? savedMealCount : 4);
  baseDietForm.style.value = previous.style || "omnivore";
  baseDietForm.budget.value = previous.budget || "economy";
  baseDietForm.cooking.value = previous.cooking || "normal";
  baseDietForm.primary_carb.value = previous.primaryCarb || "arroz_branco_cozido";
  baseDietForm.training_time.value = previous.trainingTime || state.customRoutine?.trainingTime || "";
  baseDietForm.avoid.value = (previous.avoid || []).join(", ");
  const restrictions = new Set(previous.restrictions || []);
  baseDietForm.querySelectorAll('[name="restrictions"]').forEach(input => { input.checked = restrictions.has(input.value); });
  updateBaseDietPreview();
  baseDietModal.hidden = false;
}

function closeBaseDietModal() { baseDietModal.hidden = true; }

document.getElementById("btn-base-diet").addEventListener("click", openBaseDietModal);
document.getElementById("base-diet-cancel").addEventListener("click", closeBaseDietModal);
baseDietModal.addEventListener("click", event => { if (event.target === baseDietModal) closeBaseDietModal(); });
baseDietForm.addEventListener("input", updateBaseDietPreview);
baseDietForm.addEventListener("change", updateBaseDietPreview);
baseDietForm.addEventListener("submit", async event => {
  event.preventDefault();
  const age = Number(state.profile?.idade);
  if (age > 0 && age < 18) return showToast("O plano automático não está disponível para menores de 18 anos.");
  const plan = buildBaseDietPlan(baseDietConfigFromForm());
  if ((state.dietPlan?.meals || []).length && !window.confirm("Criar o plano-base substituirá o plano alimentar atual. Deseja continuar?")) return;
  state.dietPlan = plan;
  state.customRoutine.mealCount = plan.meals.length;
  saveState();
  if (window.persistRoutineConfig) await window.persistRoutineConfig(state.customRoutine);
  closeBaseDietModal();
  renderDieta();
  renderHoje();
  renderSemana();
  showToast("Plano alimentar base criado. Todas as refeições podem ser editadas.");
});

/* ---------------------------------------------------------
   17. RENDER — TREINO SEPARADO DA ALIMENTAÇÃO
--------------------------------------------------------- */
function createExerciseList(exercises) {
  const list = document.createElement("ol");
  list.className = "training-exercises";
  exercises.forEach(exercise => {
    const item = document.createElement("li");
    item.textContent = exercise;
    list.appendChild(item);
  });
  return list;
}

function renderTreino() {
  const today = new Date();
  const wd = today.getDay();
  const iso = todayISO();
  const configured = (state.customRoutine?.trainingDays || []).map(Number).includes(wd);
  const workout = state.workoutPlan?.days?.[wd];
  const completion = getCompletionsForDate(iso);
  const todayBox = document.getElementById("training-today");
  todayBox.innerHTML = "";

  const heading = document.createElement("div");
  heading.className = "training-heading";
  const headingText = document.createElement("div");
  const eyebrow = document.createElement("span");
  eyebrow.textContent = "TREINO DE HOJE";
  const title = document.createElement("h2");
  title.textContent = configured ? (workout?.focus || "Treino programado") : "Dia sem treino";
  headingText.append(eyebrow, title);
  if (configured) {
    const time = document.createElement("b");
    time.textContent = state.customRoutine?.trainingTime || "—";
    heading.append(headingText, time);
  } else heading.appendChild(headingText);
  todayBox.appendChild(heading);

  if (!configured) {
    const empty = document.createElement("p");
    empty.className = "training-empty";
    empty.textContent = "Nenhum treino foi programado para hoje. Você pode alterar os dias em Perfil → Personalizar minha rotina.";
    todayBox.appendChild(empty);
  } else {
    if (workout?.exercises?.length) todayBox.appendChild(createExerciseList(workout.exercises));
    else {
      const empty = document.createElement("p");
      empty.className = "training-empty";
      empty.textContent = "O dia está programado, mas ainda não há exercícios identificados. Envie um PDF/DOCX ou ajuste seu plano.";
      todayBox.appendChild(empty);
    }
    const doneButton = document.createElement("button");
    doneButton.className = "training-done-btn" + (completion.treino ? " completed" : "");
    doneButton.textContent = completion.treino ? "Treino concluído ✓" : "Marcar treino como concluído";
    doneButton.addEventListener("click", () => {
      completion.treino = !completion.treino;
      saveState();
      renderTreino();
    });
    todayBox.appendChild(doneButton);
  }

  const weekBox = document.getElementById("training-week-list");
  weekBox.innerHTML = "";
  for (let day = 1; day <= 7; day++) {
    const dayIndex = day === 7 ? 0 : day;
    const active = (state.customRoutine?.trainingDays || []).map(Number).includes(dayIndex);
    if (!active) continue;
    const dayWorkout = state.workoutPlan?.days?.[dayIndex];
    const card = document.createElement("article");
    card.className = "training-day-card";
    const cardHead = document.createElement("div");
    cardHead.className = "training-day-head";
    const dayName = document.createElement("b");
    dayName.textContent = WEEKDAY_NAMES[dayIndex];
    const focus = document.createElement("span");
    focus.textContent = dayWorkout?.focus || "Treino programado";
    cardHead.append(dayName, focus);
    card.appendChild(cardHead);
    if (dayWorkout?.exercises?.length) card.appendChild(createExerciseList(dayWorkout.exercises));
    const edit = document.createElement("button");
    edit.type = "button";
    edit.className = "training-card-edit";
    edit.textContent = dayWorkout?.exercises?.length ? "Corrigir este treino" : "Adicionar exercícios";
    edit.addEventListener("click", () => openWorkoutEditor(dayIndex));
    card.appendChild(edit);
    weekBox.appendChild(card);
  }
  if (!weekBox.children.length) {
    const empty = document.createElement("p");
    empty.className = "training-empty";
    empty.textContent = "Nenhum dia de treino selecionado.";
    weekBox.appendChild(empty);
  }
  const hasWorkoutPlan = Object.keys(state.workoutPlan?.days || {}).length > 0;
  const hasTrainingDays = (state.customRoutine?.trainingDays || []).length > 0;
  document.getElementById("training-reset-area").hidden = !hasWorkoutPlan && !hasTrainingDays;
}

document.getElementById("btn-reset-workout-plan").addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Excluir o plano de treino atual e remover todos os dias programados? Seu perfil, dieta e evolução serão mantidos."
  );
  if (!confirmed) return;
  state.workoutPlan = structuredCloneSafe(DEFAULT_STATE.workoutPlan);
  state.customRoutine.trainingDays = [];
  Object.values(state.completions || {}).forEach(day => {
    if (day && typeof day === "object") delete day.treino;
  });
  saveState();
  if (window.persistRoutineConfig) await window.persistRoutineConfig(state.customRoutine);
  renderTreino();
  renderSemana();
  renderHoje();
  showToast("Plano de treino excluído. A aba foi reiniciada.");
});

/* ---------------------------------------------------------
   17A. GERADOR DE PLANO DE TREINO-BASE
--------------------------------------------------------- */
const BASE_WORKOUT_LIBRARY = {
  gym: {
    fullA: { focus: "Corpo inteiro A", exercises: ["Leg press", "Supino máquina", "Remada sentada", "Mesa flexora", "Elevação lateral", "Prancha"] },
    fullB: { focus: "Corpo inteiro B", exercises: ["Agachamento no smith", "Puxada frontal", "Supino inclinado com halteres", "Cadeira extensora", "Rosca direta", "Tríceps na polia"] },
    fullC: { focus: "Corpo inteiro C", exercises: ["Levantamento terra romeno com halteres", "Desenvolvimento máquina", "Remada baixa", "Afundo com apoio", "Panturrilha em pé", "Abdominal máquina"] },
    upperA: { focus: "Superiores A", exercises: ["Supino máquina", "Puxada frontal", "Remada sentada", "Desenvolvimento máquina", "Rosca direta", "Tríceps na polia"] },
    lowerA: { focus: "Inferiores A", exercises: ["Leg press", "Mesa flexora", "Cadeira extensora", "Elevação pélvica", "Panturrilha em pé", "Prancha"] },
    upperB: { focus: "Superiores B", exercises: ["Supino inclinado com halteres", "Remada baixa", "Puxada neutra", "Elevação lateral", "Rosca martelo", "Tríceps francês"] },
    lowerB: { focus: "Inferiores B", exercises: ["Agachamento no smith", "Levantamento terra romeno com halteres", "Afundo com apoio", "Cadeira abdutora", "Panturrilha sentada", "Abdominal máquina"] },
    push: { focus: "Empurrar — peito, ombros e tríceps", exercises: ["Supino máquina", "Supino inclinado com halteres", "Desenvolvimento máquina", "Elevação lateral", "Tríceps na polia"] },
    pull: { focus: "Puxar — costas e bíceps", exercises: ["Puxada frontal", "Remada sentada", "Remada unilateral", "Crucifixo inverso", "Rosca direta", "Rosca martelo"] },
    legs: { focus: "Pernas", exercises: ["Leg press", "Levantamento terra romeno com halteres", "Cadeira extensora", "Mesa flexora", "Elevação pélvica", "Panturrilha em pé"] }
  },
  home: {
    fullA: { focus: "Corpo inteiro A — casa", exercises: ["Agachamento livre", "Flexão de braços com apoio se necessário", "Remada com mochila", "Ponte de glúteos", "Elevação lateral com garrafas", "Prancha"] },
    fullB: { focus: "Corpo inteiro B — casa", exercises: ["Afundo com apoio", "Flexão inclinada", "Remada unilateral com mochila", "Bom dia com mochila", "Rosca com mochila", "Tríceps no banco"] },
    fullC: { focus: "Corpo inteiro C — casa", exercises: ["Agachamento sumô", "Flexão de braços", "Crucifixo inverso com garrafas", "Elevação pélvica unilateral", "Panturrilha em pé", "Abdominal curto"] },
    upperA: { focus: "Superiores A — casa", exercises: ["Flexão inclinada", "Remada com mochila", "Desenvolvimento com mochila", "Elevação lateral com garrafas", "Rosca com mochila", "Tríceps no banco"] },
    lowerA: { focus: "Inferiores A — casa", exercises: ["Agachamento livre", "Afundo com apoio", "Ponte de glúteos", "Bom dia com mochila", "Panturrilha em pé", "Prancha"] },
    upperB: { focus: "Superiores B — casa", exercises: ["Flexão de braços", "Remada unilateral com mochila", "Crucifixo inverso com garrafas", "Desenvolvimento com mochila", "Rosca martelo com garrafas", "Tríceps acima da cabeça"] },
    lowerB: { focus: "Inferiores B — casa", exercises: ["Agachamento sumô", "Afundo reverso", "Elevação pélvica unilateral", "Levantamento romeno com mochila", "Panturrilha unilateral", "Abdominal curto"] },
    push: { focus: "Empurrar — casa", exercises: ["Flexão inclinada", "Flexão de braços", "Desenvolvimento com mochila", "Elevação lateral com garrafas", "Tríceps no banco"] },
    pull: { focus: "Puxar — casa", exercises: ["Remada com mochila", "Remada unilateral com mochila", "Crucifixo inverso com garrafas", "Rosca com mochila", "Rosca martelo com garrafas"] },
    legs: { focus: "Pernas — casa", exercises: ["Agachamento livre", "Afundo reverso", "Levantamento romeno com mochila", "Ponte de glúteos", "Panturrilha em pé", "Prancha"] }
  }
};

const BASE_WORKOUT_SPLITS = {
  2: ["fullA", "fullB"],
  3: ["fullA", "fullB", "fullC"],
  4: ["upperA", "lowerA", "upperB", "lowerB"],
  5: ["push", "pull", "legs", "upperB", "lowerB"]
};

function baseExercisePrescription(name, level, goal, location) {
  const core = /prancha|abdominal/i.test(name);
  if (core) return `${name} — ${level === "beginner" ? 2 : 3} séries de 20–40 segundos ou 8–15 repetições`;
  let sets = level === "beginner" ? 2 : 3;
  let reps = "8–12";
  if (goal === "strength") reps = location === "gym" ? "6–8" : "6–10 controladas";
  if (goal === "general") reps = "10–15";
  if (goal === "hypertrophy" && level === "intermediate") sets = 3;
  return `${name} — ${sets} séries de ${reps} repetições — termine com técnica estável e sem chegar à falha nas primeiras semanas`;
}

function buildBaseWorkout({ location, frequency, level, goal, days, time }) {
  const split = BASE_WORKOUT_SPLITS[frequency];
  const library = BASE_WORKOUT_LIBRARY[location];
  const planDays = {};
  days.forEach((day, index) => {
    const session = library[split[index]];
    planDays[day] = {
      focus: session.focus,
      exercises: session.exercises.map(exercise => baseExercisePrescription(exercise, level, goal, location))
    };
  });
  return {
    source: "Plano base criado no aplicativo",
    parsedAt: new Date().toISOString(),
    parserVersion: 3,
    baseConfig: { location, frequency, level, goal, days, time },
    days: planDays
  };
}

const baseWorkoutModal = document.getElementById("modal-base-workout");
const baseWorkoutForm = document.getElementById("form-base-workout");

function selectedBaseDays() {
  return [...baseWorkoutForm.querySelectorAll('[name="base_days"]:checked')].map(input => Number(input.value));
}

function updateBaseWorkoutPreview() {
  const frequency = Number(baseWorkoutForm.frequency.value);
  const selected = selectedBaseDays();
  document.getElementById("base-days-help").textContent = `Escolha exatamente ${frequency} dia(s). Selecionados: ${selected.length}.`;
  const preview = document.getElementById("base-plan-preview");
  preview.innerHTML = "";
  const split = BASE_WORKOUT_SPLITS[frequency];
  selected.slice(0, frequency).forEach((day, index) => {
    const session = BASE_WORKOUT_LIBRARY[baseWorkoutForm.location.value][split[index]];
    const row = document.createElement("div");
    row.className = "base-preview-day";
    row.innerHTML = `<b>${WEEKDAY_NAMES[day]}</b><span>${session.focus}</span>`;
    preview.appendChild(row);
  });
  if (selected.length !== frequency) {
    const warning = document.createElement("div");
    warning.className = "base-preview-day";
    warning.innerHTML = `<b>Ajuste necessário</b><span>Selecione ${frequency} dia(s) para gerar o plano.</span>`;
    preview.appendChild(warning);
  }
}

function applyDefaultBaseDays(frequency) {
  const defaults = { 2: [1, 4], 3: [1, 3, 5], 4: [1, 2, 4, 5], 5: [1, 2, 3, 5, 6] }[frequency];
  baseWorkoutForm.querySelectorAll('[name="base_days"]').forEach(input => { input.checked = defaults.includes(Number(input.value)); });
}

function openBaseWorkoutModal() {
  baseWorkoutForm.reset();
  const previous = state.workoutPlan?.baseConfig;
  if (previous) {
    baseWorkoutForm.level.value = previous.level || "beginner";
    baseWorkoutForm.location.value = previous.location || "gym";
    baseWorkoutForm.goal.value = previous.goal || "general";
    baseWorkoutForm.frequency.value = String(previous.frequency || 3);
    baseWorkoutForm.time.value = previous.time || state.customRoutine?.trainingTime || "18:00";
    const days = (previous.days || []).map(Number);
    baseWorkoutForm.querySelectorAll('[name="base_days"]').forEach(input => { input.checked = days.includes(Number(input.value)); });
  } else {
    baseWorkoutForm.time.value = state.customRoutine?.trainingTime || "18:00";
    applyDefaultBaseDays(3);
  }
  updateBaseWorkoutPreview();
  baseWorkoutModal.hidden = false;
}

function closeBaseWorkoutModal() { baseWorkoutModal.hidden = true; }

document.getElementById("btn-base-workout").addEventListener("click", openBaseWorkoutModal);
document.getElementById("base-workout-cancel").addEventListener("click", closeBaseWorkoutModal);
baseWorkoutModal.addEventListener("click", event => { if (event.target === baseWorkoutModal) closeBaseWorkoutModal(); });
baseWorkoutForm.frequency.addEventListener("change", () => {
  applyDefaultBaseDays(Number(baseWorkoutForm.frequency.value));
  updateBaseWorkoutPreview();
});
baseWorkoutForm.location.addEventListener("change", updateBaseWorkoutPreview);
baseWorkoutForm.querySelectorAll('[name="base_days"]').forEach(input => input.addEventListener("change", updateBaseWorkoutPreview));
baseWorkoutForm.addEventListener("submit", async event => {
  event.preventDefault();
  const frequency = Number(baseWorkoutForm.frequency.value);
  const days = selectedBaseDays();
  if (days.length !== frequency) return showToast(`Selecione exatamente ${frequency} dia(s).`);
  if (Object.keys(state.workoutPlan?.days || {}).length && !window.confirm("Criar o plano-base substituirá o plano de treino atual. Deseja continuar?")) return;
  const options = {
    location: baseWorkoutForm.location.value,
    frequency,
    level: baseWorkoutForm.level.value,
    goal: baseWorkoutForm.goal.value,
    days,
    time: baseWorkoutForm.time.value || "18:00"
  };
  state.workoutPlan = buildBaseWorkout(options);
  state.customRoutine.trainingDays = days;
  state.customRoutine.trainingTime = options.time;
  saveState();
  if (window.persistRoutineConfig) await window.persistRoutineConfig(state.customRoutine);
  closeBaseWorkoutModal();
  renderTreino();
  renderSemana();
  renderHoje();
  showToast("Plano-base criado. Você pode corrigi-lo a qualquer momento.");
});

const workoutEditorModal = document.getElementById("modal-workout-editor");
const workoutEditorForm = document.getElementById("form-workout-editor");

function fillWorkoutEditor(day) {
  const dayNumber = Number(day);
  const workout = state.workoutPlan?.days?.[dayNumber];
  workoutEditorForm.day.value = String(dayNumber);
  workoutEditorForm.focus.value = workout?.focus || "";
  workoutEditorForm.exercises.value = (workout?.exercises || []).join("\n");
}

function openWorkoutEditor(preferredDay = null) {
  const importedDays = Object.keys(state.workoutPlan?.days || {}).map(Number);
  const trainingDays = (state.customRoutine?.trainingDays || []).map(Number);
  const day = preferredDay ?? (importedDays.includes(new Date().getDay()) ? new Date().getDay() : importedDays[0] ?? trainingDays[0] ?? 1);
  fillWorkoutEditor(day);
  workoutEditorModal.hidden = false;
}

function closeWorkoutEditor() {
  workoutEditorModal.hidden = true;
}

document.getElementById("btn-edit-workout").addEventListener("click", () => openWorkoutEditor());
document.getElementById("workout-editor-day").addEventListener("change", event => fillWorkoutEditor(event.target.value));
document.getElementById("workout-editor-cancel").addEventListener("click", closeWorkoutEditor);
workoutEditorModal.addEventListener("click", event => { if (event.target === workoutEditorModal) closeWorkoutEditor(); });

workoutEditorForm.addEventListener("submit", event => {
  event.preventDefault();
  const day = Number(workoutEditorForm.day.value);
  const exercises = workoutEditorForm.exercises.value
    .split(/\r?\n/)
    .map(line => line.replace(/^[-•\d.)\s]+/, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (!exercises.length) return showToast("Adicione pelo menos um exercício.");
  if (!state.workoutPlan) state.workoutPlan = { source: "Edição manual", parsedAt: null, days: {} };
  if (!state.workoutPlan.days) state.workoutPlan.days = {};
  state.workoutPlan.days[day] = {
    focus: workoutEditorForm.focus.value.trim() || "Treino do dia",
    exercises: [...new Set(exercises)].slice(0, 30)
  };
  state.workoutPlan.parsedAt = new Date().toISOString();
  const trainingDays = new Set((state.customRoutine?.trainingDays || []).map(Number));
  trainingDays.add(day);
  state.customRoutine.trainingDays = [...trainingDays];
  saveState();
  closeWorkoutEditor();
  renderTreino();
  renderSemana();
  renderHoje();
  showToast("Correções do treino salvas.");
});

document.getElementById("workout-editor-clear").addEventListener("click", () => {
  const day = Number(workoutEditorForm.day.value);
  if (!state.workoutPlan?.days?.[day]) return showToast("Este dia ainda não possui exercícios.");
  if (!window.confirm(`Limpar os exercícios de ${WEEKDAY_NAMES[day]}?`)) return;
  delete state.workoutPlan.days[day];
  saveState();
  fillWorkoutEditor(day);
  renderTreino();
  renderSemana();
  renderHoje();
  showToast("Exercícios removidos deste dia.");
});

const workoutBuilderModal = document.getElementById("modal-workout-builder");
const workoutBuilderForm = document.getElementById("form-workout-builder");
const builderExercises = document.getElementById("builder-exercises");

function renumberBuilderExercises() {
  [...builderExercises.children].forEach((row, index) => {
    row.querySelector(".builder-exercise-number").textContent = index + 1;
    row.querySelector(".builder-up").disabled = index === 0;
    row.querySelector(".builder-down").disabled = index === builderExercises.children.length - 1;
  });
}

function addBuilderExercise(values = {}) {
  const row = document.createElement("div");
  row.className = "builder-exercise";
  row.innerHTML = `
    <span class="builder-exercise-number"></span>
    <div class="builder-exercise-grid">
      <label class="builder-name">Exercício<input type="text" data-field="name" placeholder="Ex.: Supino reto" required></label>
      <label>Séries<input type="number" data-field="sets" min="1" max="20" placeholder="4" required></label>
      <label>Repetições<input type="text" data-field="reps" inputmode="numeric" placeholder="10 ou 8-12" required></label>
      <label class="builder-load">Carga (opcional)<input type="text" data-field="load" inputmode="decimal" placeholder="Ex.: 40 kg"></label>
      <label class="builder-note">Observação (opcional)<input type="text" data-field="note" placeholder="Ex.: aumentar carga progressivamente"></label>
    </div>
    <div class="builder-exercise-actions"><button type="button" class="builder-up">Subir</button><button type="button" class="builder-down">Descer</button><button type="button" class="builder-remove">Remover</button></div>`;
  Object.entries(values).forEach(([field, value]) => {
    const input = row.querySelector(`[data-field="${field}"]`);
    if (input) input.value = value;
  });
  row.querySelector(".builder-up").addEventListener("click", () => {
    if (row.previousElementSibling) builderExercises.insertBefore(row, row.previousElementSibling);
    renumberBuilderExercises();
  });
  row.querySelector(".builder-down").addEventListener("click", () => {
    if (row.nextElementSibling) builderExercises.insertBefore(row.nextElementSibling, row);
    renumberBuilderExercises();
  });
  row.querySelector(".builder-remove").addEventListener("click", () => {
    if (builderExercises.children.length === 1) return showToast("O treino precisa ter pelo menos um exercício.");
    row.remove();
    renumberBuilderExercises();
  });
  builderExercises.appendChild(row);
  renumberBuilderExercises();
}

function openWorkoutBuilder(preferredDay = null) {
  workoutBuilderForm.reset();
  const initialDay = preferredDay ?? (new Date().getDay() || 1);
  workoutBuilderForm.day.value = String(initialDay);
  workoutBuilderForm.time.value = state.customRoutine?.trainingTime || "18:00";
  builderExercises.innerHTML = "";
  addBuilderExercise();
  workoutBuilderModal.hidden = false;
}

function closeWorkoutBuilder() {
  workoutBuilderModal.hidden = true;
}

document.getElementById("btn-create-workout-profile").addEventListener("click", () => openWorkoutBuilder());
document.getElementById("btn-create-workout-tab").addEventListener("click", () => openWorkoutBuilder());
document.getElementById("builder-add-exercise").addEventListener("click", () => addBuilderExercise());
document.getElementById("workout-builder-cancel").addEventListener("click", closeWorkoutBuilder);
workoutBuilderModal.addEventListener("click", event => { if (event.target === workoutBuilderModal) closeWorkoutBuilder(); });

workoutBuilderForm.addEventListener("submit", async event => {
  event.preventDefault();
  const day = Number(workoutBuilderForm.day.value);
  if (state.workoutPlan?.days?.[day] && !window.confirm(`${WEEKDAY_NAMES[day]} já possui um treino. Deseja substituí-lo?`)) return;
  const exercises = [...builderExercises.children].map(row => {
    const get = field => row.querySelector(`[data-field="${field}"]`).value.trim();
    const name = get("name");
    const sets = get("sets");
    const reps = get("reps");
    const load = get("load");
    const note = get("note");
    return `${name} — ${sets} séries de ${reps} repetições${load ? ` — carga ${load}` : ""}${note ? ` — ${note}` : ""}`;
  });
  if (!state.workoutPlan) state.workoutPlan = { source: "Criado manualmente", parsedAt: null, parserVersion: 2, days: {} };
  if (!state.workoutPlan.days) state.workoutPlan.days = {};
  state.workoutPlan.source = state.workoutPlan.source || "Criado manualmente";
  state.workoutPlan.days[day] = { focus: workoutBuilderForm.focus.value.trim(), exercises };
  state.workoutPlan.parsedAt = new Date().toISOString();
  const trainingDays = new Set((state.customRoutine?.trainingDays || []).map(Number));
  trainingDays.add(day);
  state.customRoutine.trainingDays = [...trainingDays];
  state.customRoutine.trainingTime = workoutBuilderForm.time.value || state.customRoutine.trainingTime;
  saveState();
  if (window.persistRoutineConfig) await window.persistRoutineConfig(state.customRoutine);
  closeWorkoutBuilder();
  renderTreino();
  renderSemana();
  renderHoje();
  showToast("Treino criado e salvo na sua conta.");
});


/* ---------------------------------------------------------
   17. RENDER — EVOLUÇÃO (peso, medidas, gráfico, fotos)
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

let weightChartPoints = [];

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

  weightChartPoints = [];
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
    return { x, y, entry: e };
  });
  weightChartPoints = pts;
  const themeStyles = getComputedStyle(document.documentElement);
  const chartAccent = themeStyles.getPropertyValue("--amber").trim() || "#a879ff";
  const chartAccentRgb = themeStyles.getPropertyValue("--amber-rgb").trim() || "168, 121, 255";
  const chartBackground = themeStyles.getPropertyValue("--bg-0").trim() || "#0c0a12";

  // linha
  ctx.beginPath();
  pts.forEach((p, i) => { i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y); });
  ctx.strokeStyle = chartAccent;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  // área sob a linha
  ctx.lineTo(pts[pts.length - 1].x, pad.t + h);
  ctx.lineTo(pts[0].x, pad.t + h);
  ctx.closePath();
  ctx.fillStyle = `rgba(${chartAccentRgb},0.10)`;
  ctx.fill();

  // pontos
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = chartBackground;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = chartAccent;
    ctx.stroke();
  });
}

const weightCanvas = document.getElementById("chart-peso");
const weightTooltip = document.getElementById("chart-tooltip");
weightCanvas.addEventListener("pointermove", event => {
  if (!weightChartPoints.length) return;
  const rect = weightCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const nearest = weightChartPoints.reduce((best, point) => Math.abs(point.x - x) < Math.abs(best.x - x) ? point : best);
  weightTooltip.innerHTML = `<b>${nearest.entry.peso.toFixed(1).replace(".", ",")} kg</b><span>${fmtDateBR(nearest.entry.data)}</span>`;
  weightTooltip.style.left = `${Math.max(44, Math.min(rect.width - 44, nearest.x))}px`;
  weightTooltip.style.top = `${Math.max(8, nearest.y - 52)}px`;
  weightTooltip.hidden = false;
});
weightCanvas.addEventListener("pointerleave", () => { weightTooltip.hidden = true; });

function parseMeasurement(value, min, max) {
  const normalized = String(value || "").trim().replace(",", ".");
  if (!normalized) return null;
  let amount = Number(normalized);
  if (!Number.isFinite(amount)) return NaN;
  if (amount > 0 && amount <= 3) amount *= 100;
  else if (amount > max && amount <= max * 10) amount /= 10;
  if (amount < min || amount > max) return NaN;
  return Math.round(amount * 10) / 10;
}

document.getElementById("form-peso").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const entry = {
    id: "w_" + Date.now(),
    data: fd.get("data") || todayISO(),
    peso: parseFloat(fd.get("peso")),
    cintura: parseMeasurement(fd.get("cintura"), 30, 250),
    braco: parseMeasurement(fd.get("braco"), 10, 100),
    obs: (fd.get("obs") || "").trim()
  };
  if (isNaN(entry.peso)) { showToast("Informe um peso válido."); return; }
  if (Number.isNaN(entry.cintura)) { showToast("Informe a cintura em centímetros, entre 30 e 250."); return; }
  if (Number.isNaN(entry.braco)) { showToast("Informe o braço em centímetros, entre 10 e 100."); return; }
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

window.activateUserPhotos = function(userId) {
  if (photosDB) photosDB.close();
  photosDB = null;
  ACTIVE_USER_ID = userId;
};

function openPhotosDB() {
  return new Promise((resolve, reject) => {
    if (!photosSupported) return reject(new Error("IndexedDB indisponível"));
    if (photosDB) return resolve(photosDB);
    if (!ACTIVE_USER_ID) return reject(new Error("Usuário não identificado"));
    const req = indexedDB.open(`joaofit_fotos_${ACTIVE_USER_ID}`, 1);
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
  window.updateProfileAvatarIdentity?.();
  document.getElementById("p-idade").textContent = state.profile.idade ? state.profile.idade + " anos" : "—";
  document.getElementById("p-altura").textContent = state.profile.altura ? Number(state.profile.altura).toFixed(2).replace(".", ",") + " m" : "—";
  document.getElementById("p-peso-inicial").textContent = state.profile.pesoInicial ? Number(state.profile.pesoInicial).toFixed(1).replace(".", ",") + " kg" : "—";
  document.getElementById("p-meta-data").textContent = state.profile.metaData ? fmtDateBR(state.profile.metaData) : "—";
  document.querySelectorAll("[data-theme-choice]").forEach(button => {
    button.classList.toggle("selected", button.dataset.themeChoice === (state.appearance?.theme || "amber"));
  });

  const routineForm = document.getElementById("form-routine");
  const routine = state.customRoutine || DEFAULT_STATE.customRoutine;
  routineForm.wake_time.value = routine.wakeTime || "07:00";
  routineForm.sleep_time.value = routine.sleepTime || "23:00";
  routineForm.meal_count.value = routine.mealCount || 4;
  routineForm.training_time.value = routine.trainingTime || "18:00";
  routineForm.free_meal_day.value = routine.freeMealDay ?? "";
  routineForm.has_commitment.checked = !!routine.commitment?.enabled;
  routineForm.commitment_name.value = routine.commitment?.name || "";
  routineForm.commitment_start.value = routine.commitment?.start || "08:00";
  routineForm.commitment_end.value = routine.commitment?.end || "12:00";
  routineForm.querySelectorAll('input[name="training_days"]').forEach(input => input.checked = (routine.trainingDays || []).map(Number).includes(Number(input.value)));
  routineForm.querySelectorAll('input[name="commitment_days"]').forEach(input => input.checked = (routine.commitment?.days || []).map(Number).includes(Number(input.value)));
  document.getElementById("routine-commitment-fields").hidden = !routineForm.has_commitment.checked;

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

document.querySelectorAll("[data-theme-choice]").forEach(button => {
  button.addEventListener("click", () => {
    state.appearance = { ...(state.appearance || {}), theme: button.dataset.themeChoice };
    applyAppearanceTheme();
    saveState();
    renderPerfil();
    showToast(`Paleta ${APP_THEMES[state.appearance.theme].label} aplicada.`);
  });
});

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
  renderHoje();
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
    if (ACTIVE_USER_ID) indexedDB.deleteDatabase(`joaofit_fotos_${ACTIVE_USER_ID}`);
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
    navigator.serviceWorker.register("sw.js?v=25", { updateViaCache: "none" }).catch(err => {
      console.error("Falha ao registrar service worker:", err);
    });
  });
}

/* ---------------------------------------------------------
   20. INIT
--------------------------------------------------------- */
function init() {
  initFoodPresets();
  const dateInput = document.querySelector('#form-peso input[name="data"]');
  if (dateInput) dateInput.value = todayISO();
  renderHoje();
}
init();
