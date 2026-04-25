const createBtn = document.getElementById("createBtn");
const joinBtn = document.getElementById("joinBtn");
const createSection = document.getElementById("createSection");
const joinSection = document.getElementById("joinSection");
const optionSection = document.getElementById("optionSection");
const chatSection = document.getElementById("chatSection");
const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("message");
const imageInput = document.getElementById("imageInput");
const sendButton = document.getElementById("send");
const chatWith = document.getElementById("chatWith");

const overlay = document.getElementById("overlay");
const overlayImg = document.getElementById("overlayImg");
const closeOverlay = document.getElementById("closeOverlay");
const previewContainer = document.getElementById("previewContainer");

let username = "";
let secret = "";
let partner = "";

// Show sections
createBtn.onclick = () => {
  optionSection.style.display = "none";
  createSection.style.display = "flex";
};

joinBtn.onclick = () => {
  optionSection.style.display = "none";
  joinSection.style.display = "flex";
};

// Create chat
document.getElementById("createSubmit").onclick = () => {
  const name = document.getElementById("createName").value.trim();
  const pin = document.getElementById("createPin").value.trim();
  if (!name || !pin) return alert("Enter both name and pin!");
  username = name;
  secret = pin;
  const pins = JSON.parse(localStorage.getItem("chat-pins") || "{}");
  if (!pins[pin]) {
    pins[pin] = name;
    localStorage.setItem("chat-pins", JSON.stringify(pins));
  }
  chatWith.textContent = "Waiting...";
  createSection.style.display = "none";
  chatSection.style.display = "flex";
};

// Join chat
document.getElementById("joinSubmit").onclick = () => {
  const name = document.getElementById("joinName").value.trim();
  const pin = document.getElementById("joinPin").value.trim();
  if (!name || !pin) return alert("Enter both name and pin!");
  const pins = JSON.parse(localStorage.getItem("chat-pins") || "{}");
  if (!pins[pin]) {
    alert("No such secret pin exists!");
    return;
  }
  username = name;
  secret = pin;
  partner = pins[pin];
  chatWith.textContent = partner;
  joinSection.style.display = "none";
  chatSection.style.display = "flex";
};

// Encryption helpers
async function getKey(password) {
  const enc = new TextEncoder();
  const keyMaterial = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: enc.encode("chat-salt"), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptMessage(message, password) {
  const key = await getKey(password);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(message);
  const cipherText = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return { iv: Array.from(iv), data: Array.from(new Uint8Array(cipherText)), from: username, pin: password };
}

async function decryptMessage(encrypted, password) {
  const key = await getKey(password);
  const iv = new Uint8Array(encrypted.iv);
  const data = new Uint8Array(encrypted.data);
  try {
    const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    return "[Unable to decrypt]";
  }
}

// Append messages
function appendMessage(text, isMe, isImage = false, isFile = false, fileName = "") {
  const div = document.createElement("div");
  div.className = "message " + (isMe ? "me" : "them");

  if (isImage) {
    const img = document.createElement("img");
    img.src = text;
    img.style.maxWidth = "200px";
    img.style.cursor = "pointer";
    img.onclick = () => { overlayImg.src = text; overlay.style.display = "flex"; };
    div.appendChild(img);
  } else if (isFile) {
    const link = document.createElement("a");
    link.href = text;
    link.download = fileName;
    link.textContent = fileName; // Show real filename
    div.appendChild(link);
  } else {
    div.textContent = text;
  }

  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

// File preview
imageInput.addEventListener("change", () => {
  previewContainer.innerHTML = "";
  const file = imageInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if(file.type.startsWith("image/")) {
      const img = document.createElement("img");
      img.src = reader.result;
      img.onclick = () => { overlayImg.src = reader.result; overlay.style.display = "flex"; };
      previewContainer.appendChild(img);
    } else {
      const link = document.createElement("a");
      link.href = reader.result;
      link.download = file.name;
      link.textContent = file.name;
      previewContainer.appendChild(link);
    }
  };
  reader.readAsDataURL(file);
});

// Send message/file
async function sendCurrentMessage() {
  if (!secret) return;
  const file = imageInput.files[0];

  if(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result;
      const encrypted = await encryptMessage(JSON.stringify({data: base64, name: file.name}), secret);
      localStorage.setItem("chat-msg", JSON.stringify(encrypted));

      if(file.type.startsWith("image/")) appendMessage(base64, true, true);
      else appendMessage(base64, true, false, true, file.name);

      imageInput.value = "";
      previewContainer.innerHTML = "";
      messageInput.value = "";
    };
    reader.readAsDataURL(file);
    return;
  }

  const text = messageInput.value.trim();
  if(!text) return;
  const encrypted = await encryptMessage(text, secret);
  localStorage.setItem("chat-msg", JSON.stringify(encrypted));
  appendMessage(text, true);
  messageInput.value = "";
}

sendButton.onclick = sendCurrentMessage;
messageInput.addEventListener("keydown", e => { if(e.key === "Enter") sendCurrentMessage(); });

// Receive messages
window.addEventListener("storage", async event => {
  if(event.key === "chat-msg") {
    const encrypted = JSON.parse(event.newValue);
    if(encrypted.from === username || encrypted.pin !== secret) return;
    partner = encrypted.from;
    chatWith.textContent = partner;
    const decrypted = await decryptMessage(encrypted, secret);

    // Check if it's a file (JSON)
    let isFile = false, fileData = "", fileName = "";
    try {
      const obj = JSON.parse(decrypted);
      if(obj.data && obj.name) {
        isFile = true;
        fileData = obj.data;
        fileName = obj.name;
      }
    } catch {}

    if(isFile) {
      if(fileData.startsWith("data:image/")) appendMessage(fileData, false, true);
      else appendMessage(fileData, false, false, true, fileName);
    } else if(decrypted.startsWith("data:image/")) appendMessage(decrypted, false, true);
    else appendMessage(decrypted, false);
  }
});

// Overlay close
closeOverlay.onclick = () => { overlay.style.display = "none"; };
overlay.onclick = e => { if(e.target === overlay) overlay.style.display = "none"; };
