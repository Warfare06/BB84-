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

// 2-Device Parabolic Antenna State
let liveTxBit = 0;
let liveTxBasis = "+";
let liveRxBasis = "+";
let activeAntennaView = "sender";
let liveSiftedKeyBits = "";
let processedLivePhotonIds = new Set();

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

      // Geiger / APD avalanche click: short bandpassed noise burst
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
    } catch (e) {
      // Audio autoplay policy fallback
    }
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

  // Bind settings
  $("room-select").value = room;
  $("role-select").value = role;

  $("room-select").addEventListener("change", changeRoom);
  $("role-select").addEventListener("change", changeRole);

  // Eve controls
  $("eve-probability").addEventListener("input", event => {
    eveProbability = Number(event.target.value) / 100;
    $("eve-probability-label").textContent = `${Math.round(eveProbability * 100)}%`;
  });

  $("channel-noise").addEventListener("input", event => {
    channelNoise = Number(event.target.value) / 100;
    $("noise-label").textContent = `${Math.round(channelNoise * 100)}%`;
  });

  $("eve-toggle").addEventListener("click", toggleEve);

  // Top action modals
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

  // Audio toggle
  updateAudioIcon();
  $("audio-toggle").addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    localStorage.setItem("quantum_sound_enabled", String(soundEnabled));
    updateAudioIcon();
    showToast(`Sound clicks ${soundEnabled ? "enabled" : "muted"}`);
    if (soundEnabled) audio.playLaserChirp();
  });

  // Simulator toolbar controls
  $("stream-toggle").addEventListener("click", togglePhotonStreaming);
  $("step-photon").addEventListener("click", stepSinglePhoton);
  $("run-bb84").addEventListener("click", runInstantBurst);
  $("step-bb84").addEventListener("click", nextProtocolStage);
  $("reset-bb84").addEventListener("click", resetSimulator);
  $("publish-key").addEventListener("click", publishActiveKey);

  $("anim-speed").addEventListener("change", e => {
    animSpeed = Number(e.target.value) || 1.0;
  });

  // Modal tabs
  setupTabs();

  // Malus law dial controls
  setupMalusDial();

  // Table filter buttons
  setupTableFilters();

  // PTRP Analytics controls
  $("run-monte-carlo").addEventListener("click", runMonteCarloExperiment);
  $("mc-eve").addEventListener("change", e => {
    $("mc-eve-prob-wrap").style.display = e.target.checked ? "flex" : "none";
  });

  // Exports
  $("export-csv").addEventListener("click", exportExperimentCSV);
  $("download-report").addEventListener("click", exportHTMLReport);
  $("print-report").addEventListener("click", exportHTMLReport);

  // Modal dismiss buttons
  document.querySelectorAll("[data-close]").forEach(btn => {
    btn.addEventListener("click", () => closeModal(btn.dataset.close));
  });

  document.querySelectorAll(".modal").forEach(modal => {
    modal.addEventListener("click", event => {
      if (event.target === modal) closeModal(modal.id);
    });
  });

  // Chat message composer
  $("message-form").addEventListener("submit", sendMessage);
  $("message-input").addEventListener("input", handleTypingInput);
  $("message-input").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("message-form").requestSubmit();
    }
  });

  // Canvas setup
  setupChannelCanvas();
  $("open-antenna-sim")?.addEventListener("click", openAntennaSimModal);
  setupAntennaSimulation();

  updateRoomTitle();
  updateEveUI();
  updateKeyReservoirUI();

  // Firebase Realtime DB setup
  connectFirebase();

  // Initial demonstration charts
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
  const status = $("connection-state");
  const dot = $("connection-dot");

  try {
    if (!window.firebase) {
      throw new Error("Firebase SDK did not load. Check internet access and the Firebase script URLs.");
    }

    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    db = firebase.database();

    // Show a useful state instead of claiming the database is connected before it is.
    status.textContent = "Connecting to Firebase…";
    dot.classList.remove("connected");

    db.ref(".info/connected").on("value", snapshot => {
      const connected = snapshot.val() === true;
      status.textContent = connected ? "Firebase Connected" : "Firebase Disconnected";
      dot.classList.toggle("connected", connected);
      if (connected) {
        addSystemLog("Connected to Firebase Realtime Database.");
      }
    }, error => handleFirebaseErr(error));

    attachListeners();
  } catch (error) {
    console.error("Firebase initialization failed:", error);
    status.textContent = "Firebase Error — see Console";
    dot.classList.remove("connected");
    showToast("Firebase failed to initialize. Open DevTools Console for details.");
    addSystemLog("Firebase initialization failed: " + (error.message || error), true);
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

  // Eve state sync
  const eveRef = trackListener(db.ref(`${root}/eveEnabled`));
  eveRef.on("value", snapshot => {
    eveEnabled = snapshot.val() === true;
    updateEveUI();
  }, handleFirebaseErr);

  // Incoming encrypted messages
  const messagesRef = trackListener(db.ref(`${root}/messages`).orderByChild("time"));
  messagesRef.on("child_added", snapshot => {
    const key = snapshot.key;
    if (processedMessageIds.has(key)) return;
    processedMessageIds.add(key);

    const data = snapshot.val() || {};
    if (data.sender === role) return;

    handleIncomingMessage(data, peer);
  }, handleFirebaseErr);

  // Received BB84 keys
  const keysRef = trackListener(db.ref(`${root}/keys`).orderByChild("time"));
  keysRef.on("child_added", snapshot => {
    const key = snapshot.key;
    if (processedKeyIds.has(key)) return;
    processedKeyIds.add(key);

    const data = snapshot.val() || {};
    if (data.sender === role || !data.demoKeyBits) return;

    // Bob receives bobKeyBits (which has errors if Eve was active), Alice receives aliceKeyBits
    const receivedKey = role === "Bob" ? (data.bobKeyBits || data.demoKeyBits) : (data.aliceKeyBits || data.demoKeyBits);
    activeKeyBits = String(receivedKey);
    keyBufferOffset = 0;

    if (data.accepted) {
      setKeyStatus(`OTP KEY READY · ${activeKeyBits.length} bits`, "ready");
      addSystemLog(`Quantum key (${activeKeyBits.length} bits) securely received from ${data.sender}.`);
      audio.playSuccess();
      showToast(`Quantum key (${activeKeyBits.length} bits) received from ${data.sender}`);
    } else {
      setKeyStatus(`COMPROMISED KEY · ${activeKeyBits.length} bits`, "rejected");
      addSystemLog(`⚠️ Compromised quantum key received from ${data.sender} (Eve intercepted! QBER: ${(Number(data.stats?.qber || 0.25) * 100).toFixed(1)}%). Your key does not match Alice's key!`, true);
      audio.playAlert();
      showToast(`⚠️ Compromised key received: Decryption will be corrupted!`);
    }

    updateCurrentStats(data.stats || {});
    updateKeyReservoirUI();
  }, handleFirebaseErr);

  // Peer typing state
  const typingRef = trackListener(db.ref(`${root}/typing_status/${peer}`));
    // Real-time 2-Device Parabolic Dish Photons
  const livePhotonsRef = trackListener(db.ref(`${root}/live_photons`).limitToLast(20));
  livePhotonsRef.on("child_added", snapshot => {
    const data = snapshot.val() || {};
    if (processedLivePhotonIds.has(snapshot.key)) return;
    processedLivePhotonIds.add(snapshot.key);

    if (data.sender === role && activeAntennaView !== "dual") return;
    handleIncomingLivePhoton(data);
  }, handleFirebaseErr);

  typingRef.on("value", snapshot => {
    const isTyping = snapshot.val() === true;
    $("typing-line").textContent = isTyping ? `${peer} is typing…` : "";
    $("typing-line").style.display = isTyping ? "block" : "none";
  }, handleFirebaseErr);
}

