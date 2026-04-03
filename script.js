let bb84Key = null;
let currentRole = "Alice";
let pendingText = "";
let pendingBinary = [];

// --- 1. Startup Logic & Role Sync ---
window.onload = () => {
    // Clear old data for a fresh demo
    localStorage.removeItem('quantum_key_sync');
    localStorage.removeItem('quantum_chat_msg');

    let roleInput = prompt("Enter your role (Alice or Bob):", "Alice");
    currentRole = (roleInput && roleInput.toLowerCase() === 'bob') ? "Bob" : "Alice";
    
    document.getElementById('user-role').value = currentRole;
    document.getElementById('chat-with').innerText = `Chatting as: ${currentRole}`;

    // --- 2. THE CHANNEL LISTENERS ---
    window.addEventListener('storage', (event) => {
        // Quantum Channel Listener (Key Sync)
        if (event.key === 'quantum_key_sync' && event.newValue) {
            const data = JSON.parse(event.newValue);
            if (data.sender !== currentRole) {
                bb84Key = data.key;
                updateKeyUI(bb84Key);
                addSystemMessage(`System: Received Shared Quantum Key from ${data.sender}`);
            }
        }

        // Classical Channel Listener (Message Sync)
        if (event.key === 'quantum_chat_msg' && event.newValue) {
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

// --- 3. KEY GENERATION & BROADCAST ---
function generateBB84Key() {
    // Simulated BB84 process results in this key
    bb84Key = Math.floor(Math.random() * 255) + 1;
    
    updateKeyUI(bb84Key);
    addSystemMessage(`System: You generated Quantum Key ${bb84Key}`);

    // Push key to the "Quantum Channel" so the other tab sees it
    const keyData = { 
        sender: currentRole, 
        key: bb84Key, 
        timestamp: Date.now() 
    };
    localStorage.setItem('quantum_key_sync', JSON.stringify(keyData));
}

function updateKeyUI(key) {
    const keyDisplay = document.getElementById('key-status');
    keyDisplay.innerText = `KEY: ${key} (${key.toString(2).padStart(8, '0')})`;
    keyDisplay.style.visibility = "visible";
    keyDisplay.style.opacity = "1";
}

// --- 4. ENCRYPTION (String -> Binary -> XOR) ---
function sendMessage() {
    const input = document.getElementById('msg-input');
    pendingText = input.value;

    if (!pendingText) return;
    if (!bb84Key) { 
        alert("CRITICAL: No Shared Key! Please click 'KEY GEN' first."); 
        return; 
    }

    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = ""; 
    pendingBinary = [];
    
    for (let i = 0; i < pendingText.length; i++) {
        let ascii = pendingText.charCodeAt(i);
        let xored = ascii ^ bb84Key; // XOR Logic from your Python scripts
        let xorBin = xored.toString(2).padStart(8, '0');
        pendingBinary.push(xorBin);

        modalBody.innerHTML += `<tr>
            <td>'${pendingText[i]}'</td>
            <td>${ascii}</td>
            <td style="color: #666;">${ascii.toString(2).padStart(8, '0')}</td>
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
        timestamp: Date.now() 
    };
    
    // Send over "Classical Channel"
    localStorage.setItem('quantum_chat_msg', JSON.stringify(msgData)); 
    
    displayMessage(currentRole, pendingText, pendingBinary.join(' '), 'sent');
    closeModal();
    document.getElementById('msg-input').value = "";
}

// --- 5. DECRYPTION (Binary -> XOR -> String) ---
function receiveFromNetwork(binaryArray, sender) {
    if (!bb84Key) { 
        addSystemMessage(`Warning: Message from ${sender} blocked. Key missing!`); 
        displayMessage(sender, "Encrypted Content 🔒", binaryArray.join(' '), 'received');
        return; 
    }
    
    // Reverse XOR logic
    let decrypted = binaryArray.map(bin => 
        String.fromCharCode(parseInt(bin, 2) ^ bb84Key)
    ).join('');
    
    displayMessage(sender, decrypted, binaryArray.join(' '), 'received');
}

// --- UI HELPERS ---
function displayMessage(user, text, bin, type) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = `<strong>${user}</strong><br>${text}<span class="binary">XOR: ${bin}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function addSystemMessage(t) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.style = "text-align:center; font-size:11px; color:gray; margin:10px; font-style:italic;";
    div.innerText = t;
    box.appendChild(div);
}

function closeModal() { document.getElementById('conversionModal').style.display = "none"; }
