
"use strict";

/* =========================================================
   BB84 + PTRP QUANTUM CHAT
   Firebase Realtime Database SDK v8
   Educational simulation only.
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyC3qv5heO6FpSjFHv7bXQaoIDzqlX1GX9Y",
  authDomain: "bb84-5aaed.firebaseapp.com",
  databaseURL: "https://bb84-5aaed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bb84-5aaed",
  storageBucket: "bb84-5aaed.firebasestorage.app",
  messagingSenderId: "296035061055",
  appId: "1:296035061055:web:e63d9a5fcfbed3202a578a",
  measurementId: "G-Q5Q9HDFV7K"
};

const $ = id => document.getElementById(id);
const randomBit = () => Math.random() < 0.5 ? 0 : 1;
const randomBasis = () => Math.random() < 0.5 ? "+" : "×";
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

let db = null;
let room = localStorage.getItem("quantum_room") || "server_1";
let role = localStorage.getItem("quantum_role") || "Alice";
let displayName = localStorage.getItem("quantum_name") || role;

let eveEnabled = false;
let eveProbability = 1;
let demoKeyByte = null;
let demoKeyBits = "";
let latestSimulation = null;
let latestExperiment = null;
let simulationStep = 0;
let simulationRunning = false;
let listeners = [];
let processedMessageIds = new Set();
let processedKeyIds = new Set();
let experimentHistory = [];
let toastTimer = null;
let typingTimer = null;

/* ---------------- INITIALIZATION ---------------- */

window.addEventListener("load", init);

function init() {
  if (!$("chat-messages")) return;

  $("room-select").value = room;
  $("role-select").value = role;

  $("room-select").addEventListener("change", changeRoom);
  $("role-select").addEventListener("change", changeRole);

  $("eve-probability").addEventListener("input", event => {
    eveProbability = Number(event.target.value) / 100;
    $("eve-probability-label").textContent =
      `${Math.round(eveProbability * 100)}%`;
  });

  $("eve-toggle").addEventListener("click", toggleEve);
  $("generate-key").addEventListener("click", openSimulator);
  $("open-sim").addEventListener("click", openSimulator);
  $("open-analytics").addEventListener("click", openAnalytics);

  $("open-logs").addEventListener("click", () => {
    $("logs-panel").classList.toggle("open");
  });

  $("close-logs").addEventListener("click", () => {
    $("logs-panel").classList.remove("open");
  });

  $("run-bb84").addEventListener("click", runBB84);
  $("step-bb84").addEventListener("click", nextSimulationStep);
  $("reset-bb84").addEventListener("click", resetSimulation);
  $("publish-key").addEventListener("click", publishDemoKey);
  $("run-monte-carlo").addEventListener("click", runMonteCarlo);
  $("export-csv").addEventListener("click", exportCSV);
  $("download-report").addEventListener("click", downloadReport);
  $("print-report").addEventListener("click", printReport);

  document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => closeModal(button.dataset.close));
  });

  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal(modal.id);
    });
  });

  $("message-form").addEventListener("submit", sendMessage);
  $("message-input").addEventListener("input", updateTyping);

  $("message-input").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("message-form").requestSubmit();
    }
  });

  updateRoomTitle();
  updateEveUI();
  drawInitialCharts();

  try {
    if (!window.firebase) {
      throw new Error("Firebase SDK did not load.");
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    db = firebase.database();

    db.ref(".info/connected").on("value", snapshot => {
      const connected = snapshot.val() === true;
      $("connection-state").textContent =
        connected ? "Firebase connected" : "Connecting…";
      $("connection-dot").classList.toggle("connected", connected);
    });

    attachListeners();
    addSystem("Welcome to the BB84 PTRP lab. Open the simulator to begin.");
  } catch (error) {
    console.error(error);
    showToast(`Firebase setup failed: ${error.message}`);
    $("connection-state").textContent = "Firebase unavailable";
  }
}

function updateRoomTitle() {
  const label = $("room-select").selectedOptions[0]?.textContent || room;
  $("room-title").textContent = `Quantum Chat — ${displayName} (${role})`;
  $("peer-status").textContent =
    `${label} · ${role === "Alice" ? "Bob is your peer" : "Alice is your peer"}`;
}

function changeRole() {
  localStorage.setItem("quantum_role", $("role-select").value);
  location.reload();
}

function changeRoom() {
  detachListeners();

  room = $("room-select").value;
  localStorage.setItem("quantum_room", room);

  demoKeyByte = null;
  demoKeyBits = "";
  latestSimulation = null;
  latestExperiment = null;

  processedMessageIds.clear();
  processedKeyIds.clear();

  $("chat-messages").replaceChildren();
  $("crypto-logs").replaceChildren();

  setKeyStatus("No accepted key", "");
  updateCurrentStats({});
  updateRoomTitle();

  if (db) attachListeners();

  addSystem("Room changed. Generate and publish a new demonstration key.");
}

function detachListeners() {
  listeners.forEach(ref => ref.off());
  listeners = [];
}

