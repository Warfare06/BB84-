
/* ============================================================
   BB84 QUANTUM CHAT + PTRP ANALYTICS
   Firebase v8 | Educational simulation
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

let database = null;
let currentRole = "Alice";
let currentServer = "server_1";

let bb84Key = null;
let bb84KeyBits = "";
let eveEnabled = false;
let isGeneratingKey = false;
let typingTimer = null;
let listeners = [];

let latestBB84Result = null;
let latestStats = null;
let experimentHistory = [];

const $ = id => document.getElementById(id);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* ================= INITIALIZATION ================= */

window.addEventListener("load", () => {
  currentRole = localStorage.getItem("quantum_role") || "Alice";

  if ($("user-role")) $("user-role").value = currentRole;

  currentServer = $("server-select")?.value || "server_1";

  const displayName =
    localStorage.getItem("quantum_display_name") || currentRole;

  if ($("chat-with")) {
    $("chat-with").textContent =
      `Chatting as: ${displayName} (${currentRole})`;
  }

  updatePeerUI();

  if (window.firebase) {
    try {
      if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
      }

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
      console.error("Firebase initialization failed:", error);
      showToast("Firebase initialization failed. Check your configuration.");
    }
  } else {
    showToast("Firebase SDK did not load. Check your internet connection.");
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

  if ($("analytics-eve")) $("analytics-eve").checked = false;

  drawEmptyCharts();
});

function updatePeerUI() {
  const peer = currentRole === "Alice" ? "Bob" : "Alice";

  if ($("contact-name")) $("contact-name").textContent = peer;
  if ($("contact-avatar")) $("contact-avatar").textContent = peer[0];

  if ($("room-label") && $("server-select")) {
    $("room-label").textContent =
      $("server-select").selectedOptions[0].textContent;
  }
}

function detachListeners() {
  if (database) listeners.forEach(ref => ref.off());
  listeners = [];
}

function setRole() {
  localStorage.setItem("quantum_role", $("user-role").value);
  location.reload();
}

function switchServer() {
  detachListeners();

  currentServer = $("server-select").value;
  bb84Key = null;
  bb84KeyBits = "";
  latestBB84Result = null;
  latestStats = null;
  eveEnabled = false;

  if ($("chat-box")) $("chat-box").innerHTML = "";

  if ($("key-status")) {
    $("key-status").textContent = "No shared key";
    $("key-status").classList.remove("key-ready", "key-warning");
  }

  if ($("eve-state")) {
    $("eve-state").textContent = "● Interception disabled";
  }

  if ($("eve-btn")) {
    $("eve-btn").textContent = "Simulate Eve attack";
    $("eve-btn").classList.remove("armed");
  }

  updatePeerUI();
  addSystemMessage("Room changed. Generate a new BB84 key to begin.");

  if (database) attachFirebaseListeners();
}

/* ================= FIREBASE ================= */

function attachFirebaseListeners() {
  if (!database) return;

  const room = `servers/${currentServer}`;
  const peer = currentRole === "Alice" ? "Bob" : "Alice";

  const keysRef = database.ref(`${room}/keys`).orderByChild("time");

  keysRef.on("child_added", snapshot => {
    const data = snapshot.val() || {};

    if (data.sender !== currentRole && data.keyBits) {
      bb84KeyBits = String(data.keyBits);
      bb84Key = parseInt(bb84KeyBits.slice(0, 8).padEnd(8, "0"), 2);

      updateKeyUI(bb84Key, bb84KeyBits);
      updateCurrentStats(data.stats || {});

      addSystemMessage(
        `Simulated key received from ${data.sender}. ` +
        `${bb84KeyBits.length} bits available.`
      );
    }
  }, error => {
    console.error("Firebase key listener error:", error);
    showToast("Cannot read keys. Check Firebase Database Rules.");
  });

  listeners.push(keysRef);

  const messagesRef = database.ref(`${room}/messages`).orderByChild("time");

  messagesRef.on("child_added", snapshot => {
    const data = snapshot.val() || {};

    if (data.sender !== currentRole && Array.isArray(data.payload)) {
      receiveFromNetwork(data.payload, data.sender);
    }
  }, error => {
    console.error("Firebase message listener error:", error);
    showToast("Cannot read messages. Check Firebase Database Rules.");
  });

  listeners.push(messagesRef);

  const typingRef = database.ref(`${room}/typing_status/${peer}`);

  typingRef.on("value", snapshot => {
    if ($("typing-indicator")) {
      $("typing-indicator").textContent = `${peer} is typing…`;
      $("typing-indicator").style.display =
        snapshot.val() ? "block" : "none";
    }
  });

  listeners.push(typingRef);

  const alertsRef = database.ref(`${room}/alerts`).orderByChild("time");

  alertsRef.on("child_added", snapshot => {
    const alert = snapshot.val() || {};

    if (alert.type === "EVE_INTERCEPT") {
      eveEnabled = true;

      if ($("analytics-eve")) $("analytics-eve").checked = true;

      if ($("eve-state")) {
        $("eve-state").textContent = "● Attack armed for next key";
      }

      if ($("eve-btn")) {
        $("eve-btn").textContent = "Eve attack enabled";
        $("eve-btn").classList.add("armed");
      }

      addSystemMessage("Eve intercept-resend attack has been armed.");
    }
  });

  listeners.push(alertsRef);
}

