"use strict";

const cloud = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.publishableKey,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
);

let currentUser = null;
let authMode = "login";
let cloudSaveTimer = null;
let loadingCloudState = false;
let passwordRecoveryActive = false;

const authGate = document.getElementById("auth-gate");
const recoveryGate = document.getElementById("recovery-gate");
const onboardingGate = document.getElementById("onboarding-gate");
const appElement = document.getElementById("app");
const authStatus = document.getElementById("auth-status");

function setAuthStatus(message, error = false) {
  authStatus.textContent = message || "";
  authStatus.classList.toggle("error", error);
}

function showAuth() {
  authGate.hidden = false;
  recoveryGate.hidden = true;
  onboardingGate.hidden = true;
  appElement.hidden = true;
}

function showApp() {
  authGate.hidden = true;
  recoveryGate.hidden = true;
  onboardingGate.hidden = true;
  appElement.hidden = false;
}

function showRecovery() {
  passwordRecoveryActive = true;
  authGate.hidden = true;
  recoveryGate.hidden = false;
  onboardingGate.hidden = true;
  appElement.hidden = true;
}

function showOnboarding(profile = {}) {
  authGate.hidden = true;
  recoveryGate.hidden = true;
  onboardingGate.hidden = false;
  appElement.hidden = true;
  const form = document.getElementById("onboarding-form");
  form.nome.value = profile.nome || currentUser?.user_metadata?.nome || "";
  form.idade.value = profile.idade || "";
  form.peso.value = profile.peso || "";
  form.altura.value = profile.altura || "";
  form.objetivo.value = profile.objetivo || "";
  const defaultTarget = new Date();
  defaultTarget.setMonth(defaultTarget.getMonth() + 6);
  form.expected_result_date.value = profile.expected_result_date || defaultTarget.toISOString().slice(0, 10);
  const routine = profile.routine_config || {};
  if (routine.wakeTime) form.wake_time.value = routine.wakeTime;
  if (routine.sleepTime) form.sleep_time.value = routine.sleepTime;
  if (routine.mealCount) form.meal_count.value = routine.mealCount;
  if (routine.trainingTime) form.training_time.value = routine.trainingTime;
  if (routine.freeMealDay !== null && routine.freeMealDay !== undefined) form.free_meal_day.value = routine.freeMealDay;
  form.querySelectorAll('input[name="training_days"]').forEach(input => input.checked = (routine.trainingDays || []).map(Number).includes(Number(input.value)));
  setOnboardingStep(0);
}

function setAuthMode(mode) {
  authMode = mode;
  document.querySelectorAll("[data-auth-mode]").forEach(button => button.classList.toggle("active", button.dataset.authMode === mode));
  document.getElementById("auth-name-label").hidden = mode !== "signup";
  document.getElementById("auth-name").required = mode === "signup";
  document.getElementById("auth-password").autocomplete = mode === "signup" ? "new-password" : "current-password";
  document.getElementById("auth-submit").textContent = mode === "signup" ? "Criar conta" : "Entrar";
  document.getElementById("auth-forgot").hidden = mode === "signup";
  setAuthStatus("");
}

document.querySelectorAll("[data-auth-mode]").forEach(button => button.addEventListener("click", () => setAuthMode(button.dataset.authMode)));

document.querySelectorAll("[data-password-target]").forEach(button => {
  const input = document.getElementById(button.dataset.passwordTarget);
  const reveal = event => { event.preventDefault(); input.type = "text"; button.classList.add("pressed"); };
  const conceal = () => { input.type = "password"; button.classList.remove("pressed"); };
  button.addEventListener("pointerdown", reveal);
  button.addEventListener("pointerup", conceal);
  button.addEventListener("pointercancel", conceal);
  button.addEventListener("pointerleave", conceal);
  button.addEventListener("contextmenu", event => event.preventDefault());
});

