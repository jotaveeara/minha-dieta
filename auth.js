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
  window.applyAppearanceTheme?.(state.appearance?.theme || "amber");

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
    await Promise.all([loadWorkoutFiles(), refreshProfileAvatar()]);
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

window.persistRoutineConfig = async function(routine) {
  if (!currentUser) return false;
  const { error } = await cloud.from("profiles").update({ routine_config: routine, updated_at: new Date().toISOString() }).eq("id", currentUser.id);
  if (error) {
    showToast("A rotina foi salva neste aparelho, mas a sincronização falhou.");
    return false;
  }
  return true;
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
  updateProfileAvatarIdentity();
  showToast("Perfil salvo.");
});

function profileInitials() {
  const parts = String(state.profile?.nome || "Usuário").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "U") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function updateProfileAvatarIdentity() {
  const name = state.profile?.nome || "Usuário";
  document.getElementById("profile-display-name").textContent = name;
  document.getElementById("profile-avatar-initials").textContent = profileInitials();
}
window.updateProfileAvatarIdentity = updateProfileAvatarIdentity;

function setProfileAvatarUrl(url = "") {
  const profileImage = document.getElementById("profile-avatar");
  const initials = document.getElementById("profile-avatar-initials");
  const headerImage = document.getElementById("header-avatar");
  const headerPlaceholder = document.getElementById("header-avatar-placeholder");
  const removeButton = document.getElementById("btn-remove-profile-avatar");
  profileImage.src = url;
  headerImage.src = url;
  profileImage.hidden = !url;
  headerImage.hidden = !url;
  initials.hidden = !!url;
  headerPlaceholder.hidden = !!url;
  removeButton.hidden = !url;
  updateProfileAvatarIdentity();
}

async function refreshProfileAvatar() {
  const path = state.profile?.avatarPath;
  if (!path || !currentUser) {
    setProfileAvatarUrl("");
    return;
  }
  const { data, error } = await cloud.storage.from("profile-avatars").createSignedUrl(path, 3600);
  if (error || !data?.signedUrl) {
    setProfileAvatarUrl("");
    document.getElementById("profile-avatar-status").textContent = "Não foi possível carregar a foto. Verifique a configuração do Supabase.";
    return;
  }
  const signedUrl = data.signedUrl;
  setProfileAvatarUrl(signedUrl.startsWith("data:") ? signedUrl : `${signedUrl}${signedUrl.includes("?") ? "&" : "?"}v=${Date.now()}`);
  document.getElementById("profile-avatar-status").textContent = "Foto sincronizada com sua conta.";
}

function loadImageFile(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Imagem inválida")); };
    image.src = url;
  });
}

async function compressProfileAvatar(file) {
  const image = await loadImageFile(file);
  const size = 512;
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = Math.max(0, (image.naturalWidth - sourceSize) / 2);
  const sourceY = Math.max(0, (image.naturalHeight - sourceSize) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  context.fillStyle = "#11161a";
  context.fillRect(0, 0, size, size);
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Falha ao comprimir imagem")), "image/jpeg", 0.84));
}

document.getElementById("btn-profile-avatar").addEventListener("click", () => document.getElementById("profile-avatar-input").click());
document.getElementById("profile-avatar-input").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const status = document.getElementById("profile-avatar-status");
  if (!/^image\//i.test(file.type)) return status.textContent = "Escolha um arquivo de imagem.";
  if (file.size > 10485760) return status.textContent = "A imagem original deve ter no máximo 10 MB.";
  status.textContent = "Preparando e enviando a foto…";
  try {
    const compressed = await compressProfileAvatar(file);
    const path = `${currentUser.id}/avatar.jpg`;
    const { error } = await cloud.storage.from("profile-avatars").upload(path, compressed, { contentType: "image/jpeg", upsert: true, cacheControl: "3600" });
    if (error) throw error;
    state.profile.avatarPath = path;
    saveState();
    await cloud.from("app_states").upsert({ user_id: currentUser.id, state, updated_at: new Date().toISOString() });
    await refreshProfileAvatar();
    showToast("Foto de perfil atualizada.");
  } catch (error) {
    console.error("Falha ao enviar foto de perfil", error);
    status.textContent = /bucket|row-level|policy|not found/i.test(error.message || "")
      ? "O armazenamento da foto ainda não foi configurado no Supabase."
      : "Não foi possível enviar a foto. Tente novamente.";
  }
});

