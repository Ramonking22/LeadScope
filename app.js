const inputData = document.getElementById("inputData");
const scanBtn = document.getElementById("scanBtn");
const sampleBtn = document.getElementById("sampleBtn");
const progressBar = document.getElementById("progressBar");
const progressText = document.getElementById("progressText");
const spinner = document.getElementById("spinner");
const emailCount = document.getElementById("emailCount");
const domainCount = document.getElementById("domainCount");
const lastScan = document.getElementById("lastScan");
const results = document.getElementById("results");
const historyContent = document.getElementById("historyContent");
const toggleHistory = document.getElementById("toggleHistory");
const historyPanel = document.getElementById("historyPanel");
const copyBtn = document.getElementById("copyBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const filterBtn = document.getElementById("filterBtn");
const searchEmail = document.getElementById("searchEmail");
const fromDate = document.getElementById("fromDate");
const toDate = document.getElementById("toDate");
const openConfig = document.getElementById("openConfig");
const closeConfig = document.getElementById("closeConfig");
const configModal = document.getElementById("configModal");
const saveConfig = document.getElementById("saveConfig");
const supabaseUrlInput = document.getElementById("supabaseUrl");
const supabaseKeyInput = document.getElementById("supabaseKey");
const flutterwaveKeyInput = document.getElementById("flutterwaveKey");
const flutterwaveLinkInput = document.getElementById("flutterwaveLink");
const upgradeBtn = document.getElementById("upgradeBtn");
const planStatus = document.getElementById("planStatus");
const trialInfo = document.getElementById("trialInfo");
const exportNote = document.getElementById("exportNote");
const googleLoginBtn = document.getElementById("googleLoginBtn");
const clearHistory = document.getElementById("clearHistory");
const toast = document.getElementById("toast");

const storageKeys = {
  scans: "leadscope_scans",
  config: "leadscope_config",
  plan: "leadscope_plan",
  trialStart: "leadscope_trial_start",
};

const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const previewProxyBase = "https://r.jina.ai/";
const SAMPLE = `Contact us at hello@dimetech.agency or sales@leadscope.app
https://example.com
Support: support@shop-demo.test, founders@shop-demo.test`;

let displayedResults = [];

const showToast = (message) => {
  toast.hidden = false;
  toast.textContent = message;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => {
    toast.hidden = true;
  }, 2400);
};

const loadConfig = () => {
  const config = JSON.parse(localStorage.getItem(storageKeys.config) || "{}");
  supabaseUrlInput.value = config.supabaseUrl || "";
  supabaseKeyInput.value = config.supabaseKey || "";
  flutterwaveKeyInput.value = config.flutterwaveKey || "";
  flutterwaveLinkInput.value = config.flutterwaveLink || "";
};

const saveConfigValues = () => {
  const config = {
    supabaseUrl: supabaseUrlInput.value.trim(),
    supabaseKey: supabaseKeyInput.value.trim(),
    flutterwaveKey: flutterwaveKeyInput.value.trim(),
    flutterwaveLink: flutterwaveLinkInput.value.trim(),
  };
  localStorage.setItem(storageKeys.config, JSON.stringify(config));
  configModal.classList.remove("open");
  showToast("Configuration saved in this browser");
};

const getPlan = () => localStorage.getItem(storageKeys.plan) || "free";

const updatePlanUI = () => {
  const plan = getPlan();
  planStatus.textContent = plan === "pro" ? "Pro" : "Free";
  if (plan === "pro") {
    trialInfo.textContent = "Unlimited scans + exports";
    upgradeBtn.textContent = "Manage Subscription";
    exportNote.innerHTML =
      'Pro plan: unlimited exports and cross-device sync. <span class="note-highlight">URL scans</span> run through a server proxy so CORS does not block them.';
  } else if (trialExpired()) {
    trialInfo.textContent = "Trial expired - upgrade to continue";
    upgradeBtn.textContent = "Upgrade to Pro";
    exportNote.textContent = "Free plan exports are limited to 10 records after trial.";
  } else {
    trialInfo.textContent = "7-day trial available";
    upgradeBtn.textContent = "Upgrade to Pro";
    exportNote.innerHTML =
      'Free plan exports are limited to 50 records. <span class="note-highlight">URL scans</span> run through a server proxy so CORS does not block them.';
  }
};

const ensureTrial = () => {
  if (!localStorage.getItem(storageKeys.trialStart)) {
    localStorage.setItem(storageKeys.trialStart, new Date().toISOString());
  }
};

const trialExpired = () => {
  const start = localStorage.getItem(storageKeys.trialStart);
  if (!start) return false;
  return Date.now() - new Date(start).getTime() > 7 * 24 * 60 * 60 * 1000;
};

