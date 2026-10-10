
/* ============================================================
   BB84 + PTRP QUANTUM CHAT
   Firebase v8 | Classical educational simulation
   ============================================================ */

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
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

let database = null;
let currentRole = localStorage.getItem("quantum_role") || "Alice";
let currentServer = "server_1";

let bb84Key = null;
let bb84KeyBits = "";
let eveEnabled = false;
let isGeneratingKey = false;
let typingTimer = null;
let listeners = [];
let latestStats = null;
let experimentHistory = [];
let processedMessageIds = new Set();
let processedKeyIds = new Set();

/* ---------------- INITIALIZATION ---------------- */

window.addEventListener("load", initializeAppUI);

function initializeAppUI() {
  if (!$("chat-box")) return;

  if ($("user-role")) $("user-role").value = currentRole;
  currentServer = $("server-select")?.value || "server_1";

  const name = localStorage.getItem("quantum_display_name") || currentRole;

  if ($("chat-with")) {
    $("chat-with").textContent = `Chatting as: ${name} (${currentRole})`;
  }

  updatePeerUI();

  if (!window.firebase) {
    showToast("Firebase SDK failed to load.");
    return;
  }

  try {
    if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
    database = firebase.database();

    database.ref(".info/connected").on("value", snapshot => {
      const connected = snapshot.val() === true;
      const element = $("connection-state");

      if (element) {
        element.textContent = connected
          ? "Firebase connected"
          : "Connecting to Firebase…";
        element.classList.toggle("connected", connected);
      }
    });

    attachFirebaseListeners();
  } catch (error) {
    console.error("Firebase initialization error:", error);
    showToast("Firebase initialization failed. Check configuration.");
  }

  if ($("msg-input")) {
    $("msg-input").addEventListener("input", updateTypingStatus);

    $("msg-input").addEventListener("keydown", event => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendMessage();
      }
    });
  }

  drawEmptyCharts();
  addSystemMessage("BB84 lab ready. Select Alice to generate a simulated key.");
}

function updatePeerUI() {
  const peer = currentRole === "Alice" ? "Bob" : "Alice";

  if ($("contact-name")) $("contact-name").textContent = peer;
  if ($("contact-avatar")) $("contact-avatar").textContent = peer[0];

  if ($("room-label") && $("server-select")) {
    $("room-label").textContent =
      $("server-select").selectedOptions[0].textContent;
  }
}

function setRole() {
  localStorage.setItem("quantum_role", $("user-role").value);
  location.reload();
}

function detachListeners() {
  listeners.forEach(ref => ref.off());
  listeners = [];
}

function switchServer() {
  detachListeners();

  currentServer = $("server-select").value;
  bb84Key = null;
  bb84KeyBits = "";
  latestStats = null;
  eveEnabled = false;

  processedMessageIds.clear();
  processedKeyIds.clear();

  if ($("chat-box")) $("chat-box").innerHTML = "";

  if ($("key-status")) {
    $("key-status").textContent = "No shared key";
    $("key-status").classList.remove("key-ready", "key-warning");
  }

  updateEveUI();
  updatePeerUI();
  addSystemMessage("Room changed. Generate a new key to start.");

  if (database) attachFirebaseListeners();
}

/* ---------------- FIREBASE LISTENERS ---------------- */