document.getElementById("btn-remove-profile-avatar").addEventListener("click", async () => {
  const path = state.profile?.avatarPath;
  if (!path || !window.confirm("Remover sua foto de perfil?")) return;
  const status = document.getElementById("profile-avatar-status");
  status.textContent = "Removendo foto…";
  const { error } = await cloud.storage.from("profile-avatars").remove([path]);
  if (error) return status.textContent = "Não foi possível remover a foto.";
  delete state.profile.avatarPath;
  saveState();
  await cloud.from("app_states").upsert({ user_id: currentUser.id, state, updated_at: new Date().toISOString() });
  setProfileAvatarUrl("");
  status.textContent = "Foto removida.";
  showToast("Foto de perfil removida.");
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
  renderTreino();
  renderPerfil();
  showToast("Rotina atualizada.");
});

document.getElementById("btn-signout").addEventListener("click", async () => {
  await cloud.auth.signOut();
});

document.getElementById("btn-upload-workout").addEventListener("click", () => document.getElementById("workout-input").click());

function readBlobAsArrayBuffer(blob) {
  if (blob && typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("Não foi possível ler o arquivo"));
    reader.readAsArrayBuffer(blob);
  });
}

async function extractPdfPageText(page) {
  // No Safari/iOS, PDF.js 6.1.200 pode falhar no for-await usado por getTextContent().
  // A leitura explícita pelo reader é compatível com o mesmo ReadableStream.
  if (typeof page.streamTextContent === "function") {
    const stream = page.streamTextContent();
    if (stream && typeof stream.getReader === "function") {
      const reader = stream.getReader();
      const items = [];
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          if (Array.isArray(chunk.value?.items)) items.push(...chunk.value.items);
        }
      } finally {
        if (typeof reader.releaseLock === "function") reader.releaseLock();
      }
      return items.map(item => item.str + (item.hasEOL ? "\n" : " ")).join("");
    }
  }
  const content = await page.getTextContent();
  return content.items.map(item => item.str + (item.hasEOL ? "\n" : " ")).join("");
}

async function extractWorkoutText(file) {
  const buffer = await readBlobAsArrayBuffer(file);
  if (/\.pdf$/i.test(file.name || "") || file.type === "application/pdf") {
    const pdfjs = await import("https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.1.200/build/pdf.worker.mjs";
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      pages.push(await extractPdfPageText(page));
    }
    return pages.join("\n");
  }
  if (!window.mammoth) throw new Error("Leitor DOCX indisponível");
  const result = await window.mammoth.extractRawText({ arrayBuffer: buffer });
  return result.value;
}

