// --- 1. Global Variables ---
let bb84Key = null; 
let currentRole = "Alice"; // Default role
let pendingText = "";
let pendingBinary = [];

// --- 2. Initialize: Setup Role & Network Listener ---
window.onload = () => {
    // Check if role was previously saved, otherwise ask
    const savedRole = localStorage.getItem('chat_role');
    if (savedRole) {
        currentRole = savedRole;
        document.getElementById('user-role').value = currentRole;
    }
    
    // The "Network" listener: Receives messages from other tabs
    window.addEventListener('storage', (event) => {
        if (event.key === 'quantum_chat_msg') {
            const data = JSON.parse(event.newValue);
            // Only decrypt if the message is NOT from ourselves
            if (data.sender !== currentRole) {
                receiveFromNetwork(data.binary, data.sender);
            }
        }
    });
};

function setRole() {
    currentRole = document.getElementById('user-role').value;
    localStorage.setItem('chat_role', currentRole);
    alert("Role switched to: " + currentRole);
}

// --- 3. BB84 Key Generation ---
function generateBB84Key() {
    // Simulates the result of the BB84 base-matching process
    bb84Key = Math.floor(Math.random() * 255) + 1; 
    document.getElementById('key-status').innerText = `Key: ${bb84Key} (${bb84Key.toString(2)})`;
    addSystemMessage(`System: ${currentRole} generated a Quantum Key: ${bb84Key}`);
}

// --- 4. Encryption Process (Triggered by Send Button) ---
function sendMessage() {
    const input = document.getElementById('msg-input');
    pendingText = input.value;

    if (!pendingText) return;
    if (!bb84Key) {
        alert("Wait! You must 'Generate Key' first to secure the channel.");
        return;
    }

    const modalBody = document.getElementById('modal-body');
    const keyInfo = document.getElementById('key-info');
    modalBody.innerHTML = ""; 
    pendingBinary = [];
    
    keyInfo.innerText = `Shared BB84 Key: ${bb84Key} (Binary: ${bb84Key.toString(2)})`;

    // Step-by-Step Conversion (Matches your Python "String to Binary" logic)
    for (let i = 0; i < pendingText.length; i++) {
        let char = pendingText[i];
        let ascii = char.charCodeAt(0);          // ord(char)
        let binary = ascii.toString(2).padStart(8, '0'); 
        let xored = ascii ^ bb84Key;             // XOR Operation
        let xorBinary = xored.toString(2).padStart(8, '0');

        pendingBinary.push(xorBinary);

        let row = `<tr>
            <td>'${char}'</td>
            <td>${ascii}</td>
            <td>${binary}</td>
            <td>${ascii} ⊕ ${bb84Key}</td>
            <td style="color:red; font-weight:bold;">${xorBinary}</td>
        </tr>`;
        modalBody.innerHTML += row;
    }

    // Show the step-by-step popup
    document.getElementById('conversionModal').style.display = "block";
}

// --- 5. Sending to the "Network" ---
function confirmAndSend() {
    const messageData = {
        sender: currentRole,
        binary: pendingBinary,
        text: pendingText, // Included for UI purposes
        timestamp: Date.now()
    };

    // Save to localStorage (This triggers the 'storage' event in other tabs)
    localStorage.setItem('quantum_chat_msg', JSON.stringify(messageData));
    
    displayMessage(currentRole, pendingText, pendingBinary.join(' '), 'sent');
    closeModal();
    document.getElementById('msg-input').value = "";
}

// --- 6. Decryption Process (Matches your Python "Binary to String" logic) ---
function receiveFromNetwork(binaryArray, senderName) {
    if (!bb84Key) {
        displayMessage(senderName, "??? [Encrypted Data]", binaryArray.join(' '), 'received');
        addSystemMessage("Error: You cannot decrypt this because you don't have the Quantum Key!");
        return;
    }

    let decryptedText = "";
    binaryArray.forEach(bin => {
        let decimal = parseInt(bin, 2) ^ bb84Key; // XOR back with key
        decryptedText += String.fromCharCode(decimal);
    });

    displayMessage(senderName, decryptedText, binaryArray.join(' '), 'received');
}

// --- 7. UI Helper Functions ---
function displayMessage(user, text, binary, type) {
    const chatBox = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.innerHTML = `<strong>${user}</strong><br>${text}<br><span class="binary">Binary: ${binary}</span>`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addSystemMessage(text) {
    const chatBox = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    msgDiv.style.textAlign = "center";
    msgDiv.style.fontSize = "12px";
    msgDiv.style.color = "gray";
    msgDiv.style.margin = "10px 0";
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
}

function closeModal() {
    document.getElementById('conversionModal').style.display = "none";
}
