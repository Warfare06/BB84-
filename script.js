// Configuration for the "Connection"
let bb84Key = null;
let role = prompt("Enter your role (Alice or Bob):"); // Simple way to differentiate users

function generateBB84Key() {
    // This simulates the BB84 exchange from your Python scripts (Sender/Receiver)
    bb84Key = Math.floor(Math.random() * 255) + 1; 
    document.getElementById('key-status').innerText = `Key: ${bb84Key.toString(2)}`;
    
    // In a real Viva, explain this replaces the Sender.py/Receiver.py handshake
    addSystemMessage(`System: ${role} generated a Quantum Key.`);
}

let pendingMessage = ""; // Stores message while popup is open
let pendingBinary = [];  // Stores binary while popup is open

function sendMessage() {
    const input = document.getElementById('msg-input');
    pendingMessage = input.value;

    if (!pendingMessage || !bb84Key) {
        alert("Generate a BB84 Key first!");
        return;
    }

    const modalBody = document.getElementById('modal-body');
    const keyInfo = document.getElementById('key-info');
    modalBody.innerHTML = ""; // Clear old data
    pendingBinary = [];
    
    keyInfo.innerText = `Shared BB84 Key: ${bb84Key} (Binary: ${bb84Key.toString(2)})`;

    // Process each character (Logic from your String to Binary.py)
    for (let i = 0; i < pendingMessage.length; i++) {
        let char = pendingMessage[i];
        let ascii = char.charCodeAt(0);          // ASCII
        let binary = ascii.toString(2).padStart(8, '0'); 
        let xored = ascii ^ bb84Key;             // XOR Operation
        let xorBinary = xored.toString(2).padStart(8, '0');

        pendingBinary.push(xorBinary);

        // Add row to popup table
        let row = `<tr>
            <td>'${char}'</td>
            <td>${ascii}</td>
            <td>${binary}</td>
            <td>${ascii} ⊕ ${bb84Key}</td>
            <td style="color:red; font-weight:bold;">${xorBinary}</td>
        </tr>`;
        modalBody.innerHTML += row;
    }

    // Show the popup
    document.getElementById('conversionModal').style.display = "block";
}

function confirmSend() {
    // This actually puts the message in the chat after you see the popup
    displayMessage('Alice', pendingMessage, pendingBinary.join(' '), 'sent');
    closeModal();
    document.getElementById('msg-input').value = "";
    
    // Simulate Bob receiving it
    setTimeout(() => receiveMessage(pendingBinary), 1000);
}

function closeModal() {
    document.getElementById('conversionModal').style.display = "none";
}

function displayMessage(user, text, binary, type) {
    const chatBox = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.innerHTML = `<strong>${user}</strong><br>${text}<span class="binary">XOR Binary: ${binary}</span>`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}

function addSystemMessage(text) {
    const chatBox = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    msgDiv.style.textAlign = "center";
    msgDiv.style.fontSize = "12px";
    msgDiv.style.color = "gray";
    msgDiv.innerText = text;
    chatBox.appendChild(msgDiv);
}