function parseWorkoutPlan(text, fileName) {
  const dayPatterns = [
    [/^(domingo|dom)\b/i, 0], [/^(segunda(?:\s*-?\s*feira)?|seg)\b/i, 1],
    [/^(terça(?:\s*-?\s*feira)?|terca(?:\s*-?\s*feira)?|ter)\b/i, 2], [/^(quarta(?:\s*-?\s*feira)?|qua)\b/i, 3],
    [/^(quinta(?:\s*-?\s*feira)?|qui)\b/i, 4], [/^(sexta(?:\s*-?\s*feira)?|sex)\b/i, 5],
    [/^(sábado|sabado|sáb|sab)\b/i, 6]
  ];
  const musclePattern = /(pernas?|quadr[ií]ceps|posterior|gl[uú]teos?|peito|costas|ombros?|b[ií]ceps|tr[ií]ceps|braços?|abd[oô]men|panturrilha|cardio|full body)/ig;
  const exerciseEvidence = /\b(s[eé]ries?|repeti[cç][oõ](?:es|e)?|minutos?|horas?)\b/i;
  const rawLines = String(text || "").split(/\r?\n|\s{3,}/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
  const days = {};
  let currentDay = null;
  let pending = "";

  const cleanText = value => value
    .replace(/\bsereis\b/gi, "séries")
    .replace(/\bserie\b/gi, "série")
    .replace(/\bepisódios\s+(?=repeti)/gi, "")
    .replace(/\bCross\s+ouver\b/gi, "Crossover")
    .replace(/\brepetiçõe\b/gi, "repetições")
    .replace(/\s+([.,:;])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  const canonicalFocus = value => {
    const normalized = value.toLowerCase();
    if (/quadr[ií]ceps/.test(normalized)) return "Quadríceps";
    if (/posterior/.test(normalized)) return "Posterior";
    if (/gl[uú]teo/.test(normalized)) return "Glúteos";
    if (/peito/.test(normalized)) return "Peito";
    if (/costas/.test(normalized)) return "Costas";
    if (/ombro/.test(normalized)) return "Ombros";
    if (/b[ií]ceps/.test(normalized)) return "Bíceps";
    if (/tr[ií]ceps/.test(normalized)) return "Tríceps";
    if (/panturrilha/.test(normalized)) return "Panturrilha";
    if (/pernas?/.test(normalized)) return "Pernas";
    if (/cardio/.test(normalized)) return "Cardio";
    if (/abd[oô]men/.test(normalized)) return "Abdômen";
    return value.replace(/[.:;]+$/, "").trim();
  };

  const addFocus = value => {
    if (currentDay === null) return;
    const matches = [...value.matchAll(musclePattern)].map(item => canonicalFocus(item[0]));
    if (/descanso/i.test(value)) matches.push("Descanso ativo");
    matches.forEach(focus => { if (focus && !days[currentDay].focuses.includes(focus)) days[currentDay].focuses.push(focus); });
  };

  const inferFocus = exercise => {
    const rules = [
      [/barra fixa|remada|puxador|serrote|terra lombar/i, "Costas"],
      [/supino|voador|crossover|cross over/i, "Peito"],
      [/rosca|martelo|scott|b[ií]ceps/i, "Bíceps"],
      [/tr[ií]ceps|corda|testa barra|polia barra/i, "Tríceps"],
      [/desenvolvimento|eleva[cç][aã]o lateral|eleva[cç][aã]o frontal|encolhimento|crucifixo invertido/i, "Ombros"],
      [/mesa flexora|cadeira flexora|posterior|eleva[cç][aã]o p[eé]lvica/i, "Posterior"],
      [/cadeira extensora|leg press|agachamento|quadr[ií]ceps/i, "Quadríceps"],
      [/panturrilha/i, "Panturrilha"], [/cardio|esteira|bicicleta/i, "Cardio"]
    ];
    rules.forEach(([pattern, focus]) => { if (pattern.test(exercise) && !days[currentDay].focuses.includes(focus)) days[currentDay].focuses.push(focus); });
  };

  const addExerciseBlock = value => {
    if (currentDay === null || !value) return;
    let cleaned = cleanText(value)
      .replace(/(repeti[cç][oõ]es?|minutos?|horas?)\s+(?=[A-ZÀ-Ý])/g, "$1. ");
    if (!exerciseEvidence.test(cleaned)) {
      if (musclePattern.test(cleaned) || /descanso\s+de\s+treino/i.test(cleaned)) addFocus(cleaned);
      musclePattern.lastIndex = 0;
      return;
    }
    const pieces = cleaned
      .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý])|\s+\+\s+(?=[^+]*(?:\d+\s*(?:s[eé]ries?|repeti[cç][oõ]|minutos?|horas?)))/i)
      .map(item => item.replace(/^[-•\d.)\s]+/, "").replace(/[.;]+$/, "").trim())
      .filter(item => item.length >= 4 && exerciseEvidence.test(item));
    pieces.forEach(exercise => {
      const formatted = exercise.charAt(0).toUpperCase() + exercise.slice(1);
      days[currentDay].exercises.push(formatted);
      inferFocus(formatted);
    });
  };

  const flushPending = () => {
    if (!pending) return;
    addExerciseBlock(pending);
    pending = "";
  };

  for (const sourceLine of rawLines) {
    const line = cleanText(sourceLine);
    const dayMatch = dayPatterns.find(([pattern]) => pattern.test(line));
    if (dayMatch && line.length < 100) {
      flushPending();
      currentDay = dayMatch[1];
      if (!days[currentDay]) days[currentDay] = { focuses: [], focus: "", exercises: [] };
      const remainder = line.replace(dayMatch[0], "").replace(/^[\s.:-]+/, "").trim();
      if (remainder) pending = remainder;
      continue;
    }
    if (currentDay === null) continue;
    const looksLikeHeading = !exerciseEvidence.test(line) && (musclePattern.test(line) || /descanso\s+(?:de)?\s*treino/i.test(line));
    musclePattern.lastIndex = 0;
    if (looksLikeHeading && !pending) {
      addFocus(line);
      continue;
    }
    pending = pending ? `${pending} ${line}` : line;
    if (/[.!?]$/.test(line) || /\b(repeti[cç][oõ](?:es|e)?|minutos?|horas?)\.?$/i.test(line)) flushPending();
  }
  flushPending();

  Object.values(days).forEach(day => {
    day.exercises = [...new Set(day.exercises)].filter(Boolean).slice(0, 30);
    let focuses = [...day.focuses];
    if (focuses.length > 2 && !focuses.includes("Descanso ativo")) focuses = focuses.filter(focus => focus !== "Cardio");
    day.focus = focuses.slice(0, 5).join(" + ") || "Treino do dia";
    delete day.focuses;
  });
  Object.keys(days).forEach(day => {
    if (!days[day].exercises.length && !/descanso/i.test(days[day].focus)) delete days[day];
    else if (!days[day].exercises.length) {
      days[day].exercises = ["Descanso do treino de força"];
    }
  });
  if (!Object.keys(days).length) throw new Error("Não encontrei dias da semana no documento");
  return { source: fileName, parsedAt: new Date().toISOString(), parserVersion: 2, days };
}

