"use strict";

/* ==========================================================================
   BB84 QUANTUM KEY DISTRIBUTION & PTRP DEMONSTRATION PLATFORM
   Probability Theory and Random Processes Project
   Firebase Realtime Database SDK v8 + Canvas Optical Bench + Web Audio Synthesizer
   ========================================================================== */

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

// DOM helper & math utilities
const $ = id => document.getElementById(id);
const randomBit = () => Math.random() < 0.5 ? 0 : 1;
const randomBasis = () => Math.random() < 0.5 ? "+" : "×";
const clamp = (val, min, max) => Math.max(min, Math.min(max, val));

// Shannon Binary Entropy function: H2(p) = -p*log2(p) - (1-p)*log2(1-p)
function binaryEntropy(p) {
  if (p <= 0 || p >= 1) return 0;
  return -p * Math.log2(p) - (1 - p) * Math.log2(1 - p);
}

// Asymptotic secret key fraction: R = max(0, 1 - 2*H2(Q))
function secretKeyRate(q) {
  if (q >= 0.11003) return 0;
  return Math.max(0, 1 - 2 * binaryEntropy(q));
}

// ==========================================================================
// STATE MANAGEMENT
// ==========================================================================
let db = null;
let room = localStorage.getItem("quantum_room") || "server_1";
let role = localStorage.getItem("quantum_role") || "Alice";
let displayName = localStorage.getItem("quantum_name") || role;
let soundEnabled = localStorage.getItem("quantum_sound_enabled") !== "false";

let eveEnabled = false;
let eveProbability = 1.0;
let channelNoise = 0.0; // depolarizing channel noise parameter eta

let activeKeyBits = "";
let keyBufferOffset = 0;
let latestSimulation = null;
let latestExperiment = null;
let experimentHistory = [];
let processedMessageIds = new Set();
let processedKeyIds = new Set();
let listeners = [];
let toastTimer = null;
let typingTimer = null;

// Optical Bench Animation State
let animFrameId = null;
let isStreaming = false;
let animSpeed = 1.0;
let flyingPhotons = [];
let photonSeq = 0;
let channelCanvas = null;
let channelCtx = null;
let detectorFlash = { d0: 0, d1: 0, eve: 0 };
let currentTableFilter = "all";

// ==========================================================================
// WEB AUDIO SYNTHESIZER (Single-Photon APD clicks & laser pulses)
// ==========================================================================
class QuantumAudio {
  constructor() {
    this.ctx = null;
  }

  init() {
    if (!this.ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
  }

  playClick() {
    if (!soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const bufferSize = this.ctx.sampleRate * 0.005; // 5ms burst
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
      }

      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 3200;
      filter.Q.value = 3;

      const gain = this.ctx.createGain();
      gain.gain.value = 0.25;

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start();
    } catch (e) {}
  }

  playLaserChirp() {
    if (!soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1760, this.ctx.currentTime + 0.03);

      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.035);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.04);
    } catch (e) {}
  }

  playAlert() {
    if (!soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(440, this.ctx.currentTime);
      osc.frequency.setValueAtTime(330, this.ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.22);
    } catch (e) {}
  }

  playSuccess() {
    if (!soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === "suspended") this.ctx.resume();

      const now = this.ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.1, now + idx * 0.06);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now + idx * 0.06);
        osc.stop(now + idx * 0.06 + 0.16);
      });
    } catch (e) {}
  }
}

const audio = new QuantumAudio();

// ==========================================================================
// APPLICATION INITIALIZATION
// ==========================================================================
window.addEventListener("load", initApp);