const loadScans = () => JSON.parse(localStorage.getItem(storageKeys.scans) || "[]");
const saveScans = (scans) => localStorage.setItem(storageKeys.scans, JSON.stringify(scans));

const formatDateTime = (iso) => new Date(iso).toLocaleString();

const animateCount = (element, value) => {
  const start = Number(element.textContent) || 0;
  const duration = 400;
  const startTime = performance.now();
  const step = (time) => {
    const progress = Math.min((time - startTime) / duration, 1);
    element.textContent = Math.floor(start + (value - start) * progress);
    if (progress < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};

const updateMetrics = (scans) => {
  animateCount(emailCount, scans.length);
  animateCount(domainCount, new Set(scans.map((scan) => scan.domain)).size);
  lastScan.textContent = scans.length ? formatDateTime(scans[0].scannedAt) : "--";
};

const updateHistory = (scans) => {
  historyContent.innerHTML = "";
  if (!scans.length) {
    historyContent.innerHTML = "<p class=\"empty\">No scans yet.</p>";
    return;
  }
  scans.slice(0, 8).forEach((scan) => {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
      <strong>${escapeHtml(scan.email)}</strong><br/>
      ${escapeHtml(scan.domain)}<br/>
      <span>${escapeHtml(scan.sourceUrl)}</span><br/>
      <small>${formatDateTime(scan.scannedAt)}</small>
    `;
    historyContent.appendChild(item);
  });
};

const escapeHtml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const renderResults = (scans) => {
  results.innerHTML = "";
  displayedResults = scans;
  if (!scans.length) {
    results.innerHTML = "<p class=\"empty\">No results yet. Run a scan to see results.</p>";
    return;
  }
  scans.forEach((scan) => {
    const item = document.createElement("div");
    item.className = "result-item";
    item.innerHTML = `
      <span class="badge">${escapeHtml(scan.domain)}</span>
      <strong>${escapeHtml(scan.email)}</strong>
      <span>Store / URL: ${escapeHtml(scan.sourceUrl)}</span>
      <small>Scanned: ${formatDateTime(scan.scannedAt)}</small>
    `;
    results.appendChild(item);
  });
};

const filterScans = () => {
  const query = searchEmail.value.trim().toLowerCase();
  let scans = loadScans();
  if (query) scans = scans.filter((scan) => scan.email.toLowerCase().includes(query));
  if (fromDate.value) {
    const from = new Date(fromDate.value).getTime();
    scans = scans.filter((scan) => new Date(scan.scannedAt).getTime() >= from);
  }
  if (toDate.value) {
    const to = new Date(toDate.value).getTime() + 24 * 60 * 60 * 1000;
    scans = scans.filter((scan) => new Date(scan.scannedAt).getTime() <= to);
  }
  scans.sort((a, b) => new Date(b.scannedAt) - new Date(a.scannedAt));
  renderResults(scans);
};

const extractEmails = (text) => {
  const matches = text.match(emailRegex) || [];
  return Array.from(new Set(matches.map((email) => email.toLowerCase()))).filter(
    (email) => !email.endsWith(".png") && !email.endsWith(".jpg") && !email.includes("example.com")
  );
};

const parseSourceInputs = () =>
  inputData.value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const isValidUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

const domainFromEmail = (email) => email.split("@")[1] || "";

const createScanRecords = (emails, sourceUrl) => {
  const scannedAt = new Date().toISOString();
  return emails.map((email) => ({
    email,
    domain: domainFromEmail(email),
    sourceUrl,
    scannedAt,
  }));
};

const fetchViaProxy = async (url) => {
  try {
    const response = await fetch("/api/fetch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data.text) return data.text;
    }
  } catch {
    // fall through to public preview proxy
  }
  const proxyResponse = await fetch(`${previewProxyBase}${url}`);
  return proxyResponse.text();
};

const fetchContent = async (url) => {
  try {
    return await fetchViaProxy(url);
  } catch {
    return url;
  }
};

const updateProgress = (value) => {
  progressBar.style.width = `${value}%`;
};

const withSpinner = (active) => {
  spinner.classList.toggle("active", active);
  scanBtn.disabled = active;
};

const updateProgressText = (text) => {
  progressText.textContent = text;
};

const applyPlanLimits = (scans) => {
  const plan = getPlan();
  if (plan === "pro") return scans;
  return trialExpired() ? scans.slice(0, 10) : scans.slice(0, 50);
};

const getExportableResults = () => {
  const plan = getPlan();
  if (plan === "pro") return displayedResults;
  return trialExpired() ? displayedResults.slice(0, 10) : displayedResults.slice(0, 50);
};

const sendToSupabase = async (records) => {
  const config = JSON.parse(localStorage.getItem(storageKeys.config) || "{}");
  if (!config.supabaseUrl || !config.supabaseKey) return;
  try {
    await fetch(`${config.supabaseUrl}/rest/v1/lead_scans`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.supabaseKey,
        Authorization: `Bearer ${config.supabaseKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(records),
    });
  } catch (error) {
    console.warn("Supabase sync failed", error);
  }
};

const scanSources = async () => {
  ensureTrial();
  const inputs = parseSourceInputs();
  if (!inputs.length) {
    showToast("Paste URLs or text first");
    return;
  }

  withSpinner(true);
  updateProgress(10);
  updateProgressText("Scanning...");

  const records = [];
  const progressStep = 80 / inputs.length;

  for (let i = 0; i < inputs.length; i += 1) {
    const input = inputs[i];
    let text = input;
    let sourceUrl = "Pasted Text";

    if (isValidUrl(input)) {
      sourceUrl = input;
      updateProgressText(`Fetching ${i + 1}/${inputs.length}`);
      text = await fetchContent(input);
    }

    records.push(...createScanRecords(extractEmails(text), sourceUrl));
    updateProgress(10 + progressStep * (i + 1));
  }

  const existing = loadScans();
  const seen = new Set(existing.map((record) => `${record.email}-${record.sourceUrl}`));
  const fresh = [];
  for (const record of records) {
    const key = `${record.email}-${record.sourceUrl}`;
    if (seen.has(key)) continue;
    seen.add(key);
    fresh.push(record);
  }

  const limited = applyPlanLimits(fresh);
  const updated = [...limited, ...existing];
  saveScans(updated);
  await sendToSupabase(limited);

  updateMetrics(updated);
  updateHistory(updated);
  renderResults(limited.length ? limited : fresh);
  withSpinner(false);
  updateProgress(100);
  updateProgressText("Complete");
  showToast(
    limited.length
      ? `Found ${limited.length} new email${limited.length === 1 ? "" : "s"}`
      : "No new emails found"
  );
  setTimeout(() => updateProgress(0), 1000);
  setTimeout(() => updateProgressText("Ready"), 1500);
};

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

const exportCsv = () => {
  const exportable = getExportableResults();
  if (!exportable.length) {
    showToast("Nothing to export");
    return;
  }
  const headers = ["Email", "Domain", "Source URL", "Scanned At"];
  const rows = exportable.map((scan) => [scan.email, scan.domain, scan.sourceUrl, scan.scannedAt]);
  const csvContent = [headers, ...rows]
    .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  downloadFile(csvContent, "leadscope-results.csv", "text/csv");
};

const exportJson = () => {
  const exportable = getExportableResults();
  if (!exportable.length) {
    showToast("Nothing to export");
    return;
  }
  downloadFile(JSON.stringify(exportable, null, 2), "leadscope-results.json", "application/json");
};

const copyResults = async () => {
  const exportable = getExportableResults();
  if (!exportable.length) {
    showToast("Nothing to copy");
    return;
  }
  await navigator.clipboard.writeText(exportable.map((scan) => scan.email).join("\n"));
  showToast("Emails copied");
};

scanBtn.addEventListener("click", scanSources);
sampleBtn.addEventListener("click", () => {
  inputData.value = SAMPLE;
  showToast("Sample loaded - hit Start Scan");
});
filterBtn.addEventListener("click", filterScans);
searchEmail.addEventListener("keydown", (event) => {
  if (event.key === "Enter") filterScans();
});
copyBtn.addEventListener("click", copyResults);
exportCsvBtn.addEventListener("click", exportCsv);
exportJsonBtn.addEventListener("click", exportJson);

openConfig.addEventListener("click", () => configModal.classList.add("open"));
closeConfig.addEventListener("click", () => configModal.classList.remove("open"));
saveConfig.addEventListener("click", saveConfigValues);
configModal.addEventListener("click", (event) => {
  if (event.target === configModal) configModal.classList.remove("open");
});

upgradeBtn.addEventListener("click", () => {
  const config = JSON.parse(localStorage.getItem(storageKeys.config) || "{}");
  if (config.flutterwaveLink) {
    window.open(config.flutterwaveLink, "_blank");
    return;
  }
  showToast("Add a Flutterwave payment link in Configuration");
  configModal.classList.add("open");
});

googleLoginBtn.addEventListener("click", () => {
  showToast("Google login is next - scans still work without it");
});

toggleHistory.addEventListener("click", () => {
  historyPanel.classList.toggle("hidden");
  toggleHistory.textContent = historyPanel.classList.contains("hidden") ? "Show" : "Hide";
});

clearHistory.addEventListener("click", () => {
  saveScans([]);
  updateMetrics([]);
  updateHistory([]);
  renderResults([]);
  showToast("History cleared");
});

const init = () => {
  loadConfig();
  updatePlanUI();
  const scans = loadScans();
  updateMetrics(scans);
  updateHistory(scans);
  renderResults(scans);
  updateProgressText("Ready");
};

init();