function parseDietPlan(text, fileName) {
  const lines = String(text || "")
    .split(/\r?\n|\s{3,}/)
    .map(line => line.replace(/\s+/g, " ").replace(/\s+([.,:;])/g, "$1").trim())
    .filter(Boolean);
  const mealHeadings = [
    [/^(?:primeira|1[ªaº]?)\s+refei[cç][aã]o\b/i, "Café da manhã"],
    [/^(?:(?:segunda|2[ªaº]?)\s+refei[cç][aã]o|almo[cç]o)\b/i, "Almoço"],
    [/^(?:terceira|3[ªaº]?)\s+refei[cç][aã]o\b/i, "Lanche"],
    [/^(?:quarta|4[ªaº]?)\s+refei[cç][aã]o\b/i, "Quarta refeição"],
    [/^(?:quinta|5[ªaº]?)\s+refei[cç][aã]o\b/i, "Quinta refeição"],
    [/^jantar\b/i, "Jantar"], [/^p[oó]s\s*-?\s*treino\b/i, "Pós-treino"],
    [/^ceia\b/i, "Ceia"], [/^lanche\b/i, "Lanche"]
  ];
  const generalPattern = /^(?:todo\s+|aos?\s+|de\s+)?(?:segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo)\b|^(?:creatina|glutamina|multivitam[ií]nico|vitamina|tomar\s+\d|[aá]gua\b)/i;
  const meals = [];
  const generalNotes = [];
  const warnings = [];
  let currentMeal = null;
  let specialNoteMode = false;
  const cleanItem = value => value
    .replace(/\bgr\.?\b/gi, "g")
    .replace(/\bgramas?\b/gi, match => match.toLowerCase().startsWith("grama") ? "g" : match)
    .replace(/\s+/g, " ")
    .replace(/\s+([.,])/g, "$1")
    .trim();

  lines.forEach(rawLine => {
    const line = cleanItem(rawLine);
    const heading = mealHeadings.find(([pattern]) => pattern.test(line));
    if (heading) {
      const time = line.match(/\b(?:[01]?\d|2[0-3]):[0-5]\d\b/)?.[0] || null;
      let title = heading[1];
      if (/almo[cç]o/i.test(line)) title = "Almoço";
      currentMeal = { id: `diet_meal_${meals.length + 1}`, title, time, items: [] };
      meals.push(currentMeal);
      specialNoteMode = false;
      return;
    }
    const general = generalPattern.test(line) || /refei[cç][aã]o\s+livre|litros?\s+de\s+[aá]gua|por\s+dia|pela\s+manh[aã]|antes\s+de\s+dormir/i.test(line);
    if (general || specialNoteMode) {
      generalNotes.push(line);
      specialNoteMode = /^(?:sábado|sabado|domingo)\s*[!.:]?$/i.test(line);
      return;
    }
    if (currentMeal) currentMeal.items.push(line);
    else generalNotes.push(line);
  });

  meals.forEach(meal => {
    meal.items = meal.items.filter(item => {
      if (/^(?:pode\s+tomar|observa[cç][aã]o|op[cç][aã]o)\b/i.test(item)) return true;
      return item.length > 1;
    });
  });
  const allText = lines.join(" ");
  const suspiciousScoops = allText.match(/\b\d+(?:[.,]\d+)?\s+scoops?\b/gi) || [];
  suspiciousScoops.forEach(item => warnings.push(`Confira a unidade informada em “${item}”.`));
  meals.filter(meal => !meal.items.length).forEach(meal => warnings.push(`${meal.title} foi identificada sem alimentos.`));
  if (!meals.length) throw new Error("Não encontrei blocos de refeições no documento");
  const plan = { source: fileName, parsedAt: new Date().toISOString(), parserVersion: 2, meals, generalNotes: [...new Set(generalNotes)], warnings: [...new Set(warnings)] };
  return window.enrichDietPlan ? window.enrichDietPlan(plan) : plan;
}

