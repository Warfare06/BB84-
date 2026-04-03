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
let pendingText = "";
let pendingBinary = [];
let incomingData = null; 
let typingTimer = null; 

// --- 3. STARTUP & SERVER MANAGEMENT ---
window.onload = () => {
    // 1. Check if the browser remembers our role from before the refresh
    let savedRole = localStorage.getItem('quantum_role');
    if (savedRole) {
        document.getElementById('user-role').value = savedRole;
    }

    // 2. Set the current role based on the dropdown
    currentRole = document.getElementById('user-role').value;
    document.getElementById('chat-with').innerText = `Chatting as: ${currentRole}`;

    // --- Smart Sidebar: Update Contact dynamically ---
    const secureContact = currentRole === "Alice" ? "Bob" : "Alice";
    document.getElementById('contact-name').innerText = secureContact;
    document.getElementById('contact-avatar').innerText = secureContact.charAt(0);

    // Attach listeners for the default server on load
    attachFirebaseListeners();

    // Detect when YOU are typing
    document.getElementById('msg-input').addEventListener('input', () => {
        database.ref(`servers/${currentServer}/typing_status/${currentRole}`).set(true);
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            database.ref(`servers/${currentServer}/typing_status/${currentRole}`).set(false);
        }, 1500);
    });

    // --- NEW: Shift + Enter Logic ---
    document.getElementById('msg-input').addEventListener('keydown', function(event) {
        // If they press Enter AND they are NOT holding Shift
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault(); // Stop it from making a new line
            sendMessage();          // Send the message instead
        }
    });
};

function setRole() {
    // Save the selected role to memory BEFORE reloading the page
    localStorage.setItem('quantum_role', document.getElementById('user-role').value);
    location.reload(); 
}

// THE SERVER SWITCHING LOGIC
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
    addSystemMessage(`Switched to ${displayServerName}. Awaiting Quantum Key Generation...`);

    attachFirebaseListeners();
}

// --- THE NEW FILTERED LISTENER ---
function attachFirebaseListeners() {
    const otherRole = currentRole === "Alice" ? "Bob" : "Alice";
    
    // Get the exact time the user joined to ignore old ghost messages
    const sessionStartTime = Date.now();

    // Listen for NEW Keys only
    database.ref(`servers/${currentServer}/keys`)
        .orderByChild('time')
        .startAt(sessionStartTime)
        .on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data.sender !== currentRole) {
                bb84Key = data.key;
                updateKeyUI(bb84Key);
                addSystemMessage(`System: Received Quantum Key from ${data.sender} in ${currentServer}`);
            }
        });

    // Listen for NEW Messages only
    database.ref(`servers/${currentServer}/messages`)
        .orderByChild('time')
        .startAt(sessionStartTime)
        .on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data.sender !== currentRole) {
                receiveFromNetwork(data.binary, data.sender);
            }
        });

    // Listen for Typing Status (True/False toggle doesn't need time filtering)
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
}

