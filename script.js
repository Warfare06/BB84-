
/* =========================================================
   BB84 QUANTUM CHAT — PTRP EDITION
   Educational simulation; not production cryptography.
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyC3qv5heO6FpSjFHv7bXQaoIDzqlX1GX9Y",
  authDomain: "bb84-5aaed.firebaseapp.com",
  databaseURL:
    "https://bb84-5aaed-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bb84-5aaed",
  storageBucket: "bb84-5aaed.firebasestorage.app",
  messagingSenderId: "296035061055",
  appId: "1:296035061055:web:e63d9a5fcfbed3202a578a",
  measurementId: "G-Q5Q9HDFV7K"
};

const $ = id => document.getElementById(id);

let database = null;
let currentRole = "Alice";
let currentServer = "server_1";
let bb84Key = null;
let bb84KeyBits = "";
let eveEnabled = false;
let generatingKey = false;
let typingTimer = null;
let listeners = [];
let sessionStartTime = Date.now();

/* ---------------- INITIALIZATION ---------------- */

window.addEventListener("load", () => {
  currentRole = localStorage.getItem("quantum_role") || "Alice";
  $("user-role").value = currentRole;

  const displayName =
    localStorage.getItem("quantum_display_name") || currentRole;

  $("chat-with").textContent =
    `Chatting as: ${displayName} (${currentRole})`;

  const peer = currentRole === "Alice" ? "Bob" : "Alice";
  $("contact-name").textContent = peer;
  $("contact-avatar").textContent = peer[0];
  $("room-label").textContent =
    $("server-select").selectedOptions[0].textContent;

  try {
    if (!window.firebase) {
      throw new Error("Firebase SDK did not load.");
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }

    database = firebase.database();
    attachFirebaseListeners();

    $("connection-state").textContent = "Firebase initialized";
  } catch (error) {
    $("connection-state").textContent = "Firebase unavailable";
    showToast("Check your Firebase configuration and connection.");
    console.error(error);
  }

  $("msg-input").addEventListener("input", updateTyping);

  $("msg-input").addEventListener("keydown", event => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  });

  drawEmptyCharts();
});

function detachListeners() {
  if (database) {
    listeners.forEach(ref => ref.off());
  }
  listeners = [];
}

function setRole() {
  localStorage.setItem("quantum_role", $("user-role").value);
  location.reload();
}

function switchServer() {
  detachListeners();

  currentServer = $("server-select").value;
  sessionStartTime = Date.now();

  bb84Key = null;
  bb84KeyBits = "";
  eveEnabled = false;

  $("chat-box").innerHTML = "";
  $("crypto-log-content").innerHTML =
    '<p class="muted empty-state">Encryption logs appear here.</p>';

  $("key-status").textContent = "No shared key";
  $("key-status").classList.remove("key-ready");

  $("eve-state").textContent = "Interception disabled";
  $("eve-btn").textContent = "Simulate Eve attack";
  $("eve-btn").classList.remove("armed");

  $("room-label").textContent =
    $("server-select").selectedOptions[0].textContent;

  addSystemMessage(
    `Switched to ${$("room-label").textContent}. Generate a new key.`
  );

  if (database) attachFirebaseListeners();
}

/* ---------------- FIREBASE LISTENERS ---------------- */