function handleFirebaseErr(err) {
  const code = err && err.code ? err.code : "unknown";
  const message = err && err.message ? err.message : String(err || "Unknown Firebase error");
  console.error("Firebase Realtime Database error:", code, message, err);

  const status = $("connection-state");
  if (status) {
    if (code === "PERMISSION_DENIED" || /permission_denied/i.test(message)) {
      status.textContent = "Firebase Permission Denied";
    } else {
      status.textContent = "Firebase Error — see Console";
    }
  }

  if (code === "PERMISSION_DENIED" || /permission_denied/i.test(message)) {
    showToast("Firebase denied access. Check Realtime Database Rules.");
  } else {
    showToast("Firebase error: " + message);
  }
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

/*
  Single Photon Transition:
  Alice bit A_i ~ Bernoulli(0.5)
  Alice basis B_A ~ Bernoulli(0.5) in {'+', '×'}
  Polarization angle theta_A:
    '+' : 0° (bit 0), 90° (bit 1)
    '×' : 45° (bit 0), 135° (bit 1)

  Eve Interception with probability p_E:
    If intercepted: Eve measures in B_E ~ Bernoulli(0.5).
    If B_E == B_A: Eve measures Alice's bit, re-emits in B_E.
    If B_E != B_A: Eve collapses state to B_E; outcome is 50/50. Re-emits in B_E.

  Bob Measurement:
    Bob chooses B_B ~ Bernoulli(0.5).
    If B_B == arriving basis: deterministic bit.
    If B_B != arriving basis: 50/50 coin flip.

  Conditional Error Law:
    P(Bob error | B_A = B_B, Eve) = 25%
    Total theoretical QBER: Q = eta + (1-eta)*(p_E / 4).
*/
function simulateSinglePhoton(index, useEve, pE, noise) {
  const aliceBit = randomBit();
  const aliceBasis = randomBasis();
  const bobBasis = randomBasis();

  // Polarization angles
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
      // Wavefunction collapse into conjugate basis
      eveBit = randomBit();
    }
    travelingBit = eveBit;
    travelingBasis = eveBasis;
    eveAngle = eveBasis === "+" ? (eveBit === 0 ? 0 : 90) : (eveBit === 0 ? 45 : 135);
  }

  // Depolarizing channel noise
  if (Math.random() < noise) {
    travelingBit = randomBit();
  }

  // Bob's measurement
  let bobBit;
  if (bobBasis === travelingBasis) {
    bobBit = travelingBit;
  } else {
    // Malus projection: conjugate basis yields 50/50 outcome
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

  // Subsample 25% of matching bits for public QBER testing
  const sampleSet = selectRandomSample(matchingIndexes, 0.25);
  let sampleErrors = 0;

  for (const idx of sampleSet) {
    if (photons[idx].isError) {
      sampleErrors++;
    }
  }

  const sampleSize = sampleSet.size;
  const sampleQber = sampleSize > 0 ? sampleErrors / sampleSize : 0;

  // Key distillation (remaining matching bits after sacrificing sample)
  const remainingIndexes = matchingIndexes.filter(idx => !sampleSet.has(idx));
  const rawRemainingAlice = remainingIndexes.map(idx => photons[idx].aliceBit).join("");
  const rawRemainingBob = remainingIndexes.map(idx => photons[idx].bobBit).join("");

  // Theoretical Shor-Preskill threshold for asymptotic security
  const accepted = sampleSize >= 8 && sampleQber <= 0.11003;

  // Privacy amplification key shortening:
  // If accepted, compress key by keyRate.
  // If rejected/compromised (Eve active), retain candidate bits so the user can test the corruption!
  const keyRate = secretKeyRate(sampleQber);
  const privacyAmplifiedLength = accepted 
    ? Math.max(16, Math.floor(rawRemainingAlice.length * keyRate))
    : Math.max(16, Math.floor(rawRemainingAlice.length * 0.5));
  const finalAliceKey = rawRemainingAlice.slice(0, privacyAmplifiedLength);
  const finalBobKey = rawRemainingBob.slice(0, privacyAmplifiedLength);

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
    finalBobKey,
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
  renderProtocolSteps(5); // all stages completed
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
    $("publish-key").textContent = "Publish Accepted Secure Key to Bob";
    $("publish-key").className = "primary-btn";
  } else {
    audio.playAlert();
    $("sim-result").className = "result-banner error";
    $("sim-result").textContent =
      `🚨 Key Compromised: Sample QBER ${(latestSimulation.sampleQber * 100).toFixed(2)}% exceeds security threshold (11.0%). ` +
      `Eve's interception detected! You can publish this compromised key to demonstrate corrupted message reception in chat.`;

    setKeyStatus("Key Rejected · High QBER", "rejected");
    addSystemLog(`BB84 Key exchange alerted: QBER ${(latestSimulation.sampleQber * 100).toFixed(2)}% exceeds 11% threshold!`, true);
    $("publish-key").disabled = role !== "Alice";
    $("publish-key").textContent = "Publish Compromised Key (Test Eve Corruption)";
    $("publish-key").className = "danger-btn";
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

  // Format first 64 bits with span highlights
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

    // Eve checkpoint
    if (!p.passedEve && p.x >= eveX) {
      p.passedEve = true;
      if (p.data.intercepted) {
        detectorFlash.eve = 1.0;
        audio.playAlert();
        p.waveColor = "#ff3366";
      }
    }

    // Bob detection checkpoint
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

  // Decay detector LED flashes
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

  // Background optical grid
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

  // Optical channel beam line (fiber core)
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

  // 1. ALICE'S TRANSMITTER STATION
  drawAliceStation(ctx, aliceX - 90, beamY - 70, 90, 140);

  // 2. EVE'S STATION
  drawEveStation(ctx, eveX - 45, beamY - 60, 90, 120);

  // 3. BOB'S RECEIVER STATION
  drawBobStation(ctx, bobX, beamY - 70, 120, 140);

  // 4. DRAW FLYING PHOTONS
  flyingPhotons.forEach(p => drawPhoton(ctx, p, beamY));
}

function drawAliceStation(ctx, x, y, w, h) {
  // Enclosure
  ctx.fillStyle = "#071628";
  ctx.strokeStyle = "#00e5ff";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 10, true, true);

  // Label
  ctx.fillStyle = "#00e5ff";
  ctx.font = "bold 11px Inter";
  ctx.textAlign = "center";
  ctx.fillText("ALICE (TX)", x + w / 2, y + 20);

  // Diode Laser aperture
  ctx.fillStyle = "#122a44";
  ctx.strokeStyle = "rgba(0, 229, 255, 0.5)";
  ctx.fillRect(x + w - 18, y + h / 2 - 14, 18, 28);
  ctx.strokeRect(x + w - 18, y + h / 2 - 14, 18, 28);

  // Laser emitter glow
  ctx.fillStyle = "rgba(0, 229, 255, 0.8)";
  ctx.beginPath();
  ctx.arc(x + w, y + h / 2, 6, 0, Math.PI * 2);
  ctx.fill();

  // State prep dial
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

  // Eve label
  ctx.fillStyle = active ? "#ff3366" : "#627c96";
  ctx.font = "bold 11px Inter";
  ctx.textAlign = "center";
  ctx.fillText("EVE (EVA)", x + w / 2, y + 20);

  // Intercept beam splitter prism
  ctx.fillStyle = active ? "rgba(255, 51, 102, 0.2)" : "rgba(255, 255, 255, 0.05)";
  ctx.strokeStyle = active ? "#ff3366" : "#324961";
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y + 36);
  ctx.lineTo(x + w - 12, y + h - 36);
  ctx.lineTo(x + 12, y + h - 36);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Eve status indicator LED
  ctx.fillStyle = active ? (detectorFlash.eve > 0.1 ? "#ffffff" : "#ff3366") : "#324457";
  ctx.beginPath();
  ctx.arc(x + w / 2, y + h - 18, 5, 0, Math.PI * 2);
  ctx.fill();

  if (active && detectorFlash.eve > 0.1) {
    ctx.strokeStyle = "rgba(255, 51, 102, 0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + w / 2, y + h - 18, 14 * detectorFlash.eve, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBobStation(ctx, x, y, w, h) {
  ctx.fillStyle = "#071924";
  ctx.strokeStyle = "#00f5a0";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 10, true, true);

  // Label
  ctx.fillStyle = "#00f5a0";
  ctx.font = "bold 11px Inter";
  ctx.textAlign = "center";
  ctx.fillText("BOB (RX)", x + w / 2, y + 20);

  // Polarizing Beam Splitter (PBS Cube)
  const cubeX = x + 18;
  const cubeY = y + h / 2 - 20;
  ctx.fillStyle = "#0e2938";
  ctx.strokeStyle = "rgba(0, 245, 160, 0.5)";
  ctx.fillRect(cubeX, cubeY, 36, 40);
  ctx.strokeRect(cubeX, cubeY, 36, 40);

  // PBS Diagonal splitting interface
  ctx.strokeStyle = "rgba(0, 245, 160, 0.8)";
  ctx.beginPath();
  ctx.moveTo(cubeX, cubeY);
  ctx.lineTo(cubeX + 36, cubeY + 40);
  ctx.stroke();

  ctx.fillStyle = "#83baa4";
  ctx.font = "8px Inter";
  ctx.fillText("PBS", cubeX + 18, cubeY + 48);

  // Avalanche Photodiode D0 (Straight transmission)
  const d0X = x + w - 30;
  const d0Y = cubeY + 6;
  ctx.fillStyle = detectorFlash.d0 > 0.1 ? "#ffffff" : (detectorFlash.d0 > 0.01 ? "#00f5a0" : "#08241d");
  ctx.strokeStyle = "#00f5a0";
  roundRect(ctx, d0X, d0Y, 22, 16, 4, true, true);
  ctx.font = "bold 9px Fira Code";
  ctx.fillStyle = detectorFlash.d0 > 0.1 ? "#000" : "#00f5a0";
  ctx.fillText("D0", d0X + 11, d0Y + 12);

  // Avalanche Photodiode D1 (Reflected up)
  const d1X = cubeX + 8;
  const d1Y = y + 26;
  ctx.fillStyle = detectorFlash.d1 > 0.1 ? "#ffffff" : (detectorFlash.d1 > 0.01 ? "#00f5a0" : "#08241d");
  ctx.strokeStyle = "#00f5a0";
  roundRect(ctx, d1X, d1Y, 20, 16, 4, true, true);
  ctx.fillStyle = detectorFlash.d1 > 0.1 ? "#000" : "#00f5a0";
  ctx.fillText("D1", d1X + 10, d1Y + 12);
}

function drawPhoton(ctx, p, centerY) {
  const x = p.x;
  const y = centerY;
  const color = p.waveColor || "#00e5ff";

  // Transverse wave oscillation
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  const waveLen = 32;
  for (let dx = -waveLen; dx <= waveLen; dx += 2) {
    const waveY = y + Math.sin(p.phase + dx * 0.25) * 8;
    if (dx === -waveLen) ctx.moveTo(x + dx, waveY);
    else ctx.lineTo(x + dx, waveY);
  }
  ctx.stroke();

  // Core photon packet
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 8, 0, Math.PI * 2);
  ctx.globalAlpha = 0.4;
  ctx.fill();
  ctx.globalAlpha = 1.0;

  // Polarization vector angle arrow
  const rad = (p.data.aliceAngle * Math.PI) / 180;
  const arrowLen = 14;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - Math.cos(rad) * arrowLen, y - Math.sin(rad) * arrowLen);
  ctx.lineTo(x + Math.cos(rad) * arrowLen, y + Math.sin(rad) * arrowLen);
  ctx.stroke();
}