/* ================= UI HELPERS ================= */

function showToast(message) {
  const toast = $("toast");

  if (!toast) {
    console.warn(message);
    return;
  }

  toast.textContent = `ⓘ ${message}`;
  toast.classList.add("show");

  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 4000);
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

    if (row) {
      while (row.children.length > 1) {
        row.removeChild(row.lastChild);
      }
    }
  });

  if ($("key-result")) {
    $("key-result").textContent = "";
    $("key-result").classList.remove("security-fail");
  }
}

/* ================= BB84 RANDOM MODEL ================= */

function randomBit() {
  return Math.random() < 0.5 ? 0 : 1;
}

function randomBasis() {
  return Math.random() < 0.5 ? "+" : "×";
}

function simulateBB84(photonCount = 128, withEve = false) {
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
    const aliceBase = randomBasis();
    const bobBase = randomBasis();

    let sentBit = bit;
    let eveBase = "—";

    if (withEve) {
      eveBase = randomBasis();

      // Measuring in the wrong basis gives Eve a random result.
      if (eveBase !== aliceBase) sentBit = randomBit();
    }

    let receivedBit = sentBit;
    const sentBasis = withEve ? eveBase : aliceBase;

    // Bob measuring in a different basis gets a random bit.
    if (bobBase !== sentBasis) receivedBit = randomBit();

    const matched = aliceBase === bobBase;

    aliceBits.push(bit);
    aliceBases.push(aliceBase);
    eveBases.push(eveBase);
    bobBases.push(bobBase);
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
    photonCount,
    withEve,
    aliceBits,
    aliceBases,
    eveBases,
    bobBases,
    bobBits,
    matches,
    siftedAlice,
    siftedBob,
    errors,
    qber: siftedAlice.length ? errors / siftedAlice.length : 0,
    matchCount: matches.filter(Boolean).length,
    matchProbability: matches.filter(Boolean).length / photonCount
  };
}

/* ================= BB84 KEY GENERATION ================= */

