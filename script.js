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

function sendMessage() {
    const input = document.getElementById('msg-input');
    const message = input.value;

    if (!message || !bb84Key) {
        alert("You need a message and a BB84 Key!");
        return;
    }

    // ENCRYPTION (From your "String to Binary.py" logic)
    let encryptedBinary = [];
    for (let i = 0; i < message.length; i++) {
        let ascii = message.charCodeAt(i); 
        let xored = ascii ^ bb84Key;       
        encryptedBinary.push(xored.toString(2)); 
    }

    // Display locally
    displayMessage(role, message, encryptedBinary.join(' '), 'sent');

    // SIMULATING THE SOCKET (From your "1 (1).py" and "2 (1).py" logic)
    // To make this work across two PCs on GitHub, you'd usually use Firebase.
    // For a local demo, we simulate the "Receiver" getting the data.
    setTimeout(() => {
        console.log("Data sent over 'Network' to Bob...");
    }, 500);

    input.value = '';
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