document.getElementById("auth-form").addEventListener("submit", async event => {
  event.preventDefault();
  const email = document.getElementById("auth-email").value.trim();
  const password = document.getElementById("auth-password").value;
  const submit = document.getElementById("auth-submit");
  submit.disabled = true;
  setAuthStatus(authMode === "signup" ? "Criando conta…" : "Entrando…");
  try {
    if (authMode === "signup") {
      const nome = document.getElementById("auth-name").value.trim();
      const { data, error } = await cloud.auth.signUp({ email, password, options: { data: { nome } } });
      if (error) throw error;
      if (!data.session) setAuthStatus("Conta criada. Confirme o e-mail recebido e depois entre.");
    } else {
      const { error } = await cloud.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) {
    setAuthStatus(translateAuthError(error.message), true);
  } finally {
    submit.disabled = false;
  }
});

document.getElementById("auth-forgot").addEventListener("click", async () => {
  const email = document.getElementById("auth-email").value.trim();
  if (!email) return setAuthStatus("Informe seu e-mail primeiro.", true);
  const redirectTo = "https://jotaveeara.github.io/minha-dieta/";
  setAuthStatus("Enviando link de recuperação…");
  const { error } = await cloud.auth.resetPasswordForEmail(email, { redirectTo });
  setAuthStatus(error ? translateAuthError(error.message) : "Enviamos o link de recuperação para seu e-mail.", !!error);
});

document.getElementById("recovery-form").addEventListener("submit", async event => {
  event.preventDefault();
  const password = document.getElementById("recovery-password").value;
  const confirmation = document.getElementById("recovery-password-confirm").value;
  const status = document.getElementById("recovery-status");
  if (password !== confirmation) {
    status.textContent = "As senhas não coincidem.";
    status.classList.add("error");
    return;
  }
  status.textContent = "Atualizando senha…";
  status.classList.remove("error");
  const { error } = await cloud.auth.updateUser({ password });
  if (error) {
    status.textContent = translateAuthError(error.message);
    status.classList.add("error");
    return;
  }
  status.textContent = "Senha atualizada com sucesso.";
  passwordRecoveryActive = false;
  history.replaceState(null, "", location.pathname);
  setTimeout(() => currentUser ? loadUserData(currentUser) : showAuth(), 800);
});

function translateAuthError(message = "") {
  const text = message.toLowerCase();
  if (text.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (text.includes("already registered")) return "Este e-mail já possui uma conta.";
  if (text.includes("password should be")) return "A senha não atende aos requisitos de segurança informados.";
  if (text.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (text.includes("rate limit")) return "Muitas tentativas foram feitas. Aguarde alguns minutos e tente novamente.";
  if (text.includes("signup is disabled")) return "O cadastro está desativado nas configurações do Supabase.";
  if (text.includes("invalid api key") || text.includes("api key")) return "A chave pública do Supabase não foi aceita.";
  if (text.includes("database error")) return `O banco recusou a criação do perfil. Detalhe: ${message}`;
  return `Não foi possível concluir. Detalhe: ${message || "erro desconhecido"}`;
}

async function loadUserData(user) {
  loadingCloudState = true;
  currentUser = user;
  const activated = window.activateUserStorage(user.id, true);
  window.activateUserPhotos(user.id);
  document.getElementById("account-email").textContent = user.email;
  const [{ data: profile, error: profileError }, { data: remote, error: stateError }] = await Promise.all([
    cloud.from("profiles").select("nome,idade,peso,altura,objetivo,expected_result_date,onboarding_completed,routine_config").single(),
    cloud.from("app_states").select("state").maybeSingle()
  ]);
  if (profileError) console.error("Falha ao carregar perfil", profileError);
  if (stateError) console.error("Falha ao carregar dados", stateError);

  if (remote && remote.state && Object.keys(remote.state).length) {
    state = Object.assign(structuredCloneSafe(DEFAULT_STATE), remote.state, {
      profile: Object.assign({}, DEFAULT_STATE.profile, remote.state.profile || {}),
      metas: Object.assign({}, DEFAULT_STATE.metas, remote.state.metas || {}),
      segundaConfig: Object.assign({}, DEFAULT_STATE.segundaConfig, remote.state.segundaConfig || {})
    });
    localStorage.setItem(`joaofit_state_v2_${user.id}`, JSON.stringify(state));
  } else {
    await cloud.from("app_states").upsert({ user_id: user.id, state: activated.state });
  }

  if (profile) {
    const form = document.getElementById("form-account");
    form.nome.value = profile.nome || state.profile.nome || "";
    form.peso.value = profile.peso || state.profile.pesoInicial || "";
    form.altura.value = profile.altura || state.profile.altura || "";
    form.objetivo.value = profile.objetivo || "";
    form.expected_result_date.value = profile.expected_result_date || "";
    if (profile.nome) state.profile.nome = profile.nome;
    if (profile.peso) state.profile.pesoInicial = Number(profile.peso);
    if (profile.altura) state.profile.altura = Number(profile.altura);
    if (profile.idade) state.profile.idade = Number(profile.idade);
    if (profile.expected_result_date) state.profile.metaData = profile.expected_result_date;
    if (profile.objetivo) state.profile.objetivo = profile.objetivo;
    document.getElementById("p-objetivo").textContent = profile.objetivo ? `Objetivo: ${profile.objetivo}` : "Defina seu objetivo em Minha conta.";
  }
  loadingCloudState = false;
  if (!profile?.onboarding_completed || !profile?.expected_result_date) {
    showOnboarding(profile || {});
  } else {
    if (profile.routine_config && Object.keys(profile.routine_config).length) {
      state.customRoutine = profile.routine_config;
      state.onboardingComplete = true;
    }
    showApp();
    renderHoje();
    renderPerfil();
    await loadWorkoutFiles();
    document.getElementById("sync-status").textContent = "Dados sincronizados com sua conta.";
  }
}

let onboardingStep = 0;
const onboardingSteps = [...document.querySelectorAll("[data-onboarding-step]")];

function setOnboardingStep(step) {
  onboardingStep = Math.max(0, Math.min(onboardingSteps.length - 1, step));
  onboardingSteps.forEach((section, index) => section.hidden = index !== onboardingStep);
  document.getElementById("onboarding-step-label").textContent = `ETAPA ${onboardingStep + 1} DE ${onboardingSteps.length}`;
  document.getElementById("onboarding-progress-bar").style.width = `${((onboardingStep + 1) / onboardingSteps.length) * 100}%`;
  document.getElementById("onboarding-back").hidden = onboardingStep === 0;
  document.getElementById("onboarding-next").hidden = onboardingStep === onboardingSteps.length - 1;
  document.getElementById("onboarding-finish").hidden = onboardingStep !== onboardingSteps.length - 1;
  if (onboardingStep === onboardingSteps.length - 1) updateOnboardingSummary();
}

function validateOnboardingStep() {
  const controls = [...onboardingSteps[onboardingStep].querySelectorAll("input,select")].filter(control => !control.closest("[hidden]"));
  for (const control of controls) {
    if (!control.checkValidity()) { control.reportValidity(); return false; }
  }
  return true;
}

document.getElementById("onboarding-next").addEventListener("click", () => {
  if (validateOnboardingStep()) setOnboardingStep(onboardingStep + 1);
});
document.getElementById("onboarding-back").addEventListener("click", () => setOnboardingStep(onboardingStep - 1));
document.getElementById("onboarding-has-commitment").addEventListener("change", event => {
  document.getElementById("onboarding-commitment-fields").hidden = !event.target.checked;
});

function selectedNumbers(form, name) {
  return [...form.querySelectorAll(`input[name="${name}"]:checked`)].map(input => Number(input.value));
}

function updateOnboardingSummary() {
  const form = document.getElementById("onboarding-form");
  const trainingDays = selectedNumbers(form, "training_days");
  document.getElementById("onboarding-summary").textContent = trainingDays.length
    ? `Sua rotina terá ${form.meal_count.value} refeições por dia e treino em ${trainingDays.length} dia(s) da semana.`
    : `Sua rotina terá ${form.meal_count.value} refeições por dia. Nenhum dia fixo de treino foi selecionado.`;
}

document.getElementById("onboarding-form").addEventListener("submit", async event => {
  event.preventDefault();
  if (!validateOnboardingStep()) return;
  const form = event.currentTarget;
  const status = document.getElementById("onboarding-status");
  const commitmentEnabled = form.has_commitment.checked;
  const routine = {
    enabled: true,
    wakeTime: form.wake_time.value,
    sleepTime: form.sleep_time.value,
    mealCount: Number(form.meal_count.value),
    trainingDays: selectedNumbers(form, "training_days"),
    trainingTime: form.training_time.value,
    freeMealDay: form.free_meal_day.value === "" ? null : Number(form.free_meal_day.value),
    commitment: {
      enabled: commitmentEnabled,
      name: commitmentEnabled ? form.commitment_name.value.trim() : "",
      days: commitmentEnabled ? selectedNumbers(form, "commitment_days") : [],
      start: form.commitment_start.value,
      end: form.commitment_end.value
    }
  };
  const profile = {
    id: currentUser.id,
    nome: form.nome.value.trim(),
    idade: Number(form.idade.value),
    peso: Number(form.peso.value),
    altura: Number(form.altura.value),
    objetivo: form.objetivo.value,
    expected_result_date: form.expected_result_date.value,
    onboarding_completed: true,
    routine_config: routine,
    updated_at: new Date().toISOString()
  };
  status.textContent = "Criando sua rotina…";
  status.classList.remove("error");
  const { error } = await cloud.from("profiles").upsert(profile);
  if (error) {
    status.textContent = `Não foi possível salvar: ${error.message}`;
    status.classList.add("error");
    return;
  }
  state.profile.nome = profile.nome;
  state.profile.idade = profile.idade;
  state.profile.pesoInicial = profile.peso;
  state.profile.altura = profile.altura;
  state.profile.metaData = profile.expected_result_date;
  state.profile.objetivo = profile.objetivo;
  const objective = profile.objetivo.toLowerCase();
  const calorieAdjustment = objective.includes("reduzir") ? -300 : objective.includes("ganhar") ? 250 : 0;
  state.metas.kcal = Math.max(1200, Math.round((profile.peso * 30 + calorieAdjustment) / 50) * 50);
  state.metas.proteinaMin = Math.round(profile.peso * 1.6);
  state.metas.proteinaMax = Math.round(profile.peso * 2);
  state.metas.aguaMetaMl = Math.round(Number(form.water_goal.value) * 1000);
  state.customRoutine = routine;
  state.onboardingComplete = true;
  state.dayOverrides = {};
  state.segundaConfig = structuredCloneSafe(DEFAULT_STATE.segundaConfig);
  saveState();
  await cloud.from("app_states").upsert({ user_id: currentUser.id, state, updated_at: new Date().toISOString() });
  document.getElementById("p-objetivo").textContent = `Objetivo: ${profile.objetivo}`;
  showApp();
  renderHoje();
  renderPerfil();
  await loadWorkoutFiles();
});

window.scheduleCloudSave = function(nextState) {
  if (!currentUser || loadingCloudState) return;
  clearTimeout(cloudSaveTimer);
  document.getElementById("sync-status").textContent = "Sincronizando…";
  cloudSaveTimer = setTimeout(async () => {
    const { error } = await cloud.from("app_states").upsert({ user_id: currentUser.id, state: nextState, updated_at: new Date().toISOString() });
    document.getElementById("sync-status").textContent = error ? "Falha na sincronização. Tentaremos novamente." : "Dados sincronizados com sua conta.";
  }, 700);
};

document.getElementById("form-account").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const profile = {
    id: currentUser.id,
    nome: form.nome.value.trim(),
    peso: form.peso.value ? Number(form.peso.value) : null,
    altura: form.altura.value ? Number(form.altura.value) : null,
    objetivo: form.objetivo.value.trim(),
    expected_result_date: form.expected_result_date.value || null,
    updated_at: new Date().toISOString()
  };
  const { error } = await cloud.from("profiles").upsert(profile);
  if (error) return showToast("Não foi possível salvar o perfil.");
  state.profile.nome = profile.nome;
  if (profile.peso) state.profile.pesoInicial = profile.peso;
  if (profile.altura) state.profile.altura = profile.altura;
  if (profile.expected_result_date) state.profile.metaData = profile.expected_result_date;
  state.profile.objetivo = profile.objetivo;
  document.getElementById("p-objetivo").textContent = profile.objetivo ? `Objetivo: ${profile.objetivo}` : "Defina seu objetivo em Minha conta.";
  saveState();
  renderHoje();
  renderPerfil();
  showToast("Perfil salvo.");
});

document.getElementById("routine-has-commitment").addEventListener("change", event => {
  document.getElementById("routine-commitment-fields").hidden = !event.target.checked;
});

document.getElementById("form-routine").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const enabled = form.has_commitment.checked;
  const routine = {
    enabled: true,
    wakeTime: form.wake_time.value,
    sleepTime: form.sleep_time.value,
    mealCount: Number(form.meal_count.value),
    trainingDays: selectedNumbers(form, "training_days"),
    trainingTime: form.training_time.value,
    freeMealDay: form.free_meal_day.value === "" ? null : Number(form.free_meal_day.value),
    commitment: {
      enabled,
      name: enabled ? form.commitment_name.value.trim() : "",
      days: enabled ? selectedNumbers(form, "commitment_days") : [],
      start: form.commitment_start.value || "08:00",
      end: form.commitment_end.value || "12:00"
    }
  };
  const { error } = await cloud.from("profiles").update({ routine_config: routine, updated_at: new Date().toISOString() }).eq("id", currentUser.id);
  if (error) return showToast("Não foi possível salvar a rotina.");
  state.customRoutine = routine;
  saveState();
  renderHoje();
  renderSemana();
  renderPerfil();
  showToast("Rotina atualizada.");
});