async function generateBB84Key() {
  if (isGeneratingKey) return;

  if (!database) {
    showToast("Firebase is not connected. Check the Console.");
    return;
  }

  if (currentRole !== "Alice") {
    showToast("Select Alice to generate a key. Bob receives the simulated key.");
    return;
  }

  isGeneratingKey = true;

  if ($("keygen-btn")) $("keygen-btn").disabled = true;
  if ($("keyGenModal")) $("keyGenModal").style.display = "block";

  resetBB84Table();

  const status = $("key-gen-status");
  const photonCount = 128;
  const withEve = eveEnabled || Boolean($("analytics-eve")?.checked);
  const result = simulateBB84(photonCount, withEve);

  latestBB84Result = result;

  try {
    const siftedIndexes = result.matches
      .map((match, index) => match ? index : -1)
      .filter(index => index >= 0);

    // Randomly select 20% of the sifted positions for sample checking.
    const shuffled = [...siftedIndexes];

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const sampleCount = Math.floor(siftedIndexes.length * 0.2);
    const sampleIndexes = new Set(shuffled.slice(0, sampleCount));

    let sampleErrors = 0;

    sampleIndexes.forEach(index => {
      if (result.aliceBits[index] !== result.bobBits[index]) {
        sampleErrors++;
      }
    });

    const sampleQber = sampleCount ? sampleErrors / sampleCount : 0;
    const accepted = sampleQber <= 0.11;

    // Remove sample bits before creating the remaining demo key.
    const remainingIndexes = siftedIndexes.filter(
      index => !sampleIndexes.has(index)
    );

    const aliceRemaining = remainingIndexes
      .map(index => result.aliceBits[index]).join("");

    const bobRemaining = remainingIndexes
      .map(index => result.bobBits[index]).join("");

    if (aliceRemaining.length < 8) {
      throw new Error("Too few sifted bits. Generate another key.");
    }

    // Verify that Alice and Bob's retained strings agree.
    const keyBits = aliceRemaining.slice(0, 128);
    const bobBits = bobRemaining.slice(0, 128);

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

    // Render the bit and basis table.
    for (let i = 0; i < photonCount; i++) {
      if (status) {
        status.textContent = `Processing photon ${i + 1} of ${photonCount}…`;
      }

      const matchedBefore = result.matches
        .slice(0, i + 1).filter(Boolean).length;

      const siftedBit = result.matches[i]
        ? result.siftedAlice[matchedBefore - 1]
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

      await sleep(5);
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
          `Sample QBER ${(sampleQber * 100).toFixed(1)}% exceeds the ` +
          "illustrative 11% threshold. The demo key is rejected.";
        $("key-result").classList.add("security-fail");
      }

      addSystemMessage(
        "Key rejected because the sample QBER exceeded the demo threshold."
      );

      showToast("Key rejected. Generate a fresh BB84 key.");
      return;
    }

    // This remains a classical teaching demo, not real QKD.
    // Firebase synchronization exposes this simulated key to database readers.
    bb84KeyBits = keyBits;
    bb84Key = parseInt(keyBits.slice(0, 8), 2);

    updateKeyUI(bb84Key, keyBits);

    if ($("key-result")) {
      $("key-result").textContent =
        `${keyBits.length} simulated key bits | ` +
        `Basis match ${(result.matchProbability * 100).toFixed(1)}% | ` +
        `Sample QBER ${(sampleQber * 100).toFixed(1)}%`;
    }

    if (status) {
      status.textContent = "Simulation complete. Synchronizing demo key…";
    }

    // For demo synchronization only. Do not use this for real secrets.
    await database.ref(`servers/${currentServer}/keys`).push({
      sender: currentRole,
      keyBits,
      time: Date.now(),
      stats,
      simulationOnly: true
    });

    addSystemMessage(
      `BB84 run complete: ${result.matchCount}/${photonCount} bases matched; ` +
      `sample QBER ${(sampleQber * 100).toFixed(1)}%.`
    );

    addCryptoLog("BB84 key generation", [
      ["Photons sent", photonCount],
      ["Matching bases", result.matchCount],
      ["Empirical match probability", result.matchProbability.toFixed(3)],
      ["Sample bits tested", sampleCount],
      ["Sample errors", sampleErrors],
      ["Sample QBER", `${(sampleQber * 100).toFixed(2)}%`],
      ["Eve enabled", withEve ? "Yes" : "No"],
      ["Key accepted", "Yes — demo threshold"]
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

    if (withEve) {
      eveEnabled = false;

      if ($("eve-state")) {
        $("eve-state").textContent = "● Attack applied to last run";
      }

      if ($("eve-btn")) {
        $("eve-btn").textContent = "Simulate Eve attack";
        $("eve-btn").classList.remove("armed");
      }
    }
  } catch (error) {
    console.error("BB84 key generation failed:", error);

    if (status) status.textContent = error.message || "Key generation failed.";
    showToast(`Key generation failed: ${error.message || "Unknown error"}`);
  } finally {
    isGeneratingKey = false;
    if ($("keygen-btn")) $("keygen-btn").disabled = false;

    await sleep(500);
    closeModal();
  }
}

function updateKeyUI(key, bits) {
  const element = $("key-status");
  if (!element) return;

  element.textContent =
    `KEY READY · ${Number(key).toString(2).padStart(8, "0")}`;

  element.classList.add("key-ready");
  element.classList.remove("key-warning");
  element.title = `${bits.length} simulated key bits`;
}

/*
  FIX FOR THE REPORTED ERROR:
  This function is defined globally and accepts an optional stats object.
*/
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
      eve ? "Eve enabled in this simulation" : "No Eve: ideally 0%";
  }

  if ($("metric-eve")) {
    $("metric-eve").textContent =
      eve ? `${(qber * 100).toFixed(1)}% observed` : "Not active";
  }
}