function initApp() {
  if (!$("chat-messages")) return;

  $("room-select").value = room;
  $("role-select").value = role;

  $("room-select").addEventListener("change", changeRoom);
  $("role-select").addEventListener("change", changeRole);

  $("eve-probability").addEventListener("input", event => {
    eveProbability = Number(event.target.value) / 100;
    $("eve-probability-label").textContent = `${Math.round(eveProbability * 100)}%`;
  });

  $("channel-noise").addEventListener("input", event => {
    channelNoise = Number(event.target.value) / 100;
    $("noise-label").textContent = `${Math.round(channelNoise * 100)}%`;
  });

  $("eve-toggle").addEventListener("click", toggleEve);

  $("open-sim").addEventListener("click", openSimulator);
  $("generate-key").addEventListener("click", openSimulator);
  $("quick-sim-btn").addEventListener("click", openSimulator);
  $("open-analytics").addEventListener("click", openAnalytics);

  $("open-logs").addEventListener("click", () => {
    $("logs-panel").classList.toggle("open");
  });
  $("close-logs").addEventListener("click", () => {
    $("logs-panel").classList.remove("open");
  });
  $("clear-logs").addEventListener("click", clearLogs);

  updateAudioIcon();
  $("audio-toggle").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem("quantum_sound_enabled", String(soundEnabled));
    updateAudioIcon();
    showToast(`Sound clicks ${soundEnabled ? "enabled" : "muted"}`);
    if (soundEnabled) audio.playLaserChirp();
  });

  $("stream-toggle").addEventListener("click", togglePhotonStreaming);
  $("step-photon").addEventListener("click", stepSinglePhoton);
  $("run-bb84").addEventListener("click", runInstantBurst);
  $("step-bb84").addEventListener("click", nextProtocolStage);
  $("reset-bb84").addEventListener("click", resetSimulator);
  $("publish-key").addEventListener("click", publishActiveKey);

  $("anim-speed").addEventListener("change", e => {
    animSpeed = Number(e.target.value) || 1.0;
  });

  setupTabs();
  setupMalusDial();
  setupTableFilters();

  $("run-monte-carlo").addEventListener("click", runMonteCarloExperiment);
  $("mc-eve").addEventListener("change", e => {
    $("mc-eve-prob-wrap").style.display = e.target.checked ? "flex" : "none";
  });

  $("export-csv").addEventListener("click", exportExperimentCSV);
  $("download-report").addEventListener("click", exportHTMLReport);
  $("print-report").addEventListener("click", exportHTMLReport);

  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });

  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal(modal.id);
    });
  });

  $("message-form").addEventListener("submit", sendMessage);
  $("message-input").addEventListener("input", handleTypingInput);
  $("message-input").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("message-form").requestSubmit();
    }
  });

  setupChannelCanvas();

  updateRoomTitle();
  updateEveUI();
  updateKeyReservoirUI();

  connectFirebase();
  drawTheoreticalCharts();
}

function updateAudioIcon() {
  $("audio-icon").textContent = soundEnabled ? "🔊" : "🔇";
}

function updateRoomTitle() {
  const roomLabel = $("room-select").selectedOptions[0]?.textContent || room;
  $("room-title").textContent = `Quantum Lab — ${displayName} (${role})`;
  const peer = role === "Alice" ? "Bob (Receiver)" : "Alice (Transmitter)";
  $("peer-status").textContent = `${roomLabel} · Synchronized with ${peer}`;
}

function changeRole() {
  localStorage.setItem("quantum_role", $("role-select").value);
  location.reload();
}

function changeRoom() {
  detachListeners();
  room = $("room-select").value;
  localStorage.setItem("quantum_room", room);

  activeKeyBits = "";
  keyBufferOffset = 0;
  latestSimulation = null;
  latestExperiment = null;

  processedMessageIds.clear();
  processedKeyIds.clear();

  $("chat-messages").replaceChildren();
  $("crypto-logs").replaceChildren();

  setKeyStatus("No accepted key", "");
  updateCurrentStats({});
  updateRoomTitle();
  updateKeyReservoirUI();

  if (db) attachListeners();
  addSystemLog("Room changed. Generate and publish a new quantum key.");
}

function clearLogs() {
  const container = $("crypto-logs");
  container.innerHTML = '<p class="muted empty-logs">Logs cleared.</p>';
  $("log-count").textContent = "0 events";
}

/* ==========================================================================
   FIREBASE REALTIME SYNCHRONIZATION
   ========================================================================== */
