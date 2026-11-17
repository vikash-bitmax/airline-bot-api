# Airline AI Customer Simulator (`airline-bot-api`)

Production-grade AI Customer Simulation Platform for testing the International Airline Chat Support CRM.

This platform simulates realistic airline passengers across 36 distinct psychological, behavioural, and accessibility personas executing 8 real-world airline support scenarios (flight cancellations, delays, refunds, lost baggage, booking changes, and payment failures).

---

## 1. Architecture Overview

* **MVC Pattern & Separation of Concerns:** Controllers are thin; business logic is encapsulated in deterministic services.
* **Separation of Persona and Scenario:**
  * **Persona:** Defines *WHO* the customer is (personality, communication style, patience, assertiveness, escalation tendency).
  * **Scenario:** Defines *WHAT* problem the customer has (state machine, fact disclosure policy, expected events, success criteria).
* **Deterministic Synthetic Fixtures:** Given a random seed and conversation ID, the platform generates identical, reproducible passenger names, synthetic PNRs, routes, flight numbers, and dates.
* **Non-Hallucinating State Transitions:** State transitions are governed strictly by the `ScenarioEngine`. The LLM generates natural dialogue within allowed facts, but **never** decides state transitions directly.
* **Authoritative Evidence Rules:** Sensitive CRM actions (such as `BOOKING_IDENTIFIED`, `REFUND_PROCESSED`, `CHAT_CLOSED`) require verified CRM webhook/database records rather than natural language claims.
* **Database Isolation:** Connects to its own dedicated MongoDB database (`airline_crm_simulator`) and never directly accesses the CRM database.

---

## 2. Directory Structure

```
airline-bot-api/
├── src/
│   ├── app.js                          # Express application configuration
│   ├── server.js                       # HTTP & Socket.IO server setup
│   ├── config/
│   │   ├── environment.js              # Validated environment configuration
│   │   ├── database.js                 # Simulator MongoDB connection
│   │   └── redis.js                    # Redis connection options for BullMQ
│   ├── models/
│   │   ├── Persona.model.js            # 36 customer persona schemas
│   │   ├── Scenario.model.js           # 8 scenario state machine schemas
│   │   ├── SimulationRun.model.js      # Simulation batch run tracking
│   │   ├── Conversation.model.js       # Conversation state & snapshot schema
│   │   ├── ConversationMessage.model.js# Atomic sequence-numbered messages
│   │   └── ConversationEvent.model.js  # State transition & evidence history
│   ├── controllers/
│   │   ├── persona.controller.js       # Persona CRUD
│   │   ├── scenario.controller.js      # Scenario CRUD
│   │   ├── simulation.controller.js    # Simulation run orchestration
│   │   ├── conversation.controller.js  # Transcript & replay endpoints
│   │   └── report.controller.js        # Performance & assertion reports
│   ├── services/
│   │   ├── fixture-generator.service.js# Deterministic Mulberry32 synthetic data
│   │   ├── persona-engine.service.js   # Dynamic emotion & metric clamping (0-10)
│   │   ├── scenario-engine.service.js  # State-machine transition validator
│   │   ├── message.service.js          # Concurrency-safe message persistence
│   │   ├── conversation-state.service.js# Event logging & progress tracking
│   │   ├── conversation-orchestrator.service.js # Master coordinator
│   │   ├── event-interpreter.service.js# Semantic agent event classifier
│   │   ├── evaluation.service.js       # Deterministic CRM assertions
│   │   └── reporting.service.js        # Metrics aggregation
│   ├── ai/
│   │   ├── providers/
│   │   │   ├── llm-provider.interface.js
│   │   │   └── gemini.provider.js      # Google Gemini API + fallback generator
│   │   ├── prompts/
│   │   │   ├── customer-system.prompt.js
│   │   │   └── customer-turn.prompt.js
│   │   └── validators/
│   │       └── customer-output.schema.js # Zod schema for structured output
│   ├── integrations/
│   │   └── crm/
│   │       ├── crm-client.js           # Real CRM REST HTTP client
│   │       ├── crm-socket.client.js    # Real CRM Socket.IO client
│   │       └── mock-crm-client.js      # In-memory mock CRM for automated tests
│   ├── queues/
│   │   ├── simulation.queue.js         # BullMQ queue definition
│   │   └── simulation.worker.js        # Background job execution worker
│   ├── middlewares/
│   │   ├── auth.middleware.js          # API key validation
│   │   └── error.middleware.js         # Centralized error handler
│   ├── routes/                         # Express REST route handlers
│   └── utils/
│       └── logger.js                   # Winston structured logger
├── seeds/
│   ├── personas.seed.js                # All 36 personas (idempotent upsert)
│   └── scenarios.seed.js               # All 8 scenarios (idempotent upsert)
├── tests/
│   ├── persona-engine.test.js          # Persona dynamics & clamping tests
│   ├── scenario-engine.test.js         # State machine & transition tests
│   ├── fixture-generator.test.js       # PRNG determinism & format tests
│   └── security.test.js                # Zod validation & evidence tests
├── CRM_INTEGRATION.md                  # Discovered CRM contracts & API specs
├── package.json
└── .env.example
```