document.getElementById("btn-import-diet").addEventListener("click", () => document.getElementById("diet-input").click());
document.getElementById("diet-input").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  if (!/\.(pdf|docx)$/i.test(file.name)) return showToast("Envie apenas PDF ou DOCX.");
  if (file.size > 10485760) return showToast("O arquivo deve ter no máximo 10 MB.");
  const status = document.getElementById("diet-import-status");
  status.textContent = "Lendo e organizando o plano alimentar…";
  try {
    const plan = parseDietPlan(await extractWorkoutText(file), file.name);
    state.dietPlan = plan;
    state.customRoutine.mealCount = plan.meals.length;
    const freeMealSaturday = plan.generalNotes.some(note => /sábado|sabado/i.test(note) && /refei[cç][aã]o\s+livre/i.test(note));
    if (freeMealSaturday) state.customRoutine.freeMealDay = 6;
    const water = plan.generalNotes.join(" ").match(/(\d+(?:[.,]\d+)?)\s*litros?\s+de\s+[aá]gua/i);
    if (water) state.metas.aguaMetaMl = Math.round(Number(water[1].replace(",", ".")) * 1000);
    saveState();
    await window.persistRoutineConfig?.(state.customRoutine);
    renderDieta();
    renderHoje();
    renderSemana();
    const nutrition = typeof dietPlanTotals === "function" ? dietPlanTotals(plan) : null;
    status.textContent = nutrition
      ? `${plan.meals.length} refeição(ões) importada(s); ${nutrition.calculated} de ${nutrition.items} item(ns) calculado(s).`
      : `${plan.meals.length} refeição(ões) importada(s). Confira os itens abaixo.`;
    showToast("Plano alimentar importado.");
  } catch (error) {
    status.textContent = `Não foi possível organizar o plano: ${error.message}.`;
  }
});

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

async function analyzeWorkoutFile(file) {
  const text = await extractWorkoutText(file);
  state.workoutPlan = parseWorkoutPlan(text, file.name);
  const detectedDays = Object.keys(state.workoutPlan.days).map(Number);
  if (detectedDays.length) state.customRoutine.trainingDays = detectedDays;
  saveState();
  const { error } = await cloud.from("profiles").update({ routine_config: state.customRoutine, updated_at: new Date().toISOString() }).eq("id", currentUser.id);
  if (error) throw error;
  renderWorkoutAnalysis();
  renderHoje();
  renderSemana();
  renderTreino();
  return detectedDays.length;
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
    const detectedDays = await analyzeWorkoutFile(file);
    analysisStatus.textContent = `${detectedDays} dia(s) de treino identificado(s) e organizados automaticamente.`;
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
  (data || []).forEach((documentRow, documentIndex) => {
    const row = document.createElement("div");
    row.className = "workout-file";
    const name = document.createElement("span");
    name.textContent = `${documentRow.file_name} · ${documentRow.status}`;
    const actions = document.createElement("div");
    actions.className = "workout-file-actions";
    const reanalyze = document.createElement("button");
    reanalyze.type = "button";
    reanalyze.textContent = "Reanalisar";
    reanalyze.addEventListener("click", async () => {
      const status = document.getElementById("workout-analysis-status");
      status.textContent = "Baixando o arquivo privado e corrigindo a leitura…";
      reanalyze.disabled = true;
      const { data: blob, error: downloadError } = await cloud.storage.from("workout-documents").download(documentRow.storage_path);
      if (downloadError) {
        status.textContent = "Não foi possível acessar o arquivo para reanálise.";
        reanalyze.disabled = false;
        return;
      }
      try {
        const file = new File([blob], documentRow.file_name, { type: blob.type || (/\.pdf$/i.test(documentRow.file_name) ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document") });
        const count = await analyzeWorkoutFile(file);
        status.textContent = `${count} dia(s) reorganizado(s) automaticamente com o novo corretor.`;
        showToast("Treino reanalisado e corrigido.");
      } catch (analysisError) {
        status.textContent = `Não foi possível reanalisar: ${analysisError.message}.`;
      } finally {
        reanalyze.disabled = false;
      }
    });
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
        renderTreino();
      }
      await loadWorkoutFiles();
    });
    actions.append(reanalyze, remove);
    row.append(name, actions);
    box.appendChild(row);
    if (documentIndex === 0 && (!state.workoutPlan?.parserVersion || state.workoutPlan.parserVersion < 2) && !window.autoWorkoutReanalysisStarted) {
      window.autoWorkoutReanalysisStarted = true;
      setTimeout(() => reanalyze.click(), 0);
    }
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
