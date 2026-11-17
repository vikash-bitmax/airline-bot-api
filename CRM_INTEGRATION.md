# Airline CRM Simulator Integration Guide

This document specifies the exact communication contracts between the **Airline AI Customer Simulation Platform** (`airline-bot-api`) and the **Airline Chat Support CRM** (`airline-crm-api`).

---

## 1. Architecture Overview

```
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│     AI Customer Simulator       │               │        Airline Support CRM      │
│      (`airline-bot-api`)        │               │       (`airline-crm-api`)       │
│                                 │               │                                 │
│  • Persona Engine               │  HTTP REST    │  • Session Service              │
│  • Scenario State Machine       ├──────────────►│  • Queue Routing & Assignment   │
│  • Deterministic Fixture        │  Socket.IO    │  • Live Agent Frontline         │
│  • Gemini AI Generator          │◄─────────────►│  • L2/L3 Escalation Desk        │
└─────────────────────────────────┘               └─────────────────────────────────┘
```

The simulator acts strictly as an external passenger. It never impersonates agents, touches internal CRM MongoDB collections, or uses privileged administrative bypasses.

---

## 2. HTTP REST Contracts (Discovered from CRM Source)

### A. Start Customer Chat Session
* **Method:** `POST`
* **Path:** `/api/chat/sessions` (or `/api/v1/chat/sessions`)
* **Headers:**
  ```http
  Content-Type: application/json
  ```
* **Request Body:**
  ```json
  {
    "customerName": "Alexander Smith",
    "passengerEmail": "alexander.smith@example.test",
    "pnr": "SK89F2",
    "flightNumber": "SK101",
    "category": "DISRUPTION",
    "initialMessage": "Hello, my flight SK101 was cancelled and I need assistance."
  }
  ```
* **Success Response (201 Created):**
  ```json
  {
    "success": true,
    "message": "Chat session created",
    "data": {
      "chatId": "CHAT-A92F10CB",
      "status": "WAITING",
      "assigned": false,
      "customerSessionToken": "cst_eyJhbGciOi...",
      "expiresAt": "2026-11-18T10:00:00.000Z"
    }
  }
  ```

### B. Send Customer Message
* **Method:** `POST`
* **Path:** `/api/chat/sessions/:chatId/messages`
* **Headers:**
  ```http
  Content-Type: application/json
  x-chat-session-token: <customerSessionToken>
  ```
* **Request Body:**
  ```json
  {
    "text": "My booking reference is SK89F2 under name Alexander Smith.",
    "clientMessageId": "MSG-98214A"
  }
  ```

### C. Close Customer Chat Session
* **Method:** `POST`
* **Path:** `/api/chat/sessions/:chatId/close`
* **Headers:**
  ```http
  Content-Type: application/json
  x-chat-session-token: <customerSessionToken>
  ```

---

## 3. Real-Time Socket.IO Contracts

### A. Connection Handshake
* **URL:** `http://localhost:5000` (or `CRM_SOCKET_URL`)
* **Auth Payload:**
  ```javascript
  const socket = io(CRM_SOCKET_URL, {
    auth: {
      chatSessionToken: customerSessionToken
    }
  });
  ```

### B. Joining Conversation Room
Once connected, the customer socket joins the dedicated chat room:
```javascript
socket.emit('chat:join', { chatId: "CHAT-A92F10CB" }, (ack) => {
  console.log('Joined CRM chat room:', ack);
});
```

### C. Inbound CRM Events (Agent & System Responses)
The simulator listens for these server events:
* **`chat:message:new` / `chat:message`:** Inbound agent messages.
  ```json
  {
    "messageId": "MSG-0012",
    "senderRole": "AGENT",
    "senderName": "Sarah Connor",
    "text": "I can help rebook you onto the next flight leaving at 14:00.",
    "createdAt": "2026-11-17T11:45:00.000Z"
  }
  ```
* **`chat:assigned`:** Agent assignment event.
* **`chat:transferred`:** Transferred to L2/specialist desk.
* **`chat:escalated`:** Escalated to Team Lead / Supervisor.
* **`chat:status:changed`:** Transitioned to `RESOLVED` or `CLOSED`.

---

## 4. Environment Variables Required

In your `airline-bot-api/.env`:

```env
CRM_ENVIRONMENT=TEST
CRM_BASE_URL=http://localhost:5000
CRM_SOCKET_URL=http://localhost:5000
CRM_ALLOWED_HOSTS=localhost,127.0.0.1
CRM_SERVICE_TOKEN=
```

---

## 5. Security & Isolation Guarantee

1. **Database Isolation:** Simulator connects to `airline_crm_simulator` and never directly reads or writes to the CRM's database `airline_crm`.
2. **Fail-Closed Protection:** The simulator will refuse to boot if `CRM_ENVIRONMENT=PRODUCTION` to prevent accidental disruption of live flights or customer records.
3. **Synthetic Domains Only:** All synthetic customer emails use the reserved test domain `@example.test`.