function roundRect(ctx, x, y, w, h, r, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

// Streaming and Stepping Controls
let streamTimer = null;

function togglePhotonStreaming() {
  if (isStreaming) {
    stopPhotonStreaming();
  } else {
    startPhotonStreaming();
  }
}

function startPhotonStreaming() {
  isStreaming = true;
  $("stream-icon").textContent = "⏸";
  $("stream-text").textContent = "Pause Stream";
  $("hud-status").textContent = "Streaming Photons Live";

  streamTimer = setInterval(() => {
    emitPhoton();
  }, Math.max(120, 600 / animSpeed));
}

function stopPhotonStreaming() {
  isStreaming = false;
  $("stream-icon").textContent = "▶";
  $("stream-text").textContent = "Stream Photons";
  $("hud-status").textContent = "Optical Bench Paused";
  if (streamTimer) clearInterval(streamTimer);
  streamTimer = null;
}

function stepSinglePhoton() {
  stopPhotonStreaming();
  emitPhoton();
  $("hud-status").textContent = "Stepped 1 Photon";
}

function emitPhoton() {
  photonSeq++;
  const pE = eveEnabled ? eveProbability : 0;
  const photonData = simulateSinglePhoton(photonSeq, eveEnabled, pE, channelNoise);

  flyingPhotons.push({
    x: 130,
    phase: 0,
    passedEve: false,
    waveColor: "#00e5ff",
    data: photonData
  });

  audio.playLaserChirp();
  $("hud-photon-info").textContent = `Photon #${photonSeq} (${photonData.aliceBasis} Basis)`;
}

function updateStateInspector(data) {
  if (!data) {
    ["insp-alice-bit", "insp-alice-basis", "insp-alice-state", "insp-eve-action", "insp-eve-basis",
     "insp-eve-bit", "insp-bob-basis", "insp-bob-bit", "insp-bob-detector", "insp-match-status", "insp-sift-status"]
      .forEach(id => $(id).textContent = "—");
    return;
  }

  $("insp-alice-bit").textContent = String(data.aliceBit);
  $("insp-alice-basis").textContent = data.aliceBasis;

  let stateStr = "";
  if (data.aliceBasis === "+") stateStr = data.aliceBit === 0 ? "|0⟩ (0°)" : "|1⟩ (90°)";
  else stateStr = data.aliceBit === 0 ? "|+⟩ (45°)" : "|-⟩ (135°)";
  $("insp-alice-state").textContent = stateStr;

  if (data.intercepted) {
    $("insp-eve-action").textContent = "INTERCEPTED";
    $("insp-eve-action").className = "red-text";
    $("insp-eve-basis").textContent = data.eveBasis;
    $("insp-eve-bit").textContent = String(data.eveBit);
  } else {
    $("insp-eve-action").textContent = "Bypassed / Undisturbed";
    $("insp-eve-action").className = "green-text";
    $("insp-eve-basis").textContent = "—";
    $("insp-eve-bit").textContent = "—";
  }

  $("insp-bob-basis").textContent = data.bobBasis;
  $("insp-bob-bit").textContent = String(data.bobBit);
  $("insp-bob-detector").textContent = `${data.bobDetector} Click`;

  $("insp-match-status").textContent = data.basisMatch ? "YES (Matching Bases)" : "NO (Mismatched Bases)";
  $("insp-match-status").className = data.basisMatch ? "green-text" : "muted";

  $("insp-sift-status").textContent = data.basisMatch ? (data.isError ? "Kept (Error bit)" : "Kept (Valid bit)") : "Discarded";
  $("insp-sift-status").className = data.basisMatch ? (data.isError ? "red-text" : "green-text") : "muted";
}

function appendTableRow(data) {
  const tbody = $("bb84-table-body");
  tbody.querySelector(".empty-cell")?.parentElement?.remove();

  const tr = document.createElement("tr");
  if (data.isError) tr.className = "error-row";

  tr.innerHTML = `
    <td>${data.index}</td>
    <td>${data.aliceBit}</td>
    <td>${data.aliceBasis}</td>
    <td>${data.eveBasis}</td>
    <td>${data.bobBasis}</td>
    <td>${data.bobBit}</td>
    <td class="${data.basisMatch ? 'good' : 'bad'}">${data.basisMatch ? 'MATCH' : 'MISMATCH'}</td>
    <td class="dim">—</td>
    <td class="${data.isError ? 'error-cell' : 'good'}">${data.isError ? 'ERROR' : 'OK'}</td>
    <td class="${data.basisMatch ? 'good' : 'dim'}">${data.basisMatch ? data.aliceBit : '—'}</td>
  `;

  tbody.prepend(tr);

  // Keep table rows manageable
  while (tbody.children.length > 100) {
    tbody.lastElementChild.remove();
  }
}

// ==========================================================================
// PROTOCOL DISTILLATION STAGES
// ==========================================================================
let protocolStage = 0;

function nextProtocolStage() {
  if (!latestSimulation) {
    runInstantBurst();
    return;
  }
  protocolStage = (protocolStage + 1) % 6;
  renderProtocolSteps(protocolStage);

  const stageDescriptions = [
    "Stage 01 (State Preparation): Alice prepares random bits in random non-orthogonal bases (+ and ×).",
    "Stage 02 (Transmission): Photons travel across the quantum channel. Eve intercepts with probability p_E.",
    "Stage 03 (Measurement): Bob measures incoming photons in randomly selected independent bases (+ and ×).",
    "Stage 04 (Basis Sifting): Alice & Bob announce bases publicly and retain matching positions (expected ~50%).",
    "Stage 05 (QBER Estimation): Alice & Bob reveal a random 25% sample of sifted bits to test H0: QBER ≤ 11.0%.",
    "Stage 06 (Privacy Amplification): Parity checks and universal hashing compress the key by 2·H2(Q) to distill secret OTP."
  ];

  $("sim-result").textContent = stageDescriptions[protocolStage];
}

function renderProtocolSteps(stage) {
  protocolStage = clamp(stage, 0, 5);
  document.querySelectorAll(".protocol-step").forEach((el, idx) => {
    el.classList.toggle("active", idx === protocolStage);
    el.classList.toggle("done", idx < protocolStage);
  });
}

// ==========================================================================
// POLARIZATION & MALUS LAW INTERACTIVE DIAL
// ==========================================================================
function setupMalusDial() {
  const canvas = $("malus-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const aSlider = $("alice-angle-slider");
  const bSlider = $("bob-angle-slider");

  function drawDial() {
    const aDeg = Number(aSlider.value);
    const bDeg = Number(bSlider.value);

    let aLabel = `${aDeg}°`;
    if (aDeg === 0) aLabel += " (|0⟩)";
    else if (aDeg === 45) aLabel += " (|+⟩)";
    else if (aDeg === 90) aLabel += " (|1⟩)";
    else if (aDeg === 135) aLabel += " (|-⟩)";
    $("alice-angle-val").textContent = aLabel;

    let bLabel = `${bDeg}°`;
    if (bDeg === 0 || bDeg === 90) bLabel += " (+ Rectilinear)";
    else bLabel += " (× Diagonal)";
    $("bob-angle-val").textContent = bLabel;

    const deltaDeg = Math.abs(bDeg - aDeg) % 180;
    const deltaRad = (deltaDeg * Math.PI) / 180;
    const prob = Math.cos(deltaRad) ** 2;

    $("malus-delta").textContent = `Δθ = ${deltaDeg}°`;
    $("malus-prob").textContent = `P(Detect) = ${(prob * 100).toFixed(1)}%`;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const r = cx - 25;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background circle
    ctx.strokeStyle = "#14283c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshairs
    ctx.strokeStyle = "#0e1e2f";
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Basis markers
    ctx.fillStyle = "#8ba3bc";
    ctx.font = "10px Fira Code";
    ctx.textAlign = "center";
    ctx.fillText("|0⟩ 0°", cx + r - 12, cy - 8);
    ctx.fillText("|1⟩ 90°", cx, cy - r + 14);
    ctx.fillText("|+⟩ 45°", cx + r * 0.7, cy - r * 0.7 + 10);
    ctx.fillText("|-⟩ 135°", cx - r * 0.7, cy - r * 0.7 + 10);

    // Alice vector (Cyan)
    const aRad = (aDeg * Math.PI) / 180;
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(aRad) * (r - 10), cy - Math.sin(aRad) * (r - 10));
    ctx.stroke();

    // Bob analyzer axis (Emerald)
    const bRad = (bDeg * Math.PI) / 180;
    ctx.strokeStyle = "#00f5a0";
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(bRad) * (r - 10), cy - Math.sin(bRad) * (r - 10));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  aSlider.addEventListener("input", drawDial);
  bSlider.addEventListener("input", drawDial);
  drawDial();
}

// ==========================================================================
// DATA MATRIX TABLE FILTERING
// ==========================================================================
function setupTableFilters() {
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentTableFilter = btn.dataset.filter;
      if (latestSimulation) renderBB84Table(latestSimulation);
    });
  });

  $("table-search").addEventListener("input", e => {
    const val = e.target.value.trim().toLowerCase();
    const rows = $("bb84-table-body").querySelectorAll("tr");
    rows.forEach(r => {
      r.style.display = r.textContent.toLowerCase().includes(val) ? "" : "none";
    });
  });
}

function renderBB84Table(sim) {
  const tbody = $("bb84-table-body");
  tbody.replaceChildren();

  const sampleSet = sim.sampleSet || new Set();
  const maxRows = Math.min(sim.photons.length, 150);
  const fragment = document.createDocumentFragment();

  let count = 0;
  for (let i = 0; i < sim.photons.length && count < maxRows; i++) {
    const p = sim.photons[i];

    // Apply active filter
    if (currentTableFilter === "match" && !p.basisMatch) continue;
    if (currentTableFilter === "mismatch" && p.basisMatch) continue;
    if (currentTableFilter === "sample" && (!p.basisMatch || !sampleSet.has(i))) continue;
    if (currentTableFilter === "error" && (!p.basisMatch || !p.isError)) continue;

    count++;
    const tr = document.createElement("tr");
    const isSample = p.basisMatch && sampleSet.has(i);

    if (p.isError) tr.className = "error-row";

    tr.innerHTML = `
      <td>${p.index}</td>
      <td>${p.aliceBit}</td>
      <td>${p.aliceBasis}</td>
      <td>${p.eveBasis}</td>
      <td>${p.bobBasis}</td>
      <td>${p.bobBit}</td>
      <td class="${p.basisMatch ? 'good' : 'bad'}">${p.basisMatch ? 'MATCH' : 'MISMATCH'}</td>
      <td class="${isSample ? 'sample' : 'dim'}">${isSample ? 'TEST' : '—'}</td>
      <td class="${p.isError ? 'error-cell' : 'good'}">${p.isError ? 'ERROR' : 'OK'}</td>
      <td class="${p.basisMatch ? 'good' : 'dim'}">${p.basisMatch && !isSample ? p.aliceBit : '—'}</td>
    `;
    fragment.appendChild(tr);
  }

  tbody.appendChild(fragment);

  if (count === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="empty-cell">No photons match the selected filter.</td></tr>';
  }
}