function connectFirebase() {
  try {
    if (!window.firebase) throw new Error("Firebase SDK script not loaded.");
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);

    db = firebase.database();
    db.ref(".info/connected").on("value", snapshot => {
      const connected = snapshot.val() === true;
      $("connection-state").textContent = connected ? "Firebase Synchronized" : "Connecting…";
      $("connection-dot").classList.toggle("connected", connected);
    });

    attachListeners();
    addSystemLog("Quantum Network online. Ready for BB84 photon exchange.");
  } catch (error) {
    console.warn("Firebase offline/standalone mode:", error);
    $("connection-state").textContent = "Standalone Mode (Offline)";
    $("connection-dot").classList.remove("connected");
    showToast("Operating in standalone simulation mode.");
    addSystemLog("Operating in local standalone mode. Simulation is fully functional.");
  }
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

  const eveRef = trackListener(db.ref(`${root}/eveEnabled`));
  eveRef.on("value", snapshot => {
    eveEnabled = snapshot.val() === true;
    updateEveUI();
  }, handleFirebaseErr);

  const messagesRef = trackListener(db.ref(`${root}/messages`).orderByChild("time"));
  messagesRef.on("child_added", snapshot => {
    const key = snapshot.key;
    if (processedMessageIds.has(key)) return;
    processedMessageIds.add(key);

    const data = snapshot.val() || {};
    if (data.sender === role) return;

    handleIncomingMessage(data, peer);
  }, handleFirebaseErr);

  const keysRef = trackListener(db.ref(`${root}/keys`).orderByChild("time"));
  keysRef.on("child_added", snapshot => {
    const key = snapshot.key;
    if (processedKeyIds.has(key)) return;
    processedKeyIds.add(key);

    const data = snapshot.val() || {};
    if (data.sender === role || !data.accepted || !data.demoKeyBits) return;

    activeKeyBits = String(data.demoKeyBits);
    keyBufferOffset = 0;

    setKeyStatus(`OTP KEY READY · ${activeKeyBits.length} bits`, "ready");
    updateCurrentStats(data.stats || {});
    updateKeyReservoirUI();

    addSystemLog(`Quantum key (${activeKeyBits.length} bits) securely received from ${data.sender}.`);
    audio.playSuccess();
    showToast(`Quantum key (${activeKeyBits.length} bits) received from ${data.sender}`);
  }, handleFirebaseErr);

  const typingRef = trackListener(db.ref(`${root}/typing_status/${peer}`));
  typingRef.on("value", snapshot => {
    const isTyping = snapshot.val() === true;
    $("typing-line").textContent = isTyping ? `${peer} is typing…` : "";
    $("typing-line").style.display = isTyping ? "block" : "none";
  }, handleFirebaseErr);
}

function handleFirebaseErr(err) {
  console.warn("Firebase listener notice:", err);
}

// ==========================================================================
// EVE ATTACK ADVERSARY CONTROL
// ==========================================================================
async function toggleEve() {
  const next = !eveEnabled;
  eveEnabled = next;
  updateEveUI();

  if (eveEnabled) {
    audio.playAlert();
    showToast(`Eve enabled (${Math.round(eveProbability * 100)}% interception)`);
  } else {
    showToast("Eve disarmed");
  }

  addSystemLog(next
    ? `⚠️ Eve armed: Intercept-resend active with p_E = ${Math.round(eveProbability * 100)}%.`
    : "Eve disarmed: Quantum channel undisturbed.");

  if (db) {
    try {
      await db.ref(`servers/${room}/eveEnabled`).set(next);
    } catch (e) {
      console.warn("Could not sync Eve state to Firebase:", e);
    }
  }
}

