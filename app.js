const els = {
  inputData: document.getElementById("inputData"),
  scanBtn: document.getElementById("scanBtn"),
  sampleBtn: document.getElementById("sampleBtn"),
  progressBar: document.getElementById("progressBar"),
  progressText: document.getElementById("progressText"),
  spinner: document.getElementById("spinner"),
  emailCount: document.getElementById("emailCount"),
  domainCount: document.getElementById("domainCount"),
  lastScan: document.getElementById("lastScan"),
  results: document.getElementById("results"),
  historyContent: document.getElementById("historyContent"),
  toggleHistory: document.getElementById("toggleHistory"),
  historyPanel: document.getElementById("historyPanel"),
  copyBtn: document.getElementById("copyBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  filterBtn: document.getElementById("filterBtn"),
  searchEmail: document.getElementById("searchEmail"),
  fromDate: document.getElementById("fromDate"),
  toDate: document.getElementById("toDate"),
  upgradeBtn: document.getElementById("upgradeBtn"),
  planStatus: document.getElementById("planStatus"),
  trialInfo: document.getElementById("trialInfo"),
  exportNote: document.getElementById("exportNote"),
  clearHistory: document.getElementById("clearHistory"),
  toast: document.getElementById("toast"),
  signedOutCard: document.getElementById("signedOutCard"),
  planCard: document.getElementById("planCard"),
  authName: document.getElementById("authName"),
  authEmail: document.getElementById("authEmail"),
  authPassword: document.getElementById("authPassword"),
  registerBtn: document.getElementById("registerBtn"),
  loginBtn: document.getElementById("loginBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  userName: document.getElementById("userName"),
  userEmail: document.getElementById("userEmail"),
};

const SAMPLE = `https://redwolfcoshop.com/`;

let user = null;
let displayed = [];

const amp = "&" + "amp;";
const lt = "&" + "lt;";
const gt = "&" + "gt;";
const quot = "&" + "quot;";

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", amp)
    .replaceAll("<", lt)
    .replaceAll(">", gt)
    .replaceAll('"', quot);

const showToast = (message) => {
  els.toast.hidden = false;
  els.toast.textContent = message;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
};

const api = async (path, options = {}) => {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
};

const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : "--");

const renderResults = (scans) => {
  displayed = scans;
  els.results.innerHTML = "";
  if (!scans.length) {
    els.results.innerHTML = '<p class="empty">No results yet. Run a scan to see results.</p>';
    return;
  }
  for (const scan of scans) {
    const item = document.createElement("div");
    item.className = "result-item";
    item.innerHTML = `
      <span class="badge">${escapeHtml(scan.domain)}</span>
      <strong>${escapeHtml(scan.email)}</strong>
      <span>Store / URL: ${escapeHtml(scan.sourceUrl)}</span>
      <small>Scanned: ${formatDateTime(scan.scannedAt)}</small>
    `;
    els.results.appendChild(item);
  }
};

const updateHistory = (scans) => {
  els.historyContent.innerHTML = "";
  if (!scans.length) {
    els.historyContent.innerHTML = '<p class="empty">No scans yet.</p>';
    return;
  }
  for (const scan of scans.slice(0, 8)) {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <strong>${escapeHtml(scan.email)}</strong><br/>
      ${escapeHtml(scan.domain)}<br/>
      <span>${escapeHtml(scan.sourceUrl)}</span><br/>
      <small>${formatDateTime(scan.scannedAt)}</small>
    `;
    els.historyContent.appendChild(item);
  }
};

const setMetrics = (totals) => {
  els.emailCount.textContent = totals.emails ?? 0;
  els.domainCount.textContent = totals.domains ?? 0;
  els.lastScan.textContent = formatDateTime(totals.lastScan);
};

const setAuthUi = () => {
  const signedIn = Boolean(user);
  els.signedOutCard.hidden = signedIn;
  els.planCard.hidden = !signedIn;
  if (!signedIn) {
    els.planStatus.textContent = "Free";
    return;
  }
  els.userName.textContent = user.name || "Signed in";
  els.userEmail.textContent = user.email;
  els.planStatus.textContent = user.plan === "pro" ? "Pro" : "Free";
  els.upgradeBtn.textContent = user.plan === "pro" ? "Pro active" : "Upgrade to Pro";
  els.trialInfo.textContent = user.plan === "pro" ? "Unlimited saved emails" : "80 saved emails on Free.";
};

const loadScans = async () => {
  if (!user) {
    setMetrics({ emails: 0, domains: 0, lastScan: null });
    updateHistory([]);
    renderResults([]);
    return;
  }
  const params = new URLSearchParams();
  const q = els.searchEmail.value.trim();
  if (q) params.set("q", q);
  if (els.fromDate.value) params.set("from", els.fromDate.value);
  if (els.toDate.value) params.set("to", els.toDate.value);
  const data = await api(`/api/scans?${params.toString()}`);
  setMetrics(data.totals);
  updateHistory(data.results);
  renderResults(data.results);
};

const refreshMe = async () => {
  try {
    const data = await api("/api/me");
    user = data.user;
  } catch {
    user = null;
  }
  setAuthUi();
  await loadScans();
};

const withSpinner = (active) => {
  els.spinner.classList.toggle("active", active);
  els.scanBtn.disabled = active;
};

els.signedOutCard.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({
        name: els.authName.value,
        email: els.authEmail.value,
        password: els.authPassword.value,
      }),
    });
    window.location.href = "/admin";
    return;
  } catch (err) {
    showToast(err.message);
  }
});

els.loginBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/login", {
      method: "POST",
      body: JSON.stringify({
        email: els.authEmail.value,
        password: els.authPassword.value,
      }),
    });
    window.location.href = "/admin";
    return;
  } catch (err) {
    showToast(err.message);
  }
});

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  user = null;
  setAuthUi();
  await loadScans();
  showToast("Signed out");
});

els.scanBtn.addEventListener("click", async () => {
  if (!user) {
    showToast("Create an account or sign in first");
    return;
  }
  if (!els.inputData.value.trim()) {
    showToast("Paste URLs or text first");
    return;
  }
  withSpinner(true);
  els.progressBar.style.width = "35%";
  els.progressText.textContent = "Scanning...";
  try {
    const data = await api("/api/scan", {
      method: "POST",
      body: JSON.stringify({ input: els.inputData.value }),
    });
    els.progressBar.style.width = "100%";
    els.progressText.textContent = "Complete";
    if (data.errors?.length) showToast(data.errors[0]);
    else showToast(data.added ? `Saved ${data.added} new email${data.added === 1 ? "" : "s"}` : "No new emails found");
    await loadScans();
  } catch (err) {
    showToast(err.message);
  } finally {
    withSpinner(false);
    setTimeout(() => {
      els.progressBar.style.width = "0%";
      els.progressText.textContent = "Ready";
    }, 1200);
  }
});

els.sampleBtn.addEventListener("click", () => {
  els.inputData.value = SAMPLE;
  showToast("Sample store loaded - hit Start Scan");
});

els.filterBtn.addEventListener("click", () => loadScans().catch((err) => showToast(err.message)));
els.searchEmail.addEventListener("keydown", (event) => {
  if (event.key === "Enter") loadScans().catch((err) => showToast(err.message));
});

const downloadFile = (content, filename, type) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

els.exportCsvBtn.addEventListener("click", () => {
  if (!displayed.length) return showToast("Nothing to export");
  const headers = ["Email", "Domain", "Source URL", "Scanned At"];
  const rows = displayed.map((scan) => [scan.email, scan.domain, scan.sourceUrl, scan.scannedAt]);
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadFile(csv, "leadscope-results.csv", "text/csv");
});

els.exportJsonBtn.addEventListener("click", () => {
  if (!displayed.length) return showToast("Nothing to export");
  downloadFile(JSON.stringify(displayed, null, 2), "leadscope-results.json", "application/json");
});

els.copyBtn.addEventListener("click", async () => {
  if (!displayed.length) return showToast("Nothing to copy");
  const unique = Array.from(new Set(displayed.map((scan) => scan.email)));
  await navigator.clipboard.writeText(unique.join("\n"));
  showToast(`Copied ${unique.length} email${unique.length === 1 ? "" : "s"}`);
});

els.upgradeBtn.addEventListener("click", async () => {
  if (!user) return;
  if (user.plan === "pro") return showToast("Already on Pro");
  try {
    const data = await api("/api/upgrade", { method: "POST", body: "{}" });
    user = data.user;
    setAuthUi();
    showToast("Pro unlocked on this demo");
  } catch (err) {
    showToast(err.message);
  }
});

els.toggleHistory.addEventListener("click", () => {
  els.historyPanel.classList.toggle("hidden");
  els.toggleHistory.textContent = els.historyPanel.classList.contains("hidden") ? "Show" : "Hide";
});

els.clearHistory.addEventListener("click", async () => {
  if (!user) return;
  try {
    await api("/api/scans", { method: "DELETE" });
    await loadScans();
    showToast("History cleared");
  } catch (err) {
    showToast(err.message);
  }
});

refreshMe();