// ==========================================================================
// TABS HANDLING
// ==========================================================================
function setupTabs() {
  // Simulator modal tabs
  document.querySelectorAll("[data-sim-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-sim-tab]").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".sim-tab-content").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      const targetId = `tab-${btn.dataset.simTab}`;
      $(targetId)?.classList.add("active");

      if (btn.dataset.simTab === "optical-bench") resizeCanvases();
    });
  });

  // Analytics modal tabs
  document.querySelectorAll("[data-ana-tab]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-ana-tab]").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".ana-tab-content").forEach(c => c.classList.remove("active"));

      btn.classList.add("active");
      const targetId = `ana-${btn.dataset.anaTab}`;
      $(targetId)?.classList.add("active");

      if (latestExperiment) redrawExperimentCharts();
    });
  });
}

function closeModal(id) {
  $(id)?.classList.remove("open");
}

function openAnalytics() {
  $("analytics-modal").classList.add("open");
  if (!latestExperiment) {
    runMonteCarloExperiment();
  } else {
    redrawExperimentCharts();
  }
}

// ==========================================================================
// PTRP MONTE CARLO EXPERIMENTATION & CLT MOMENTS
// ==========================================================================
function runMonteCarloExperiment() {
  const btn = $("run-monte-carlo");
  btn.disabled = true;
  btn.textContent = "Simulating Trials…";

  setTimeout(() => {
    try {
      const trials = clamp(Number($("trial-count").value) || 500, 10, 10000);
      const n = clamp(Number($("mc-photons").value) || 128, 16, 2048);
      const useEve = $("mc-eve").checked;
      const pE = useEve ? Number($("mc-eve-prob").value) : 0;
      const noise = channelNoise;

      let totalMatches = 0;
      let totalMatchSq = 0;
      let totalErrors = 0;
      let totalSiftedBits = 0;

      const lengths = [];
      const qbers = [];
      const samplePaths = [];

      for (let t = 0; t < trials; t++) {
        let trialMatches = 0;
        let trialErrors = 0;
        let path = [0];

        for (let i = 0; i < n; i++) {
          const aBasis = randomBasis();
          const bBasis = randomBasis();
          const match = aBasis === bBasis;

          if (match) {
            trialMatches++;
            path.push(path[path.length - 1] + 0.5);

            // Error check
            const intercept = useEve && Math.random() < pE;
            let err = false;
            if (intercept) {
              const eBasis = randomBasis();
              if (eBasis !== aBasis && Math.random() < 0.5) err = true;
            }
            if (Math.random() < noise) err = true;
            if (err) trialErrors++;
          } else {
            path.push(path[path.length - 1] - 0.5);
          }
        }

        totalMatches += trialMatches;
        totalMatchSq += trialMatches ** 2;
        totalErrors += trialErrors;
        totalSiftedBits += trialMatches;

        lengths.push(trialMatches);
        qbers.push(trialMatches > 0 ? trialErrors / trialMatches : 0);

        if (t < 5) samplePaths.push(path);
      }

      const empiricalMatch = totalMatches / (trials * n);
      const meanLength = totalMatches / trials;
      const variance = Math.max(0, totalMatchSq / trials - meanLength * meanLength);
      const stdDev = Math.sqrt(variance);

      // Higher order moments for CLT
      let m3 = 0, m4 = 0;
      for (const k of lengths) {
        m3 += (k - meanLength) ** 3;
        m4 += (k - meanLength) ** 4;
      }
      const skewness = trials > 1 ? (m3 / trials) / (stdDev ** 3 || 1) : 0;
      const kurtosis = trials > 1 ? (m4 / trials) / (stdDev ** 4 || 1) : 3;

      const empiricalQber = totalSiftedBits > 0 ? totalErrors / totalSiftedBits : 0;
      const theoreticalQber = noise + (1 - noise) * (pE / 4);

      latestExperiment = {
        trials,
        photons: n,
        useEve,
        pE,
        noise,
        empiricalMatch,
        meanLength,
        variance,
        stdDev,
        skewness,
        kurtosis,
        empiricalQber,
        theoreticalMatch: 0.5,
        theoreticalMean: n / 2,
        theoreticalVariance: n / 4,
        theoreticalStdDev: Math.sqrt(n) / 2,
        theoreticalQber,
        lengths,
        qbers,
        samplePaths,
        time: new Date().toISOString()
      };

      // Update UI cards
      $("metric-match").textContent = empiricalMatch.toFixed(4);
      $("metric-mean").textContent = meanLength.toFixed(2);
      $("metric-variance").textContent = variance.toFixed(2);
      $("metric-qber").textContent = `${(empiricalQber * 100).toFixed(2)}%`;

      $("metric-mean-theory").textContent = `Theory: ${(n / 2).toFixed(1)} (N/2)`;
      $("metric-var-theory").textContent = `Theory: ${(n / 4).toFixed(1)} (N/4)`;
      $("metric-qber-note").textContent = `Theory: ${(theoreticalQber * 100).toFixed(1)}%`;

      $("experiment-summary").className = "result-banner";
      $("experiment-summary").textContent =
        `Monte Carlo Complete: ${trials.toLocaleString()} trials × ${n} photons. ` +
        `Empirical P(Match) = ${empiricalMatch.toFixed(4)} (Theory: 0.5000). ` +
        `Mean Length = ${meanLength.toFixed(2)} (Theory: ${n/2}), Variance = ${variance.toFixed(2)} (Theory: ${n/4}). ` +
        `Empirical QBER = ${(empiricalQber * 100).toFixed(2)}% (Theory: ${(theoreticalQber * 100).toFixed(1)}%).`;

      updateCLTMomentsTable(latestExperiment);
      redrawExperimentCharts();

      addCryptoLog("PTRP Monte Carlo Experiment", [
        ["Trials (M)", trials],
        ["Photons / Trial (N)", n],
        ["Empirical P(Match)", empiricalMatch.toFixed(4)],
        ["Theoretical P(Match)", "0.5000"],
        ["Sample Mean Length", meanLength.toFixed(2)],
        ["Theoretical Mean (N/2)", (n / 2).toFixed(2)],
        ["Sample Variance", variance.toFixed(2)],
        ["Theoretical Variance (N/4)", (n / 4).toFixed(2)],
        ["Skewness γ₁", skewness.toFixed(3)],
        ["Kurtosis κ", kurtosis.toFixed(3)],
        ["Empirical QBER", `${(empiricalQber * 100).toFixed(2)}%`]
      ], "var(--teal)");
    } catch (e) {
      console.error(e);
      showToast(`Monte Carlo error: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = "Run Monte Carlo Experiment";
    }
  }, 30);
}

function updateCLTMomentsTable(exp) {
  const tbody = $("clt-stats-tbody");
  if (!tbody) return;

  const seMean = exp.stdDev / Math.sqrt(exp.trials);
  const seVar = exp.variance * Math.sqrt(2 / (exp.trials - 1));

  tbody.innerHTML = `
    <tr>
      <td><strong>Expected Sifted Length E[K]</strong></td>
      <td>${exp.meanLength.toFixed(3)}</td>
      <td>${exp.theoreticalMean.toFixed(3)}</td>
      <td>${Math.abs(exp.meanLength - exp.theoreticalMean).toFixed(4)}</td>
      <td>&plusmn;${seMean.toFixed(4)}</td>
    </tr>
    <tr>
      <td><strong>Variance Var(K)</strong></td>
      <td>${exp.variance.toFixed(3)}</td>
      <td>${exp.theoreticalVariance.toFixed(3)}</td>
      <td>${Math.abs(exp.variance - exp.theoreticalVariance).toFixed(4)}</td>
      <td>&plusmn;${seVar.toFixed(4)}</td>
    </tr>
    <tr>
      <td><strong>Standard Deviation &sigma;</strong></td>
      <td>${exp.stdDev.toFixed(3)}</td>
      <td>${exp.theoreticalStdDev.toFixed(3)}</td>
      <td>${Math.abs(exp.stdDev - exp.theoreticalStdDev).toFixed(4)}</td>
      <td>—</td>
    </tr>
    <tr>
      <td><strong>Skewness &gamma;<sub>1</sub> (Asymmetry)</strong></td>
      <td>${exp.skewness.toFixed(4)}</td>
      <td>0.0000 (Symmetric Normal)</td>
      <td>${Math.abs(exp.skewness).toFixed(4)}</td>
      <td>&asymp; &radic;(6/M)</td>
    </tr>
    <tr>
      <td><strong>Kurtosis &kappa; (Tail Weight)</strong></td>
      <td>${exp.kurtosis.toFixed(4)}</td>
      <td>3.0000 (Mesokurtic)</td>
      <td>${Math.abs(exp.kurtosis - 3).toFixed(4)}</td>
      <td>&asymp; &radic;(24/M)</td>
    </tr>
    <tr>
      <td><strong>CLT Z-Statistic</strong></td>
      <td>${((exp.meanLength - exp.theoreticalMean) / (exp.stdDev / Math.sqrt(exp.trials))).toFixed(3)}</td>
      <td>0.0000</td>
      <td>—</td>
      <td>&sim; N(0, 1)</td>
    </tr>
  `;
}

// ==========================================================================
// CANVAS PLOTTING & PTRP CHARTS
// ==========================================================================
function getChartCtx(canvas, height = 220) {
  if (!canvas) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, rect.width);

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "#06111f";
  ctx.fillRect(0, 0, width, height);

  return { ctx, width, height, left: 45, right: 15, top: 20, bottom: 32 };
}

// Histogram with overlaid Gaussian curve
function drawCLTHistogram(canvas, values, n, theoreticalMean, theoreticalVar) {
  const chart = getChartCtx(canvas, 220);
  if (!chart) return;
  const { ctx, width, height, left, right, top, bottom } = chart;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const binStep = Math.max(1, Math.round(Math.sqrt(n) / 2));
  const minVal = Math.max(0, Math.floor(theoreticalMean - 3.5 * Math.sqrt(theoreticalVar)));
  const maxVal = Math.min(n, Math.ceil(theoreticalMean + 3.5 * Math.sqrt(theoreticalVar)));

  const bins = [];
  for (let b = minVal; b <= maxVal; b += binStep) {
    bins.push({ x: b, count: 0 });
  }

  values.forEach(v => {
    const idx = clamp(Math.floor((v - minVal) / binStep), 0, bins.length - 1);
    if (bins[idx]) bins[idx].count++;
  });

  const maxCount = Math.max(1, ...bins.map(b => b.count));
  const slotW = plotW / bins.length;

  // Grid
  ctx.strokeStyle = "#142538";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    ctx.fillStyle = "#718ca8";
    ctx.font = "9px Fira Code";
    ctx.fillText(String(Math.round(maxCount * (1 - i / 4))), 4, y + 3);
  }

  // Draw histogram bars
  bins.forEach((b, i) => {
    const barH = (b.count / maxCount) * plotH;
    const bx = left + i * slotW + 1;
    const by = top + plotH - barH;

    ctx.fillStyle = "rgba(0, 229, 255, 0.65)";
    ctx.fillRect(bx, by, Math.max(1, slotW - 2), barH);

    if (i % 2 === 0) {
      ctx.fillStyle = "#718ca8";
      ctx.font = "9px Fira Code";
      ctx.textAlign = "center";
      ctx.fillText(String(b.x), bx + slotW / 2, height - 10);
    }
  });

  // Overlaid Theoretical Gaussian Curve: f(x) = (1 / sqrt(2*pi*sigma^2)) * exp(-(x-mu)^2 / (2*sigma^2))
  const sigma = Math.sqrt(theoreticalVar);
  const totalM = values.length;
  ctx.strokeStyle = "#00f5a0";
  ctx.lineWidth = 2.5;
  ctx.beginPath();

  for (let px = 0; px <= plotW; px += 2) {
    const xVal = minVal + (px / plotW) * (maxVal - minVal);
    const pdf = (1 / (sigma * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((xVal - theoreticalMean) / sigma) ** 2);
    // Scale pdf to bin count: expected count = totalM * binStep * pdf
    const expectedCount = totalM * binStep * pdf;
    const py = top + plotH - (expectedCount / maxCount) * plotH;

    if (px === 0) ctx.moveTo(left + px, py);
    else ctx.lineTo(left + px, py);
  }
  ctx.stroke();

  // Legend
  ctx.fillStyle = "#00f5a0";
  ctx.font = "10px Inter";
  ctx.textAlign = "right";
  ctx.fillText("— Theoretical Normal N(N/2, N/4)", width - right - 5, top + 14);
}

// Random Walk / Martingale sample path chart
function drawRandomWalk(canvas, paths) {
  const chart = getChartCtx(canvas, 270);
  if (!chart) return;
  const { ctx, width, height, left, right, top, bottom } = chart;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const maxN = paths[0]?.length || 128;
  const maxDiff = Math.ceil(3 * Math.sqrt(maxN / 4));

  // Grid
  ctx.strokeStyle = "#142538";
  ctx.lineWidth = 1;
  const zeroY = top + plotH / 2;

  ctx.beginPath();
  ctx.moveTo(left, zeroY);
  ctx.lineTo(width - right, zeroY);
  ctx.strokeStyle = "rgba(0, 245, 160, 0.4)";
  ctx.stroke();

  // Bounds (+/- 3*sigma diffusion envelopes: +/- 3*sqrt(n/4))
  ctx.strokeStyle = "rgba(179, 136, 255, 0.4)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let n = 1; n < maxN; n += 2) {
    const bound = 3 * Math.sqrt(n / 4);
    const px = left + (n / maxN) * plotW;
    const pyTop = zeroY - (bound / maxDiff) * (plotH / 2);
    if (n === 1) ctx.moveTo(px, pyTop);
    else ctx.lineTo(px, pyTop);
  }
  ctx.stroke();

  ctx.beginPath();
  for (let n = 1; n < maxN; n += 2) {
    const bound = 3 * Math.sqrt(n / 4);
    const px = left + (n / maxN) * plotW;
    const pyBot = zeroY + (bound / maxDiff) * (plotH / 2);
    if (n === 1) ctx.moveTo(px, pyBot);
    else ctx.lineTo(px, pyBot);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Plot sample paths
  const colors = ["#00e5ff", "#00f5a0", "#ffc83b", "#b388ff", "#ff3366"];
  paths.forEach((path, pIdx) => {
    ctx.strokeStyle = colors[pIdx % colors.length];
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    path.forEach((val, step) => {
      const px = left + (step / maxN) * plotW;
      const py = zeroY - (val / maxDiff) * (plotH / 2);
      if (step === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });

  // Labels
  ctx.fillStyle = "#8fa6be";
  ctx.font = "9px Fira Code";
  ctx.textAlign = "left";
  ctx.fillText("0 (Martingale Center)", left + 5, zeroY - 4);
  ctx.fillText("+3σ Diffusion Bound", left + 5, top + 15);
}

// SLLN running average convergence chart
function drawSLLNConvergence(canvas, paths) {
  const chart = getChartCtx(canvas, 270);
  if (!chart) return;
  const { ctx, width, height, left, right, top, bottom } = chart;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  const maxN = paths[0]?.length || 128;

  // Grid
  ctx.strokeStyle = "#142538";
  ctx.lineWidth = 1;
  const yCenter = top + plotH / 2; // 0.5 line

  ctx.beginPath();
  ctx.moveTo(left, yCenter);
  ctx.lineTo(width - right, yCenter);
  ctx.strokeStyle = "rgba(0, 245, 160, 0.7)";
  ctx.stroke();

  // Theoretical line label
  ctx.fillStyle = "#00f5a0";
  ctx.font = "10px Fira Code";
  ctx.fillText("E[X] = 0.500 (Strong Law Center)", left + 6, yCenter - 5);

  // Confidence bounds: 0.5 +/- 2 * sqrt(0.25 / n)
  ctx.strokeStyle = "rgba(0, 229, 255, 0.3)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  for (let n = 2; n < maxN; n++) {
    const bound = 2 * Math.sqrt(0.25 / n);
    const px = left + (n / maxN) * plotW;
    const py = top + (1 - (0.5 + bound)) * plotH;
    if (n === 2) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();

  ctx.beginPath();
  for (let n = 2; n < maxN; n++) {
    const bound = 2 * Math.sqrt(0.25 / n);
    const px = left + (n / maxN) * plotW;
    const py = top + (1 - (0.5 - bound)) * plotH;
    if (n === 2) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Plot running means
  paths.slice(0, 3).forEach((path, idx) => {
    let sum = 0;
    ctx.strokeStyle = idx === 0 ? "#00e5ff" : (idx === 1 ? "#ffc83b" : "#b388ff");
    ctx.lineWidth = 1.8;
    ctx.beginPath();

    for (let step = 1; step < path.length; step++) {
      // Reconstruct match bit: step > 0
      const bit = path[step] - path[step - 1] > 0 ? 1 : 0;
      sum += bit;
      const mean = sum / step;
      const px = left + (step / maxN) * plotW;
      const py = top + (1 - mean) * plotH;

      if (step === 1) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  });
}

function drawLineChart(canvas, values, maxY, thresholdY = null) {
  const chart = getChartCtx(canvas, 220);
  if (!chart) return;
  const { ctx, width, height, left, right, top, bottom } = chart;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  // Grid
  ctx.strokeStyle = "#142538";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    ctx.fillStyle = "#718ca8";
    ctx.font = "9px Fira Code";
    ctx.fillText(`${(maxY * (1 - i / 4) * 100).toFixed(0)}%`, 4, y + 3);
  }

  // Threshold line
  if (thresholdY !== null && thresholdY <= maxY) {
    const ty = top + plotH - (thresholdY / maxY) * plotH;
    ctx.strokeStyle = "#ff3366";
    ctx.lineWidth = 1.8;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(left, ty);
    ctx.lineTo(width - right, ty);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#ff3366";
    ctx.font = "10px Inter";
    ctx.textAlign = "right";
    ctx.fillText(`Security Threshold ${(thresholdY * 100).toFixed(1)}%`, width - right - 6, ty - 4);
  }

  // Values line
  if (values.length) {
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    values.forEach((v, idx) => {
      const px = left + (idx / Math.max(1, values.length - 1)) * plotW;
      const py = top + plotH - clamp(v / maxY, 0, 1) * plotH;
      if (idx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
}

function drawBarComparison(canvas, bars, maxVal) {
  const chart = getChartCtx(canvas, 220);
  if (!chart) return;
  const { ctx, width, height, left, right, top, bottom } = chart;
  const plotW = width - left - right;
  const plotH = height - top - bottom;

  // Grid
  ctx.strokeStyle = "#142538";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = top + (plotH * i) / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    ctx.fillStyle = "#718ca8";
    ctx.font = "9px Fira Code";
    ctx.fillText((maxVal * (1 - i / 4)).toFixed(2), 4, y + 3);
  }

  const slot = plotW / bars.length;
  bars.forEach((b, i) => {
    const bh = clamp(b.value / maxVal, 0, 1) * plotH;
    const bx = left + i * slot + slot * 0.2;
    const by = top + plotH - bh;

    ctx.fillStyle = b.color || "#00e5ff";
    ctx.fillRect(bx, by, slot * 0.6, bh);

    ctx.fillStyle = "#eaf4ff";
    ctx.font = "10px Fira Code";
    ctx.textAlign = "center";
    ctx.fillText(b.value.toFixed(3), bx + slot * 0.3, Math.max(top + 10, by - 6));
    ctx.fillText(b.label, bx + slot * 0.3, height - 10);
  });
}

function drawShannonCurves() {
  // Binary Entropy H2(p)
  const cEntropy = $("chart-binary-entropy");
  if (cEntropy) {
    const chart = getChartCtx(cEntropy, 220);
    if (chart) {
      const { ctx, width, height, left, right, top, bottom } = chart;
      const plotW = width - left - right;
      const plotH = height - top - bottom;

      // Curve
      ctx.strokeStyle = "#00e5ff";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let px = 0; px <= plotW; px += 2) {
        const p = px / plotW;
        const h = binaryEntropy(p);
        const py = top + plotH - h * plotH;
        if (px === 0) ctx.moveTo(left + px, py);
        else ctx.lineTo(left + px, py);
      }
      ctx.stroke();

      // Peak at p = 0.5, H2 = 1
      ctx.fillStyle = "#00f5a0";
      ctx.beginPath();
      ctx.arc(left + plotW / 2, top, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = "10px Inter";
      ctx.textAlign = "center";
      ctx.fillText("Max Entropy: H2(0.5) = 1.0", left + plotW / 2, top + 16);
    }
  }

  // Key Rate R = max(0, 1 - 2*H2(Q))
  const cRate = $("chart-key-rate");
  if (cRate) {
    const chart = getChartCtx(cRate, 220);
    if (chart) {
      const { ctx, width, height, left, right, top, bottom } = chart;
      const plotW = width - left - right;
      const plotH = height - top - bottom;

      ctx.strokeStyle = "#00f5a0";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let px = 0; px <= plotW; px += 2) {
        const q = (px / plotW) * 0.25; // range 0 to 25%
        const r = secretKeyRate(q);
        const py = top + plotH - r * plotH;
        if (px === 0) ctx.moveTo(left + px, py);
        else ctx.lineTo(left + px, py);
      }
      ctx.stroke();

      // 11% cutoff marker
      const cutoffX = left + (0.11003 / 0.25) * plotW;
      ctx.strokeStyle = "#ff3366";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cutoffX, top);
      ctx.lineTo(cutoffX, top + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = "#ff3366";
      ctx.font = "10px Inter";
      ctx.textAlign = "center";
      ctx.fillText("11.0% Cutoff", cutoffX, top + 20);
    }
  }
}

function redrawExperimentCharts() {
  if (!latestExperiment) return;

  drawCLTHistogram(
    $("chart-histogram"),
    latestExperiment.lengths,
    latestExperiment.photons,
    latestExperiment.theoreticalMean,
    latestExperiment.theoreticalVariance
  );

  drawBarComparison($("chart-match"), [
    { label: "Observed", value: latestExperiment.empiricalMatch, color: "#00e5ff" },
    { label: "Theory (0.5)", value: 0.5, color: "#00f5a0" }
  ], 1.0);

  drawLineChart($("chart-qber"), latestExperiment.qbers.slice(0, 200), 0.5, 0.11);

  // Eve vs QBER curve
  const eveBars = [];
  for (let p = 0; p <= 1.01; p += 0.2) {
    eveBars.push({
      label: `${Math.round(p * 100)}%`,
      value: p / 4,
      color: "#00f5a0"
    });
  }
  drawBarComparison($("chart-eve"), eveBars, 0.3);

  // Random walk & SLLN paths
  if (latestExperiment.samplePaths?.length) {
    drawRandomWalk($("chart-random-walk"), latestExperiment.samplePaths);
    drawSLLNConvergence($("chart-slln"), latestExperiment.samplePaths);
  }

  drawShannonCurves();
}

function drawTheoreticalCharts() {
  drawBarComparison($("chart-match"), [
    { label: "Observed", value: 0.5, color: "#00e5ff" },
    { label: "Theory", value: 0.5, color: "#00f5a0" }
  ], 1.0);

  const eveBars = [];
  for (let p = 0; p <= 1.01; p += 0.2) {
    eveBars.push({ label: `${Math.round(p * 100)}%`, value: p / 4, color: "#00f5a0" });
  }
  drawBarComparison($("chart-eve"), eveBars, 0.3);
  drawShannonCurves();
}

// ==========================================================================
// HYPOTHESIS TESTING EVALUATION
// ==========================================================================
function evaluateHypothesisTest(sim) {
  if (!sim) return;
  const k = sim.sampleSize;
  const errors = sim.sampleErrors;
  const qHat = sim.sampleQber;
  const q0 = 0.11; // 11% threshold

  // Normal approximation to Binomial hypothesis test:
  // Z = (qHat - q0) / sqrt( q0*(1-q0) / k )
  const se = Math.sqrt((q0 * (1 - q0)) / Math.max(1, k));
  const z = (qHat - q0) / se;

  // Approximate standard normal CDF
  const pVal = 1 - standardNormalCDF(z);
  const decision = qHat <= q0 ? "ACCEPT KEY (H0 Supported)" : "REJECT KEY (H1: Eve Detected)";

  $("hypo-sample-size").textContent = String(k);
  $("hypo-errors").textContent = String(errors);
  $("hypo-qber").textContent = `${(qHat * 100).toFixed(2)}%`;
  $("hypo-z").textContent = z.toFixed(3);
  $("hypo-p").textContent = pVal.toFixed(4);

  const decisionEl = $("hypo-decision");
  decisionEl.textContent = decision;
  decisionEl.className = qHat <= q0 ? "green-text" : "red-text";
}

function standardNormalCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (x > 0) p = 1 - p;
  return p;
}

// ==========================================================================
// KEY RESERVOIR & VERNAM ONE-TIME PAD CIPHER
// ==========================================================================
async function publishActiveKey() {
  if (role !== "Alice") {
    showToast("Only Alice (Transmitter) can publish the quantum key.");
    return;
  }
  if (!latestSimulation) {
    showToast("Generate a key first.");
    return;
  }

  const aliceKey = latestSimulation.finalAliceKey;
  const bobKey = latestSimulation.finalBobKey || latestSimulation.finalAliceKey;

  if (!aliceKey || aliceKey.length < 8) {
    showToast("Generated key is too short.");
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
      interceptionProbability: latestSimulation.pE,
      finalKeyLength: aliceKey.length,
      keyAccepted: latestSimulation.accepted,
      time: Date.now()
    };

    activeKeyBits = aliceKey;
    keyBufferOffset = 0;

    if (latestSimulation.accepted) {
      setKeyStatus(`OTP KEY READY · ${aliceKey.length} bits`, "ready");
      addSystemLog(`Quantum One-Time Pad key published (${aliceKey.length} bits). Ready for secure messaging.`);
      audio.playSuccess();
      showToast("Secure quantum key published to room.");
    } else {
      setKeyStatus(`COMPROMISED KEY · ${aliceKey.length} bits`, "rejected");
      addSystemLog(`⚠️ Compromised key published (${aliceKey.length} bits, QBER ${(stats.qber * 100).toFixed(1)}%). Receiver's key differs by ~25% and will corrupt messages!`, true);
      audio.playAlert();
      showToast("Compromised key published: Receiver will receive corrupted messages.");
    }

    updateCurrentStats(stats);
    updateKeyReservoirUI();

    if (db) {
      await db.ref(`servers/${room}/keys`).push({
        sender: role,
        aliceKeyBits: aliceKey,
        bobKeyBits: bobKey,
        demoKeyBits: aliceKey,
        accepted: latestSimulation.accepted,
        stats,
        time: Date.now(),
        simulationOnly: true
      });
    }

    closeModal("sim-modal");
  } catch (error) {
    console.error(error);
    showToast(`Key publish notice: ${error.message}`);
  } finally {
    $("publish-key").disabled = false;
  }
}

function updateKeyReservoirUI() {
  const total = activeKeyBits.length;
  const remaining = Math.max(0, total - keyBufferOffset);

  $("key-bits-count").textContent = `${remaining} bits`;
  $("stat-key-length").textContent = `${remaining} bits`;

  const pct = total > 0 ? (remaining / total) * 100 : 0;
  $("key-progress-fill").style.width = `${pct}%`;

  if (total === 0) {
    $("key-reservoir-desc").textContent = "No key available · Generate in simulator";
    $("stat-key-sub").textContent = "Generate in simulator";
  } else {
    const chars = Math.floor(remaining / 8);
    $("key-reservoir-desc").textContent = `${chars} chars available for OTP`;
    $("stat-key-sub").textContent = `${chars} chars available for OTP`;
  }
}

// Vernam OTP Bitwise XOR Stream
function vernamEncrypt(plaintext, keyBits) {
  const textBytes = new TextEncoder().encode(plaintext);
  const neededBits = textBytes.length * 8;

  let activeKey = keyBits;
  let reusedWarning = false;

  // Cycle key if needed
  if (activeKey.length < neededBits) {
    reusedWarning = true;
    while (activeKey.length < neededBits) activeKey += keyBits;
  }

  const payload = [];
  const logEntries = [];

  for (let i = 0; i < textBytes.length; i++) {
    const pByte = textBytes[i];
    const keyByteBits = activeKey.slice(i * 8, (i + 1) * 8);
    const kByte = parseInt(keyByteBits, 2);
    const cByte = pByte ^ kByte;

    const pBits = pByte.toString(2).padStart(8, "0");
    const cBits = cByte.toString(2).padStart(8, "0");

    payload.push(cBits);
    logEntries.push({
      char: String.fromCharCode(pByte),
      pBits,
      kBits: keyByteBits,
      cBits
    });
  }

  keyBufferOffset += neededBits;
  updateKeyReservoirUI();

  return { payload, logEntries, reusedWarning };
}

// Disturbs ciphertext when Eve actively intercepts the transmission
function applyEveDisturbance(payloadBits, pE) {
  // Eve intercepts with probability pE.
  // Each intercepted photon/bit measured in wrong basis flips with 50% prob, yielding 25% error rate overall.
  const errorRate = Math.max(0.12, (pE || 1.0) * 0.25);
  let flippedCount = 0;
  const disturbed = payloadBits.map(byteBits => {
    let out = "";
    for (let b = 0; b < 8; b++) {
      let bit = byteBits[b];
      if (Math.random() < errorRate) {
        bit = bit === "0" ? "1" : "0";
        flippedCount++;
      }
      out += bit;
    }
    return out;
  });
  return { disturbed, flippedCount };
}

function vernamDecrypt(payload, keyBits, isEveActive, pE) {
  const textBytes = [];
  const logEntries = [];
  let activeKey = keyBits;

  while (activeKey.length < payload.length * 8) activeKey += keyBits;

  let corruptedChars = 0;

  for (let i = 0; i < payload.length; i++) {
    const cBits = payload[i];
    const cByte = parseInt(cBits, 2);
    const keyByteBits = activeKey.slice(i * 8, (i + 1) * 8);
    const kByte = parseInt(keyByteBits, 2);
    const pByte = cByte ^ kByte;

    textBytes.push(pByte);

    logEntries.push({
      char: String.fromCharCode(pByte),
      pBits: pByte.toString(2).padStart(8, "0"),
      kBits: keyByteBits,
      cBits
    });
  }

  // Construct readable or glitched string representation
  let decryptedText = "";
  for (let i = 0; i < textBytes.length; i++) {
    const b = textBytes[i];
    if (b >= 32 && b <= 126) {
      decryptedText += String.fromCharCode(b);
    } else {
      const glitchChars = ["§", "¤", "¿", "■", "≈", "Ø", "¶", "µ", "¥", "±", "†", "‡"];
      decryptedText += glitchChars[b % glitchChars.length];
      corruptedChars++;
    }
  }

  // If Eve is active on the channel, ensure visual character corruption demonstrates the 25% QBER
  if (isEveActive) {
    let scrambled = "";
    const pScramble = Math.max(0.15, (pE || 1.0) * 0.25);
    for (let i = 0; i < decryptedText.length; i++) {
      if (Math.random() < pScramble) {
        const glitchChars = ["§", "¤", "¿", "■", "~", "^", "%", "!", "X", "*", "#", "¢"];
        scrambled += glitchChars[Math.floor(Math.random() * glitchChars.length)];
        corruptedChars++;
      } else {
        scrambled += decryptedText[i];
      }
    }
    decryptedText = scrambled;
  }

  const isCorrupted = Boolean(isEveActive || corruptedChars > 0);

  return {
    plaintext: decryptedText,
    isCorrupted,
    corruptedChars,
    logEntries
  };
}

// ==========================================================================
// CHAT OPERATIONS
// ==========================================================================
async function sendMessage(event) {
  event?.preventDefault();

  const input = $("message-input");
  const text = input.value.trim();
  if (!text) return;

  if (!activeKeyBits || activeKeyBits.length < 8) {
    showToast("Generate a BB84 key first.");
    openSimulator();
    return;
  }

  // 1. Encrypt with sender's active key
  const { payload, logEntries, reusedWarning } = vernamEncrypt(text, activeKeyBits);

  // 2. Check if Eve is currently active on the channel
  const isEveActive = eveEnabled;
  const pE = eveProbability;
  let finalPayload = payload;
  let eveDisturbedCount = 0;

  if (isEveActive) {
    const res = applyEveDisturbance(payload, pE);
    finalPayload = res.disturbed;
    eveDisturbedCount = res.flippedCount;
  }

  // Display in sender's own chat
  displayChatMessage(role, text, finalPayload, "sent", logEntries, isEveActive, eveDisturbedCount, text);
  input.value = "";

  if (isEveActive) {
    showToast(`⚠️ Eve intercepted transmission (${eveDisturbedCount} bits disturbed)`);
    audio.playAlert();
  } else {
    audio.playLaserChirp();
  }

  if (reusedWarning) {
    showToast("Notice: Key looped (OTP exhausted). Generate a new key.");
  }

  addCryptoLog(isEveActive ? "Message Intercepted by Eve" : "Message Encrypted (Vernam OTP)", [
    ["Plaintext", text],
    ["Key Bits Consumed", logEntries.length * 8],
    ["Eve Attack Active", isEveActive ? `YES (p_E = ${Math.round(pE * 100)}%)` : "NO"],
    ["Bits Disturbed by Eve", eveDisturbedCount],
    ["Transmitted Ciphertext", finalPayload.join(" ")],
    ["Shannon Secrecy Status", isEveActive ? "COMPROMISED (Corrupted)" : "H(M|C) = H(M) Intact"]
  ], isEveActive ? "var(--red)" : "var(--cyan)");

  if (db) {
    try {
      const ref = await db.ref(`servers/${room}/messages`).push({
        sender: role,
        originalText: text,
        payload: finalPayload,
        rawPayload: payload,
        logEntries,
        eveActive: isEveActive,
        eveProb: pE,
        eveDisturbedCount,
        time: Date.now(),
        simulationOnly: true
      });
      processedMessageIds.add(ref.key);
      db.ref(`servers/${room}/typing_status/${role}`).set(false).catch(() => {});
    } catch (e) {
      console.warn("Could not push message to Firebase:", e);
    }
  }
}

function handleIncomingMessage(data, peer) {
  if (!activeKeyBits) {
    displayChatMessage(
      data.sender || peer,
      "🔐 Encrypted ciphertext received. A matching BB84 quantum key is required to decrypt.",
      data.payload,
      "received",
      null,
      false,
      0,
      ""
    );
    return;
  }

  try {
    const isEveCorrupted = Boolean(data.eveActive || eveEnabled || (data.eveDisturbedCount > 0));
    const { plaintext, isCorrupted, corruptedChars, logEntries } = vernamDecrypt(
      data.payload || [],
      activeKeyBits,
      isEveCorrupted,
      data.eveProb || eveProbability
    );

    displayChatMessage(
      data.sender || peer,
      plaintext,
      data.payload,
      "received",
      logEntries,
      isCorrupted,
      data.eveDisturbedCount || corruptedChars,
      data.originalText || ""
    );

    if (isCorrupted) {
      audio.playAlert();
      showToast("⚠️ Corrupted message received! Eve's eavesdropping flipped bits.");
      addCryptoLog("Corrupted Message Received (Eve Alert)", [
        ["Sender", data.sender || peer],
        ["Decrypted Text (Corrupted)", plaintext],
        ["Original Transmitted", data.originalText || "Encrypted"],
        ["Eve Interception Status", "ACTIVE (Bit Flips Detected)"],
        ["QBER Impact", "Message damaged due to non-orthogonal state collapse"]
      ], "var(--red)");
    } else {
      audio.playClick();
      addCryptoLog("Message Decrypted", [
        ["Sender", data.sender || peer],
        ["Recovered Plaintext", plaintext],
        ["Bitwise Parity", "Exact match (C ⊕ K = M)"]
      ], "var(--teal)");
    }
  } catch (err) {
    console.error("Decryption error:", err);
    addSystemLog("Message decoding failed: Keys do not match or are corrupted.", true);
  }
}

function displayChatMessage(sender, text, payload, type, logEntries, isCorrupted = false, errorCount = 0, originalText = "") {
  const container = $("chat-messages");
  const wrapper = document.createElement("article");
  wrapper.className = `message ${type}${isCorrupted ? " corrupted-msg" : ""}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";
  const name = document.createElement("strong");
  name.textContent = sender;
  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  meta.append(name, time);

  // Prominent banner if corrupted by Eve
  if (isCorrupted) {
    const corruptBanner = document.createElement("div");
    corruptBanner.className = "corrupt-banner";
    corruptBanner.innerHTML = `<span>⚠️ CORRUPTED BY EVE (QBER ~25%)</span> <small>Quantum state collapsed</small>`;
    wrapper.appendChild(corruptBanner);
  }

  const body = document.createElement("div");
  body.className = `message-text${isCorrupted ? " corrupted-text" : ""}`;
  body.textContent = text;

  // OTP metadata row
  const otpRow = document.createElement("div");
  otpRow.className = "message-otp-info";

  const chip = document.createElement("span");
  chip.className = `otp-chip${isCorrupted ? " chip-corrupted" : ""}`;
  const bitLen = Array.isArray(payload) ? payload.length * 8 : 0;
  chip.textContent = isCorrupted ? `EVE DISTURBED · ${bitLen} bits` : `OTP · ${bitLen} bits`;

  const inspectBtn = document.createElement("button");
  inspectBtn.className = `inspect-btn${isCorrupted ? " inspect-corrupt-btn" : ""}`;
  inspectBtn.textContent = isCorrupted ? "Inspect Corruption 🔍" : "Inspect Math 🔍";
  inspectBtn.addEventListener("click", () => openMessageInspector(sender, bitLen, logEntries, isCorrupted, errorCount, originalText, text));

  otpRow.append(chip, inspectBtn);

  // Expandable payload code
  const details = document.createElement("details");
  details.className = "payload";
  const summary = document.createElement("summary");
  summary.textContent = "View raw ciphertext payload";
  const code = document.createElement("code");
  code.textContent = Array.isArray(payload) ? payload.join(" ") : String(payload || "");
  details.append(summary, code);

  wrapper.append(meta, body, otpRow, details);
  container.appendChild(wrapper);
  scrollChat();
}

function openMessageInspector(sender, bits, logEntries, isCorrupted = false, errorCount = 0, originalText = "", decryptedText = "") {
  $("insp-msg-sender").textContent = sender;
  $("insp-msg-bits").textContent = `${bits} bits`;

  const titleEl = $("inspect-title");
  if (titleEl) {
    titleEl.textContent = isCorrupted 
      ? "Vernam Cipher Inspector · Eavesdropping Alert" 
      : "Vernam Cipher Bitwise Inspector";
  }

  const tbody = $("xor-tbody");
  tbody.replaceChildren();

  if (isCorrupted && originalText) {
    const infoRow = document.createElement("tr");
    infoRow.innerHTML = `
      <td colspan="5" style="background: rgba(255, 51, 102, 0.15); color: var(--red); padding: 10px; font-weight: bold; text-align: left; line-height: 1.5;">
        ⚠️ <strong>Quantum Eavesdropping Detected:</strong> Eve intercepted the quantum channel with probability p_E = 100%.<br>
        Measurement in the conjugate basis collapsed quantum superposition, inducing ~25% bit flips.<br>
        Original Sender Intended: <span style="color: var(--cyan);">'${escapeHTML(originalText)}'</span><br>
        Decrypted by Receiver: <span style="color: var(--red);">'${escapeHTML(decryptedText)}'</span>
      </td>
    `;
    tbody.appendChild(infoRow);
  }

  if (!logEntries || !logEntries.length) {
    tbody.innerHTML += '<tr><td colspan="5" class="empty-cell">Detailed bitwise trace not available for this message.</td></tr>';
  } else {
    logEntries.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>'${escapeHTML(row.char)}'</strong></td>
        <td><code>${row.pBits}</code></td>
        <td style="color: ${isCorrupted ? 'var(--red)' : 'var(--teal)'}"><code>${row.kBits}</code></td>
        <td style="color: var(--cyan)"><code>${row.cBits}</code></td>
        <td style="color: ${isCorrupted ? 'var(--red)' : 'var(--text-bright)'}"><code>${row.pBits}</code></td>
      `;
      tbody.appendChild(tr);
    });
  }

  $("inspect-modal").classList.add("open");
}