function attachFirebaseListeners() {
  if (!database) return;

  const peer = currentRole === "Alice" ? "Bob" : "Alice";

  const keysRef = database
    .ref(`servers/${currentServer}/keys`)
    .orderByChild("time")
    .startAt(sessionStartTime);

  keysRef.on("child_added", snapshot => {
    const data = snapshot.val();

    if (!data || data.sender === currentRole || !data.keyBits) {
      return;
    }

    bb84KeyBits = String(data.keyBits);
    bb84Key = parseInt(bb84KeyBits.slice(0, 8).padEnd(8, "0"), 2);

    updateKeyUI(bb84Key, bb84KeyBits);

    addSystemMessage(
      `Simulated key received from ${data.sender}.`
    );
  });

  listeners.push(keysRef);

  const messagesRef = database
    .ref(`servers/${currentServer}/messages`)
    .orderByChild("time")
    .startAt(sessionStartTime);

  messagesRef.on("child_added", snapshot => {
    const data = snapshot.val();

    if (
      data &&
      data.sender !== currentRole &&
      Array.isArray(data.payload)
    ) {
      receiveFromNetwork(data.payload, data.sender);
    }
  });

  listeners.push(messagesRef);

  const typingRef = database.ref(
    `servers/${currentServer}/typing_status/${peer}`
  );

  typingRef.on("value", snapshot => {
    $("typing-indicator").textContent = `${peer} is typing...`;
    $("typing-indicator").style.display =
      snapshot.val() ? "block" : "none";
  });

  listeners.push(typingRef);

  const alertsRef = database
    .ref(`servers/${currentServer}/alerts`)
    .orderByChild("time")
    .startAt(sessionStartTime);

  alertsRef.on("child_added", snapshot => {
    const alert = snapshot.val();

    if (
      alert &&
      alert.type === "EVE_INTERCEPT" &&
      alert.sender !== currentRole
    ) {
      eveEnabled = true;
      $("eve-state").textContent = "Attack armed for next key";
      $("eve-btn").classList.add("armed");

      addSystemMessage(
        "Eve intercept-resend attack armed for the next key exchange."
      );
    }
  });

  listeners.push(alertsRef);
}

function updateTyping() {
  if (!database) return;

  database
    .ref(`servers/${currentServer}/typing_status/${currentRole}`)
    .set(true)
    .catch(console.error);

  clearTimeout(typingTimer);

  typingTimer = setTimeout(() => {
    database
      .ref(`servers/${currentServer}/typing_status/${currentRole}`)
      .set(false)
      .catch(console.error);
  }, 1200);
}

/* ---------------- SMALL UTILITIES ---------------- */

function showToast(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast.timer);

  showToast.timer = setTimeout(() => {
    toast.classList.remove("show");
  }, 3500);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function playSound(id) {
  const audio = $(id);

  if (audio) {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  }
}

function addSystemMessage(text) {
  const div = document.createElement("div");
  div.className = "system-msg";
  div.textContent = text;

  $("chat-box").appendChild(div);
  $("chat-box").scrollTop = $("chat-box").scrollHeight;
}

/* ---------------- BB84 RANDOM PROCESS ---------------- */

function randomBit() {
  return Math.random() < 0.5 ? 0 : 1;
}

function randomBasis() {
  return Math.random() < 0.5 ? "+" : "×";
}

/*
  BB84 intercept-resend model.

  Alice selects a random bit and basis.
  Eve, when enabled, measures using a random basis and resends.
  Bob measures using his random basis.

  Only positions where Alice and Bob bases match are sifted.
*/
function simulateBB84(photonCount = 128, withEve = false) {
  const aliceBits = [];
  const aliceBases = [];
  const eveBases = [];
  const bobBases = [];
  const bobBits = [];
  const matches = [];

  for (let i = 0; i < photonCount; i++) {
    const bit = randomBit();
    const aliceBase = randomBasis();
    const bobBase = randomBasis();

    let sentBit = bit;
    let eveBase = "—";

    if (withEve) {
      eveBase = randomBasis();

      // Eve's measurement in the wrong basis gives a random result.
      if (eveBase !== aliceBase) {
        sentBit = randomBit();
      }
    }

    let receivedBit = sentBit;

    // Bob gets a random outcome if his basis differs from the
    // basis of the state Eve sent (or Alice sent if no Eve).
    const transmittedBasis = withEve ? eveBase : aliceBase;

    if (bobBase !== transmittedBasis) {
      receivedBit = randomBit();
    }

    aliceBits.push(bit);
    aliceBases.push(aliceBase);
    eveBases.push(eveBase);
    bobBases.push(bobBase);
    bobBits.push(receivedBit);
    matches.push(aliceBase === bobBase);
  }

  const siftedIndexes = matches
    .map((match, index) => match ? index : -1)
    .filter(index => index >= 0);

  const aliceSifted = siftedIndexes.map(i => aliceBits[i]);
  const bobSifted = siftedIndexes.map(i => bobBits[i]);

  let errors = 0;

  for (let i = 0; i < aliceSifted.length; i++) {
    if (aliceSifted[i] !== bobSifted[i]) errors++;
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
    siftedIndexes,
    aliceSifted,
    bobSifted,
    matchCount: siftedIndexes.length,
    matchProbability: siftedIndexes.length / photonCount,
    errors,
    qber: aliceSifted.length ? errors / aliceSifted.length : 0
  };
}

