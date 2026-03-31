let bb84Key = null;
let currentRole = "Alice";
let pendingText = "";
let pendingBinary = [];

// Ask for role on startup
window.onload = () => {
    let roleInput = prompt("Enter your role (Alice or Bob):", "Alice");
    currentRole = (roleInput && roleInput.toLowerCase() === 'bob') ? "Bob" : "Alice";
    document.getElementById('user-role').value = currentRole;
    document.getElementById('chat-with').innerText = `Chatting as: ${currentRole}`;
    
    // Network Listener
    window.addEventListener('storage', (event) => {
        if (event.key === 'quantum_chat_msg') {
            const data = JSON.parse(event.newValue);
            if (data.sender !== currentRole) receiveFromNetwork(data.binary, data.sender);
        }
    });
};

function setRole() {
    currentRole = document.getElementById('user-role').value;
    document.getElementById('chat-with').innerText = `Chatting as: ${currentRole}`;
}

function generateBB84Key() {
    bb84Key = Math.floor(Math.random() * 255) + 1;
    document.getElementById('key-status').innerText = `KEY: ${bb84Key} (${bb84Key.toString(2)})`;
    addSystemMessage(`System: ${currentRole} generated Quantum Key ${bb84Key}`);
}

function sendMessage() {
    const input = document.getElementById('msg-input');
    pendingText = input.value;
    if (!pendingText || !bb84Key) { alert("Generate Key first!"); return; }

    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = ""; pendingBinary = [];
    
    for (let i = 0; i < pendingText.length; i++) {
        let ascii = pendingText.charCodeAt(i);
        let xored = ascii ^ bb84Key;
        let xorBin = xored.toString(2).padStart(8, '0');
        pendingBinary.push(xorBin);

        modalBody.innerHTML += `<tr><td>'${pendingText[i]}'</td><td>${ascii}</td><td>${ascii.toString(2)}</td><td>⊕ ${bb84Key}</td><td>${xorBin}</td></tr>`;
    }
    document.getElementById('conversionModal').style.display = "block";
}

function confirmAndSend() {
    const msgData = { sender: currentRole, binary: pendingBinary, timestamp: Date.now() };
    localStorage.setItem('quantum_chat_msg', JSON.stringify(msgData));
    displayMessage(currentRole, pendingText, pendingBinary.join(' '), 'sent');
    closeModal();
    document.getElementById('msg-input').value = "";
}

function receiveFromNetwork(binaryArray, sender) {
    if (!bb84Key) { addSystemMessage("Encrypted message received. No Key found!"); return; }
    let decrypted = binaryArray.map(bin => String.fromCharCode(parseInt(bin, 2) ^ bb84Key)).join('');
    displayMessage(sender, decrypted, binaryArray.join(' '), 'received');
}

function displayMessage(user, text, bin, type) {
    const box = document.getElementById('chat-box');
    const div = document.createElement('div');
    div.className = `message ${type}`;
    div.innerHTML = `<strong>${user}</strong><br>${text}<span class="binary">Binary: ${bin}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
}

function addSystemMessage(t) {
    const div = document.createElement('div');
    div.style = "text-align:center; font-size:11px; color:gray; margin:10px;";
    div.innerText = t;
    document.getElementById('chat-box').appendChild(div);
}

function closeModal() { document.getElementById('conversionModal').style.display = "none"; }