function attachFirebaseListeners() {
  if (!database) return;

  const room = `servers/${currentServer}`;
  const peer = currentRole === "Alice" ? "Bob" : "Alice";

  // Keys: ignore keys created by this browser role.
  const keysRef = database.ref(`${room}/keys`).orderByChild("time");

  keysRef.on("child_added", snapshot => {
    const data = snapshot.val() || {};

    if (processedKeyIds.has(snapshot.key)) return;
    processedKeyIds.add(snapshot.key);

    if (data.sender === currentRole || !data.keyBits) return;
    if (data.stats && data.stats.keyAccepted === false) return;

    bb84KeyBits = String(data.keyBits);
    bb84Key = parseInt(bb84KeyBits.slice(0, 8).padEnd(8, "0"), 2);

    updateKeyUI(bb84Key, bb84KeyBits);
    updateCurrentStats(data.stats || {});

    addSystemMessage(
      `Simulated BB84 key received from ${data.sender} (${bb84KeyBits.length} bits).`
    );
  }, error => {
    console.error("Key listener error:", error);
    showToast("Cannot read keys. Check Firebase Database Rules.");
  });

  listeners.push(keysRef);

  // Messages: process each Firebase message only once.
  const messagesRef = database.ref(`${room}/messages`).orderByChild("time");

  messagesRef.on("child_added", snapshot => {
    if (processedMessageIds.has(snapshot.key)) return;
    processedMessageIds.add(snapshot.key);

    const data = snapshot.val() || {};
    if (data.sender === currentRole || !Array.isArray(data.payload)) return;

    receiveFromNetwork(data.payload, data.sender);
  }, error => {
    console.error("Message listener error:", error);
    showToast("Cannot read messages. Check Firebase Database Rules.");
  });

  listeners.push(messagesRef);

  // Typing indicator for the other participant.
  const typingRef = database.ref(`${room}/typing_status/${peer}`);

  typingRef.on("value", snapshot => {
    if ($("typing-indicator")) {
      $("typing-indicator").textContent = `${peer} is typing…`;
      $("typing-indicator").style.display =
        snapshot.val() ? "block" : "none";
    }
  });

  listeners.push(typingRef);

  // A single room-state listener replaces repeated Eve alert messages.
  const eveRef = database.ref(`${room}/eveEnabled`);

  eveRef.on("value", snapshot => {
    eveEnabled = snapshot.val() === true;
    updateEveUI();
  }, error => {
    console.error("Eve-state listener error:", error);
  });

  listeners.push(eveRef);
}

/* ---------------- EVE ON/OFF ---------------- */

function updateEveUI() {
  if ($("eve-state")) {
    $("eve-state").textContent = eveEnabled
      ? "● Attack armed for next key"
      : "● Attack disabled";
  }

  if ($("eve-btn")) {
    $("eve-btn").textContent = eveEnabled ? "Disable Eve" : "Enable Eve";
    $("eve-btn").classList.toggle("armed", eveEnabled);
  }

  if ($("analytics-eve")) {
    $("analytics-eve").checked = eveEnabled;
  }
}

async function toggleEveAttack() {
  if (!database) {
    showToast("Firebase is not connected.");
    return;
  }

  const nextState = !eveEnabled;

  try {
    await database.ref(`servers/${currentServer}/eveEnabled`).set(nextState);

    eveEnabled = nextState;
    updateEveUI();

    addSystemMessage(
      nextState
        ? "Eve enabled. The next key simulation will include intercept-resend."
        : "Eve disabled. The next key simulation will run without interception."
    );
  } catch (error) {
    console.error("Could not change Eve state:", error);
    showToast("Could not update Eve state. Check Firebase Rules.");
  }
}

/* ---------------- UI HELPERS ---------------- */

function showToast(message) {
  const toast = $("toast");

  if (!toast) {
    console.warn(message);
    return;
  }

  toast.textContent = `ⓘ ${message}`;
  toast.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 4000);
}