---

## 3. Installation & Setup

### Prerequisites
* Node.js v18+
* MongoDB running on `localhost:27017`
* Redis running on `localhost:6379` (optional for local/test mode; direct execution supported)

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Copy the example environment file:
```bash
cp .env.example .env
```

Key variables in `.env`:
* `PORT=5050`
* `MONGODB_URI=mongodb://localhost:27017/airline_crm_simulator`
* `CRM_BASE_URL=http://localhost:5000`
* `CRM_SOCKET_URL=http://localhost:5000`
* `GEMINI_API_KEY=<your-gemini-api-key>`

---

## 4. Seeding Database

The database seeds are idempotent: running them repeatedly updates existing records without creating duplicates.

```bash
# Seed all 36 personas
npm run seed:personas

# Seed all 8 scenarios
npm run seed:scenarios

# Seed both simultaneously
npm run seed
```

---

## 5. Running the Application

### Start the Simulator Backend Server:
```bash
npm start
# Or with hot-reload:
npm run dev
```
* HTTP API: `http://localhost:5050/api/v1`
* Health Check: `http://localhost:5050/health`
* Socket.IO Server: `http://localhost:5050`

### Start the BullMQ Worker (for asynchronous high-volume simulation runs):
```bash
npm run worker
```

---

## 6. Running Automated Tests

Run the test suite:
```bash
npm test
```

---

## 7. API Reference Summary

### Personas (`/api/v1/personas`)
* `GET /` — List all personas (with filters by `category`, `isActive`, `search`)
* `GET /:personaId` — Get single persona details
* `POST /` — Create custom persona
* `PATCH /:personaId` — Update persona
* `DELETE /:personaId` — Deactivate persona (soft-delete)

### Scenarios (`/api/v1/scenarios`)
* `GET /` — List all scenarios
* `GET /:scenarioId` — Get scenario details
* `POST /` — Create scenario
* `PATCH /:scenarioId` — Update scenario
* `DELETE /:scenarioId` — Deactivate scenario

### Simulation Runs (`/api/v1/simulations`)
* `POST /` — Create a simulation run configuration
* `GET /` — List all simulation runs
* `GET /:runId` — Get simulation details and associated conversations
* `POST /:runId/start` — Start/enqueue simulation execution
* `POST /:runId/pause` — Pause simulation run
* `POST /:runId/resume` — Resume simulation run
* `POST /:runId/cancel` — Cancel simulation run

### Conversations (`/api/v1/conversations`)
* `GET /` — List conversations with status and pagination
* `GET /:conversationId` — Get transcript, dynamic persona state, and event history
* `GET /:conversationId/messages` — Get message history
* `GET /:conversationId/events` — Get state transition event timeline
* `GET /:conversationId/replay` — Full transcript replay format
* `POST /:conversationId/stop` — Gracefully stop an active conversation

### Reports (`/api/v1/reports`)
* `GET /overview` — High-level metrics across all runs, completion rates, and scores
* `GET /runs/:runId` — Detailed breakdown for a specific run
* `GET /personas/:personaId` — Performance report for a specific persona
* `GET /scenarios/:scenarioId` — Pass rate report for a specific scenario