function trackListener(ref) {
  listeners.push(ref);
  return ref;
}

function attachListeners() {
  if (!db) return;

  const root = `servers/${room}`;
  const peer = role === "Alice" ? "Bob" : "Alice";

  // Shared Eve state: do not create new alert records in this listener.
  const eveRef = trackListener(db.ref(`${root}/eveEnabled`));

  eveRef.on("value", snapshot => {
    eveEnabled = snapshot.val() === true;
    updateEveUI();
  }, showFirebaseError);

  // Incoming messages.
  const messagesRef = trackListener(
    db.ref(`${root}/messages`).orderByChild("time")
  );

  messagesRef.on("child_added", snapshot => {
    if (processedMessageIds.has(snapshot.key)) return;
    processedMessageIds.add(snapshot.key);

    const data = snapshot.val() || {};
    if (data.sender === role) return;

    if (demoKeyByte === null) {
      displayMessage(
        data.sender || peer,
        "Encrypted demo payload received. A compatible demo key is required.",
        data.payload,
        "received"
      );
      return;
    }

    try {
      const text = xorDecode(data.payload || [], demoKeyByte);
      displayMessage(data.sender || peer, text, data.payload, "received");

      addLog("Message decoded", [
        ["Sender", data.sender || peer],
        ["Payload bytes", (data.payload || []).length],
        ["Recovered text", text]
      ], "var(--teal)");
    } catch (error) {
      console.error("Message decode error:", error);
      addSystem("Message decoding failed. The demo keys may not match.", true);
    }
  }, showFirebaseError);

  // Received demo keys.
  const keysRef = trackListener(
    db.ref(`${root}/keys`).orderByChild("time")
  );

  keysRef.on("child_added", snapshot => {
    if (processedKeyIds.has(snapshot.key)) return;
    processedKeyIds.add(snapshot.key);

    const data = snapshot.val() || {};

    if (data.sender === role || !data.accepted || !data.demoKeyBits) return;

    demoKeyBits = String(data.demoKeyBits);
    demoKeyByte = parseInt(demoKeyBits.slice(0, 8).padEnd(8, "0"), 2);

    setKeyStatus(`DEMO KEY READY · ${demoKeyBits.length} bits`, "ready");
    updateCurrentStats(data.stats || {});

    addSystem(`Demo key received from ${data.sender}.`);
  }, showFirebaseError);

  // Peer typing state.
  const typingRef = trackListener(
    db.ref(`${root}/typing_status/${peer}`)
  );

  typingRef.on("value", snapshot => {
    $("typing-line").textContent =
      snapshot.val() ? `${peer} is typing…` : "";

    $("typing-line").style.display =
      snapshot.val() ? "block" : "none";
  }, showFirebaseError);
}

function showFirebaseError(error) {
  console.error("Firebase listener error:", error);
  showToast(`Firebase error: ${error.message || "check database rules"}`);
}

/* ---------------- UI HELPERS ---------------- */

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3600);
}

function setKeyStatus(text, state) {
  const badge = $("key-status");
  badge.textContent = text;
  badge.classList.remove("ready", "rejected");

  if (state) badge.classList.add(state);
}

function addSystem(text, alert = false) {
  const element = document.createElement("div");
  element.className = `system-message${alert ? " alert" : ""}`;
  element.textContent = text;

  $("chat-messages").appendChild(element);
  scrollChat();
}

function scrollChat() {
  const box = $("chat-messages");
  box.scrollTop = box.scrollHeight;
}

function closeModal(id) {
  $(id)?.classList.remove("open");
}

function openSimulator() {
  $("sim-modal").classList.add("open");
}

function openAnalytics() {
  $("analytics-modal").classList.add("open");

  if (!latestExperiment) {
    runMonteCarlo();
  } else {
    redrawExperimentCharts();
  }
}

function updateEveUI() {
  $("eve-state").textContent = eveEnabled
    ? "Attack armed for next simulation"
    : "Attack disabled";

  $("eve-toggle").textContent = eveEnabled ? "Disable Eve" : "Enable Eve";
  $("eve-toggle").classList.toggle("armed", eveEnabled);
  $("stat-eve").textContent = eveEnabled ? "ON" : "OFF";
}

/* Fix for the original updateCurrentStats is not defined error. */
function updateCurrentStats(stats = {}) {
  const match = Number(
    stats.matchProbability ?? stats.basisMatchProbability ?? 0
  );

  const qber = Number(stats.qber ?? stats.sampleQber ?? 0);
  const keyLength = Number(stats.finalKeyLength ?? stats.keyLength ?? 0);

  $("stat-match").textContent =
    stats.matchProbability == null && stats.basisMatchProbability == null
      ? "—"
      : `${(match * 100).toFixed(1)}%`;

  $("stat-qber").textContent =
    stats.qber == null && stats.sampleQber == null
      ? "—"
      : `${(qber * 100).toFixed(1)}%`;

  $("stat-key-length").textContent = String(keyLength);

  $("stat-eve").textContent = stats.eve == null
    ? (eveEnabled ? "ON" : "OFF")
    : (stats.eve ? "ON" : "OFF");

  if ($("metric-match")) {
    $("metric-match").textContent = `${(match * 100).toFixed(2)}%`;
  }

  if ($("metric-qber")) {
    $("metric-qber").textContent = `${(qber * 100).toFixed(2)}%`;
  }

  if ($("metric-mean") && stats.meanSifted != null) {
    $("metric-mean").textContent = Number(stats.meanSifted).toFixed(2);
  }

  if ($("metric-variance") && stats.variance != null) {
    $("metric-variance").textContent = Number(stats.variance).toFixed(2);
  }
}

