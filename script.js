let bb84Key = null;

// 1. BB84 Simulation: Generate a random key
function generateBB84Key() {
    bb84Key = Math.floor(Math.random() * 255) + 1; // Simulated agreed key
    document.getElementById('key-status').innerText = `Key: ${bb84Key.toString(2)}`;
    alert("BB84 Protocol complete. Shared Secret Key established!");
}


// 2. Encryption: String to Binary + XOR (from your Python file)
function sendMessage() {
    const input = document.getElementById('msg-input');
    const message = input.value;

    if (!message || !bb84Key) {
        alert("Enter message and generate a BB84 key first!");
        return;
    }

    let encryptedBinary = [];
    for (let i = 0; i < message.length; i++) {
        let ascii = message.charCodeAt(i); // ord(ch)
        let xored = ascii ^ bb84Key;       // value ^ key
        encryptedBinary.push(xored.toString(2)); // bin(value)
    }

    displayMessage('You', message, encryptedBinary.join(' '), 'sent');
    
    // Simulate Bob receiving and decrypting
    setTimeout(() => receiveMessage(encryptedBinary), 1000);
    input.value = '';
}

// 3. Decryption: Binary to String (from your Python file)
function receiveMessage(binaryArray) {
    let decryptedText = "";
    binaryArray.forEach(binStr => {
        let decimal = parseInt(binStr, 2) ^ bb84Key; // result_binary XOR key
        decryptedText += String.fromCharCode(decimal); // chr(decimal_value)
    });

    displayMessage('Bob', decryptedText, binaryArray.join(' '), 'received');
}

function displayMessage(user, text, binary, type) {
    const chatBox = document.getElementById('chat-box');
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${type}`;
    msgDiv.innerHTML = `<strong>${user}</strong><br>${text}<span class="binary">Encrypted: ${binary}</span>`;
    chatBox.appendChild(msgDiv);
    chatBox.scrollTop = chatBox.scrollHeight;
}
