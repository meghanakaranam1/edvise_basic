"use client";

import { useState, useRef, useEffect } from "react";

type Message = { role: "user" | "assistant"; content: string };

export default function Home() {
  const [fileId, setFileId] = useState<string>("");
  const [csvName, setCsvName] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvName(file.name);
    setUploading(true);
    setFileId("");

    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body: form });
      const data = await res.json();
      setFileId(data.fileId);
      setMessages([
        {
          role: "assistant",
          content: `I've loaded **${file.name}**. What would you like to know about your class?`,
        },
      ]);
    } catch {
      setCsvName("");
      setMessages([{ role: "assistant", content: "Failed to upload file. Please try again." }]);
    } finally {
      setUploading(false);
    }
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages, fileId }),
      });

      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      setMessages([...newMessages, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
        setMessages([...newMessages, { role: "assistant", content: fullText }]);
      }
    } catch {
      setMessages([...newMessages, { role: "assistant", content: "Something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  }

  const ready = !!fileId && !uploading;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", maxWidth: 760, margin: "0 auto", padding: "0 16px" }}>
      {/* Header */}
      <div style={{ padding: "20px 0 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Edvise</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {csvName && (
            <span style={{ fontSize: 13, color: uploading ? "#d97706" : "#16a34a", background: uploading ? "#fffbeb" : "#f0fdf4", padding: "4px 10px", borderRadius: 20, fontWeight: 500 }}>
              {uploading ? `Uploading ${csvName}…` : `✓ ${csvName}`}
            </span>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              padding: "7px 14px",
              background: uploading ? "#9ca3af" : "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              fontSize: 14,
              cursor: uploading ? "not-allowed" : "pointer",
              fontWeight: 500,
            }}
          >
            {csvName ? "Change file" : "Upload gradebook"}
          </button>
          <input ref={fileInputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", paddingTop: 24, paddingBottom: 8 }}>
        {messages.length === 0 ? (
          <div style={{ textAlign: "center", color: "#9ca3af", marginTop: 80 }}>
            <p style={{ fontSize: 18, marginBottom: 8 }}>Upload a gradebook CSV to get started.</p>
            <p style={{ fontSize: 14 }}>Then ask anything — who needs support, grade averages, trends, and more.</p>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                marginBottom: 16,
              }}
            >
              <div
                style={{
                  maxWidth: "78%",
                  padding: "12px 16px",
                  borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                  background: msg.role === "user" ? "#2563eb" : "#f3f4f6",
                  color: msg.role === "user" ? "#fff" : "#111",
                  fontSize: 15,
                  lineHeight: 1.6,
                  whiteSpace: "pre-wrap",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))
        )}
        {loading && (
          <div style={{ display: "flex", marginBottom: 16 }}>
            <div style={{ padding: "12px 16px", borderRadius: "18px 18px 18px 4px", background: "#f3f4f6", color: "#888", fontSize: 15 }}>
              Thinking…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} style={{ padding: "12px 0 24px", display: "flex", gap: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={ready ? "Ask about your class…" : uploading ? "Uploading file…" : "Upload a gradebook first…"}
          disabled={!ready || loading}
          style={{
            flex: 1,
            padding: "12px 16px",
            borderRadius: 10,
            border: "1px solid #d1d5db",
            fontSize: 15,
            outline: "none",
            background: !ready ? "#f9fafb" : "#fff",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || !ready || loading}
          style={{
            padding: "12px 20px",
            background: !input.trim() || !ready || loading ? "#d1d5db" : "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 10,
            fontSize: 15,
            cursor: !input.trim() || !ready || loading ? "not-allowed" : "pointer",
            fontWeight: 600,
          }}
        >
          Send
        </button>
      </form>
    </div>
  );
}