function updateEveUI() {
  $("eve-state").textContent = eveEnabled
    ? `Attack armed (${Math.round(eveProbability * 100)}% intercept)`
    : "Attack disabled";

  $("eve-toggle").textContent = eveEnabled ? "Disarm Eve" : "Enable Eve Intercept-Resend";
  $("eve-toggle").classList.toggle("armed", eveEnabled);

  $("stat-security").textContent = eveEnabled ? "EVE ACTIVE" : "SECURE";
  $("stat-security").className = eveEnabled ? "security-alert" : "security-safe";
  $("stat-eve-sub").textContent = eveEnabled ? `Eve: ${Math.round(eveProbability * 100)}%` : "Eve: OFF";

  const hudEve = $("hud-eve");
  if (hudEve) {
    hudEve.textContent = eveEnabled ? `Eve: ARMED (${Math.round(eveProbability * 100)}%)` : "Eve: DISARMED";
    hudEve.classList.toggle("hud-eve-pill", eveEnabled);
  }
}

// ==========================================================================
// BB84 QUANTUM STOCHASTIC SIMULATION ENGINE
// ==========================================================================
function simulateSinglePhoton(index, useEve, pE, noise) {
  const aliceBit = randomBit();
  const aliceBasis = randomBasis();
  const bobBasis = randomBasis();

  const aliceAngle = aliceBasis === "+" ? (aliceBit === 0 ? 0 : 90) : (aliceBit === 0 ? 45 : 135);

  const intercepted = useEve && (Math.random() < pE);
  let eveBasis = "—";
  let eveBit = "—";
  let eveAngle = "—";
  let travelingBit = aliceBit;
  let travelingBasis = aliceBasis;

  if (intercepted) {
    eveBasis = randomBasis();
    if (eveBasis === aliceBasis) {
      eveBit = aliceBit;
    } else {
      eveBit = randomBit();
    }
    travelingBit = eveBit;
    travelingBasis = eveBasis;
    eveAngle = eveBasis === "+" ? (eveBit === 0 ? 0 : 90) : (eveBit === 0 ? 45 : 135);
  }

  if (Math.random() < noise) {
    travelingBit = randomBit();
  }

  let bobBit;
  if (bobBasis === travelingBasis) {
    bobBit = travelingBit;
  } else {
    bobBit = randomBit();
  }

  const basisMatch = aliceBasis === bobBasis;
  const bitMatch = aliceBit === bobBit;
  const isError = basisMatch && !bitMatch;
  const bobDetector = bobBit === 0 ? "D0" : "D1";

  return {
    index,
    aliceBit,
    aliceBasis,
    aliceAngle,
    intercepted,
    eveBasis,
    eveBit,
    eveAngle,
    bobBasis,
    bobBit,
    bobDetector,
    basisMatch,
    bitMatch,
    isError
  };
}

function simulateBB84Batch(n, useEve, pE, noise) {
  const photons = [];
  const matchingIndexes = [];
  let errorCount = 0;

  for (let i = 0; i < n; i++) {
    const p = simulateSinglePhoton(i + 1, useEve, pE, noise);
    photons.push(p);
    if (p.basisMatch) {
      matchingIndexes.push(i);
      if (p.isError) errorCount++;
    }
  }

  const sampleSet = selectRandomSample(matchingIndexes, 0.25);
  let sampleErrors = 0;

  for (const idx of sampleSet) {
    if (photons[idx].isError) {
      sampleErrors++;
    }
  }

  const sampleSize = sampleSet.size;
  const sampleQber = sampleSize > 0 ? sampleErrors / sampleSize : 0;

  const remainingIndexes = matchingIndexes.filter(idx => !sampleSet.has(idx));
  const rawRemainingAlice = remainingIndexes.map(idx => photons[idx].aliceBit).join("");
  const rawRemainingBob = remainingIndexes.map(idx => photons[idx].bobBit).join("");

  const accepted = sampleSize >= 8 && sampleQber <= 0.11003;
  const keyRate = secretKeyRate(sampleQber);
  const privacyAmplifiedLength = accepted ? Math.floor(rawRemainingAlice.length * keyRate) : 0;
  const finalAliceKey = rawRemainingAlice.slice(0, privacyAmplifiedLength);

  return {
    n,
    useEve,
    pE,
    noise,
    photons,
    matchingIndexes,
    matchCount: matchingIndexes.length,
    matchProbability: matchingIndexes.length / n,
    sampleSet,
    sampleSize,
    sampleErrors,
    sampleQber,
    remainingIndexes,
    rawRemainingAlice,
    rawRemainingBob,
    accepted,
    keyRate,
    privacyAmplifiedLength,
    finalAliceKey,
    time: new Date().toISOString()
  };
}

