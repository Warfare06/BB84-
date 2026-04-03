let bb84Key = null;
let currentRole = "Alice";
let pendingText = "";
let pendingBinary = [];

// Startup Role Selection & Network Listeners
window.onload = () => {
    let roleInput = prompt("Enter your role (Alice or Bob):", "Alice");
    currentRole = (roleInput && roleInput.toLowerCase() === 'bob') ? "Bob" : "Alice";
    document.getElementById('user-role').value = currentRole;
    document.getElementById('chat-with').innerText = `Chatting as: ${currentRole}`;
    
    // LISTENERS for the "Quantum & Classical Channels"
    window.addEventListener('storage', (event) => {
        // 1. Listen for new Keys (Quantum Channel Simulation)
        if (event.key === 'quantum_key_sync') {
            const data = JSON.parse(event.newValue);
            if (data.sender !== currentRole) {
                bb84Key = data.key;
                const keyDisplay = document.getElementById('key-status');
                keyDisplay.innerText = `KEY: ${bb84Key} (${bb84Key.toString(2).padStart(8, '0')})`;
                keyDisplay.style.visibility = "visible";
                addSystemMessage(`System: Received Shared Quantum Key from ${data.sender}`);
            }
        }
        
        // 2. Listen for new Messages (Classical Channel)
        if (event.key === 'quantum_chat_msg') {
            const data = JSON.parse(event.newValue);
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

// BB84 Key Generation & SYNCHRONIZATION
function generateBB84Key() {
    bb84Key = Math.floor(Math.random() * 255) + 1;
    
    // Update local UI
    const keyDisplay = document.getElementById('key-status');
    keyDisplay.innerText = `KEY: ${bb84Key} (${bb84Key.toString(2).padStart(8, '0')})`;
    keyDisplay.style.visibility = "visible";
    addSystemMessage(`System: You generated Quantum Key ${bb84Key}`);

    // SEND KEY TO OTHER USER (Simulating the QKD result)
    const keyData = { sender: currentRole, key: bb84Key, timestamp: Date.now() };
    localStorage.setItem('quantum_key_sync', JSON.stringify(keyData));
}

// Encryption Process
function sendMessage() {
    const input = document.getElementById('msg-input');
    pendingText = input.value;
    if (!pendingText) return;
    if (!bb84Key) { 
        alert("CRITICAL: No Shared Key! One user must click 'KEY GEN' first."); 
        return; 
    }

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
    const msgData = { sender: currentRole, binary: pendingBinary, timestamp: Date.now() };
    // Classic Channel Transmission
    localStorage.setItem('quantum_chat_msg', JSON.stringify(msgData)); 
    
    displayMessage(currentRole, pendingText, pendingBinary.join(' '), 'sent');
    closeModal();
    document.getElementById('msg-input').value = "";
}

// Decryption Process
function receiveFromNetwork(binaryArray, sender) {
    // Check if we have the key to decrypt
    if (!bb84Key) { 
        addSystemMessage(`Warning: Message received from ${sender}, but you lack the Quantum Key!`); 
        displayMessage(sender, "Locked Content 🔐", binaryArray.join(' '), 'received');
        return; 
    }
    
    let decrypted = binaryArray.map(bin => String.fromCharCode(parseInt(bin, 2) ^ bb84Key)).join('');
    displayMessage(sender, decrypted, binaryArray.join(' '), 'received');
}

function displayMessage(user, text, bin, type) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = `<strong>${user}</strong><br>${text}<span class="binary">Encrypted: ${bin}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function addSystemMessage(t) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.style = "text-align:center; font-size:11px; color:gray; margin:10px;";
    div.innerText = t;
    box.appendChild(div);
}

function closeModal() { document.getElementById('conversionModal').style.display = "none"; }