/* ---------------- EVE CONTROL ---------------- */

async function toggleEve() {
  if (!db) {
    showToast("Firebase is not connected.");
    return;
  }

  const next = !eveEnabled;

  try {
    await db.ref(`servers/${room}/eveEnabled`).set(next);
    eveEnabled = next;
    updateEveUI();

    addSystem(next
      ? `Eve enabled. Interception probability: ${Math.round(eveProbability * 100)}%.`
      : "Eve disabled for the next simulation.");
  } catch (error) {
    showFirebaseError(error);
  }
}

/* ---------------- BB84 SIMULATION MODEL ---------------- */

/*
  + represents the rectilinear basis.
  × represents the diagonal basis.

  A wrong-basis measurement produces a random bit.
  Eve intercepts each photon independently with probability p.
*/
function simulateBB84(n, useEve, interceptProbability) {
  const aliceBits = [];
  const aliceBases = [];
  const eveBases = [];
  const bobBases = [];
  const bobBits = [];
  const matches = [];
  const intercepted = [];

  for (let i = 0; i < n; i++) {
    const aBit = randomBit();
    const aBasis = randomBasis();
    const bBasis = randomBasis();

    const intercept = useEve && Math.random() < interceptProbability;

    let travelingBit = aBit;
    let travelingBasis = aBasis;
    let eBasis = "—";

    if (intercept) {
      eBasis = randomBasis();

      if (eBasis !== aBasis) {
        travelingBit = randomBit();
      }

      travelingBasis = eBasis;
    }

    const bBit = bBasis === travelingBasis
      ? travelingBit
      : randomBit();

    aliceBits.push(aBit);
    aliceBases.push(aBasis);
    eveBases.push(eBasis);
    bobBases.push(bBasis);
    bobBits.push(bBit);
    matches.push(aBasis === bBasis);
    intercepted.push(intercept);
  }

  const matchingIndexes = matches
    .map((yes, i) => yes ? i : -1)
    .filter(i => i >= 0);

  const siftAlice = matchingIndexes.map(i => aliceBits[i]);
  const siftBob = matchingIndexes.map(i => bobBits[i]);

  return {
    n,
    useEve,
    interceptProbability,
    aliceBits,
    aliceBases,
    eveBases,
    bobBases,
    bobBits,
    matches,
    intercepted,
    matchingIndexes,
    siftAlice,
    siftBob,
    matchCount: matchingIndexes.length,
    matchProbability: matchingIndexes.length / n
  };
}

function chooseSample(indexes, fraction = 0.25) {
  const copy = [...indexes];

  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }

  const count = Math.min(copy.length, Math.floor(copy.length * fraction));
  return new Set(copy.slice(0, count));
}

function evaluateBB84(result) {
  const sample = chooseSample(result.matchingIndexes, 0.25);
  let errors = 0;

  for (const index of sample) {
    if (result.aliceBits[index] !== result.bobBits[index]) {
      errors++;
    }
  }

  const sampleQber = sample.size ? errors / sample.size : 0;
  const remaining = result.matchingIndexes.filter(i => !sample.has(i));

  const aliceBits = remaining.map(i => result.aliceBits[i]).join("");
  const bobBits = remaining.map(i => result.bobBits[i]).join("");

  // An illustrative teaching threshold, not a security proof.
  const accepted = sample.size >= 8 && sampleQber <= 0.11;

  // Conceptual leakage allowance for the demonstration only.
  const estimatedLeakage = Math.ceil(aliceBits.length * 0.10);

  const proposedPrivacyAmplifiedLength = accepted
    ? Math.max(
        0,
        Math.floor(aliceBits.length - estimatedLeakage - 2 * sample.size * sampleQber)
      )
    : 0;

  return {
    sample,
    sampleErrors: errors,
    sampleQber,
    remaining,
    aliceBits,
    bobBits,
    accepted,
    estimatedLeakage,
    proposedPrivacyAmplifiedLength
  };
}

/* ---------------- SIMULATOR CONTROLS ---------------- */

function resetSimulation() {
  latestSimulation = null;
  simulationStep = 0;
  simulationRunning = false;

  $("bb84-table-body").innerHTML =
    '<tr><td colspan="9" class="empty-cell">Run a simulation to populate the table.</td></tr>';

  $("sim-result").className = "result-banner";
  $("sim-result").textContent = "Ready to simulate.";
  $("publish-key").disabled = true;

  ["sim-photons", "sim-matches", "sim-qber", "sim-final-bits"]
    .forEach(id => $(id).textContent = "—");

  renderSteps(0);
}