function addSystemMessage(message) {
  const box = $("chat-box");
  if (!box) return;

  const div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = message;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function closeModal() {
  if ($("keyGenModal")) $("keyGenModal").style.display = "none";
}

function toggleCryptoLogs() {
  $("crypto-sidebar")?.classList.toggle("open");
}

function resetBB84Table() {
  [
    "row-bits", "row-s-bases", "row-e-bases",
    "row-r-bases", "row-match", "row-key"
  ].forEach(id => {
    const row = $(id);
    if (!row) return;

    while (row.children.length > 1) row.removeChild(row.lastChild);
  });

  if ($("key-result")) {
    $("key-result").textContent = "";
    $("key-result").classList.remove("security-fail");
  }
}

/* ---------------- BB84 SIMULATION ---------------- */

function randomBit() {
  return Math.random() < 0.5 ? 0 : 1;
}

function randomBasis() {
  return Math.random() < 0.5 ? "+" : "×";
}

function simulateBB84(photonCount = 512, withEve = false) {
  const aliceBits = [];
  const aliceBases = [];
  const eveBases = [];
  const bobBases = [];
  const bobBits = [];
  const matches = [];
  const siftedAlice = [];
  const siftedBob = [];

  for (let i = 0; i < photonCount; i++) {
    const bit = randomBit();
    const aBase = randomBasis();
    const bBase = randomBasis();

    let sentBit = bit;
    let eBase = "—";

    if (withEve) {
      eBase = randomBasis();

      // Eve measuring in the wrong basis obtains a random result.
      if (eBase !== aBase) sentBit = randomBit();
    }

    let receivedBit = sentBit;
    const sentBasis = withEve ? eBase : aBase;

    // Bob gets a random outcome when his basis differs.
    if (bBase !== sentBasis) receivedBit = randomBit();

    const matched = aBase === bBase;

    aliceBits.push(bit);
    aliceBases.push(aBase);
    eveBases.push(eBase);
    bobBases.push(bBase);
    bobBits.push(receivedBit);
    matches.push(matched);

    if (matched) {
      siftedAlice.push(bit);
      siftedBob.push(receivedBit);
    }
  }

  let errors = 0;

  for (let i = 0; i < siftedAlice.length; i++) {
    if (siftedAlice[i] !== siftedBob[i]) errors++;
  }

  return {
    photonCount, withEve, aliceBits, aliceBases, eveBases,
    bobBases, bobBits, matches, siftedAlice, siftedBob, errors,
    qber: siftedAlice.length ? errors / siftedAlice.length : 0,
    matchCount: matches.filter(Boolean).length,
    matchProbability: matches.filter(Boolean).length / photonCount
  };
}

/* ---------------- KEY GENERATION ---------------- */

async function generateBB84Key() {
  if (isGeneratingKey) return;

  if (!database) {
    showToast("Firebase is not connected.");
    return;
  }

  if (currentRole !== "Alice") {
    showToast("Choose Alice to generate a key. Bob receives it automatically.");
    return;
  }

  isGeneratingKey = true;
  bb84Key = null;
  bb84KeyBits = "";

  if ($("keygen-btn")) $("keygen-btn").disabled = true;
  if ($("key-status")) {
    $("key-status").textContent = "Generating…";
    $("key-status").classList.remove("key-ready", "key-warning");
  }
  if ($("keyGenModal")) $("keyGenModal").style.display = "block";

  resetBB84Table();

  const status = $("key-gen-status");
  const photonCount = 512;
  const withEve = eveEnabled;
  const result = simulateBB84(photonCount, withEve);

  try {
    // Reconcile bases; keep only matching positions.
    const siftedIndexes = result.matches
      .map((matched, index) => matched ? index : -1)
      .filter(index => index >= 0);

    // Publicly reveal a random sample and remove it from the final key.
    const shuffled = [...siftedIndexes];

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const sampleCount = Math.floor(siftedIndexes.length * 0.25);
    const sampleIndexes = new Set(shuffled.slice(0, sampleCount));

    let sampleErrors = 0;

    sampleIndexes.forEach(index => {
      if (result.aliceBits[index] !== result.bobBits[index]) sampleErrors++;
    });

    const sampleQber = sampleCount ? sampleErrors / sampleCount : 0;
    const accepted = sampleQber <= 0.11;

    const remainingIndexes = siftedIndexes.filter(
      index => !sampleIndexes.has(index)
    );

    const aliceRemaining = remainingIndexes
      .map(index => result.aliceBits[index]).join("");

    const bobRemaining = remainingIndexes
      .map(index => result.bobBits[index]).join("");

    if (aliceRemaining.length < 8) {
      throw new Error("Too few remaining bits. Generate another key.");
    }

    const keyBits = aliceRemaining.slice(0, 128);
    const bobKeyBits = bobRemaining.slice(0, 128);

    const stats = {
      photons: photonCount,
      matched: result.matchCount,
      siftedBits: result.matchCount,
      matchProbability: result.matchProbability,
      sampleBits: sampleCount,
      sampleErrors,
      qber: sampleQber,
      eve: withEve,
      timestamp: Date.now(),
      keyAccepted: accepted
    };

    latestStats = stats;
    updateCurrentStats(stats);

    // Draw the BB84 transmission table.
    for (let i = 0; i < photonCount; i++) {
      if (status) {
        status.textContent = `Processing photon ${i + 1} of ${photonCount}…`;
      }

      const siftedIndex = result.matches
        .slice(0, i + 1).filter(Boolean).length - 1;

      const siftedBit = result.matches[i]
        ? result.siftedAlice[siftedIndex]
        : "—";

      const cells = [
        ["row-bits", result.aliceBits[i], ""],
        ["row-s-bases", result.aliceBases[i], "cyan"],
        ["row-e-bases", result.eveBases[i], "purple"],
        ["row-r-bases", result.bobBases[i], "teal"],
        ["row-match", result.matches[i] ? "YES" : "NO",
          result.matches[i] ? "good" : "bad"],
        ["row-key", siftedBit, result.matches[i] ? "good" : "dim"]
      ];

      cells.forEach(([rowId, value, className]) => {
        const row = $(rowId);
        if (!row) return;

        const cell = document.createElement("td");
        cell.textContent = String(value);
        if (className) cell.className = className;
        row.appendChild(cell);
      });

      await sleep(2);
    }

    if (!accepted) {
      bb84Key = null;
      bb84KeyBits = "";

      if ($("key-status")) {
        $("key-status").textContent = "Key rejected — high QBER";
        $("key-status").classList.add("key-warning");
        $("key-status").classList.remove("key-ready");
      }

      if ($("key-result")) {
        $("key-result").textContent =
          `Sample QBER: ${(sampleQber * 100).toFixed(2)}%. ` +
          "The sample exceeds the illustrative 11% threshold. No key shared.";
        $("key-result").classList.add("security-fail");
      }

      addSystemMessage(
        `BB84 key rejected. Sample QBER ${(sampleQber * 100).toFixed(2)}%.`
      );

      showToast("Key rejected. Disable Eve or generate a fresh key.");
      return;
    }

    /*
      This is a simulation shortcut. In real BB84, both parties derive
      the key through reconciliation and privacy amplification.
      Never publish a real secret key to Firebase.
    */
    if (keyBits !== bobKeyBits) {
      throw new Error("Alice and Bob's remaining simulated bits differ.");
    }

    bb84KeyBits = keyBits;
    bb84Key = parseInt(keyBits.slice(0, 8), 2);

    updateKeyUI(bb84Key, keyBits);

    if ($("key-result")) {
      $("key-result").textContent =
        `${keyBits.length} demo bits | ` +
        `Basis match ${(result.matchProbability * 100).toFixed(1)}% | ` +
        `Sample QBER ${(sampleQber * 100).toFixed(1)}% | Accepted`;
    }

    if (status) status.textContent = "Key accepted. Synchronizing demo key…";

    await database.ref(`servers/${currentServer}/keys`).push({
      sender: currentRole,
      keyBits,
      time: Date.now(),
      stats,
      simulationOnly: true
    });

    addSystemMessage(
      `Key accepted: ${result.matchCount} matching bases; ` +
      `sample QBER ${(sampleQber * 100).toFixed(1)}%.`
    );

    addCryptoLog("BB84 key generation", [
      ["Photons", photonCount],
      ["Matching bases", result.matchCount],
      ["Empirical P(match)", result.matchProbability.toFixed(3)],
      ["Sample bits", sampleCount],
      ["Sample errors", sampleErrors],
      ["Sample QBER", `${(sampleQber * 100).toFixed(2)}%`],
      ["Eve", withEve ? "Enabled" : "Disabled"],
      ["Accepted", "Yes"]
    ], "var(--cyan)");

    experimentHistory.push({
      time: new Date().toISOString(),
      type: "BB84",
      photons: photonCount,
      matchingBases: result.matchCount,
      matchProbability: result.matchProbability,
      qber: sampleQber,
      eve: withEve,
      sampleBits: sampleCount,
      sampleErrors,
      accepted
    });

  } catch (error) {
    console.error("Key generation error:", error);
    if (status) status.textContent = error.message || "Key generation failed.";
    showToast(`Key generation failed: ${error.message || "Unknown error"}`);
  } finally {
    isGeneratingKey = false;
    if ($("keygen-btn")) $("keygen-btn").disabled = false;
    await sleep(400);
    closeModal();
  }
}

function updateKeyUI(key, bits) {
  if (!$("key-status")) return;

  $("key-status").textContent =
    `KEY READY · ${Number(key).toString(2).padStart(8, "0")}`;
  $("key-status").classList.add("key-ready");
  $("key-status").classList.remove("key-warning");
  $("key-status").title = `${bits.length} simulated bits`;
}

/* This function fixes the original updateCurrentStats ReferenceError. */
function updateCurrentStats(stats = {}) {
  const match = Number(stats.matchProbability ?? 0);
  const sifted = Number(stats.siftedBits ?? stats.matched ?? 0);
  const qber = Number(stats.qber ?? 0);
  const eve = Boolean(stats.eve);

  if ($("metric-match")) {
    $("metric-match").textContent = `${(match * 100).toFixed(1)}%`;
  }
  if ($("metric-sifted")) {
    $("metric-sifted").textContent = sifted.toFixed(1);
  }
  if ($("metric-qber")) {
    $("metric-qber").textContent = `${(qber * 100).toFixed(1)}%`;
  }
  if ($("metric-qber-note")) {
    $("metric-qber-note").textContent =
      eve ? "Eve included in this simulation" : "No Eve: ideally 0%";
  }
  if ($("metric-eve")) {
    $("metric-eve").textContent = eve ? "Enabled" : "Disabled";
  }
}

/* ---------------- DEMO CHAT ENCODING ---------------- */

function xorEncrypt(text, keyByte) {
  return Array.from(new TextEncoder().encode(text)).map(
    byte => (byte ^ keyByte).toString(2).padStart(8, "0")
  );
}

function xorDecrypt(payload, keyByte) {
  const bytes = payload.map(binary => parseInt(binary, 2) ^ keyByte);
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function sendMessage() {
  const input = $("msg-input");
  if (!input) return;

  const messageText = input.value.trim();
  if (!messageText) return;

  if (!database) {
    showToast("Firebase is not connected.");
    return;
  }

  if (bb84Key === null) {
    showToast("Generate or receive an accepted demo key first.");
    return;
  }

  const payload = xorEncrypt(messageText, bb84Key);

  database.ref(`servers/${currentServer}/messages`).push({
    sender: currentRole,
    payload,
    time: Date.now(),
    simulationOnly: true
  }).then(() => {
    displayMessage(currentRole, messageText, payload.join(" "), "sent");
    input.value = "";

    database.ref(`servers/${currentServer}/typing_status/${currentRole}`)
      .set(false).catch(console.error);

    addCryptoLog("Message encoded", [
      ["UTF-8 bytes", payload.length],
      ["Demo XOR byte", bb84Key],
      ["Payload", payload.join(" ")]
    ], "var(--cyan)");
  }).catch(error => {
    console.error("Message write failed:", error);
    showToast(`Message send failed: ${error.message}`);
  });
}

function receiveFromNetwork(payload, sender) {
  if (bb84Key === null) {
    displayMessage(sender, "Locked content 🔐", payload.join(" "), "received");
    addSystemMessage("Message received, but this browser has no demo key.");
    return;
  }

  try {
    const plaintext = xorDecrypt(payload, bb84Key);
    displayMessage(sender, plaintext, payload.join(" "), "received");

    addCryptoLog("Message decoded", [
      ["Sender", sender],
      ["Payload", payload.join(" ")],
      ["Recovered text", plaintext]
    ], "var(--teal)");
  } catch (error) {
    console.error("Message decoding failed:", error);
    showToast("Could not decode the message.");
  }
}

function displayMessage(sender, messageText, payloadText, type) {
  const box = $("chat-box");
  if (!box) return;

  const message = document.createElement("div");
  message.className = `message ${type}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const name = document.createElement("strong");
  name.textContent = sender;

  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit"
  });

  meta.append(name, time);

  const body = document.createElement("div");
  body.className = "message-text";
  body.textContent = messageText;

  const details = document.createElement("details");
  details.className = "payload-details";

  const summary = document.createElement("summary");
  summary.textContent = "View network payload";

  const code = document.createElement("code");
  code.textContent = payloadText;

  details.append(summary, code);
  message.append(meta, body, details);
  box.appendChild(message);
  box.scrollTop = box.scrollHeight;
}

function updateTypingStatus() {
  if (!database) return;

  database.ref(`servers/${currentServer}/typing_status/${currentRole}`)
    .set(true).catch(() => {});

  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    database.ref(`servers/${currentServer}/typing_status/${currentRole}`)
      .set(false).catch(() => {});
  }, 1200);
}

/* ---------------- CRYPTO LOGS ---------------- */

function addCryptoLog(title, rows, color) {
  const wrap = $("crypto-log-content");
  if (!wrap) return;

  wrap.querySelector(".empty-state")?.remove();

  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.style.borderLeftColor = color;

  const heading = document.createElement("strong");
  heading.textContent = `[${title}]`;
  heading.style.color = color;

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

  entry.append(heading, table);
  wrap.prepend(entry);
}

/* ---------------- PTRP MONTE CARLO ---------------- */

function runMonteCarlo() {
  const trialSelect = $("trial-count");
  const eveCheckbox = $("analytics-eve");
  if (!trialSelect || !eveCheckbox) return;

  const trials = Math.max(1, Math.min(10000, Number(trialSelect.value) || 500));
  const withEve = eveCheckbox.checked;
  const button = $("run-experiment-btn");

  if (button) {
    button.disabled = true;
    button.textContent = "Running experiment…";
  }

  setTimeout(() => {
    try {
      let matches = 0;
      let siftedTotal = 0;
      let siftedSquaredTotal = 0;
      let errorTotal = 0;

      const lengths = [];
      const qbers = [];

      for (let i = 0; i < trials; i++) {
        const result = simulateBB84(128, withEve);

        matches += result.matchCount;
        siftedTotal += result.siftedAlice.length;
        siftedSquaredTotal += result.siftedAlice.length ** 2;
        errorTotal += result.errors;

        lengths.push(result.siftedAlice.length);
        qbers.push(result.qber);
      }

      const empiricalMatch = matches / (trials * 128);
      const mean = siftedTotal / trials;
      const variance = Math.max(
        0, siftedSquaredTotal / trials - mean ** 2
      );
      const qber = siftedTotal ? errorTotal / siftedTotal : 0;

      experimentHistory.push({
        time: new Date().toISOString(),
        type: "PTRP Monte Carlo",
        trials,
        eve: withEve,
        matchProbability: empiricalMatch,
        meanSifted: mean,
        variance,
        qber
      });

      updateCurrentStats({
        matchProbability: empiricalMatch,
        siftedBits: mean,
        qber,
        eve: withEve
      });

      drawBarChart($("matchChart"), [
        { label: "Observed", value: empiricalMatch, color: "#00c2ff" },
        { label: "Theory", value: .5, color: "#5bc0be" }
      ], 0, 1);

      drawHistogram($("siftChart"), lengths, 32, 96);
      drawLineChart($("qberChart"), qbers.slice(0, 200), .5, withEve ? .25 : 0);

      if ($("experiment-summary")) {
        $("experiment-summary").dataset.ran = "true";
        $("experiment-summary").textContent =
          `${trials.toLocaleString()} trials × 128 photons | ` +
          `Eve: ${withEve ? "ON" : "OFF"} | ` +
          `P(match): ${(empiricalMatch * 100).toFixed(2)}% (theory 50%) | ` +
          `Mean sifted bits: ${mean.toFixed(2)} (theory 64) | ` +
          `Variance: ${variance.toFixed(2)} (theory 32) | ` +
          `QBER: ${(qber * 100).toFixed(2)}% ` +
          `(ideal ${withEve ? "about 25%" : "0%"})`;
      }

      addCryptoLog("PTRP Monte Carlo", [
        ["Trials", trials],
        ["Eve", withEve ? "Enabled" : "Disabled"],
        ["P(match)", empiricalMatch.toFixed(4)],
        ["Mean sifted bits", mean.toFixed(3)],
        ["Variance", variance.toFixed(3)],
        ["QBER", `${(qber * 100).toFixed(2)}%`]
      ], "var(--teal)");

    } catch (error) {
      console.error("Monte Carlo error:", error);
      showToast("PTRP experiment failed. Check the Console.");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Run experiment";
      }
    }
  }, 20);
}

function toggleAnalytics(forceOpen) {
  const modal = $("analyticsModal");
  if (!modal) return;

  const open = typeof forceOpen === "boolean"
    ? forceOpen
    : modal.style.display !== "block";

  modal.style.display = open ? "block" : "none";

  if (open && !$("experiment-summary")?.dataset.ran) runMonteCarlo();
}

/* ---------------- CHARTS ---------------- */

function canvasSetup(canvas) {
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 210;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b1425";
  ctx.fillRect(0, 0, width, height);
  ctx.font = "11px Arial, sans-serif";

  return {
    ctx, width, height,
    pad: { left: 42, right: 16, top: 18, bottom: 34 }
  };
}

function drawBarChart(canvas, bars, min, max) {
  const chart = canvasSetup(canvas);
  if (!chart) return;

  const { ctx, width, height, pad } = chart;
  const ph = height - pad.top - pad.bottom;
  const pw = width - pad.left - pad.right;

  ctx.strokeStyle = "#25364b";

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + ph * i / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.fillStyle = "#8ca3bd";
    ctx.fillText((max - (max - min) * i / 4).toFixed(2), 4, y + 4);
  }

  const slot = pw / Math.max(1, bars.length);

  bars.forEach((bar, i) => {
    const barH = Math.max(0, (bar.value - min) / (max - min)) * ph;
    const x = pad.left + i * slot + slot * .23;
    const y = height - pad.bottom - barH;

    ctx.fillStyle = bar.color;
    ctx.fillRect(x, y, slot * .54, barH);
    ctx.fillStyle = "#e6f0ff";
    ctx.textAlign = "center";
    ctx.fillText(bar.label, x + slot * .27, height - 12);
    ctx.fillText(bar.value.toFixed(3), x + slot * .27, Math.max(12, y - 6));
  });

  ctx.textAlign = "left";
}

function drawHistogram(canvas, values, min, max) {
  const chart = canvasSetup(canvas);
  if (!chart) return;

  const { ctx, width, height, pad } = chart;
  const step = 4;
  const bins = [];

  for (let value = min; value <= max; value += step) {
    bins.push({ label: String(value), count: 0 });
  }

  values.forEach(value => {
    const i = Math.max(0, Math.min(
      bins.length - 1, Math.floor((value - min) / step)
    ));
    bins[i].count++;
  });

  const ph = height - pad.top - pad.bottom;
  const pw = width - pad.left - pad.right;
  const maxCount = Math.max(1, ...bins.map(bin => bin.count));
  const slot = pw / bins.length;

  ctx.strokeStyle = "#25364b";

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + ph * i / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  bins.forEach((bin, i) => {
    const barH = bin.count / maxCount * ph;

    ctx.fillStyle = "#00c2ff";
    ctx.fillRect(
      pad.left + i * slot + 1,
      height - pad.bottom - barH,
      Math.max(1, slot - 2),
      barH
    );

    if (i % 4 === 0) {
      ctx.fillStyle = "#8ca3bd";
      ctx.fillText(bin.label, pad.left + i * slot, height - 12);
    }
  });

  ctx.fillStyle = "#8ca3bd";
  ctx.fillText(`Trials: ${values.length}`, pad.left, pad.top + 12);
}

function drawLineChart(canvas, values, maxY, theoryY) {
  const chart = canvasSetup(canvas);
  if (!chart) return;

  const { ctx, width, height, pad } = chart;
  const ph = height - pad.top - pad.bottom;
  const pw = width - pad.left - pad.right;

  ctx.strokeStyle = "#25364b";

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + ph * i / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = "#8ca3bd";
    ctx.fillText(`${(maxY * (1 - i / 4) * 100).toFixed(0)}%`, 4, y + 4);
  }

  if (values.length) {
    ctx.strokeStyle = "#00c2ff";
    ctx.lineWidth = 2;
    ctx.beginPath();

    values.forEach((value, i) => {
      const x = pad.left + (values.length === 1 ? 0 : i / (values.length - 1)) * pw;
      const y = pad.top + ph - Math.min(maxY, value) / maxY * ph;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
  } else {
    ctx.fillStyle = "#8ca3bd";
    ctx.fillText("Run an experiment to view QBER", pad.left + 8, pad.top + ph / 2);
  }

  if (theoryY > 0) {
    const y = pad.top + ph - theoryY / maxY * ph;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#5bc0be";
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#5bc0be";
    ctx.fillText("Theory 25%", width - pad.right - 70, y - 5);
  }
}

function drawEmptyCharts() {
  drawBarChart($("matchChart"), [
    { label: "Observed", value: 0, color: "#00c2ff" },
    { label: "Theory", value: .5, color: "#5bc0be" }
  ], 0, 1);

  drawHistogram($("siftChart"), [], 32, 96);
  drawLineChart($("qberChart"), [], .5, 0);
}

/* ---------------- CSV EXPORT ---------------- */

function exportExperimentCSV() {
  if (!experimentHistory.length) {
    showToast("Run a BB84 or PTRP experiment before exporting.");
    return;
  }

  const columns = [
    "time", "type", "trials", "photons", "matchingBases",
    "matchProbability", "meanSifted", "variance", "qber",
    "eve", "sampleBits", "sampleErrors", "accepted"
  ];

  const escapeCSV = value =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const csv = [
    columns.join(","),
    ...experimentHistory.map(row =>
      columns.map(column => escapeCSV(row[column])).join(",")
    )
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob([csv], {
    type: "text/csv;charset=utf-8;"
  }));

  const link = document.createElement("a");
  link.href = url;
  link.download = "bb84_ptrp_experiments.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);

  showToast("CSV experiment report downloaded.");
}

window.addEventListener("resize", () => {
  if ($("analyticsModal")?.style.display === "block") {
    drawEmptyCharts();
  }
});