function selectRandomSample(indexes, fraction = 0.25) {
  const copy = [...indexes];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  const count = Math.min(copy.length, Math.max(8, Math.floor(copy.length * fraction)));
  return new Set(copy.slice(0, count));
}

// ==========================================================================
// SIMULATOR UI & ACTIONS
// ==========================================================================
function openSimulator() {
  $("sim-modal").classList.add("open");
  resizeCanvases();
  if (!latestSimulation) {
    stepSinglePhoton();
  }
}

function resetSimulator() {
  stopPhotonStreaming();
  latestSimulation = null;
  flyingPhotons = [];
  photonSeq = 0;

  $("bb84-table-body").innerHTML =
    '<tr><td colspan="10" class="empty-cell">Simulation reset. Stream photons or run instant burst.</td></tr>';

  $("sim-result").className = "result-banner";
  $("sim-result").textContent = "Optical bench ready. Choose photon count and simulate.";
  $("publish-key").disabled = true;

  ["sim-photons", "sim-matches", "sim-qber", "sim-final-bits"].forEach(id => $(id).textContent = "—");
  updateStateInspector(null);
  updateBitstreamRibbon(null);
  renderProtocolSteps(0);
}

function runInstantBurst() {
  stopPhotonStreaming();
  const n = Number($("photon-count").value) || 512;
  const pE = eveEnabled ? eveProbability : 0;
  const noise = channelNoise;

  latestSimulation = simulateBB84Batch(n, eveEnabled, pE, noise);

  updateSimulationMetrics(latestSimulation);
  renderBB84Table(latestSimulation);
  updateBitstreamRibbon(latestSimulation);
  renderProtocolSteps(5);
  evaluateHypothesisTest(latestSimulation);

  updateCurrentStats({
    matchProbability: latestSimulation.matchProbability,
    qber: latestSimulation.sampleQber,
    finalKeyLength: latestSimulation.privacyAmplifiedLength,
    eve: eveEnabled
  });

  experimentHistory.push(simulationToHistoryRow(latestSimulation));

  if (latestSimulation.accepted) {
    audio.playSuccess();
    $("sim-result").className = "result-banner success";
    $("sim-result").textContent =
      `✅ Sample QBER: ${(latestSimulation.sampleQber * 100).toFixed(2)}% (≤ 11.0% Shor-Preskill bound). ` +
      `Channel verified secure! Privacy amplified key: ${latestSimulation.privacyAmplifiedLength} bits ready for One-Time Pad.`;

    $("publish-key").disabled = role !== "Alice" || latestSimulation.privacyAmplifiedLength < 8;
  } else {
    audio.playAlert();
    $("sim-result").className = "result-banner error";
    $("sim-result").textContent =
      `🚨 Key Compromised: Sample QBER ${(latestSimulation.sampleQber * 100).toFixed(2)}% exceeds security threshold (11.0%). ` +
      `Eve's interception detected! Key discarded to preserve perfect secrecy.`;

    setKeyStatus("Key Rejected · High QBER", "rejected");
    addSystemLog(`BB84 Key exchange aborted: QBER ${(latestSimulation.sampleQber * 100).toFixed(2)}% exceeds 11% threshold!`, true);
    $("publish-key").disabled = true;
  }

  addCryptoLog("BB84 Batch Simulation", [
    ["Photons Prepared (N)", n],
    ["Basis Matches (K)", `${latestSimulation.matchCount} (${(latestSimulation.matchProbability * 100).toFixed(1)}%)`],
    ["Sample Tested (k)", latestSimulation.sampleSize],
    ["Sample QBER (Q̂)", `${(latestSimulation.sampleQber * 100).toFixed(2)}%`],
    ["Eve Active", eveEnabled ? `YES (${Math.round(pE * 100)}%)` : "NO"],
    ["Channel Noise (η)", `${Math.round(noise * 100)}%`],
    ["Secret Key Rate R", latestSimulation.keyRate.toFixed(4)],
    ["Distilled OTP Bits", latestSimulation.privacyAmplifiedLength],
    ["Security Verdict", latestSimulation.accepted ? "PASSED (Safe)" : "COMPROMISED (Aborted)"]
  ], latestSimulation.accepted ? "var(--teal)" : "var(--red)");
}

