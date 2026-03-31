function sendMessage() {
    var msg = document.getElementById("msg").value;
    var messages = document.getElementById("messages");

    var bubble = document.createElement("div");
    bubble.innerText = msg;
    bubble.style.background = "#dcf8c6";
    bubble.style.padding = "10px";
    bubble.style.margin = "5px";
    bubble.style.width = "fit-content";
    bubble.style.borderRadius = "10px";

    messages.appendChild(bubble);

    document.getElementById("msg").value = "";
}