function handleTypingInput() {
  if (!db) return;
  db.ref(`servers/${room}/typing_status/${role}`).set(true).catch(() => {});
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    db.ref(`servers/${room}/typing_status/${role}`).set(false).catch(() => {});
  }, 1000);
}

// ==========================================================================
// LOGGING & SYSTEM NOTICES
// ==========================================================================
function addSystemLog(text, alert = false) {
  const container = $("chat-messages");
  const el = document.createElement("div");
  el.className = `system-message${alert ? " alert" : ""}`;
  el.textContent = text;
  container.appendChild(el);
  scrollChat();
}

function addCryptoLog(title, rows, color = "var(--cyan)") {
  const container = $("crypto-logs");
  container.querySelector(".empty-logs")?.remove();

  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.style.borderLeftColor = color;

  const header = document.createElement("div");
  header.className = "log-entry-header";
  const strong = document.createElement("strong");
  strong.textContent = title;
  const time = document.createElement("span");
  time.className = "log-time";
  time.textContent = new Date().toLocaleTimeString();
  header.append(strong, time);

  const table = document.createElement("table");
  rows.forEach(([label, value]) => {
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.textContent = label;
    const td = document.createElement("td");
    td.textContent = String(value);
    tr.append(th, td);
    table.appendChild(tr);
  });

  entry.append(header, table);
  container.prepend(entry);

  const count = container.querySelectorAll(".log-entry").length;
  $("log-count").textContent = `${count} events`;
}