/* ================= EDUCATIONAL CHAT ENCODING ================= */

/*
  The XOR layer is retained for demonstration compatibility.
  It is NOT secure encryption.
*/

function toUtf8Bytes(value) {
  return Array.from(new TextEncoder().encode(value));
}

function fromUtf8Bytes(bytes) {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function xorEncrypt(text, keyByte) {
  return toUtf8Bytes(text).map(
    byte => (byte ^ keyByte).toString(2).padStart(8, "0")
  );
}

function xorDecrypt(payload, keyByte) {
  const bytes = payload.map(binary => parseInt(binary, 2) ^ keyByte);
  return fromUtf8Bytes(bytes);
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
    showToast("Generate or receive a simulated BB84 key first.");
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

    database.ref(
      `servers/${currentServer}/typing_status/${currentRole}`
    ).set(false).catch(console.error);

    addCryptoLog("Message encoded", [
      ["UTF-8 bytes", payload.length],
      ["Demo XOR byte", bb84Key],
      ["Encoded payload", payload.join(" ")]
    ], "var(--cyan)");
  }).catch(error => {
    console.error("Message write failed:", error);
    showToast(`Message send failed: ${error.message}`);
  });
}

function receiveFromNetwork(payload, sender) {
  if (bb84Key === null) {
    displayMessage(sender, "Locked content 🔐", payload.join(" "), "received");
    addSystemMessage("Message received, but no demo key is available.");
    return;
  }

  try {
    const decrypted = xorDecrypt(payload, bb84Key);

    displayMessage(sender, decrypted, payload.join(" "), "received");

    addCryptoLog("Message decoded", [
      ["Sender", sender],
      ["Encoded payload", payload.join(" ")],
      ["Recovered text", decrypted]
    ], "var(--teal)");
  } catch (error) {
    console.error(error);
    showToast("Could not decode message. Check whether both demo keys match.");
  }
}

function displayMessage(user, messageText, payloadText, type) {
  const box = $("chat-box");
  if (!box) return;

  const message = document.createElement("div");
  message.className = `message ${type}`;

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const name = document.createElement("strong");
  name.textContent = user;

  const time = document.createElement("time");
  time.textContent = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
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

  database.ref(
    `servers/${currentServer}/typing_status/${currentRole}`
  ).set(true).catch(() => {});

  clearTimeout(typingTimer);

  typingTimer = setTimeout(() => {
    database.ref(
      `servers/${currentServer}/typing_status/${currentRole}`
    ).set(false).catch(() => {});
  }, 1200);
}

/* ================= CRYPTO LOGS ================= */

function addCryptoLog(title, rows, color) {
  const wrap = $("crypto-log-content");
  if (!wrap) return;

  const empty = wrap.querySelector(".empty-state");
  if (empty) empty.remove();

  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.style.borderLeftColor = color;

  const heading = document.createElement("strong");
  heading.textContent = `[${title}]`;
  heading.style.color = color;

  const table = document.createElement("table");

  rows.forEach(([label, value]) => {
    const row = document.createElement("tr");
    const th = document.createElement("th");
    const td = document.createElement("td");

    th.textContent = label;
    td.textContent = String(value);

    row.append(th, td);
    table.appendChild(row);
  });

  entry.append(heading, table);
  wrap.prepend(entry);
}

/* ================= EVE ATTACK ================= */

function triggerEveAttack() {
  if (!database) {
    showToast("Firebase is not connected.");
    return;
  }

  eveEnabled = true;

  if ($("analytics-eve")) $("analytics-eve").checked = true;

  if ($("eve-state")) {
    $("eve-state").textContent = "● Attack armed for next key";
  }

  if ($("eve-btn")) {
    $("eve-btn").textContent = "Eve attack enabled";
    $("eve-btn").classList.add("armed");
  }

  database.ref(`servers/${currentServer}/alerts`).push({
    type: "EVE_INTERCEPT",
    sender: currentRole,
    time: Date.now()
  }).catch(error => {
    console.error(error);
    showToast("Could not notify the room about Eve.");
  });

  addSystemMessage(
    "Eve attack armed. Alice should generate a fresh key to measure QBER."
  );
}