/* ---------------- BB84 TABLE ---------------- */

function resetBB84Table() {
  [
    "row-bits",
    "row-s-bases",
    "row-e-bases",
    "row-r-bases",
    "row-match",
    "row-key"
  ].forEach(id => {
    const row = $(id);
    while (row.children.length > 1) {
      row.removeChild(row.lastChild);
    }
  });

  $("key-result").textContent = "";
  $("key-result").classList.remove("security-fail");
}

function appendTableCell(rowId, value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  $(rowId).appendChild(cell);
}

/* ---------------- KEY GENERATION ---------------- */

async function generateBB84Key() {
  if (generatingKey) return;

  if (!database) {
    showToast("Firebase is not connected.");
    return;
  }

  if (currentRole !== "Alice") {
    showToast("Select Alice to initiate the key exchange.");
    return;
  }

  generatingKey = true;
  $("keygen-btn").disabled = true;
  $("keyGenModal").style.display = "block";

  resetBB84Table();

  const status = $("key-gen-status");
  const photonCount = 128;
  const result = simulateBB84(photonCount, eveEnabled);

  try {
    for (let i = 0; i < photonCount; i++) {
      status.textContent =
        `Simulating photon ${i + 1} of ${photonCount}...`;

      appendTableCell("row-bits", result.aliceBits[i]);
      appendTableCell("row-s-bases", result.aliceBases[i], "cyan");
      appendTableCell("row-e-bases", result.eveBases[i], "purple");
      appendTableCell("row-r-bases", result.bobBases[i]);

      appendTableCell(
        "row-match",
        result.matches[i] ? "YES" : "NO",
        result.matches[i] ? "good" : "bad"
      );

      const siftedPosition = result.siftedIndexes.indexOf(i);
      const keyBit = siftedPosition >= 0
        ? result.aliceSifted[siftedPosition]
        : "—";

      appendTableCell(
        "row-key",
        keyBit,
        result.matches[i] ? "good" : "dim"
      );

      if (i % 8 === 7) await sleep(12);
    }

    /*
      Randomly choose 20% of sifted positions for public testing.
      Tested bits are removed from the final key.
    */
    const shuffled = [...result.siftedIndexes];

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const sampleCount = Math.floor(shuffled.length * 0.2);
    const sampleIndexes = new Set(shuffled.slice(0, sampleCount));

    let sampleErrors = 0;

    sampleIndexes.forEach(index => {
      if (result.aliceBits[index] !== result.bobBits[index]) {
        sampleErrors++;
      }
    });

    const sampleQBER = sampleCount ? sampleErrors / sampleCount : 0;

    const finalIndexes = result.siftedIndexes.filter(
      index => !sampleIndexes.has(index)
    );

    const aliceFinal = finalIndexes
      .map(index => result.aliceBits[index])
      .join("");

    const bobFinal = finalIndexes
      .map(index => result.bobBits[index])
      .join("");

    const stats = {
      photons: photonCount,
      matched: result.matchCount,
      matchProbability: result.matchProbability,
      sampleBits: sampleCount,
      sampleErrors,
      qber: sampleQBER,
      eve: result.withEve
    };

    $("key-result").innerHTML = `
      <strong>${aliceFinal.length} candidate key bits</strong>
      <span>Basis match: ${(result.matchProbability * 100).toFixed(1)}%</span>
      <span>Sample QBER: ${(sampleQBER * 100).toFixed(1)}%</span>
    `;

    updateCurrentStats(stats);

    /*
      Illustrative security threshold. A real QKD implementation needs
      a statistically justified finite-key analysis.
    */
    if (sampleQBER > 0.11) {
      $("key-result").classList.add("security-fail");
      status.textContent =
        "WARNING: High sample QBER. Candidate key rejected.";

      bb84Key = null;
      bb84KeyBits = "";
      $("key-status").textContent = "Key rejected — high QBER";
      $("key-status").classList.remove("key-ready");

      addSystemMessage(
        `Security warning: sample QBER ${(sampleQBER * 100).toFixed(1)}%. ` +
        "Candidate key rejected in this demonstration."
      );

      addCryptoLog("Security check — key rejected", [
        ["Sample bits", sampleCount],
        ["Sample errors", sampleErrors],
        ["Sample QBER", `${(sampleQBER * 100).toFixed(1)}%`],
        ["Illustrative threshold", "11%"]
      ], "var(--red)");

      return;
    }

    if (aliceFinal.length < 8 || aliceFinal !== bobFinal) {
      status.textContent = "Not enough reliable key bits. Try again.";
      showToast("No usable key produced. Run BB84 again.");
      return;
    }

    // Demo uses the first eight final bits as a one-byte XOR key.
    bb84KeyBits = aliceFinal;
    bb84Key = parseInt(aliceFinal.slice(0, 8), 2);

    updateKeyUI(bb84Key, bb84KeyBits);

    const record = {
      sender: currentRole,
      keyBits: bb84KeyBits,
      time: Date.now(),
      stats,
      simulationOnly: true
    };

    await database
      .ref(`servers/${currentServer}/keys`)
      .push(record);

    status.textContent =
      "Basis reconciliation complete. Candidate key synchronized.";

    addSystemMessage(
      `BB84 complete: ${result.matchCount}/${photonCount} bases matched; ` +
      `sample QBER ${(sampleQBER * 100).toFixed(1)}%.`
    );

    addCryptoLog("BB84 key generation", [
      ["Photons sent", photonCount],
      ["Matching bases", result.matchCount],
      ["Empirical P(match)", result.matchProbability.toFixed(3)],
      ["Sample bits", sampleCount],
      ["Sample errors", sampleErrors],
      ["Sample QBER", `${(sampleQBER * 100).toFixed(1)}%`],
      ["Eve enabled", result.withEve ? "Yes" : "No"],
      ["Demo XOR key byte", bb84Key]
    ], "var(--cyan)");

    playSound("snd-key");
  } catch (error) {
    console.error(error);
    status.textContent = "Key generation failed.";
    showToast("Key generation failed. Check Firebase and try again.");
  } finally {
    generatingKey = false;
    $("keygen-btn").disabled = false;
    await sleep(1200);
    $("keyGenModal").style.display = "none";
  }
}

