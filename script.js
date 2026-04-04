// --- 1. FIREBASE INITIALIZATION ---
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

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// --- 2. GLOBAL VARIABLES ---
let bb84Key = null;
let currentRole = "Alice";
let currentServer = "server_1"; 
let typingTimer = null; 
let isGeneratingKey = false; 

// --- 3. STARTUP & SERVER MANAGEMENT ---
window.onload = () => {
    let savedRole = localStorage.getItem('quantum_role');
    if (savedRole) { document.getElementById('user-role').value = savedRole; }

    currentRole = document.getElementById('user-role').value;
    document.getElementById('chat-with').innerText = `Chatting as: ${currentRole}`;

    const secureContact = currentRole === "Alice" ? "Bob" : "Alice";
    document.getElementById('contact-name').innerText = secureContact;
    document.getElementById('contact-avatar').innerText = secureContact.charAt(0);

    attachFirebaseListeners();

    document.getElementById('msg-input').addEventListener('input', () => {
        database.ref(`servers/${currentServer}/typing_status/${currentRole}`).set(true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            database.ref(`servers/${currentServer}/typing_status/${currentRole}`).set(false);
        }, 1500);
    });

    document.getElementById('msg-input').addEventListener('keydown', function(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); 
            sendMessage();          
        }
    });
};

function setRole() {
    localStorage.setItem('quantum_role', document.getElementById('user-role').value);
    location.reload(); 
}

function switchServer() {
    database.ref(`servers/${currentServer}/keys`).off();
    database.ref(`servers/${currentServer}/messages`).off();
    
    const otherRole = currentRole === "Alice" ? "Bob" : "Alice";
    database.ref(`servers/${currentServer}/typing_status/${otherRole}`).off();

    currentServer = document.getElementById('server-select').value;
    document.getElementById('chat-box').innerHTML = "";
    bb84Key = null; 
    document.getElementById('key-status').style.visibility = "hidden";
    document.getElementById('typing-indicator').style.display = "none";

    let displayServerName = document.getElementById('server-select').options[document.getElementById('server-select').selectedIndex].text;
    addSystemMessage(`Switched to ${displayServerName}. Awaiting Quantum Key...`);
    attachFirebaseListeners();
}

function attachFirebaseListeners() {
    const otherRole = currentRole === "Alice" ? "Bob" : "Alice";
    const sessionStartTime = Date.now();

    database.ref(`servers/${currentServer}/keys`).orderByChild('time').startAt(sessionStartTime).on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data.sender !== currentRole) {
            bb84Key = data.key;
            updateKeyUI(bb84Key);
            addSystemMessage(`System: Quantum Key Synchronized securely with ${data.sender}`);
        }
    });

    database.ref(`servers/${currentServer}/messages`).orderByChild('time').startAt(sessionStartTime).on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data.sender !== currentRole) {
            receiveFromNetwork(data.binary, data.sender); 
        }
    });

    database.ref(`servers/${currentServer}/typing_status/${otherRole}`).on('value', (snapshot) => {
        const isTyping = snapshot.val();
        const indicator = document.getElementById('typing-indicator');
        if (isTyping) {
            indicator.innerText = `${otherRole} is typing...`;
            indicator.style.display = "block";
            const box = document.getElementById('chat-box');
            box.scrollTop = box.scrollHeight;
        } else {
            indicator.style.display = "none";
        }
    });

    database.ref(`servers/${currentServer}/alerts`).orderByChild('time').startAt(sessionStartTime).on('child_added', (snapshot) => {
        const alertData = snapshot.val();
        if (alertData.type === "EVE_INTERCEPT") {
            bb84Key = Math.floor(Math.random() * 9999); 
            const el = document.getElementById('key-status');
            el.innerText = `KEY: CORRUPTED`;
            el.style.background = "#ff4444";
            el.style.boxShadow = "0 0 20px red";
            
            const box = document.getElementById('chat-box');
            const div = document.createElement('div');
            div.className = "system-msg alert";
            div.innerHTML = "🚨 CRITICAL WARNING 🚨<br>Quantum State Collapse Detected.<br>Eavesdropper Interception. Key Corrupted!";
            box.appendChild(div);
            box.scrollTop = box.scrollHeight;
            
            showToast("QUANTUM CHANNEL COMPROMISED!");
        }
    });
}

