import {
  supabase,
  supabaseConfigMissing,
} from "./lib/supabase.js";

const authView = document.querySelector("#auth-view");
const gameView = document.querySelector("#game-view");
const gameHeader = document.querySelector("#game-header");

const authForm = document.querySelector("#auth-form");
const emailInput = document.querySelector("#auth-email");
const passwordInput = document.querySelector("#auth-password");
const authMessage = document.querySelector("#auth-message");

const userEmailElement = document.querySelector("#user-email");
const logoutButton = document.querySelector("#logout-button");

let submitting = false;

function setAuthMessage(message, type = "normal") {
  if (!authMessage) {
    return;
  }

  authMessage.textContent = message;
  authMessage.dataset.type = type;
}

function setAuthSubmitting(value) {
  submitting = value;

  if (!authForm) {
    return;
  }

  const buttons = authForm.querySelectorAll("button");

  for (const button of buttons) {
    button.disabled = value;
  }
}

function updateView(session) {
  if (!authView || !gameView || !gameHeader) {
    return;
  }

  const loggedIn = Boolean(session);

  authView.hidden = loggedIn;
  gameView.hidden = !loggedIn;
  gameHeader.hidden = !loggedIn;

  if (loggedIn && userEmailElement) {
    userEmailElement.textContent =
      session.user.email ?? "未知账号";
  } else if (userEmailElement) {
    userEmailElement.textContent = "";
  }
}

function getErrorMessage(error) {
  const message = error?.message ?? "";

  if (message.includes("Invalid login credentials")) {
    return "邮箱或密码错误。";
  }

  if (message.includes("User already registered")) {
    return "这个邮箱已经注册过，请直接登录。";
  }

  if (message.includes("Password should be at least")) {
    return "密码至少需要 6 位。";
  }

  if (message.includes("Unable to validate email")) {
    return "请输入有效的邮箱地址。";
  }

  if (message.includes("Email not confirmed")) {
    return "邮箱尚未验证，请先完成邮箱验证。";
  }

  return message || "操作失败，请稍后重试。";
}

async function login(email, password) {
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  setAuthMessage("登录成功。", "success");
}

async function register(email, password) {
  const redirectUrl =
    `${window.location.origin}${window.location.pathname}`;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
    },
  });

  if (error) {
    throw error;
  }

  if (data.session) {
    setAuthMessage("注册成功，已自动登录。", "success");
  } else {
    setAuthMessage(
      "注册成功，请检查邮箱并完成验证后再登录。",
      "success",
    );
  }
}

if (authForm) {
  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (submitting || !supabase) {
      return;
    }

    const action =
      event.submitter?.dataset.authAction ?? "login";

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      setAuthMessage("请输入邮箱和密码。", "error");
      return;
    }

    setAuthSubmitting(true);

    setAuthMessage(
      action === "register"
        ? "正在创建账号……"
        : "正在登录……",
    );

    try {
      if (action === "register") {
        await register(email, password);
      } else {
        await login(email, password);
      }
    } catch (error) {
      setAuthMessage(getErrorMessage(error), "error");
    } finally {
      setAuthSubmitting(false);
    }
  });
}

if (logoutButton) {
  logoutButton.addEventListener("click", async () => {
    if (!supabase || submitting) {
      return;
    }

    logoutButton.disabled = true;

    const { error } = await supabase.auth.signOut();

    if (error) {
      setAuthMessage(getErrorMessage(error), "error");
    }

    logoutButton.disabled = false;
  });
}

async function initializeAuth() {
  if (supabaseConfigMissing || !supabase) {
    updateView(null);
    setAuthMessage(
      "尚未配置 Supabase，请先创建 .env.local 并填写项目参数。",
      "error",
    );

    const buttons = authForm.querySelectorAll("button");
    for (const button of buttons) {
      button.disabled = true;
    }

    return;
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  updateView(session);

  supabase.auth.onAuthStateChange((_event, nextSession) => {
    updateView(nextSession);
  });
}

void initializeAuth();