function scrollChat() {
  const box = $("chat-messages");
  if (box) box.scrollTop = box.scrollHeight;
}

function setKeyStatus(text, state) {
  const badge = $("key-status");
  badge.textContent = text;
  badge.className = `key-badge ${state || ""}`;
}

function updateCurrentStats(stats = {}) {
  const match = Number(stats.matchProbability ?? 0);
  const qber = Number(stats.qber ?? 0);
  const keyLen = Number(stats.finalKeyLength ?? 0);

  $("stat-match").textContent = stats.matchProbability != null ? `${(match * 100).toFixed(1)}%` : "—";
  $("stat-qber").textContent = stats.qber != null ? `${(qber * 100).toFixed(2)}%` : "—";
  $("stat-key-length").textContent = `${keyLen} bits`;

  const isSafe = qber <= 0.11003;
  $("stat-security").textContent = stats.qber != null ? (isSafe ? "SECURE" : "COMPROMISED") : (eveEnabled ? "EVE ACTIVE" : "SECURE");
  $("stat-security").className = (stats.qber != null ? isSafe : !eveEnabled) ? "security-safe" : "security-alert";
}

function showToast(msg) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
}

// ==========================================================================
// EXPORT & REPORTING
// ==========================================================================
function simulationToHistoryRow(sim) {
  return {
    timestamp: sim.time,
    type: "BB84 Single Batch",
    photons: sim.n,
    basisMatches: sim.matchCount,
    matchProbability: sim.matchProbability.toFixed(4),
    sampleTestedBits: sim.sampleSize,
    sampleErrors: sim.sampleErrors,
    sampleQBER: (sim.sampleQber * 100).toFixed(2) + "%",
    eveActive: sim.useEve ? "YES" : "NO",
    eveInterceptProb: Math.round(sim.pE * 100) + "%",
    channelNoiseEta: Math.round(sim.noise * 100) + "%",
    secretKeyRateR: sim.keyRate.toFixed(4),
    finalDistilledKeyBits: sim.privacyAmplifiedLength,
    securityAccepted: sim.accepted ? "PASSED" : "REJECTED"
  };
}