function updateKeyUI(key, bits) {
  $("key-status").textContent =
    `KEY READY · ${key.toString(2).padStart(8, "0")}`;
  $("key-status").classList.add("key-ready");
  $("key-status").title = `${bits.length} simulated key bits`;
}

function closeModal() {
  $("keyGenModal").style.display = "none";
}

/* ---------------- XOR MESSAGE DEMO ---------------- */

/*
  This deliberately remains a simple classroom demonstration.
  A single XOR byte is NOT secure encryption.
*/
function xorEncrypt(text, keyByte) {
  const bytes = new TextEncoder().encode(text);

  return Array.from(bytes, byte =>
    (byte ^ keyByte).toString(2).padStart(8, "0")
  );
}

function xorDecrypt(payload, keyByte) {
  const bytes = payload.map(bits => parseInt(bits, 2) ^ keyByte);
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function sendMessage() {
  const input = $("msg-input");
  const text = input.value.trim();

  if (!text) return;

  if (!database) {
    showToast("Firebase is not connected.");
    return;
  }

  if (bb84Key === null) {
    showToast("Generate or receive a BB84 key first.");
    return;
  }

  const payload = xorEncrypt(text, bb84Key);

  database.ref(`servers/${currentServer}/messages`).push({
    sender: currentRole,
    payload,
    time: Date.now(),
    simulationOnly: true
  }).then(() => {
    displayMessage(currentRole, text, payload.join(" "), "sent");
    playSound("snd-send");
    input.value = "";

    database
      .ref(`servers/${currentServer}/typing_status/${currentRole}`)
      .set(false)
      .catch(console.error);

    addCryptoLog("Encrypted & sent", [
      ["UTF-8 bytes", payload.length],
      ["XOR key byte", bb84Key],
      ["Ciphertext", payload.join(" ")]
    ], "var(--cyan)");
  }).catch(error => {
    console.error(error);
    showToast("Message send failed. Check database rules.");
  });
}

function receiveFromNetwork(payload, sender) {
  if (bb84Key === null) {
    addSystemMessage(
      `Message from ${sender} received, but no demo key is available.`
    );
    displayMessage(sender, "Locked content 🔐", payload.join(" "), "received");
    return;
  }

  try {
    const text = xorDecrypt(payload, bb84Key);

    displayMessage(sender, text, payload.join(" "), "received");
    playSound("snd-recv");

    addCryptoLog(`Decrypted from ${sender}`, [
      ["Ciphertext", payload.join(" ")],
      ["XOR key byte", bb84Key],
      ["Recovered text", text]
    ], "var(--teal)");
  } catch (error) {
    console.error(error);
    showToast("Unable to decode this message.");
  }
}

function displayMessage(user, text, binary, type) {
  const div = document.createElement("div");
  div.className = `message ${type}`;

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
  body.textContent = text;

  const details = document.createElement("details");
  details.className = "payload-details";

  const summary = document.createElement("summary");
  summary.textContent = "View network payload";

  const code = document.createElement("code");
  code.textContent = binary;

  details.append(summary, code);
  div.append(meta, body, details);

  $("chat-box").appendChild(div);
  $("chat-box").scrollTop = $("chat-box").scrollHeight;
}

function addCryptoLog(title, rows, color) {
  const container = $("crypto-log-content");
  const empty = container.querySelector(".empty-state");

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
  container.prepend(entry);
}

function toggleCryptoLogs() {
  $("crypto-sidebar").classList.toggle("open");
}

/* ---------------- EVE INTERCEPT-RESEND ---------------- */

function triggerEveAttack() {
  if (!database) {
    showToast("Firebase is not connected.");
    return;
  }

  eveEnabled = true;
  $("eve-state").textContent = "Attack armed for next key";
  $("eve-btn").textContent = "Eve attack enabled";
  $("eve-btn").classList.add("armed");

  database.ref(`servers/${currentServer}/alerts`).push({
    type: "EVE_INTERCEPT",
    sender: currentRole,
    time: Date.now()
  }).catch(console.error);

  addSystemMessage(
    "Eve is armed. Alice should generate a fresh BB84 key."
  );
}

/* =========================================================
   PTRP MONTE CARLO EXPERIMENTS
   ========================================================= */

function runMonteCarlo() {
  const count = Number($("trial-count").value);
  const withEve = $("analytics-eve").checked;
  const button = $("run-experiment-btn");

  button.disabled = true;
  button.textContent = "Running experiment...";

  // Defer computation so the browser can update the button.
  setTimeout(() => {
    let totalMatches = 0;
    let totalPhotons = 0;
    let totalErrors = 0;
    let totalSifted = 0;

    const matchProbabilities = [];
    const siftedLengths = [];
    const qbers = [];

    for (let i = 0; i < count; i++) {
      const result = simulateBB84(128, withEve);

      totalMatches += result.matchCount;
      totalPhotons += result.photonCount;
      totalErrors += result.errors;
      totalSifted += result.matchCount;

      matchProbabilities.push(result.matchProbability);
      siftedLengths.push(result.matchCount);
      qbers.push(result.qber);
    }

    const empiricalMatch = totalMatches / totalPhotons;
    const meanSifted = mean(siftedLengths);
    const varianceSifted = variance(siftedLengths);
    const empiricalQBER = totalSifted
      ? totalErrors / totalSifted
      : 0;

    $("metric-match").textContent =
      `${(empiricalMatch * 100).toFixed(2)}%`;

    $("metric-sifted").textContent = meanSifted.toFixed(2);

    $("metric-qber").textContent =
      `${(empiricalQBER * 100).toFixed(2)}%`;

    $("metric-qber-note").textContent = withEve
      ? "Expected approximately 25%"
      : "Expected approximately 0%";

    $("metric-eve").textContent = withEve
      ? `${(empiricalQBER * 100).toFixed(2)}% observed`
      : "Not active";

    drawBarChart(
      $("matchChart"),
      [
        {label:"Observed", value:empiricalMatch, color:"#00c2ff"},
        {label:"Theory", value:0.5, color:"#5bc0be"}
      ],
      0, 1
    );

    drawHistogram($("siftChart"), siftedLengths);

    drawLineChart(
      $("qberChart"),
      qbers.slice(0, Math.min(qbers.length, 100)),
      withEve ? 0.5 : 0.1,
      withEve ? 0.25 : 0
    );

    $("experiment-summary").textContent =
      `${count.toLocaleString()} trials × 128 photons. ` +
      `Eve: ${withEve ? "ON" : "OFF"}. ` +
      `P(match): ${(empiricalMatch * 100).toFixed(2)}% ` +
      `(theory 50%). Mean sifted length: ${meanSifted.toFixed(2)} ` +
      `(theory 64). Variance: ${varianceSifted.toFixed(2)} ` +
      `(theory 32). QBER: ${(empiricalQBER * 100).toFixed(2)}% ` +
      `(ideal ${withEve ? "about 25%" : "0%"}).`;

    addCryptoLog("PTRP Monte Carlo experiment", [
      ["Number of trials", count],
      ["Eve", withEve ? "Enabled" : "Disabled"],
      ["Empirical P(match)", empiricalMatch.toFixed(4)],
      ["Mean sifted length", meanSifted.toFixed(3)],
      ["Variance", varianceSifted.toFixed(3)],
      ["Empirical QBER", `${(empiricalQBER * 100).toFixed(2)}%`]
    ], "var(--teal)");

    button.disabled = false;
    button.textContent = "Run experiment";
  }, 20);
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function variance(values) {
  const average = mean(values);
  return values.reduce(
    (sum, value) => sum + (value - average) ** 2, 0
  ) / values.length;
}

/* ---------------- CANVAS GRAPHS ---------------- */

function canvasSetup(canvas) {
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || 600;
  const height = canvas.clientHeight || 220;

  canvas.width = width * ratio;
  canvas.height = height * ratio;

  context.scale(ratio, ratio);
  context.fillStyle = "#0b1425";
  context.fillRect(0, 0, width, height);

  return {
    ctx: context,
    width,
    height,
    left: 43,
    right: 15,
    top: 18,
    bottom: 34
  };
}

function drawBarChart(canvas, bars, min, max) {
  const c = canvasSetup(canvas);
  const {ctx, width, height, left, right, top, bottom} = c;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;

  ctx.font = "11px Segoe UI";
  ctx.strokeStyle = "#25364b";
  ctx.fillStyle = "#91a4bd";

  for (let i = 0; i <= 4; i++) {
    const y = top + plotHeight * i / 4;

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    ctx.fillText((max - (max - min) * i / 4).toFixed(2), 3, y + 4);
  }

  const slot = plotWidth / bars.length;

  bars.forEach((bar, i) => {
    const barHeight = Math.max(
      1, ((bar.value - min) / (max - min)) * plotHeight
    );

    const x = left + i * slot + slot * 0.22;
    const y = height - bottom - barHeight;

    ctx.fillStyle = bar.color;
    ctx.fillRect(x, y, slot * 0.56, barHeight);

    ctx.textAlign = "center";
    ctx.fillStyle = "#eaf5ff";
    ctx.fillText(bar.value.toFixed(3), x + slot * 0.28, Math.max(12, y - 6));
    ctx.fillText(bar.label, x + slot * 0.28, height - 11);
  });

  ctx.textAlign = "left";
}

function drawHistogram(canvas, values) {
  const c = canvasSetup(canvas);
  const {ctx, width, height, left, right, top, bottom} = c;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;

  const labels = [];
  for (let x = 32; x <= 96; x += 4) labels.push(x);

  const bins = labels.map(() => 0);

  values.forEach(value => {
    const index = Math.max(
      0, Math.min(bins.length - 1, Math.floor((value - 32) / 4))
    );
    bins[index]++;
  });

  const maxCount = Math.max(1, ...bins);
  const slot = plotWidth / bins.length;

  ctx.strokeStyle = "#25364b";
  ctx.fillStyle = "#91a4bd";
  ctx.font = "10px Segoe UI";

  for (let i = 0; i <= 4; i++) {
    const y = top + plotHeight * i / 4;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
  }

  bins.forEach((value, i) => {
    const barHeight = value / maxCount * plotHeight;

    ctx.fillStyle = "#00c2ff";
    ctx.fillRect(
      left + i * slot + 1,
      height - bottom - barHeight,
      Math.max(1, slot - 2),
      barHeight
    );

    if (i % 4 === 0) {
      ctx.fillStyle = "#91a4bd";
      ctx.fillText(String(labels[i]), left + i * slot, height - 11);
    }
  });

  ctx.fillStyle = "#91a4bd";
  ctx.fillText(`Trials: ${values.length}`, left, top + 12);
}

function drawLineChart(canvas, values, maxY, theoryY) {
  const c = canvasSetup(canvas);
  const {ctx, width, height, left, right, top, bottom} = c;
  const plotHeight = height - top - bottom;
  const plotWidth = width - left - right;

  ctx.font = "10px Segoe UI";
  ctx.strokeStyle = "#25364b";
  ctx.fillStyle = "#91a4bd";

  for (let i = 0; i <= 4; i++) {
    const y = top + plotHeight * i / 4;

    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();

    ctx.fillText(
      `${(maxY * (1 - i / 4) * 100).toFixed(0)}%`,
      3, y + 4
    );
  }

  if (values.length) {
    ctx.beginPath();
    ctx.strokeStyle = "#00c2ff";
    ctx.lineWidth = 2;

    values.forEach((value, i) => {
      const x = left + (
        values.length === 1 ? 0 : i / (values.length - 1)
      ) * plotWidth;

      const y = top + plotHeight -
        Math.min(maxY, value) / maxY * plotHeight;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
  } else {
    ctx.fillText("Run an experiment to view QBER.", left + 8, top + 35);
  }

  if (theoryY > 0) {
    const y = top + plotHeight - theoryY / maxY * plotHeight;

    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = "#5bc0be";
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(width - right, y);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = "#5bc0be";
    ctx.fillText("Theory: 25%", Math.max(left, width - right - 70), y - 5);
  }
}

function drawEmptyCharts() {
  drawBarChart($("matchChart"), [
    {label:"Observed", value:0, color:"#00c2ff"},
    {label:"Theory", value:0.5, color:"#5bc0be"}
  ], 0, 1);

  drawHistogram($("siftChart"), []);
  drawLineChart($("qberChart"), [], 0.5, 0);
}

function updateCurrentStats() {
    // Update the current key statistics on the dashboard.
    const keyLengthEl = document.getElementById("keyLength");
    const qberEl = document.getElementById("qberValue");
    const statusEl = document.getElementById("keyStatus");

    if (keyLengthEl) {
        keyLengthEl.textContent = String(
            Array.isArray(sharedKey) ? sharedKey.length : 0
        );
    }

    if (qberEl) {
        qberEl.textContent = typeof currentQBER !== "undefined"
            ? `${(currentQBER * 100).toFixed(2)}%`
            : "—";
    }

    if (statusEl) {
        statusEl.textContent = Array.isArray(sharedKey) && sharedKey.length
            ? "Key Generated"
            : "Waiting";
    }
}

/* ---------------- ANALYTICS MODAL ---------------- */

function toggleAnalytics(forceOpen) {
  const modal = $("analyticsModal");

  const shouldOpen = typeof forceOpen === "boolean"
    ? forceOpen
    : modal.style.display !== "block";

  modal.style.display = shouldOpen ? "block" : "none";

  if (shouldOpen) {
    drawEmptyCharts();
  }
}

window.addEventListener("resize", () => {
  if ($("analyticsModal")?.style.display === "block") {
    drawEmptyCharts();
  }
});