document.getElementById("btn-signout").addEventListener("click", async () => {
  await cloud.auth.signOut();
});

document.getElementById("btn-upload-workout").addEventListener("click", () => document.getElementById("workout-input").click());

async function extractWorkoutText(file) {
  const buffer = await file.arrayBuffer();
  if (file.type === "application/pdf") {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.worker.mjs";
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      let pageText = "";
      content.items.forEach(item => { pageText += item.str + (item.hasEOL ? "\n" : " "); });
      pages.push(pageText);
    }
    return pages.join("\n");
  }
  if (!window.mammoth) throw new Error("Leitor DOCX indisponível");
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

function parseWorkoutPlan(text, fileName) {
  const dayPatterns = [
    [/\b(domingo|dom)\b/i, 0], [/\b(segunda(?:-feira)?|seg)\b/i, 1],
    [/\b(terça(?:-feira)?|terca(?:-feira)?|ter)\b/i, 2], [/\b(quarta(?:-feira)?|qua)\b/i, 3],
    [/\b(quinta(?:-feira)?|qui)\b/i, 4], [/\b(sexta(?:-feira)?|sex)\b/i, 5],
    [/\b(sábado|sabado|sáb|sab)\b/i, 6]
  ];
  const focusWords = /(pernas?|quadr[ií]ceps|posterior|gl[uú]teos?|peito|costas|ombros?|b[ií]ceps|tr[ií]ceps|braços?|abd[oô]men|cardio|full body)/ig;
  const ignored = /^(treino|ficha|exerc[ií]cios?|s[eé]ries?|repeti[cç][oõ]es?|descanso|aluno|academia)\s*:?$/i;
  const lines = String(text || "").split(/\r?\n|\s{3,}/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const days = {};
  let currentDay = null;
  for (const line of lines) {
    const match = dayPatterns.find(([pattern]) => pattern.test(line));
    if (match && line.length < 100) {
      currentDay = match[1];
      if (!days[currentDay]) days[currentDay] = { focus: "", exercises: [] };
      const focuses = [...line.matchAll(focusWords)].map(item => item[0]);
      if (focuses.length) days[currentDay].focus = [...new Set(focuses)].join(" + ");
      continue;
    }
    if (currentDay !== null && line.length >= 3 && line.length <= 120 && !ignored.test(line)) {
      days[currentDay].exercises.push(line.replace(/^[-•\d.)\s]+/, "").trim());
    }
  }
  Object.values(days).forEach(day => {
    day.exercises = [...new Set(day.exercises)].filter(Boolean).slice(0, 15);
    if (!day.focus) {
      const focus = [...day.exercises.join(" ").matchAll(focusWords)].map(item => item[0]);
      day.focus = [...new Set(focus)].slice(0, 3).join(" + ") || "Treino do dia";
    }
  });
  if (!Object.keys(days).length) throw new Error("Não encontrei dias da semana no documento");
  return { source: fileName, parsedAt: new Date().toISOString(), days };
}