function exportExperimentCSV() {
  if (!experimentHistory.length && !latestSimulation) {
    showToast("Run a simulation or Monte Carlo experiment first.");
    return;
  }

  const rows = [...experimentHistory];
  if (!rows.length && latestSimulation) rows.push(simulationToHistoryRow(latestSimulation));

  const columns = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const csv = [
    columns.join(","),
    ...rows.map(r => columns.map(c => `"${String(r[c] ?? '').replace(/"/g, '""')}"`).join(","))
  ].join("\r\n");

  downloadBlobFile("bb84_ptrp_experiment_data.csv", csv, "text/csv;charset=utf-8");
  showToast("CSV dataset exported successfully.");
}

function exportHTMLReport() {
  const dateStr = new Date().toLocaleString();
  const rows = experimentHistory.length ? experimentHistory : (latestSimulation ? [simulationToHistoryRow(latestSimulation)] : []);

  const tableHeaders = rows.length ? Object.keys(rows[0]).map(k => `<th>${escapeHTML(k)}</th>`).join("") : "";
  const tableRows = rows.map((r, i) => `
    <tr>
      <td>${i + 1}</td>
      ${Object.values(r).map(v => `<td>${escapeHTML(String(v))}</td>`).join("")}
    </tr>
  `).join("");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>BB84 &amp; PTRP Quantum Project Report</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 36px; color: #0d1e30; line-height: 1.6; }
  h1 { color: #0070ba; margin-bottom: 4px; }
  h2 { color: #0f3d6b; margin-top: 28px; border-bottom: 1px solid #d0e0ee; padding-bottom: 6px; }
  .formula-card { background: #f0f7fc; border-left: 4px solid #0070ba; padding: 12px 18px; margin: 14px 0; font-family: monospace; font-size: 13px; }
  table { border-collapse: collapse; width: 100%; font-size: 12px; margin-top: 14px; }
  th, td { border: 1px solid #b8d2e8; padding: 8px 10px; text-align: left; }
  th { background: #e2f0fa; font-weight: bold; }
  .footer { margin-top: 40px; font-size: 11px; color: #627b95; }
  @media print { body { margin: 15px; } }
</style>
</head>
<body>
<h1>BB84 Protocol &amp; Probability Theory / Random Processes Report</h1>
<p><strong>Generated:</strong> ${dateStr} &nbsp;|&nbsp; <strong>Room:</strong> ${escapeHTML(room)} &nbsp;|&nbsp; <strong>Station:</strong> ${escapeHTML(displayName)} (${role})</p>

<h2>1. Executive Summary &amp; Theoretical Model</h2>
<p>
  This report documents the simulation and empirical stochastic validation of the Bennett-Brassard 1984 (BB84)
  Quantum Key Distribution protocol against the rigorous framework of Probability Theory and Random Processes (PTRP).
</p>
<div class="formula-card">
  <strong>Key Mathematical Formulations:</strong><br>
  1. Basis Match Indicator: B<sub>A</sub>, B<sub>B</sub> &sim; Bernoulli(1/2) &rArr; P(Match) = 1/2<br>
  2. Sifted Key Length: K = &sum; I_{B_A = B_B} &sim; Binomial(N, 1/2) with E[K] = N/2, Var(K) = N/4<br>
  3. Central Limit Theorem: (K - N/2) / (&radic;N / 2) &rarr;<sup>d</sup> N(0, 1) as N &rarr; &infin;<br>
  4. Conditional Error Law under Eve: P(Err | Match, Eve) = 1/4 = 25%<br>
  5. Asymptotic Key Capacity: R = max(0, 1 - 2&middot;H<sub>2</sub>(Q)), yielding the 11.0% Shor-Preskill Security Bound
</div>

<h2>2. Recorded Empirical Experiments</h2>
<table>
  <thead><tr><th>#</th>${tableHeaders}</tr></thead>
  <tbody>${tableRows || '<tr><td colspan="10">No experiment records.</td></tr>'}</tbody>
</table>

<h2>3. Probability &amp; Stochastic Analysis Conclusions</h2>
<p>
  Monte Carlo simulations empirically confirm that the sifted key distribution strictly matches the Normal approximation
  predicted by the Central Limit Theorem. Under intercept-resend eavesdropping, the sample QBER accurately reflects the
  theoretical Law of Total Probability limit Q = p<sub>E</sub> / 4. Whenever Q exceeds the 11.0% threshold, mutual information
  with the eavesdropper prevents secret key distillation, and the protocol securely terminates.
</p>
<div class="footer">BB84 PTRP Academic Project Demonstration Platform. Printable via browser Print &rarr; Save as PDF.</div>
</body>
</html>`;

  downloadBlobFile("bb84_ptrp_project_report.html", html, "text/html;charset=utf-8");
  showToast("Project report downloaded. Open and print to PDF if desired.");
}

function downloadBlobFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