function updateSimulationMetrics(sim) {
  $("sim-photons").textContent = String(sim.n);
  $("sim-matches").textContent = `${sim.matchCount} (${(sim.matchProbability * 100).toFixed(1)}%)`;
  $("sim-qber").textContent = `${(sim.sampleQber * 100).toFixed(2)}%`;
  $("sim-final-bits").textContent = `${sim.privacyAmplifiedLength} bits`;
}

function updateBitstreamRibbon(sim) {
  if (!sim) {
    $("ribbon-raw").textContent = "Awaiting simulation…";
    $("ribbon-sifted").textContent = "Awaiting sifting…";
    $("ribbon-sample").textContent = "Awaiting error estimation…";
    $("ribbon-final").textContent = "Awaiting privacy amplification…";
    return;
  }

  const rawSnippet = sim.photons.slice(0, 48).map(p =>
    `<span class="${p.basisMatch ? 'bit-match' : 'bit-mismatch'}">${p.aliceBit}</span>`
  ).join(" ");
  $("ribbon-raw").innerHTML = rawSnippet + (sim.photons.length > 48 ? " …" : "");

  const siftedSnippet = sim.matchingIndexes.slice(0, 48).map(idx => {
    const p = sim.photons[idx];
    return `<span class="${p.isError ? 'bit-error' : 'bit-match'}">${p.aliceBit}</span>`;
  }).join(" ");
  $("ribbon-sifted").innerHTML = siftedSnippet || "No matching bases";

  const sampleSnippet = Array.from(sim.sampleSet).slice(0, 32).map(idx => {
    const p = sim.photons[idx];
    return `<span class="${p.isError ? 'bit-error' : 'bit-sample'}">${p.aliceBit}</span>`;
  }).join(" ");
  $("ribbon-sample").innerHTML = sampleSnippet || "No sample";

  $("ribbon-final").innerHTML = sim.finalAliceKey
    ? `<span class="bit-match">${sim.finalAliceKey.slice(0, 64)}</span>${sim.finalAliceKey.length > 64 ? ' …' : ''}`
    : "Key rejected (0 bits)";
}

// ==========================================================================
// OPTICAL BENCH INTERACTIVE CANVAS ANIMATION
// ==========================================================================
function setupChannelCanvas() {
  channelCanvas = $("channel-canvas");
  if (!channelCanvas) return;
  channelCtx = channelCanvas.getContext("2d");
  resizeCanvases();
  window.addEventListener("resize", resizeCanvases);
  startAnimationLoop();
}