function renderSteps(step) {
  simulationStep = clamp(step, 0, 5);

  document.querySelectorAll(".protocol-step").forEach((element, i) => {
    element.classList.toggle("active", i === simulationStep);
    element.classList.toggle("done", i < simulationStep);
  });
}

function nextSimulationStep() {
  if (!latestSimulation) {
    showToast("Run a simulation first.");
    return;
  }

  if (simulationStep < 5) {
    renderSteps(simulationStep + 1);
  } else {
    showToast("All six protocol stages are displayed.");
  }

  const descriptions = [
    "Alice prepares random bits and bases.",
    "Photons travel through the channel; Eve may intercept.",
    "Bob measures photons with randomly chosen bases.",
    "Alice and Bob compare bases and retain matching positions.",
    "A sample is revealed to estimate the quantum bit error rate.",
    "Reconciliation and privacy amplification are represented conceptually; this is not a security proof."
  ];

  $("sim-result").textContent = descriptions[simulationStep];
}

async function runBB84() {
  if (simulationRunning) return;

  simulationRunning = true;
  $("run-bb84").disabled = true;
  $("publish-key").disabled = true;

  try {
    const n = Number($("photon-count").value) || 512;
    const probability = eveEnabled ? eveProbability : 0;

    const raw = simulateBB84(n, eveEnabled, probability);
    const evaluated = evaluateBB84(raw);

    latestSimulation = {
      ...raw,
      ...evaluated,
      time: new Date().toISOString()
    };

    renderSteps(0);
    renderBB84Table(latestSimulation);
    updateSimulationMetrics(latestSimulation);

    updateCurrentStats({
      matchProbability: raw.matchProbability,
      qber: evaluated.sampleQber,
      finalKeyLength: evaluated.proposedPrivacyAmplifiedLength,
      eve: eveEnabled
    });

    experimentHistory.push(toExperimentRow(latestSimulation));

    addLog("BB84 simulation", [
      ["Photons", n],
      ["Matching bases", raw.matchCount],
      ["Sample size", evaluated.sample.size],
      ["Sample errors", evaluated.sampleErrors],
      ["Sample QBER", `${(evaluated.sampleQber * 100).toFixed(2)}%`],
      ["Eve interception", `${Math.round(probability * 100)}%`],
      ["Accepted", evaluated.accepted ? "Yes" : "No"]
    ], evaluated.accepted ? "var(--teal)" : "var(--red)");

    if (evaluated.accepted) {
      $("sim-result").className = "result-banner success";
      $("sim-result").textContent =
        `Sample QBER ${(evaluated.sampleQber * 100).toFixed(2)}%. ` +
        `The demonstration passes its illustrative 11% threshold. ` +
        `Proposed final length: ${evaluated.proposedPrivacyAmplifiedLength} bits.`;

      $("publish-key").disabled =
        role !== "Alice" || evaluated.proposedPrivacyAmplifiedLength < 8;
    } else {
      $("sim-result").className = "result-banner error";
      $("sim-result").textContent =
        `Key rejected: sample QBER ${(evaluated.sampleQber * 100).toFixed(2)}%. ` +
        "Try another run or disable Eve. The threshold is illustrative.";

      setKeyStatus("Key rejected — high QBER", "rejected");
      addSystem(
        `BB84 run rejected: QBER ${(evaluated.sampleQber * 100).toFixed(2)}%.`,
        true
      );
    }
  } catch (error) {
    console.error(error);
    showToast(`Simulation error: ${error.message}`);
  } finally {
    simulationRunning = false;
    $("run-bb84").disabled = false;
  }
}

function renderBB84Table(data) {
  const body = $("bb84-table-body");
  body.replaceChildren();

  const sampleIndexes = new Set(data.sample);
  const maxRows = Math.min(data.n, 100);
  const fragment = document.createDocumentFragment();

  for (let i = 0; i < maxRows; i++) {
    const tr = document.createElement("tr");
    const matched = data.matches[i];
    const sample = matched && sampleIndexes.has(i);
    const siftedBit = matched && !sample ? data.aliceBits[i] : "—";

    const values = [
      i + 1,
      data.aliceBits[i],
      data.aliceBases[i],
      data.eveBases[i],
      data.bobBases[i],
      data.bobBits[i],
      matched ? "YES" : "NO",
      sample ? "SAMPLE" : "—",
      siftedBit
    ];

    values.forEach((value, column) => {
      const td = document.createElement("td");
      td.textContent = String(value);

      if (column === 6) td.className = matched ? "good" : "bad";
      if (column === 7 && sample) td.className = "sample";
      if (column === 8 && !matched) td.className = "dim";
      if (column === 8 && matched && !sample) td.className = "good";

      tr.appendChild(td);
    });

    fragment.appendChild(tr);
  }

  body.appendChild(fragment);

  if (data.n > maxRows) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");

    td.colSpan = 9;
    td.className = "empty-cell";
    td.textContent = `Showing first ${maxRows} of ${data.n} photons.`;

    tr.appendChild(td);
    body.appendChild(tr);
  }
}

