// Saves text as a file through the browser. The content is created in memory and handed to the browser's own download;
// nothing is sent anywhere.
export function downloadText(name, text, type = "text/plain;charset=utf-8", { bom = false } = {}) {
  const url = URL.createObjectURL(new Blob([bom ? `﻿${text}` : text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name;
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