function renderWorkoutAnalysis() {
  const box = document.getElementById("workout-analysis");
  const plan = state.workoutPlan;
  box.innerHTML = "";
  if (!plan?.days || !Object.keys(plan.days).length) return;
  Object.entries(plan.days).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([day, workout]) => {
    const item = document.createElement("div");
    item.className = "workout-analysis-day";
    item.innerHTML = `<b>${WEEKDAY_NAMES[Number(day)]}: ${workout.focus}</b><span>${workout.exercises.length} exercício(s) identificado(s)</span>`;
    box.appendChild(item);
  });
}

document.getElementById("workout-input").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const valid = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  const validExtension = /\.(pdf|docx)$/i.test(file.name);
  if (!valid.includes(file.type) && !validExtension) return showToast("Envie apenas PDF ou DOCX.");
  if (file.size > 10485760) return showToast("O arquivo deve ter no máximo 10 MB.");
  const analysisStatus = document.getElementById("workout-analysis-status");
  analysisStatus.textContent = "Lendo e analisando o treino…";
  try {
    const text = await extractWorkoutText(file);
    state.workoutPlan = parseWorkoutPlan(text, file.name);
    const detectedDays = Object.keys(state.workoutPlan.days).map(Number);
    if (detectedDays.length) state.customRoutine.trainingDays = detectedDays;
    saveState();
    await cloud.from("profiles").update({ routine_config: state.customRoutine, updated_at: new Date().toISOString() }).eq("id", currentUser.id);
    renderWorkoutAnalysis();
    renderHoje();
    renderSemana();
    analysisStatus.textContent = `${detectedDays.length} dia(s) de treino identificado(s). Revise o resultado abaixo.`;
  } catch (analysisError) {
    analysisStatus.textContent = `A leitura automática não foi concluída: ${analysisError.message}. O arquivo ainda será salvo para você revisar.`;
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${currentUser.id}/${Date.now()}-${safeName}`;
  showToast("Enviando treino…");
  const { error: uploadError } = await cloud.storage.from("workout-documents").upload(path, file);
  if (uploadError) return showToast("Não foi possível enviar o arquivo.");
  const { error: rowError } = await cloud.from("workout_documents").insert({
    user_id: currentUser.id, file_name: file.name, storage_path: path, mime_type: file.type, file_size: file.size
  });
  if (rowError) {
    await cloud.storage.from("workout-documents").remove([path]);
    return showToast("Não foi possível registrar o arquivo.");
  }
  showToast("Treino enviado com segurança.");
  await loadWorkoutFiles();
});

async function loadWorkoutFiles() {
  const box = document.getElementById("workout-files");
  const { data, error } = await cloud.from("workout_documents").select("id,file_name,storage_path,status").order("created_at", { ascending: false });
  box.innerHTML = "";
  if (error) return;
  renderWorkoutAnalysis();
  (data || []).forEach(documentRow => {
    const row = document.createElement("div");
    row.className = "workout-file";
    const name = document.createElement("span");
    name.textContent = `${documentRow.file_name} · ${documentRow.status}`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Excluir";
    remove.addEventListener("click", async () => {
      const { error: storageError } = await cloud.storage.from("workout-documents").remove([documentRow.storage_path]);
      if (storageError) return showToast("Não foi possível excluir o arquivo.");
      await cloud.from("workout_documents").delete().eq("id", documentRow.id);
      if (state.workoutPlan?.source === documentRow.file_name) {
        state.workoutPlan = { source: "", parsedAt: null, days: {} };
        saveState();
        renderHoje();
        renderSemana();
      }
      await loadWorkoutFiles();
    });
    row.append(name, remove);
    box.appendChild(row);
  });
}

cloud.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    passwordRecoveryActive = true;
    currentUser = session?.user || null;
    showRecovery();
    return;
  }
  if (session?.user) loadUserData(session.user);
  else {
    currentUser = null;
    showAuth();
  }
});

(async function startAuth() {
  const { data } = await cloud.auth.getSession();
  if (passwordRecoveryActive) return;
  if (data.session?.user) await loadUserData(data.session.user);
  else showAuth();
})();