function updateSimulationMetrics(data) {
  $("sim-photons").textContent = String(data.n);
  $("sim-matches").textContent =
    `${data.matchCount} (${(data.matchProbability * 100).toFixed(1)}%)`;
  $("sim-qber").textContent = `${(data.sampleQber * 100).toFixed(2)}%`;
  $("sim-final-bits").textContent =
    String(data.proposedPrivacyAmplifiedLength);
}

/* ---------------- DEMO KEY PUBLISHING ---------------- */

async function publishDemoKey() {
  if (role !== "Alice") {
    showToast("Only Alice can publish the demo key.");
    return;
  }

  if (!db) {
    showToast("Firebase is not connected.");
    return;
  }

  if (!latestSimulation?.accepted) {
    showToast("Run an accepted simulation first.");
    return;
  }

  /*
    Classroom shortcut only:
    this does not implement real error correction or proven privacy
    amplification. The key is visible to authorized Firebase readers.
  */
  const finalLength = latestSimulation.proposedPrivacyAmplifiedLength;
  const candidate = latestSimulation.aliceBits.slice(0, finalLength);

  if (candidate.length < 8) {
    showToast("The final demonstration key is too short.");
    return;
  }

  $("publish-key").disabled = true;

  try {
    const stats = {
      photons: latestSimulation.n,
      matched: latestSimulation.matchCount,
      matchProbability: latestSimulation.matchProbability,
      qber: latestSimulation.sampleQber,
      eve: latestSimulation.useEve,
      interceptionProbability: latestSimulation.interceptProbability,
      finalKeyLength: candidate.length,
      keyAccepted: true,
      time: Date.now()
    };

    await db.ref(`servers/${room}/keys`).push({
      sender: role,
      demoKeyBits: candidate,
      accepted: true,
      stats,
      time: Date.now(),
      simulationOnly: true
    });

    demoKeyBits = candidate;
    demoKeyByte = parseInt(candidate.slice(0, 8).padEnd(8, "0"), 2);

    setKeyStatus(`DEMO KEY READY · ${candidate.length} bits`, "ready");
    updateCurrentStats(stats);

    addSystem(
      `Demo key published (${candidate.length} bits). This is not a secret from Firebase readers.`
    );

    addLog("Demo key published", [
      ["Final demo bits", candidate.length],
      ["Sample QBER", `${(stats.qber * 100).toFixed(2)}%`],
      ["Post-processing", "Conceptual length reduction"],
      ["Security status", "Not production-secure"]
    ], "var(--teal)");

    closeModal("sim-modal");
    showToast("Demo key published to the room.");
  } catch (error) {
    console.error(error);
    showToast(`Key publish failed: ${error.message}`);
  } finally {
    $("publish-key").disabled = false;
  }
}

/* ---------------- DEMO CHAT ---------------- */

function xorEncode(text, keyByte) {
  return Array.from(new TextEncoder().encode(text), byte =>
    (byte ^ keyByte).toString(2).padStart(8, "0")
  );
}

function xorDecode(payload, keyByte) {
  const bytes = payload.map(bits => parseInt(bits, 2) ^ keyByte);
  return new TextDecoder().decode(new Uint8Array(bytes));
}

async function sendMessage(event) {
  event?.preventDefault();

  const input = $("message-input");
  const text = input.value.trim();

  if (!text) return;

  if (!db) {
    showToast("Firebase is not connected.");
    return;
  }

  if (demoKeyByte === null) {
    showToast("Generate or receive an accepted demo key first.");
    return;
  }

  const payload = xorEncode(text, demoKeyByte);

  try {
    const ref = await db.ref(`servers/${room}/messages`).push({
      sender: role,
      payload,
      time: Date.now(),
      simulationOnly: true
    });

    processedMessageIds.add(ref.key);

    displayMessage(role, text, payload, "sent");
    input.value = "";

    db.ref(`servers/${room}/typing_status/${role}`)
      .set(false)
      .catch(() => {});

    addLog("Message encoded", [
      ["Bytes", payload.length],
      ["Encoding", "Educational XOR"],
      ["Payload", payload.join(" ")]
    ], "var(--cyan)");
  } catch (error) {
    console.error(error);
    showToast(`Send failed: ${error.message}`);
  }
}