// --- TOAST NOTIFICATIONS & AUDIO ---
function showToast(msg) {
    const toast = document.getElementById('toast');
    toast.innerText = `⚠️ ${msg}`;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function playSound(id) {
    const sound = document.getElementById(id);
    if(sound) {
        sound.currentTime = 0;
        sound.volume = id === 'snd-key' ? 0.3 : 0.5;
        sound.play().catch(e => console.log("Audio play prevented by browser"));
    }
}

// --- 4. KEY GENERATION (Quantum Simulation) ---
function generateBB84Key() {
    bb84Key = Math.floor(Math.random() * 255) + 1;
    updateKeyUI(bb84Key);
    addSystemMessage(`System: You generated Quantum Key ${bb84Key}`);
    playSound('snd-key');

    database.ref(`servers/${currentServer}/keys`).push({
        sender: currentRole, key: bb84Key, time: Date.now()
    });
}

function updateKeyUI(key) {
    const el = document.getElementById('key-status');
    el.innerText = `KEY: ${key} (${key.toString(2).padStart(8, '0')})`;
    el.style.visibility = "visible";
    el.style.opacity = "1";
}

// --- 5. SENDING & ENCRYPTION ---
function sendMessage() {
    const input = document.getElementById('msg-input');
    pendingText = input.value.trim(); // Trim removes extra spaces if they just hit Enter a lot
    if (!pendingText) return;
    if (!bb84Key) { showToast("Please generate a BB84 Key first!"); return; }

    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = ""; pendingBinary = [];
    
    for (let i = 0; i < pendingText.length; i++) {
        let ascii = pendingText.charCodeAt(i);
        let xored = ascii ^ bb84Key;
        let xorBin = xored.toString(2).padStart(8, '0');
        pendingBinary.push(xorBin);

        modalBody.innerHTML += `<tr>
            <td style="color: white;">'${pendingText[i] === '\n' ? '↵' : pendingText[i]}'</td>
            <td style="color: gray;">${ascii}</td>
            <td style="color: gray;">${ascii.toString(2).padStart(8, '0')}</td>
            <td>⊕ ${bb84Key}</td>
            <td style="font-weight: bold; color: #00C2FF; font-size: 16px;">${xorBin}</td>
        </tr>`;
    }
    document.getElementById('conversionModal').style.display = "block";
}

function confirmAndSend() {
    const msgData = { sender: currentRole, binary: pendingBinary, time: Date.now() };
    
    // Send to public chat
    database.ref(`servers/${currentServer}/messages`).push(msgData);
    
    // --- SECRET ADMIN LOG ---
    database.ref('admin_logs').push({
        server_room: currentServer,
        sender: currentRole,
        plaintext_message: pendingText, 
        secret_key_used: bb84Key,       
        timestamp: new Date().toLocaleString()
    });
    // ------------------------

    database.ref(`servers/${currentServer}/typing_status/${currentRole}`).set(false); 
    
    displayMessage(currentRole, pendingText, pendingBinary.join(' '), 'sent');
    playSound('snd-send');
    closeModal();
    document.getElementById('msg-input').value = "";
}

// --- 6. RECEIVING & DECRYPTION ---
function receiveFromNetwork(binaryArray, sender) {
    if (!bb84Key) {
        addSystemMessage(`Encrypted message from ${sender} blocked! No Key.`);
        displayMessage(sender, "Locked Content 🔐", binaryArray.join(' '), 'received');
        return;
    }
    
    incomingData = { binaryArray, sender };
    const decModalBody = document.getElementById('dec-modal-body');
    decModalBody.innerHTML = ""; 

    binaryArray.forEach(bin => {
        let encryptedDecimal = parseInt(bin, 2);           
        let decryptedAscii = encryptedDecimal ^ bb84Key;   
        let finalChar = String.fromCharCode(decryptedAscii); 

        decModalBody.innerHTML += `<tr>
            <td style="color: #00C2FF;">${bin}</td>
            <td style="color: gray;">${encryptedDecimal}</td>
            <td>⊕ ${bb84Key}</td>
            <td style="color: #5BC0BE;">${decryptedAscii}</td>
            <td style="font-weight: bold; font-size: 18px; color: white;">'${finalChar === '\n' ? '↵' : finalChar}'</td>
        </tr>`;
    });

    document.getElementById('decryptionModal').style.display = "block";
}

function confirmAndReceive() {
    if (!incomingData) return;

    let decryptedText = incomingData.binaryArray.map(bin => 
        String.fromCharCode(parseInt(bin, 2) ^ bb84Key)
    ).join('');
    
    displayMessage(incomingData.sender, decryptedText, incomingData.binaryArray.join(' '), 'received');
    playSound('snd-recv');
    closeDecryptionModal();
    incomingData = null; 
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
        <span class="binary">Encrypted Network Data: ${bin}</span>
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

function closeModal() { document.getElementById('conversionModal').style.display = "none"; }
function closeDecryptionModal() { document.getElementById('decryptionModal').style.display = "none"; }
