let bb84Key = null;
let currentRole = "Alice";
let pendingText = "";
let pendingBinary = [];

// --- 1. Startup & Global Listeners ---
window.onload = () => {
    // Clear old data so it doesn't get confused
    localStorage.removeItem('quantum_chat_msg');
    localStorage.removeItem('quantum_key_sync');

    let roleInput = prompt("Enter your role (Alice or Bob):", "Alice");
    currentRole = (roleInput && roleInput.toLowerCase() === 'bob') ? "Bob" : "Alice";
    
    document.getElementById('user-role').value = currentRole;
    document.getElementById('chat-with').innerText = `Chatting as: ${currentRole}`;

    // THE LISTENER: This is the "Classical Channel"
    window.addEventListener('storage', (event) => {
        if (!event.newValue) return; // Ignore deletions
        
        const data = JSON.parse(event.newValue);
        
        // Handle Key Synchronization
        if (event.key === 'quantum_key_sync') {
            if (data.sender !== currentRole) {
                bb84Key = data.key;
                updateKeyUI(bb84Key);
                addSystemMessage(`System: Received Quantum Key from ${data.sender}`);
            }
        }

        // Handle Message Synchronization
        if (event.key === 'quantum_chat_msg') {
            if (data.sender !== currentRole) {
                receiveFromNetwork(data.binary, data.sender);
            }
        }
    });
};

function setRole() {
    currentRole = document.getElementById('user-role').value;
    document.getElementById('chat-with').innerText = `Chatting as: ${currentRole}`;
}

// --- 2. Key Generation & Sync ---
function generateBB84Key() {
    bb84Key = Math.floor(Math.random() * 255) + 1;
    updateKeyUI(bb84Key);
    addSystemMessage(`System: You generated Quantum Key ${bb84Key}`);

    // Broadcast Key
    localStorage.setItem('quantum_key_sync', JSON.stringify({
        sender: currentRole,
        key: bb84Key,
        time: Date.now()
    }));
}

function updateKeyUI(key) {
    const el = document.getElementById('key-status');
    el.innerText = `KEY: ${key} (${key.toString(2).padStart(8, '0')})`;
    el.style.visibility = "visible";
    el.style.opacity = "1";
}

// --- 3. Sending (Classical Channel Transmission) ---
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
        time: Date.now() // Timestamp forces the storage event to fire every time
    };

    // WRITING TO STORAGE - This is where Alice sends data to Bob
    localStorage.setItem('quantum_chat_msg', JSON.stringify(msgData));
    
    displayMessage(currentRole, pendingText, pendingBinary.join(' '), 'sent');
    closeModal();
    document.getElementById('msg-input').value = "";
}

// --- 4. Receiving & Decrypting ---
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
    div.className = "system-msg"; // Ensure this matches your CSS or style it here
    div.style = "text-align:center; font-size:11px; color:gray; margin:10px; font-style:italic;";
    div.innerText = t;
    document.getElementById('chat-box').appendChild(div);
}

function closeModal() { document.getElementById('conversionModal').style.display = "none"; }