function displayMessage(sender, text, payload, type) {
  const wrapper = document.createElement("article");
  wrapper.className = `message ${type}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const name = document.createElement("strong");
  name.textContent = sender;

  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });

  meta.append(name, time);

  const body = document.createElement("div");
  body.className = "message-text";
  body.textContent = text;

  const details = document.createElement("details");
  details.className = "payload";

  const summary = document.createElement("summary");
  summary.textContent = "View encoded payload";

  const code = document.createElement("code");
  code.textContent = Array.isArray(payload)
    ? payload.join(" ")
    : String(payload || "");

  details.append(summary, code);
  wrapper.append(meta, body, details);

  $("chat-messages").appendChild(wrapper);
  scrollChat();
}

function updateTyping() {
  if (!db) return;

  db.ref(`servers/${room}/typing_status/${role}`)
    .set(true)
    .catch(() => {});

  clearTimeout(typingTimer);

  typingTimer = setTimeout(() => {
    db.ref(`servers/${room}/typing_status/${role}`)
      .set(false)
      .catch(() => {});
  }, 1000);
}

/* ---------------- CRYPTO LOGS ---------------- */

function addLog(title, rows, color = "var(--cyan)") {
  const container = $("crypto-logs");
  container.querySelector(".muted")?.remove();

  const card = document.createElement("div");
  card.className = "log-entry";
  card.style.borderLeftColor = color;

  const heading = document.createElement("strong");
  heading.textContent = `[${title}]`;

  const table = document.createElement("table");

  rows.forEach(([label, value]) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    const td = document.createElement("td");

    th.textContent = label;
    td.textContent = String(value);

    tr.append(th, td);
    table.appendChild(tr);
  });

  card.append(heading, table);
  container.prepend(card);
}

/* ---------------- PTRP MONTE CARLO ---------------- */

function runMonteCarlo() {
  const button = $("run-monte-carlo");
  button.disabled = true;
  button.textContent = "Running…";

  setTimeout(() => {
    try {
      const trials = clamp(Number($("trial-count").value) || 500, 1, 10000);
      const n = clamp(Number($("mc-photons").value) || 128, 16, 1024);
      const useEve = $("mc-eve").checked;
      const probability = useEve ? eveProbability : 0;

      let totalMatches = 0;
      let totalSiftedSquared = 0;
      let totalErrors = 0;

      const lengths = [];
      const qbers = [];

      for (let t = 0; t < trials; t++) {
        const result = simulateBB84(n, useEve, probability);
        let errors = 0;

        for (const index of result.matchingIndexes) {
          if (result.aliceBits[index] !== result.bobBits[index]) {
            errors++;
          }
        }

        totalMatches += result.matchCount;
        totalSiftedSquared += result.matchCount ** 2;
        totalErrors += errors;

        lengths.push(result.matchCount);
        qbers.push(result.matchCount ? errors / result.matchCount : 0);
      }

      const empiricalMatch = totalMatches / (trials * n);
      const mean = totalMatches / trials;
      const variance = Math.max(
        0,
        totalSiftedSquared / trials - mean * mean
      );

      const qber = totalMatches ? totalErrors / totalMatches : 0;

      latestExperiment = {
        time: new Date().toISOString(),
        trials,
        photons: n,
        eve: useEve,
        interceptionProbability: probability,
        empiricalMatch,
        mean,
        variance,
        qber,
        lengths,
        qbers,
        theoreticalMatch: 0.5,
        theoreticalMean: n / 2,
        theoreticalVariance: n / 4,
        theoreticalQber: probability / 4
      };

      experimentHistory.push({
        time: latestExperiment.time,
        type: "Monte Carlo",
        trials,
        photons: n,
        eve: useEve,
        interceptionProbability: probability,
        matchProbability: empiricalMatch,
        meanSifted: mean,
        variance,
        qber
      });

      $("metric-match").textContent = empiricalMatch.toFixed(4);
      $("metric-mean").textContent = mean.toFixed(2);
      $("metric-variance").textContent = variance.toFixed(2);
      $("metric-qber").textContent = `${(qber * 100).toFixed(2)}%`;

      $("metric-qber-note").textContent =
        `Ideal target: ${(probability * 25).toFixed(1)}% at ` +
        `${Math.round(probability * 100)}% interception`;

      $("experiment-summary").className = "result-banner";
      $("experiment-summary").textContent =
        `${trials.toLocaleString()} trials × ${n} photons. ` +
        `Eve: ${useEve ? "ON" : "OFF"} ` +
        `(${Math.round(probability * 100)}% interception). ` +
        `P(match): ${empiricalMatch.toFixed(4)} (theory 0.5). ` +
        `Mean sifted length: ${mean.toFixed(2)} (theory ${n / 2}). ` +
        `Variance: ${variance.toFixed(2)} (theory ${n / 4}). ` +
        `QBER: ${(qber * 100).toFixed(2)}% ` +
        `(ideal target ${(probability * 25).toFixed(1)}%).`;

      updateCurrentStats({
        matchProbability: empiricalMatch,
        qber,
        meanSifted: mean,
        variance,
        eve: useEve
      });

      redrawExperimentCharts();

      addLog("PTRP Monte Carlo", [
        ["Trials", trials],
        ["Photons per trial", n],
        ["Eve", useEve],
        ["Interception", `${Math.round(probability * 100)}%`],
        ["P(match)", empiricalMatch.toFixed(4)],
        ["Mean", mean.toFixed(3)],
        ["Variance", variance.toFixed(3)],
        ["QBER", `${(qber * 100).toFixed(2)}%`]
      ], "var(--teal)");
    } catch (error) {
      console.error(error);
      showToast(`PTRP experiment failed: ${error.message}`);
    } finally {
      button.disabled = false;
      button.textContent = "Run Experiment";
    }
  }, 20);
}

/* ---------------- CANVAS CHARTS ---------------- */

function chartContext(canvas) {
  if (!canvas) return null;

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(250, rect.width);
  const height = 220;
  const ratio = window.devicePixelRatio || 1;

  canvas.width = width * ratio;
  canvas.height = height * ratio;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#0d1a2b";
  ctx.fillRect(0, 0, width, height);

  return {
    ctx,
    width,
    height,
    left: 42,
    right: 14,
    top: 16,
    bottom: 34
  };
}

function drawBars(canvas, values, maxValue) {
  const chart = chartContext(canvas);
  if (!chart) return;

  const { ctx, width, height, left, right, top, bottom } = chart;
  const plotH = height - top - bottom;
  const plotW = width - left - right;
  const max = Math.max(maxValue, 0.0001);

  ctx.font = "10px Arial";
  ctx.strokeStyle = "#263b51";
  ctx.fillStyle = "#91a8c2";

  for (let i = 0; i <= 4; i++) {
    const y = top + plotH * i / 4;

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    ctx.fillText((max * (1 - i / 4)).toFixed(2), 3, y + 3);
  }

  if (!values.length) return;

  const slot = plotW / values.length;

  values.forEach((item, i) => {
    const h = clamp(item.value / max, 0, 1) * plotH;
    const x = left + i * slot + slot * 0.2;

    ctx.fillStyle = item.color || "#00c8ff";
    ctx.fillRect(x, top + plotH - h, slot * 0.6, h);

    ctx.fillStyle = "#eaf3ff";
    ctx.textAlign = "center";
    ctx.fillText(item.value.toFixed(3), x + slot * 0.3, Math.max(12, top + plotH - h - 5));
    ctx.fillText(item.label, x + slot * 0.3, height - 11);
  });

  ctx.textAlign = "left";
}

function drawHistogram(canvas, values, min, max, step = 4) {
  const chart = chartContext(canvas);
  if (!chart) return;

  const { ctx, width, height, left, right, top, bottom } = chart;
  const bins = [];

  for (let value = min; value <= max; value += step) {
    bins.push({ label: value, count: 0 });
  }

  values.forEach(value => {
    const index = clamp(
      Math.floor((value - min) / step),
      0,
      bins.length - 1
    );
    bins[index].count++;
  });

  const plotH = height - top - bottom;
  const plotW = width - left - right;
  const highest = Math.max(1, ...bins.map(bin => bin.count));
  const slot = plotW / bins.length;

  ctx.strokeStyle = "#263b51";

  for (let i = 0; i <= 4; i++) {
    const y = top + plotH * i / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
  }

  bins.forEach((bin, i) => {
    const h = bin.count / highest * plotH;

    ctx.fillStyle = "#00c8ff";
    ctx.fillRect(
      left + i * slot + 1,
      top + plotH - h,
      Math.max(1, slot - 2),
      h
    );

    if (i % 3 === 0) {
      ctx.fillStyle = "#91a8c2";
      ctx.font = "9px Arial";
      ctx.fillText(String(bin.label), left + i * slot, height - 10);
    }
  });
}

function drawLine(canvas, values, maxY, theoryY = null) {
  const chart = chartContext(canvas);
  if (!chart) return;

  const { ctx, width, height, left, right, top, bottom } = chart;
  const plotH = height - top - bottom;
  const plotW = width - left - right;

  ctx.strokeStyle = "#263b51";
  ctx.fillStyle = "#91a8c2";
  ctx.font = "10px Arial";

  for (let i = 0; i <= 4; i++) {
    const y = top + plotH * i / 4;

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    ctx.fillText(`${(maxY * (1 - i / 4) * 100).toFixed(0)}%`, 3, y + 3);
  }

  if (values.length) {
    ctx.strokeStyle = "#00c8ff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    values.forEach((value, i) => {
      const x = left +
        (values.length === 1 ? 0 : i / (values.length - 1)) * plotW;

      const y = top + plotH - clamp(value / maxY, 0, 1) * plotH;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
  }

  if (theoryY != null && theoryY <= maxY) {
    const y = top + plotH - theoryY / maxY * plotH;

    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#5bd0c7";
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#5bd0c7";
    ctx.fillText(
      `Theory ${(theoryY * 100).toFixed(1)}%`,
      width - right - 83,
      Math.max(11, y - 5)
    );
  }
}

function redrawExperimentCharts() {
  if (!latestExperiment) return;

  drawBars($("chart-match"), [
    {
      label: "Observed",
      value: latestExperiment.empiricalMatch,
      color: "#00c8ff"
    },
    {
      label: "Theory",
      value: 0.5,
      color: "#5bd0c7"
    }
  ], 1);

  drawHistogram(
    $("chart-histogram"),
    latestExperiment.lengths,
    0,
    latestExperiment.photons,
    4
  );

  drawLine(
    $("chart-qber"),
    latestExperiment.qbers.slice(0, 250),
    0.5,
    latestExperiment.theoreticalQber
  );

  const probabilityBars = [];

  for (let p = 0; p <= 1.0001; p += 0.1) {
    probabilityBars.push({
      label: `${Math.round(p * 100)}%`,
      value: p / 4,
      color: "#5bd0c7"
    });
  }

  drawBars($("chart-eve"), probabilityBars, 0.3);
}

function drawInitialCharts() {
  drawBars($("chart-match"), [
    { label: "Observed", value: 0, color: "#00c8ff" },
    { label: "Theory", value: 0.5, color: "#5bd0c7" }
  ], 1);

  drawHistogram($("chart-histogram"), [], 0, 128, 4);
  drawLine($("chart-qber"), [], 0.5);

  const probabilityBars = [];

  for (let p = 0; p <= 1.0001; p += 0.1) {
    probabilityBars.push({
      label: `${Math.round(p * 100)}%`,
      value: p / 4
    });
  }

  drawBars($("chart-eve"), probabilityBars, 0.3);
}

window.addEventListener("resize", () => {
  if ($("analytics-modal")?.classList.contains("open")) {
    if (latestExperiment) redrawExperimentCharts();
    else drawInitialCharts();
  }
});

/* ---------------- EXPORTS AND REPORTS ---------------- */

function toExperimentRow(data) {
  return {
    time: data.time,
    type: "BB84",
    photons: data.n,
    matchingBases: data.matchCount,
    matchProbability: data.matchProbability,
    sampleBits: data.sample.size,
    sampleErrors: data.sampleErrors,
    qber: data.sampleQber,
    eve: data.useEve,
    interceptionProbability: data.interceptProbability,
    accepted: data.accepted,
    proposedFinalBits: data.proposedPrivacyAmplifiedLength
  };
}

function downloadText(filename, text, mime = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCSV() {
  if (!experimentHistory.length) {
    showToast("Run an experiment before exporting CSV.");
    return;
  }

  const columns = [
    ...new Set(experimentHistory.flatMap(row => Object.keys(row)))
  ];

  const csv = [
    columns.map(csvEscape).join(","),
    ...experimentHistory.map(row =>
      columns.map(key => csvEscape(row[key])).join(",")
    )
  ].join("\r\n");

  downloadText(
    "bb84_ptrp_experiments.csv",
    csv,
    "text/csv;charset=utf-8"
  );

  showToast("CSV downloaded.");
}

function downloadReport() {
  if (!experimentHistory.length) {
    showToast("Run an experiment before generating a report.");
    return;
  }

  const headers = [
    ...new Set(experimentHistory.flatMap(row => Object.keys(row)))
  ];

  const rows = experimentHistory.map((row, index) => `
    <tr>
      <td>${index + 1}</td>
      ${headers.map(key => `<td>${escapeHTML(row[key] ?? "")}</td>`).join("")}
    </tr>
  `).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>BB84 PTRP Experiment Report</title>
<style>
body{font:14px Arial;margin:35px;color:#142235}
h1{color:#087b9e}
p{line-height:1.6}
.wrap{overflow:auto}
table{border-collapse:collapse;font-size:11px}
th,td{border:1px solid #b9c8d5;padding:7px;text-align:left}
th{background:#e8f5fa}
</style>
</head>
<body>
<h1>BB84 Protocol — PTRP Experiment Report</h1>
<p><strong>Generated:</strong> ${escapeHTML(new Date().toLocaleString())}</p>
<p><strong>Room:</strong> ${escapeHTML(room)} ·
<strong>Role:</strong> ${escapeHTML(role)}</p>

<h2>Probability model</h2>
<p>For independent, uniformly random bases, the basis-match probability
is P(M) = 1/2. The sifted length K follows Binomial(N, 1/2), with
E[K] = N/2 and Var(K) = N/4.</p>

<p>Under the ideal intercept-resend model, the expected QBER among
sifted bits is approximately p(Eve)/4.</p>

<h2>Recorded experiments</h2>
<div class="wrap">
<table>
<thead><tr><th>#</th>
${headers.map(key => `<th>${escapeHTML(key)}</th>`).join("")}
</tr></thead>
<tbody>${rows}</tbody>
</table>
</div>

<h2>Conclusion</h2>
<p>Monte Carlo results should approach theoretical values as the number
of trials increases. Finite samples fluctuate. This website is a classical
educational simulation, not a security-certified QKD system.</p>
</body>
</html>`;

  downloadText(
    "bb84_ptrp_report.html",
    html,
    "text/html;charset=utf-8"
  );

  showToast("HTML report downloaded. Open it and print to PDF if required.");
}

function printReport() {
  if (!experimentHistory.length) {
    showToast("Run an experiment before generating a report.");
    return;
  }

  downloadReport();
  showToast("Open the report and choose Print → Save as PDF.");
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}