// --- UTILS ---
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = `⚠️ ${msg}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function playSound(id) {
    const sound = document.getElementById(id);
    if(sound) { sound.currentTime = 0; sound.volume = id === 'snd-key' ? 0.3 : 0.5; sound.play().catch(e=>{}); }
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// --- 4. VISUALIZED BB84 KEY GENERATION ---
async function generateBB84Key() {
    if (isGeneratingKey) return;
    isGeneratingKey = true;

    const el = document.getElementById('key-status');
    el.style.background = "var(--neon-blue)";
    el.style.boxShadow = "0 0 20px var(--neon-blue)";

    document.getElementById('keyGenModal').style.display = "block";
    const statusEl = document.getElementById('key-gen-status');
    const rows = ['row-bits', 'row-s-bases', 'row-r-bases', 'row-match', 'row-key'];
    rows.forEach(id => {
        const tr = document.getElementById(id);
        while(tr.children.length > 1) tr.removeChild(tr.lastChild);
    });

    const basesOptions = ['+', 'x'];
    let finalBinary = "";
    const maxPhotons = 16; 

    for (let i = 0; i < maxPhotons; i++) {
        statusEl.innerText = `Transmitting Photon ${i+1} of ${maxPhotons}...`;
        
        let bit = Math.round(Math.random());
        let aliceBase = basesOptions[Math.round(Math.random())];
        let bobBase = basesOptions[Math.round(Math.random())];

        if (finalBinary.length < 8 && i >= 8) bobBase = aliceBase; 
        if (finalBinary.length >= 8) bobBase = aliceBase === '+' ? 'x' : '+'; 

        let match = (aliceBase === bobBase);
        let finalBit = match ? bit : "-";
        if (match && finalBinary.length < 8) finalBinary += bit;

        document.getElementById('row-bits').innerHTML += `<td style="color: gray;">${bit}</td>`;
        await sleep(150);
        document.getElementById('row-s-bases').innerHTML += `<td style="color: #00C2FF;">${aliceBase}</td>`;
        await sleep(150);
        document.getElementById('row-r-bases').innerHTML += `<td style="color: #5BC0BE;">${bobBase}</td>`;
        await sleep(150);
        
        let matchColor = match ? "#5BC0BE" : "#ff4444";
        let matchText = match ? "YES" : "NO";
        document.getElementById('row-match').innerHTML += `<td style="color: ${matchColor}; font-weight: bold;">${matchText}</td>`;
        
        let keyColor = match ? "white" : "#333";
        document.getElementById('row-key').innerHTML += `<td style="color: ${keyColor}; font-weight: bold;">${finalBit}</td>`;
        
        await sleep(250); 
    }

    statusEl.innerText = "Basis Reconciliation Complete! Encrypting Key...";
    playSound('snd-key');
    await sleep(1000);

    bb84Key = parseInt(finalBinary, 2);
    updateKeyUI(bb84Key);
    addSystemMessage(`System: Local Quantum Key Generated: ${bb84Key}`);

    database.ref(`servers/${currentServer}/keys`).push({
        sender: currentRole, key: bb84Key, time: Date.now()
    });

    document.getElementById('keyGenModal').style.display = "none";
    isGeneratingKey = false;
}

function updateKeyUI(key) {
    const el = document.getElementById('key-status');
    el.innerText = `KEY: ${key} (${key.toString(2).padStart(8, '0')})`;
    el.style.visibility = "visible";
    el.style.opacity = "1";
}

// --- 5. SENDING & LOGGING ---
function sendMessage() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim(); 
    if (!text) return;
    if (!bb84Key) { showToast("Please generate a BB84 Key first!"); return; }

    let binaryArray = [];
    
    let logHTML = `<div class="log-entry" style="border-left: 3px solid var(--neon-blue);">
        <strong style="color: var(--neon-blue);">[ENCRYPTED & SENT]</strong>
        <table><tr><th>Char</th><th>ASCII</th><th>XOR</th><th>Binary</th></tr>`;
    
    for (let i = 0; i < text.length; i++) {
        let ascii = text.charCodeAt(i);
        let xored = ascii ^ bb84Key;
        let xorBin = xored.toString(2).padStart(8, '0');
        binaryArray.push(xorBin);

        let charDisplay = text[i] === '\n' ? '↵' : text[i];
        logHTML += `<tr><td style="color: white;">'${charDisplay}'</td><td style="color: gray;">${ascii}</td><td>⊕ ${bb84Key}</td><td style="color: #00C2FF; font-weight: bold;">${xorBin}</td></tr>`;
    }
    
    logHTML += `</table></div>`;
    document.getElementById('crypto-log-content').insertAdjacentHTML('afterbegin', logHTML);

    const msgData = { sender: currentRole, binary: binaryArray, time: Date.now() };
    database.ref(`servers/${currentServer}/messages`).push(msgData);
    
    database.ref('admin_logs').push({
        server_room: currentServer, sender: currentRole,
        plaintext_message: text, secret_key_used: bb84Key,       
        timestamp: new Date().toLocaleString()
    });

    database.ref(`servers/${currentServer}/typing_status/${currentRole}`).set(false); 
    displayMessage(currentRole, text, binaryArray.join(' '), 'sent');
    playSound('snd-send');
    input.value = "";
}

// --- 6. INSTANT RECEIVE & LOGGING ---
function receiveFromNetwork(binaryArray, sender) {
    if (!bb84Key) {
        addSystemMessage(`Encrypted message from ${sender} blocked! No Shared Key.`);
        displayMessage(sender, "Locked Content 🔐", binaryArray.join(' '), 'received');
        return;
    }
    
    let decryptedText = "";
    
    let logHTML = `<div class="log-entry" style="border-left: 3px solid var(--header-cyan);">
        <strong style="color: var(--header-cyan);">[DECRYPTED from ${sender}]</strong>
        <table><tr><th>Binary</th><th>XOR</th><th>ASCII</th><th>Char</th></tr>`;

    binaryArray.forEach(bin => {
        let encryptedDecimal = parseInt(bin, 2);           
        let decryptedAscii = encryptedDecimal ^ bb84Key;   
        let finalChar = String.fromCharCode(decryptedAscii); 
        decryptedText += finalChar;

        let charDisplay = finalChar === '\n' ? '↵' : finalChar;
        logHTML += `<tr><td style="color: #00C2FF;">${bin}</td><td>⊕ ${bb84Key}</td><td style="color: gray;">${decryptedAscii}</td><td style="color: white; font-weight: bold;">'${charDisplay}'</td></tr>`;
    });

    logHTML += `</table></div>`;
    document.getElementById('crypto-log-content').insertAdjacentHTML('afterbegin', logHTML);
    
    displayMessage(sender, decryptedText, binaryArray.join(' '), 'received');
    playSound('snd-recv');
}

// --- UI HELPERS ---
function displayMessage(user, text, bin, type) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `message ${type}`;
    const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
        <strong>${user}</strong> <span style="font-size: 10px; color: gray; float: right;">${timeString}</span><br>
        <span style="font-size: 16px;">${text}</span>
        <span class="binary">Network Payload: ${bin}</span>
    `;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function addSystemMessage(t) {
    const div = document.createElement('div');
    div.className = "system-msg";
    div.innerText = t;
    const box = document.getElementById('chat-box');
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function toggleCryptoLogs() {
    const sidebar = document.getElementById('crypto-sidebar');
    sidebar.classList.toggle('open');
}

function triggerEveAttack() {
    if (!bb84Key) { showToast("No active quantum key to intercept!"); return; }
    database.ref(`servers/${currentServer}/alerts`).push({ type: "EVE_INTERCEPT", time: Date.now() });
}