function resizeCanvases() {
  if (!channelCanvas) return;
  const rect = channelCanvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = Math.max(300, rect.width || 1100);
  const h = 340;

  channelCanvas.width = w * dpr;
  channelCanvas.height = h * dpr;
  channelCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function startAnimationLoop() {
  if (animFrameId) cancelAnimationFrame(animFrameId);

  let lastTime = performance.now();

  function loop(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    updatePhotons(dt);
    drawOpticalBench();

    animFrameId = requestAnimationFrame(loop);
  }
  animFrameId = requestAnimationFrame(loop);
}

function updatePhotons(dt) {
  const speedPxPerSec = 380 * animSpeed;
  const width = channelCanvas ? channelCanvas.getBoundingClientRect().width : 1100;
  const aliceX = 140;
  const eveX = width / 2;
  const bobX = width - 150;

  for (let i = flyingPhotons.length - 1; i >= 0; i--) {
    const p = flyingPhotons[i];
    p.x += speedPxPerSec * dt;
    p.phase += dt * 12;

    if (!p.passedEve && p.x >= eveX) {
      p.passedEve = true;
      if (p.data.intercepted) {
        detectorFlash.eve = 1.0;
        audio.playAlert();
        p.waveColor = "#ff3366";
      }
    }

    if (p.x >= bobX) {
      if (p.data.bobDetector === "D0") {
        detectorFlash.d0 = 1.0;
      } else {
        detectorFlash.d1 = 1.0;
      }
      audio.playClick();

      updateStateInspector(p.data);
      appendTableRow(p.data);

      flyingPhotons.splice(i, 1);
    }
  }

  detectorFlash.d0 = Math.max(0, detectorFlash.d0 - dt * 4);
  detectorFlash.d1 = Math.max(0, detectorFlash.d1 - dt * 4);
  detectorFlash.eve = Math.max(0, detectorFlash.eve - dt * 3);
}

function drawOpticalBench() {
  if (!channelCtx || !channelCanvas) return;
  const w = channelCanvas.getBoundingClientRect().width;
  const h = 340;
  const ctx = channelCtx;

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(23, 45, 68, 0.4)";
  ctx.lineWidth = 1;
  const gridSize = 30;
  for (let x = 0; x < w; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  const beamY = h / 2;
  const aliceX = 130;
  const bobX = w - 140;
  const eveX = w / 2;

  const gradBeam = ctx.createLinearGradient(aliceX, beamY, bobX, beamY);
  gradBeam.addColorStop(0, "rgba(0, 229, 255, 0.6)");
  gradBeam.addColorStop(0.5, eveEnabled ? "rgba(255, 51, 102, 0.7)" : "rgba(0, 245, 160, 0.5)");
  gradBeam.addColorStop(1, "rgba(0, 245, 160, 0.6)");

  ctx.strokeStyle = gradBeam;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(aliceX, beamY);
  ctx.lineTo(bobX, beamY);
  ctx.stroke();
  ctx.setLineDash([]);

  drawAliceStation(ctx, aliceX - 90, beamY - 70, 90, 140);
  drawEveStation(ctx, eveX - 45, beamY - 60, 90, 120);
  drawBobStation(ctx, bobX, beamY - 70, 120, 140);

  flyingPhotons.forEach(p => drawPhoton(ctx, p, beamY));
}

function drawAliceStation(ctx, x, y, w, h) {
  ctx.fillStyle = "#071628";
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 10, true, true);

  ctx.fillStyle = "#00e5ff";
  ctx.font = "bold 11px Inter";
  ctx.textAlign = "center";
  ctx.fillText("ALICE (TX)", x + w / 2, y + 20);

  ctx.fillStyle = "#122a44";
  ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
  ctx.fillRect(x + w - 18, y + h / 2 - 14, 18, 28);
  ctx.strokeRect(x + w - 18, y + h / 2 - 14, 18, 28);

  ctx.fillStyle = "rgba(0, 229, 255, 0.8)";
  ctx.beginPath();
  ctx.arc(x + w, y + h / 2, 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(0, 229, 255, 0.4)";
  ctx.beginPath();
  ctx.arc(x + w / 2 - 8, y + h / 2, 22, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#8fb3d4";
  ctx.font = "9px Fira Code";
  ctx.fillText("Bases: +, ×", x + w / 2 - 8, y + h - 14);
}

function drawEveStation(ctx, x, y, w, h) {
  const active = eveEnabled;
  ctx.fillStyle = active ? "#1c0910" : "#071220";
  ctx.strokeStyle = active ? "#ff3366" : "rgba(100, 130, 160, 0.3)";
  ctx.lineWidth = active ? 2 : 1;
  roundRect(ctx, x, y, w, h, 8, true, true);

  ctx.fillStyle = active ? "#ff3366" : "#627c96";
  ctx.font = "bold 11px Inter";
  ctx.textAlign = "center";
  ctx.fillText("EVE (EVA)", x + w / 2, y + 20);

  ctx.fillStyle = active ? "rgba(255, 51, 102, 0.2)" :
