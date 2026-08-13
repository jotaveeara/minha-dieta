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

const authGate = document.getElementById("auth-gate");
const appElement = document.getElementById("app");
const authStatus = document.getElementById("auth-status");

function setAuthStatus(message, error = false) {
  authStatus.textContent = message || "";
  authStatus.classList.toggle("error", error);
}

function showAuth() {
  authGate.hidden = false;
  appElement.hidden = true;
}

function showApp() {
  authGate.hidden = true;
  appElement.hidden = false;
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
  const { error } = await cloud.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  setAuthStatus(error ? translateAuthError(error.message) : "Enviamos o link de recuperação para seu e-mail.", !!error);
});

function translateAuthError(message = "") {
  const text = message.toLowerCase();
  if (text.includes("invalid login")) return "E-mail ou senha incorretos.";
  if (text.includes("already registered")) return "Este e-mail já possui uma conta.";
  if (text.includes("password")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (text.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  return "Não foi possível concluir. Verifique os dados e tente novamente.";
}

async function loadUserData(user) {
  loadingCloudState = true;
  currentUser = user;
  document.getElementById("account-email").textContent = user.email;
  const [{ data: profile, error: profileError }, { data: remote, error: stateError }] = await Promise.all([
    cloud.from("profiles").select("nome,peso,altura,objetivo").single(),
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } else {
    await cloud.from("app_states").upsert({ user_id: user.id, state });
  }

  if (profile) {
    const form = document.getElementById("form-account");
    form.nome.value = profile.nome || state.profile.nome || "";
    form.peso.value = profile.peso || state.profile.pesoInicial || "";
    form.altura.value = profile.altura || state.profile.altura || "";
    form.objetivo.value = profile.objetivo || "";
    if (profile.nome) state.profile.nome = profile.nome;
    if (profile.peso) state.profile.pesoInicial = Number(profile.peso);
    if (profile.altura) state.profile.altura = Number(profile.altura);
    document.getElementById("p-objetivo").textContent = profile.objetivo ? `Objetivo: ${profile.objetivo}` : "Defina seu objetivo em Minha conta.";
  }
  loadingCloudState = false;
  showApp();
  renderHoje();
  renderPerfil();
  await loadWorkoutFiles();
  document.getElementById("sync-status").textContent = "Dados sincronizados com sua conta.";
}

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
    updated_at: new Date().toISOString()
  };
  const { error } = await cloud.from("profiles").upsert(profile);
  if (error) return showToast("Não foi possível salvar o perfil.");
  state.profile.nome = profile.nome;
  if (profile.peso) state.profile.pesoInicial = profile.peso;
  if (profile.altura) state.profile.altura = profile.altura;
  document.getElementById("p-objetivo").textContent = profile.objetivo ? `Objetivo: ${profile.objetivo}` : "Defina seu objetivo em Minha conta.";
  saveState();
  renderHoje();
  renderPerfil();
  showToast("Perfil salvo.");
});

document.getElementById("btn-signout").addEventListener("click", async () => {
  await cloud.auth.signOut();
});

document.getElementById("btn-upload-workout").addEventListener("click", () => document.getElementById("workout-input").click());
document.getElementById("workout-input").addEventListener("change", async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;
  const valid = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (!valid.includes(file.type)) return showToast("Envie apenas PDF ou DOCX.");
  if (file.size > 10485760) return showToast("O arquivo deve ter no máximo 10 MB.");
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
      await loadWorkoutFiles();
    });
    row.append(name, remove);
    box.appendChild(row);
  });
}

cloud.auth.onAuthStateChange((event, session) => {
  if (session?.user) loadUserData(session.user);
  else {
    currentUser = null;
    showAuth();
  }
});

(async function startAuth() {
  const { data } = await cloud.auth.getSession();
  if (data.session?.user) await loadUserData(data.session.user);
  else showAuth();
})();
