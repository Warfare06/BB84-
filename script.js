// --- 1. FIREBASE INITIALIZATION ---
// Using your exact Firebase configuration
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

// Initialize Firebase App & Database
firebase.initializeApp(firebaseConfig);
const database = firebase.database();

// --- Global Variables ---
let bb84Key = null;
let currentRole = "Alice";
let pendingText = "";
let pendingBinary = [];

// --- 2. Startup & Cloud Listeners ---
window.onload = () => {
    let roleInput = prompt("Enter your role (Alice or Bob):", "Alice");
    currentRole = (roleInput && roleInput.toLowerCase() === 'bob') ? "Bob" : "Alice";
    
    document.getElementById('user-role').value = currentRole;
    document.getElementById('chat-with').innerText = `Chatting as: ${currentRole}`;

    // FIREBASE LISTENER 1: The "Quantum Channel" (Listens for Key Sync)
    database.ref('quantum_channel/keys').on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data.sender !== currentRole) {
            bb84Key = data.key;
            updateKeyUI(bb84Key);
            addSystemMessage(`System: Received Quantum Key from ${data.sender} via Cloud`);
        }
    });

    // FIREBASE LISTENER 2: The "Classical Channel" (Listens for Messages)
    database.ref('quantum_channel/messages').on('child_added', (snapshot) => {
        const data = snapshot.val();
        if (data.sender !== currentRole) {
            receiveFromNetwork(data.binary, data.sender);
        }
    });
};

function setRole() {
    currentRole = document.getElementById('user-role').value;
    document.getElementById('chat-with').innerText = `Chatting as: ${currentRole}`;
}

// --- 3. Key Generation & Sync ---
function generateBB84Key() {
    bb84Key = Math.floor(Math.random() * 255) + 1;
    updateKeyUI(bb84Key);
    addSystemMessage(`System: You generated Quantum Key ${bb84Key}`);

    // Broadcast Key to FIREBASE CLOUD
    database.ref('quantum_channel/keys').push({
        sender: currentRole,
        key: bb84Key,
        time: Date.now()
    });
}

function updateKeyUI(key) {
    const el = document.getElementById('key-status');
    el.innerText = `KEY: ${key} (${key.toString(2).padStart(8, '0')})`;
    el.style.visibility = "visible";
    el.style.opacity = "1";
}

// --- 4. Sending (Classical Channel Transmission) ---
function sendMessage() {
    const input = document.getElementById('msg-input');
    pendingText = input.value;
    if (!pendingText) return;
    if (!bb84Key) { alert("Please generate a BB84 Key first!"); return; }

    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = ""; 
    pendingBinary = [];
    
    for (let i = 0; i < pendingText.length; i++) {
        let ascii = pendingText.charCodeAt(i);
        let xored = ascii ^ bb84Key;
        let xorBin = xored.toString(2).padStart(8, '0');
        pendingBinary.push(xorBin);

        modalBody.innerHTML += `<tr>
            <td>'${pendingText[i]}'</td>
            <td>${ascii}</td>
            <td style="color: gray;">${ascii.toString(2).padStart(8, '0')}</td>
            <td>⊕ ${bb84Key}</td>
            <td style="font-weight: bold; color: #00C2FF;">${xorBin}</td>
        </tr>`;
    }
    document.getElementById('conversionModal').style.display = "block";
}

function confirmAndSend() {
    const msgData = {
        sender: currentRole,
        binary: pendingBinary,
        time: Date.now() 
    };

    // WRITING TO FIREBASE CLOUD - Alice sends encrypted data to Bob
    database.ref('quantum_channel/messages').push(msgData);
    
    displayMessage(currentRole, pendingText, pendingBinary.join(' '), 'sent');
    closeModal();
    document.getElementById('msg-input').value = "";
}

// --- 5. Receiving & Decrypting ---
function receiveFromNetwork(binaryArray, sender) {
    if (!bb84Key) {
        addSystemMessage(`Encrypted message from ${sender} blocked!`);
        displayMessage(sender, "Locked Content 🔐", binaryArray.join(' '), 'received');
        return;
    }
    
    let decrypted = binaryArray.map(bin => 
        String.fromCharCode(parseInt(bin, 2) ^ bb84Key)
    ).join('');
    
    displayMessage(sender, decrypted, binaryArray.join(' '), 'received');
}

// --- UI Helpers ---
function displayMessage(user, text, bin, type) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = `<strong>${user}</strong><br>${text}<span class="binary">XOR: ${bin}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function addSystemMessage(t) {
    const div = document.createElement('div');
    div.className = "system-msg";
    div.style = "text-align:center; font-size:11px; color:gray; margin:10px; font-style:italic;";
    div.innerText = t;
    document.getElementById('chat-box').appendChild(div);
}

function closeModal() { document.getElementById('conversionModal').style.display = "none"; }
