const els = {
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
  planStatus: document.getElementById("planStatus"),
  trialInfo: document.getElementById("trialInfo"),
  toast: document.getElementById("toast"),
  gateCard: document.getElementById("gateCard"),
  dataCard: document.getElementById("dataCard"),
  signedInActions: document.getElementById("signedInActions"),
  emailCount: document.getElementById("emailCount"),
  domainCount: document.getElementById("domainCount"),
  lastScan: document.getElementById("lastScan"),
  searchEmail: document.getElementById("searchEmail"),
  fromDate: document.getElementById("fromDate"),
  toDate: document.getElementById("toDate"),
  filterBtn: document.getElementById("filterBtn"),
  tableBody: document.getElementById("tableBody"),
  emptyState: document.getElementById("emptyState"),
  copyBtn: document.getElementById("copyBtn"),
  exportCsvBtn: document.getElementById("exportCsvBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  clearHistory: document.getElementById("clearHistory"),
};

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
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
};

const formatDateTime = (iso) => (iso ? new Date(iso).toLocaleString() : "--");

const setAuthUi = () => {
  const signedIn = Boolean(user);
  els.signedOutCard.hidden = signedIn;
  els.planCard.hidden = !signedIn;
  els.gateCard.hidden = signedIn;
  els.dataCard.hidden = !signedIn;
  els.signedInActions.hidden = !signedIn;
  if (!signedIn) return;
  els.userName.textContent = user.name || "Signed in";
  els.userEmail.textContent = user.email;
  els.planStatus.textContent = user.plan === "pro" ? "Pro" : "Free";
  els.trialInfo.textContent =
    user.plan === "pro" ? "Unlimited saved emails on this account." : "Free plan stores up to 80 emails on this account.";
};

const renderTable = (scans) => {
  displayed = scans;
  els.tableBody.innerHTML = "";
  els.emptyState.hidden = scans.length > 0;
  for (const scan of scans) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${escapeHtml(scan.email)}</td>
      <td>${escapeHtml(scan.domain)}</td>
      <td>${escapeHtml(scan.sourceUrl)}</td>
      <td>${formatDateTime(scan.scannedAt)}</td>
    `;
    els.tableBody.appendChild(row);
  }
};

const loadScans = async () => {
  if (!user) {
    displayed = [];
    return;
  }
  const params = new URLSearchParams();
  const q = els.searchEmail.value.trim();
  if (q) params.set("q", q);
  if (els.fromDate.value) params.set("from", els.fromDate.value);
  if (els.toDate.value) params.set("to", els.toDate.value);
  const data = await api(`/api/scans?${params.toString()}`);
  els.emailCount.textContent = data.totals.emails ?? 0;
  els.domainCount.textContent = data.totals.domains ?? 0;
  els.lastScan.textContent = formatDateTime(data.totals.lastScan);
  renderTable(data.results);
};

const afterAuth = async (nextUser, message) => {
  user = nextUser;
  els.authPassword.value = "";
  setAuthUi();
  await loadScans();
  showToast(message);
};

els.registerBtn.addEventListener("click", async () => {
  try {
    const data = await api("/api/register", {
      method: "POST",
      body: JSON.stringify({
        name: els.authName.value,
        email: els.authEmail.value,
        password: els.authPassword.value,
      }),
    });
    await afterAuth(data.user, "Account created. Scans you run will save here.");
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
    await afterAuth(data.user, "Signed in. Your saved leads are loaded.");
  } catch (err) {
    showToast(err.message);
  }
});

els.logoutBtn.addEventListener("click", async () => {
  await api("/api/logout", { method: "POST", body: "{}" });
  user = null;
  setAuthUi();
  renderTable([]);
  showToast("Signed out");
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

els.copyBtn.addEventListener("click", async () => {
  if (!displayed.length) return showToast("Nothing to copy");
  await navigator.clipboard.writeText(displayed.map((scan) => scan.email).join("\n"));
  showToast("Emails copied");
});

els.exportCsvBtn.addEventListener("click", () => {
  if (!displayed.length) return showToast("Nothing to export");
  const headers = ["Email", "Domain", "Source URL", "Scanned At"];
  const rows = displayed.map((scan) => [scan.email, scan.domain, scan.sourceUrl, scan.scannedAt]);
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadFile(csv, "leadscope-admin.csv", "text/csv");
});

els.exportJsonBtn.addEventListener("click", () => {
  if (!displayed.length) return showToast("Nothing to export");
  downloadFile(JSON.stringify(displayed, null, 2), "leadscope-admin.json", "application/json");
});

els.clearHistory.addEventListener("click", async () => {
  if (!user) return;
  if (!window.confirm("Clear every saved lead on this account?")) return;
  try {
    await api("/api/scans", { method: "DELETE" });
    await loadScans();
    showToast("Saved data cleared");
  } catch (err) {
    showToast(err.message);
  }
});

(async () => {
  try {
    const data = await api("/api/me");
    user = data.user;
  } catch {
    user = null;
  }
  setAuthUi();
  if (user) await loadScans();
})();