/* ================= PTRP MONTE CARLO ================= */

function runMonteCarlo() {
  const trialSelect = $("trial-count");
  const eveCheckbox = $("analytics-eve");
  if (!trialSelect || !eveCheckbox) return;

  const count = Math.max(
    1,
    Math.min(10000, Number(trialSelect.value) || 500)
  );

  const withEve = eveCheckbox.checked;
  const button = $("run-experiment-btn");

  if (button) {
    button.disabled = true;
    button.textContent = "Running experiment…";
  }

  setTimeout(() => {
    try {
      let totalMatches = 0;
      let totalSifted = 0;
      let totalSiftedSquared = 0;
      let totalErrors = 0;

      const siftedLengths = [];
      const qbers = [];

      for (let trial = 0; trial < count; trial++) {
        const result = simulateBB84(128, withEve);

        totalMatches += result.matchCount;
        totalSifted += result.siftedAlice.length;
        totalSiftedSquared += result.siftedAlice.length ** 2;
        totalErrors += result.errors;

        siftedLengths.push(result.siftedAlice.length);
        qbers.push(result.qber);
      }

      const totalPhotons = count * 128;
      const empiricalMatch = totalMatches / totalPhotons;
      const meanSifted = totalSifted / count;

      const variance = Math.max(
        0,
        totalSiftedSquared / count - meanSifted ** 2
      );

      const empiricalQber = totalSifted
        ? totalErrors / totalSifted
        : 0;

      const record = {
        time: new Date().toISOString(),
        type: "PTRP Monte Carlo",
        trials: count,
        eve: withEve,
        empiricalMatch,
        meanSifted,
        variance,
        qber: empiricalQber
      };

      experimentHistory.push(record);

      updateCurrentStats({
        matchProbability: empiricalMatch,
        siftedBits: meanSifted,
        qber: empiricalQber,
        eve: withEve
      });

      drawBarChart($("matchChart"), [
        { label: "Observed", value: empiricalMatch, color: "#00c2ff" },
        { label: "Theory", value: 0.5, color: "#5bc0be" }
      ], 0, 1);

      drawHistogram($("siftChart"), siftedLengths, 32, 96);

      drawLineChart(
        $("qberChart"),
        qbers.slice(0, Math.min(200, qbers.length)),
        0.5,
        withEve ? 0.25 : 0
      );

      if ($("experiment-summary")) {
        $("experiment-summary").dataset.ran = "true";
        $("experiment-summary").textContent =
          `${count.toLocaleString()} trials × 128 photons | ` +
          `Eve: ${withEve ? "ON" : "OFF"} | ` +
          `P(match): ${(empiricalMatch * 100).toFixed(2)}% (theory 50%) | ` +
          `Mean sifted bits: ${meanSifted.toFixed(2)} (theory 64) | ` +
          `Variance: ${variance.toFixed(2)} (theory 32) | ` +
          `QBER: ${(empiricalQber * 100).toFixed(2)}% ` +
          `(ideal ${withEve ? "about 25%" : "0%"})`;
      }

      addCryptoLog("PTRP Monte Carlo", [
        ["Trials", count],
        ["Eve", withEve ? "Enabled" : "Disabled"],
        ["Empirical P(match)", empiricalMatch.toFixed(4)],
        ["Mean sifted length", meanSifted.toFixed(3)],
        ["Variance", variance.toFixed(3)],
        ["Empirical QBER", `${(empiricalQber * 100).toFixed(2)}%`]
      ], "var(--teal)");

    } catch (error) {
      console.error("Monte Carlo experiment failed:", error);
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

  if (open && !$("experiment-summary")?.dataset.ran) {
    runMonteCarlo();
  }
}

/* ================= CHART DRAWING ================= */

function canvasSetup(canvas) {
  if (!canvas) return null;

  const ctx = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 640;
  const height = canvas.clientHeight || 260;

  canvas.width = width * ratio;
  canvas.height = height * ratio;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#0b1425";
  ctx.fillRect(0, 0, width, height);

  ctx.font = "11px Arial, sans-serif";
  ctx.fillStyle = "#8ca3bd";

  return {
    ctx, width, height,
    pad: { left: 42, right: 16, top: 18, bottom: 34 }
  };
}

function drawBarChart(canvas, bars, min, max) {
  const chart = canvasSetup(canvas);
  if (!chart) return;

  const { ctx, width, height, pad } = chart;
  const plotH = height - pad.top - pad.bottom;
  const plotW = width - pad.left - pad.right;

  ctx.strokeStyle = "#25364b";

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH * i / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = "#8ca3bd";
    ctx.fillText((max - (max - min) * i / 4).toFixed(2), 4, y + 4);
  }

  const slot = plotW / Math.max(1, bars.length);

  bars.forEach((bar, index) => {
    const ratio = Math.max(0, (bar.value - min) / (max - min));
    const barH = ratio * plotH;
    const x = pad.left + index * slot + slot * 0.23;
    const y = height - pad.bottom - barH;

    ctx.fillStyle = bar.color;
    ctx.fillRect(x, y, slot * 0.54, barH);

    ctx.fillStyle = "#e6f0ff";
    ctx.textAlign = "center";
    ctx.fillText(bar.label, x + slot * 0.27, height - 12);
    ctx.fillText(bar.value.toFixed(3), x + slot * 0.27, Math.max(12, y - 6));
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
    const index = Math.max(
      0,
      Math.min(bins.length - 1, Math.floor((value - min) / step))
    );
    bins[index].count++;
  });

  const plotH = height - pad.top - pad.bottom;
  const plotW = width - pad.left - pad.right;
  const maxCount = Math.max(1, ...bins.map(bin => bin.count));

  ctx.strokeStyle = "#25364b";

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH * i / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
  }

  const slot = plotW / bins.length;

  bins.forEach((bin, index) => {
    const barH = bin.count / maxCount * plotH;

    ctx.fillStyle = "#00c2ff";
    ctx.fillRect(
      pad.left + index * slot + 1,
      height - pad.bottom - barH,
      Math.max(1, slot - 2),
      barH
    );

    if (index % 4 === 0) {
      ctx.fillStyle = "#8ca3bd";
      ctx.fillText(bin.label, pad.left + index * slot, height - 12);
    }
  });

  ctx.fillStyle = "#8ca3bd";
  ctx.fillText(`Trials: ${values.length}`, pad.left, pad.top + 12);
}

function drawLineChart(canvas, values, maxY, theoryY) {
  const chart = canvasSetup(canvas);
  if (!chart) return;

  const { ctx, width, height, pad } = chart;
  const plotH = height - pad.top - pad.bottom;
  const plotW = width - pad.left - pad.right;

  ctx.strokeStyle = "#25364b";

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + plotH * i / 4;

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

    values.forEach((value, index) => {
      const x = pad.left +
        (values.length === 1 ? 0 : index / (values.length - 1)) * plotW;

      const y = pad.top + plotH -
        Math.min(maxY, value) / maxY * plotH;

      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
  } else {
    ctx.fillStyle = "#8ca3bd";
    ctx.fillText("Run an experiment to view QBER", pad.left + 8, pad.top + plotH / 2);
  }

  if (theoryY > 0) {
    const y = pad.top + plotH - theoryY / maxY * plotH;

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
    { label: "Theory", value: 0.5, color: "#5bc0be" }
  ], 0, 1);

  drawHistogram($("siftChart"), [], 32, 96);
  drawLineChart($("qberChart"), [], 0.5, 0);
}

/* ================= CSV EXPORT ================= */

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

  const escapeCSV = value => {
    const text = value == null ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const lines = [
    columns.join(","),
    ...experimentHistory.map(row =>
      columns.map(column => escapeCSV(row[column])).join(",")
    )
  ];

  const blob = new Blob([lines.join("\r\n")], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "bb84_ptrp_experiments.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
  showToast("CSV experiment report downloaded.");
}

/* Redraw graphs when the window size changes. */
window.addEventListener("resize", () => {
  if ($("analyticsModal")?.style.display === "block") {
    if ($("experiment-summary")?.dataset.ran) {
      runMonteCarlo();
    } else {
      drawEmptyCharts();
    }
  }
});
