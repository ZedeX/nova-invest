# ADR-0005: Memory Layer (2-Layer Phase 1: KV Short-Term + D1 Long-Term)

## Status

Accepted

## Date

2026-07-19

## Engine Compatibility

| Field | Value |
|-------|-------|
| **Engine** | Next.js 16.2.10 + Cloudflare Workers 4 + KV (short-term) + D1 (long-term structured) |
| **Domain** | Core (Memory Layer / Agent State) |
| **Knowledge Risk** | LOW |
| **References Consulted** | EP01 §ID-3, EP03 §2.5/§反模式, ADR-0001 §USE_MOCK, ADR-0004 §LoopContext.memory_ref, ADR-0011 §Migration 003 (user_profiles + conversation_history), `docs/registry/architecture.yaml`, architecture.md §3 Layer 4 |
| **Post-Cutoff APIs Used** | None |
| **Verification Required** | `MemoryRef` loads short_term eagerly + user_profile lazily; Mock mode uses in-memory Map (no KV/D1 calls); pronoun resolution via LLM prompt history; user data isolation (no cross-user access); conversation_history persists across sessions |

## ADR Dependencies

| Field | Value |
|-------|-------|
| **Depends On** | ADR-0001 (USE_MOCK mode - Mock uses in-memory store, Real uses KV+D1), ADR-0004 (LoopContext.memory_ref field - this ADR defines the shape), ADR-0011 (D1 user_profiles + conversation_history tables - already defined in Migration 003) |
| **Enables** | EP01 Agent Harness stories (memory layer L4), EP03 Ask Agent stories (multi-turn dialog, cross-session personalization), ADR-0014 Observability Schema (memory events in trace) |
| **Blocks** | EP01/EP03 implementation sprints involving multi-turn dialog or personalization |
| **Ordering Note** | ADR-0004 LoopContext interface has `memory_ref?: MemoryRef` field that forward-references this ADR. This ADR defines the `MemoryRef` shape. Does NOT require ADR-0004 to be Accepted (MemoryRef can be unit-tested standalone), but production usage requires the loop. |

## Context

### Problem Statement

EP01 §ID-3 specifies a 3-layer Memory architecture:

```typescript
type Memory = {
  short_term: Message[];           // 对话窗口（最近 N 条）
  long_term_structured: UserPref;   // D1 用户偏好
  long_term_vector: Embedding[];    // Vectorize 历史检索
};
```

EP03 §2.5 adds storage detail: short_term uses KV (session-scoped, context_window 4096 tokens), long_term_structured uses D1 (`user_profiles` + `conversation_history` tables, already defined in ADR-0011 Migration 003), long_term_vector uses Cloudflare Vectorize.

ADR-0004 §LoopContext defines `memory_ref?: MemoryRef` field with comment "per future ADR-0005" - the shape is undefined. Without this ADR:

1. AgentLoop cannot load conversation history for multi-turn dialog (EP03 Job Story 3: "那它的 EPS 呢?" needs previous ticker context).
2. Cross-session personalization (EP03 Job Story 4: "基于我的持仓分析风险") has no mechanism to load user_profile.
3. Mock mode has no memory strategy (would break multi-turn demo flow).
4. `LoopContext.memory_ref` shape is undefined - Sub-Agent handlers cannot access memory.

### Constraints

- **Cloudflare Workers stateless**: No module-level memory caches (per FP-0001/FP-0002/FP-0006 pattern). All memory state must be loaded per-request via `MemoryStore` interface.
- **Mock mode zero external HTTP (FP-0005)**: Mock mode MUST NOT call KV, D1, or Vectorize APIs. Uses in-memory Map + seeded JSON.
- **EP01 §ID-3 3-layer contract**: The ADR must define all 3 layers, even if Phase 1 defers Vectorize. The `MemoryRef` shape must accommodate future Vectorize addition without breaking changes.
- **EP03 §反模式 "跨用户共享长期记忆"**: Strict user_id scoping in all D1 queries + KV key format. No cross-user access.
- **EP03 §2.5 context_window 4096 tokens**: Short-term memory must be bounded. Messages beyond 4096 tokens are summarized or dropped (FIFO).
- **ADR-0011 D1 schema frozen**: `user_profiles` and `conversation_history` tables already defined. This ADR must use them as-is (no schema changes).
- **ADR-0004 LoopContext interface**: `memory_ref?: MemoryRef` is the consumption point. This ADR defines `MemoryRef` shape; ADR-0004 interface unchanged.
- **Phase 1 query volume low**: ~10-100 queries/day expected. Vectorize (long_term_vector) adds complexity without clear ROI at this scale. Defer to Phase 1.5.

### Requirements

- `MemoryRef` type defined with: session_id, user_id, short_term (Message[]), user_profile? (UserPref, lazy), vector_ref? (string, deferred to Phase 1.5).
- `MemoryStore` interface with: `loadShortTerm(session_id, user_id)`, `loadUserProfile(user_id)`, `saveShortTerm(session_id, user_id, messages)`, `appendConversation(user_id, session_id, role, content, metadata)`.
- `MockMemoryStore` class: in-memory Map + seeded JSON from `web/public/mock/user_profile.json`. No external calls.
- `KVMemoryStore` class: Cloudflare KV for short_term. Key format: `session:{user_id}:{session_id}`. TTL: 24 hours.
- `D1UserProfileStore` class: D1 for user_profile + conversation_history. Reuses ADR-0011 Migration 003 tables.
- Pronoun resolution via LLM prompt history (no separate module). Last N messages included in LLM prompt.
- User data isolation: all D1 queries scoped by `WHERE user_id = ?`. KV keys include user_id.
- context_window 4096 tokens: short_term Message[] truncated when exceeding 4096 tokens (FIFO, oldest dropped first).
- Loop integration: `onInit` loads short_term (eager) + prepares lazy loaders; `onFinalize` saves short_term to KV + appends conversation to D1.
- Phase 1.5 trigger: when query volume > 1000/day OR explicit need for semantic search over conversation history, add `VectorizeMemoryStore`.

## Decision

**Adopt a 2-layer memory architecture for Phase 1 (short_term KV + long_term_structured D1), with long_term_vector (Vectorize) deferred to Phase 1.5. `MemoryRef` uses hybrid loading (short_term eager + user_profile lazy + vector_ref deferred). Pronoun resolution via LLM prompt history (no separate NLP module).**

### Architecture Diagram

```
                    ┌──────────────────────────────────────────┐
                    │  AgentLoop.run() (per ADR-0004)          │
                    │                                          │
                    │  onInit:                                 │
                    │    memoryRef = memoryStore.loadRef(...)  │
                    │      -> short_term: Message[] (eager)    │
                    │      -> user_profile: UserPref (lazy)    │
                    │      -> vector_ref: string (deferred)    │
                    │                                          │
                    │  onExecute:                              │
                    │    if (needsPersonalization) {           │
                    │      await memoryRef.loadUserProfile()   │
                    │    }                                     │
                    │    prompt += short_term as history       │
                    │                                          │
                    │  onFinalize:                             │
                    │    memoryStore.saveShortTerm(...)        │
                    │    memoryStore.appendConversation(...)   │
                    └──────────────────┬───────────────────────┘
                                       │
                                       ▼
                    ┌──────────────────────────────────────────┐
                    │  MemoryStore interface (factory)         │
                    │                                          │
                    │  if (isMockMode(env))                    │
                    │    -> MockMemoryStore (in-memory Map)    │
                    │  else                                    │
                    │    -> RealMemoryStore (KV + D1)          │
                    └──────────────────┬───────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    │                                     │
                    ▼                                     ▼
       ┌─────────────────────────┐         ┌─────────────────────────┐
       │  ShortTermStore         │         │  LongTermStructuredStore│
       │                         │         │                         │
       │  Mock: in-memory Map    │         │  Mock: seeded JSON      │
       │  Real: Cloudflare KV    │         │  Real: D1               │
       │                         │         │                         │
       │  Key: session:{uid}:    │         │  Tables (ADR-0011):     │
       │       {session_id}      │         │  - user_profiles        │
       │  Value: Message[] JSON  │         │  - conversation_history │
       │  TTL: 24h               │         │                         │
       └─────────────────────────┘         └─────────────────────────┘

       ┌─────────────────────────────────────────────────────────┐
       │  long_term_vector (Vectorize) - DEFERRED Phase 1.5      │
       │                                                         │
       │  Phase 1.5 trigger: query volume > 1000/day OR explicit │
       │  need for semantic search over conversation history.     │
       │  MemoryRef.vector_ref will hold Vectorize index name.    │
       └─────────────────────────────────────────────────────────┘
```

### Key Interfaces

```typescript
// web/src/lib/memory/types.ts (canonical)

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;  // ISO 8601
  metadata?: {
    intent?: QueryIntent;
    citations_count?: number;
    cost_usd?: number;
  };
}

export interface UserPref {
  user_id: string;
  risk_tolerance?: "conservative" | "moderate" | "aggressive";
  sectors?: string[];           // JSON array in D1: ["tech", "healthcare"]
  preferred_sources?: string[]; // ["yahoo", "sec_edgar"]
  // Note: watchlist, past_strategies, credit_balance are derived from
  // other tables (watchlists, strategies, credit_balances), not stored
  // in user_profiles. EP01 §ID-3 UserPref shape is conceptual; the actual
  // D1 user_profiles table (ADR-0011) stores only risk_tolerance,
  // sectors, preferred_sources.
}

/**
 * MemoryRef is the in-flight memory state consumed by LoopContext.memory_ref
 * (per ADR-0004 IF-0005). Hybrid loading strategy:
 *   - short_term: eager loaded (always needed for multi-turn dialog)
 *   - user_profile: lazy loaded (only when personalization needed)
 *   - vector_ref: deferred to Phase 1.5 (string identifier, not loaded in Phase 1)
 */
export interface MemoryRef {
  session_id: string;
  user_id: string;
  short_term: Message[];                    // eager loaded
  user_profile?: UserPref;                  // lazy loaded via loadUserProfile()
  vector_ref?: string;                      // deferred (Phase 1.5)
  private _store: MemoryStore;              // back-reference for lazy loads
  private _profileLoaded: boolean;

  /**
   * Lazy load user_profile from D1 (Real) or seeded JSON (Mock).
   * Subsequent calls return cached value.
   */
  loadUserProfile(): Promise<UserPref | undefined>;
}

/**
 * MemoryStore interface - factory selects Mock vs Real based on env.
 */
export interface MemoryStore {
  /**
   * Load MemoryRef for a session. Short_term is eager loaded;
   * user_profile and vector_ref are lazy/deferred.
   */
  loadRef(session_id: string, user_id: string): Promise<MemoryRef>;

  /**
   * Load short_term messages from KV (Real) or in-memory Map (Mock).
   * Returns empty array if session not found.
   */
  loadShortTerm(session_id: string, user_id: string): Promise<Message[]>;

  /**
   * Load user_profile from D1 user_profiles table (Real) or seeded JSON (Mock).
   * Returns undefined if user has no profile yet.
   */
  loadUserProfile(user_id: string): Promise<UserPref | undefined>;

  /**
   * Save short_term messages to KV (Real) or in-memory Map (Mock).
   * TTL: 24 hours (KV only; Mock persists until restart).
   */
  saveShortTerm(session_id: string, user_id: string, messages: Message[]): Promise<void>;

  /**
   * Append a message to D1 conversation_history (Real) or in-memory log (Mock).
   * Used by onFinalize to persist the conversation.
   */
  appendConversation(
    user_id: string,
    session_id: string,
    role: "user" | "assistant",
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;
}

// web/src/lib/memory/store.ts (factory)

export function getMemoryStore(env: { USE_MOCK?: string; ENVIRONMENT?: string }): MemoryStore {
  if (isMockMode(env)) {
    return new MockMemoryStore();
  }
  return new RealMemoryStore(env);
}

// web/src/lib/memory/mock-store.ts

export class MockMemoryStore implements MemoryStore {
  private sessions = new Map<string, Message[]>();  // key: `${user_id}:${session_id}`
  private conversations = new Map<string, Message[]>();  // key: user_id
  private seededProfile?: UserPref;

  constructor() {
    // Load seeded user_profile from mock JSON (sync, file read at startup)
    // Path: web/public/mock/user_profile.json
    // If file missing, profile is undefined (Mock still works)
  }

  async loadRef(session_id: string, user_id: string): Promise<MemoryRef> {
    const short_term = await this.loadShortTerm(session_id, user_id);
    return {
      session_id,
      user_id,
      short_term,
      _store: this,
      _profileLoaded: false,
      loadUserProfile: async () => {
        if (this._profileLoaded) return this.seededProfile;
        this._profileLoaded = true;
        return this.seededProfile;
      }
    } as MemoryRef;
  }

  async loadShortTerm(session_id: string, user_id: string): Promise<Message[]> {
    const key = `${user_id}:${session_id}`;
    return this.sessions.get(key) ?? [];
  }

  async loadUserProfile(user_id: string): Promise<UserPref | undefined> {
    return this.seededProfile;
  }

  async saveShortTerm(session_id: string, user_id: string, messages: Message[]): Promise<void> {
    const key = `${user_id}:${session_id}`;
    // Enforce context_window 4096 tokens (FIFO truncation)
    const truncated = truncateToTokenBudget(messages, 4096);
    this.sessions.set(key, truncated);
  }

  async appendConversation(
    user_id: string,
    session_id: string,
    role: "user" | "assistant",
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const key = user_id;
    const conv = this.conversations.get(key) ?? [];
    conv.push({ role, content, timestamp: new Date().toISOString(), metadata });
    this.conversations.set(key, conv);
  }
}

// web/src/lib/memory/real-store.ts (Phase 1 - KV + D1)

export class RealMemoryStore implements MemoryStore {
  constructor(private env: { KV: KVNamespace; DB: D1Database }) {}

  async loadRef(session_id: string, user_id: string): Promise<MemoryRef> {
    const short_term = await this.loadShortTerm(session_id, user_id);
    let profileLoaded = false;
    let profile: UserPref | undefined;

    return {
      session_id,
      user_id,
      short_term,
      _store: this,
      _profileLoaded: false,
      loadUserProfile: async () => {
        if (profileLoaded) return profile;
        profile = await this.loadUserProfile(user_id);
        profileLoaded = true;
        return profile;
      }
    } as MemoryRef;
  }

  async loadShortTerm(session_id: string, user_id: string): Promise<Message[]> {
    const key = `session:${user_id}:${session_id}`;
    const raw = await this.env.KV.get(key, "json");
    return (raw as Message[]) ?? [];
  }

  async loadUserProfile(user_id: string): Promise<UserPref | undefined> {
    const stmt = this.env.DB.prepare("SELECT user_id, risk_tolerance, sectors, preferred_sources FROM user_profiles WHERE user_id = ?");
    const result = await stmt.bind(user_id).first();
    if (!result) return undefined;
    return {
      user_id: result.user_id as string,
      risk_tolerance: result.risk_tolerance as "conservative" | "moderate" | "aggressive" | undefined,
      sectors: result.sectors ? JSON.parse(result.sectors as string) : undefined,
      preferred_sources: result.preferred_sources ? JSON.parse(result.preferred_sources as string) : undefined,
    };
  }

  async saveShortTerm(session_id: string, user_id: string, messages: Message[]): Promise<void> {
    const key = `session:${user_id}:${session_id}`;
    const truncated = truncateToTokenBudget(messages, 4096);
    await this.env.KV.put(key, JSON.stringify(truncated), { expirationTtl: 86400 });  // 24h TTL
  }

  async appendConversation(
    user_id: string,
    session_id: string,
    role: "user" | "assistant",
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const stmt = this.env.DB.prepare(
      "INSERT INTO conversation_history (user_id, session_id, role, content, metadata, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))"
    );
    await stmt.bind(
      user_id,
      session_id,
      role,
      content,
      metadata ? JSON.stringify(metadata) : null
    ).run();
  }
}

// Helper: truncate Message[] to fit within token budget (FIFO)
function truncateToTokenBudget(messages: Message[], maxTokens: number): Message[] {
  // Rough estimate: 1 token ≈ 4 characters
  let totalChars = 0;
  const reversed: Message[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgChars = messages[i].content.length;
    if (totalChars + msgChars > maxTokens * 4) break;
    reversed.unshift(messages[i]);
    totalChars += msgChars;
  }
  return reversed;
}
```

### Pronoun Resolution via LLM Prompt History

EP03 Job Story 3: "Brenda 在第二次对话问'那它的 EPS 呢？'，Ask Agent 知道'它'指 AAPL"

**Phase 1 approach**: Include `memoryRef.short_term` (last N messages, ≤ 4096 tokens) in the LLM prompt as conversation history. The LLM handles coreference resolution naturally.

```typescript
// In AskStepHandler.onExecute (per ADR-0004):
const history = memoryRef.short_term
  .map(m => `${m.role}: ${m.content}`)
  .join("\n");

const prompt = `
Conversation history:
${history}

User question: ${userQuery}

Answer the question, using "it"/"this"/etc. from the history to resolve references.
`;
```

**No separate NLP module**. The LLM's built-in coreference resolution handles common cases ("它" -> last mentioned ticker, "这家公司" -> last analyzed company). Phase 1.5 may add rule-based fallback if LLM misresolution rate > 10%.

### Loop Integration

Per ADR-0004, `StepHandler` integration points:

```typescript
// web/src/lib/agent/ask-handlers.ts (future, not yet implemented)

export class AskStepHandler implements StepHandler {
  async onInit(ctx: LoopContext): Promise<LoopContext> {
    // Load MemoryRef (short_term eager, user_profile lazy)
    const store = getMemoryStore(ctx.env);
    ctx.memory_ref = await store.loadRef(ctx.session_id, ctx.user_id);
    return ctx;
  }

  async onExecute(ctx: LoopContext, plan: Plan): Promise<ExecResult> {
    // If personalization needed, lazy load user_profile
    if (plan.needs_personalization) {
      await ctx.memory_ref?.loadUserProfile();
    }
    // Include short_term in LLM prompt for pronoun resolution
    const history = ctx.memory_ref?.short_term ?? [];
    // ... RAG retrieve, LLM call with history in prompt ...
  }

  async onFinalize(ctx: LoopContext, synthesis: Synthesis): Promise<LoopResult> {
    // Save short_term to KV (or in-memory Mock)
    const updatedMessages = [
      ...ctx.memory_ref!.short_term,
      { role: "user", content: ctx.query, timestamp: new Date().toISOString() },
      { role: "assistant", content: synthesis.answer.summary, timestamp: new Date().toISOString(), metadata: { intent: ctx.intent, cost: ctx.accumulated_cost_usd } },
    ];
    const store = getMemoryStore(ctx.env);
    await store.saveShortTerm(ctx.session_id, ctx.user_id, updatedMessages);
    await store.appendConversation(ctx.user_id, ctx.session_id, "user", ctx.query);
    await store.appendConversation(ctx.user_id, ctx.session_id, "assistant", synthesis.answer.summary, { intent: ctx.intent, cost: ctx.accumulated_cost_usd });

    return { answer: synthesis.answer, trace: ctx.trace, /* ... */ };
  }
}
```

### Mock Mode Seeded Profile

Mock mode loads a seeded `UserPref` from `web/public/mock/user_profile.json`:

```json
{
  "$schema": "https://nova-invest.dev/schemas/user_profile.json",
  "user_id": "mock-user-001",
  "risk_tolerance": "moderate",
  "sectors": ["tech", "semiconductors"],
  "preferred_sources": ["yahoo", "sec_edgar"]
}
```

This file is created by this ADR (alongside existing mock data files per ADR-0001 §API-0002).

### User Data Isolation

- **KV key format**: `session:{user_id}:{session_id}` - user_id is part of the key, preventing cross-user access even if session_id collides.
- **D1 queries**: All `user_profiles` and `conversation_history` queries include `WHERE user_id = ?`. No exceptions.
- **Vectorize (Phase 1.5)**: Per-user index OR single index with user_id metadata filter (decision deferred to Phase 1.5 ADR).
- **Mock mode**: In-memory Map keys include user_id. No cross-user leakage possible.

### Phase 1.5 Vectorize Trigger

Phase 1 skips `long_term_vector` (Vectorize). Phase 1.5 adds it when EITHER:

1. **Query volume > 1000/day**: Semantic search over conversation history becomes valuable for answering "what did I ask about NVDA last week?"
2. **Explicit product need**: User-facing feature requires semantic retrieval (e.g., "search my past conversations for X").

When triggered, a new ADR (ADR-0005 amendment or ADR-0005b) will define:
- `VectorizeMemoryStore` class
- Per-user vs single-index strategy
- Embedding model (Cloudflare Workers AI or external)
- `MemoryRef.vector_ref` field activation

The current `MemoryRef` shape already includes `vector_ref?: string` - Phase 1.5 activation requires no breaking changes.

## Alternatives Considered

### Alternative 1: Full 3-layer from Phase 1 (include Vectorize)

- **Description**: Implement all 3 layers (short_term KV + long_term_structured D1 + long_term_vector Vectorize) from Phase 1.
- **Pros**: Complete EP01 §ID-3 implementation; semantic search available immediately.
- **Cons**: Vectorize is still in beta (Cloudflare docs flag); Phase 1 query volume ~10-100/day doesn't justify semantic search; adds ~50ms latency per query (embedding + vector search); increases operational complexity (3 storage backends instead of 2).
- **Rejection Reason**: Phase 1 simplicity. Defer to Phase 1.5 with explicit trigger conditions. `MemoryRef` shape accommodates future addition without breaking changes.

### Alternative 2: All D1 (no KV for short_term)

- **Description**: Store short_term messages in D1 `conversation_history` table. Load recent N messages per session via SQL query.
- **Pros**: Single storage backend (D1 only); simpler ops; relational queries possible.
- **Cons**: D1 row reads cost (5M/day free tier - short_term messages change frequently, high read/write volume); D1 write latency (~10-50ms) vs KV (~5ms); short_term is ephemeral (24h TTL) - D1 is designed for persistent data; KV is purpose-built for session-scoped data.
- **Rejection Reason**: Cost + write pattern mismatch. KV is cheaper and faster for session-scoped ephemeral data. D1 remains for persistent long_term_structured.

### Alternative 3: All KV (no D1 for long_term_structured)

- **Description**: Store user_profile in KV as JSON. No D1 usage for memory.
- **Pros**: Fast reads; simple; single backend.
- **Cons**: No structured queries (can't SQL JOIN user_profiles + positions + strategies for "based on my holdings"); KV value size limit (25MB, but user_profile is small); no relational integrity; loses ADR-0011 D1 schema benefits (FK constraints, indexes).
- **Rejection Reason**: Lose ADR-0011 schema benefits. user_profile needs JOIN with positions (ADR-0011 FP-0013: holdings canonical = positions table), strategies, watchlists - these are D1 tables.

### Alternative 4: External Redis (Upstash) for short_term

- **Description**: Use Upstash Redis instead of Cloudflare KV for short_term memory.
- **Pros**: Richer data structures (lists, hashes); better TTL management; atomic operations.
- **Cons**: External dependency (adds latency ~20-50ms cross-region); cost (Upstash free tier 10K commands/day, paid tier needed for scale); breaks Cloudflare-native stack principle (architecture.md §6); adds another vendor.
- **Rejection Reason**: Cloudflare-native stack preference. KV is sufficient for Phase 1 (simple get/put with TTL).

### Alternative 5: LLM-based coreference resolution module (separate from prompt history)

- **Description**: Build a separate NLP module that resolves pronouns ("它" -> "AAPL") before passing the query to the main LLM.
- **Pros**: More deterministic; doesn't rely on LLM's coreference ability.
- **Cons**: Extra LLM call or rule engine (~$0.0001 per resolution or 5ms regex); Phase 1 query volume doesn't justify; LLMs (especially Sonnet-tier) handle coreference well in-context; adds maintenance burden.
- **Rejection Reason**: LLM via prompt history is sufficient for Phase 1. Revisit if misresolution rate > 10%.

### Alternative 6: Eager load all (short_term + user_profile + vector_ref) in onInit

- **Description**: Load everything at onInit, no lazy loading.
- **Pros**: Simpler code; no lazy load complexity.
- **Cons**: Adds cold-start latency (KV + D1 + Vectorize = 3 calls × 10-50ms = 30-150ms); many queries don't need user_profile (e.g., "AAPL 现在多少钱" doesn't need personalization); wastes resources.
- **Rejection Reason**: Hybrid loading (short_term eager + user_profile lazy) optimizes latency for the common case.

## Consequences

### Positive

- **EP01 §ID-3 2/3 layers implemented**: short_term (KV) + long_term_structured (D1). long_term_vector (Vectorize) shape defined but deferred.
- **EP03 §2.5 storage mapping formalized**: KV for short_term, D1 for long_term_structured. No ambiguity.
- **ADR-0004 LoopContext.memory_ref shape defined**: Sub-Agent handlers can now access memory via typed interface.
- **Multi-turn dialog enabled**: short_term Message[] loaded eagerly, included in LLM prompt for pronoun resolution.
- **Cross-session personalization enabled**: user_profile lazy loaded from D1 when needed.
- **Mock mode compliant**: In-memory Map + seeded JSON, no KV/D1/Vectorize calls (FP-0005).
- **User data isolation enforced**: KV key format + D1 WHERE clauses.
- **Phase 1.5 path clear**: MemoryRef.vector_ref field reserved; Vectorize addition requires no breaking changes.
- **Reuses ADR-0011 schema**: No D1 schema changes. user_profiles + conversation_history tables already defined.

### Negative

- **2/3 layers only in Phase 1**: EP01 §ID-3 conceptual `long_term_vector` is deferred. Documentation must note this gap.
- **Pronoun resolution depends on LLM quality**: If LLM misresolves "它", user gets wrong answer. No deterministic fallback in Phase 1.
- **KV cost at scale**: KV free tier 100K reads/day, 1K writes/day. At >1000 queries/day, short_term writes may exceed free tier (each query = 1 KV write for saveShortTerm).
- **Mock mode no persistence**: In-memory Map resets on Worker restart. Multi-turn Mock demos must complete in a single session.
- **context_window 4096 tokens is rough estimate**: `truncateToTokenBudget` uses 1 token ≈ 4 chars heuristic. Actual token count may vary (especially for Chinese text where 1 char ≈ 1-2 tokens). May exceed or under-use the budget.
- **conversation_history grows unbounded**: No TTL or archival. Phase 1.5 should add cleanup (e.g., archive conversations older than 90 days).

### Risks

- **Risk**: LLM misresolves pronouns > 10% of the time.
  - **Mitigation**: Phase 1.5 add rule-based fallback (regex for "它" -> last mentioned ticker). Monitor via Eval Golden Set.
- **Risk**: KV write quota exceeded at scale (>1000 queries/day).
  - **Mitigation**: Phase 1.5 consider batching short_term saves (debounce); or migrate to D1 for short_term (Alternative 2).
- **Risk**: `truncateToTokenBudget` heuristic causes prompt overflow (LLM API rejects).
  - **Mitigation**: Use conservative estimate (1 token = 3 chars for Chinese, 4 for English); add 10% safety margin; unit test with edge cases.
- **Risk**: Mock mode in-memory Map causes memory leak in long-running Worker (dev only).
  - **Mitigation**: Mock mode is for local dev only (USE_MOCK=true); Workers in production don't use MockMemoryStore. Add Map size cap (100 sessions) with LRU eviction in MockMemoryStore.
- **Risk**: user_profile lazy load adds latency to personalized queries.
  - **Mitigation**: D1 read is ~10-50ms; acceptable for personalization scenario. If > 100ms, consider caching in LoopContext (request-scoped, not module-level).

## GDD Requirements Addressed

| GDD System | Requirement | How This ADR Addresses It |
|------------|-------------|---------------------------|
| EP01 §ID-3 | `type Memory = { short_term: Message[]; long_term_structured: UserPref; long_term_vector: Embedding[] }` | Defines all 3 layers; Phase 1 implements 2 (short_term + long_term_structured), long_term_vector shape reserved in MemoryRef.vector_ref |
| EP01 §ID-3 | `type UserPref = { watchlist; preferences; past_strategies; credit_balance }` | UserPref interface defined; watchlist/past_strategies/credit_balance are derived from other D1 tables (not stored in user_profiles per ADR-0011) |
| EP01 §L4 Memory | "对话 + 向量 + 结构化" architecture layer | 2/3 implemented (对话=KV, 结构化=D1); 向量=Vectorize deferred |
| EP03 §2.5 | Short-term memory: sessionId/messages/context_window 4096/last_topic (KV) | `ShortTermStore` (KV) + `truncateToTokenBudget(messages, 4096)` + Message.metadata for last_topic |
| EP03 §2.5 | Long-term memory D1 schema: user_profiles + conversation_history | Reuses ADR-0011 Migration 003 tables; `D1UserProfileStore` + `appendConversation()` |
| EP03 §2.5 | `user_profiles.holdings` column REMOVED per ADR-0011 | UserPref does NOT include holdings; derived from EP06 positions table via SQL JOIN |
| EP03 §反模式 | "跨用户共享长期记忆" forbidden | KV key format `session:{user_id}:{session_id}` + D1 WHERE user_id = ?; strict isolation |
| EP03 Job Story 3 | "那它的 EPS 呢?" - pronoun resolution via conversation history | LLM prompt includes short_term Message[] history; LLM handles coreference |
| EP03 Job Story 4 | "基于我的持仓分析风险" - cross-session personalization | `loadUserProfile()` lazy loads from D1; personalization data available |
| EP03 Job Story 7 | Mock mode returns pre-built samples immediately | MockMemoryStore uses in-memory Map + seeded JSON; no KV/D1 calls (FP-0005) |
| EP03 §2.7 | Ask Agent Loop includes SaveMemory state | `StepHandler.onFinalize` saves short_term to KV + appends conversation to D1 |
| ADR-0004 §LoopContext | `memory_ref?: MemoryRef` field "per future ADR-0005" | This ADR defines `MemoryRef` shape (session_id, user_id, short_term, user_profile?, vector_ref?) |
| TR-EP01-005 | 3-layer Memory: short_term / long_term_structured / long_term_vector | 2/3 covered (short_term ✅, long_term_structured ✅); long_term_vector shape defined but deferred (Phase 1.5) |
| TR-EP03-009 | Short-term memory (sessionId/messages/context_window 4096/last_topic) | `MemoryRef.short_term: Message[]` + `truncateToTokenBudget(4096)` |
| TR-EP03-010 | Long-term memory D1 schema (user_profiles + conversation_history) | Already covered by ADR-0011; this ADR provides the access layer (`D1UserProfileStore`) |
| TR-EP03-012 | Ask Agent Loop SaveMemory state | Partial: `StepHandler.onFinalize` saves memory; full Ask loop still in handler implementation |
| TR-EP03-017 | Multi-turn memory with pronoun resolution | LLM prompt history approach; short_term Message[] included in prompt |
| TR-EP03-018 | Cross-session long-term memory persistence (user_profiles) | `loadUserProfile()` lazy loads from D1; conversation_history persists all messages |

## Performance Implications

- **CPU**: `truncateToTokenBudget` O(n) where n = message count; ~0.1ms for 100 messages. `loadUserProfile` lazy load: D1 query ~10-50ms.
- **Memory**: MemoryRef holds short_term Message[] (up to 4096 tokens ≈ 16KB) + UserPref (~500 bytes). Request-scoped, freed after LoopResult.
- **Load Time**:
  - Mock: in-memory Map read ~0.1ms
  - Real short_term (KV): ~5-10ms per load
  - Real user_profile (D1, lazy): ~10-50ms per load (only when personalization needed)
  - Real conversation append (D1): ~10-30ms per write
- **Network**: Mock: zero (FP-0005). Real: 1 KV read (short_term) + 1 D1 read (user_profile, lazy) + 1 KV write (saveShortTerm) + 2 D1 writes (appendConversation × 2) = 5 operations per query.
- **Cost**: Mock: $0. Real: KV free tier 100K reads + 1K writes/day; D1 free tier 5M row reads + 100K row writes/day. At 1000 queries/day: ~1K KV reads + 1K KV writes (may exceed free tier) + ~3K D1 row reads + ~2K D1 row writes (within free tier).

## Migration Plan

Current state: No memory layer exists. `web/src/lib/llm/router.ts` has `MockLLM.complete()` and `RealLLM.complete()` returning single-turn responses (no history). ADR-0004 `LoopContext.memory_ref` is undefined.

Migration steps:

1. **Create `web/src/lib/memory/types.ts`** with `Message`, `UserPref`, `MemoryRef`, `MemoryStore` interfaces.
2. **Create `web/src/lib/memory/store.ts`** with `getMemoryStore(env)` factory.
3. **Create `web/src/lib/memory/mock-store.ts`** with `MockMemoryStore` class (in-memory Map + seeded JSON).
4. **Create `web/src/lib/memory/real-store.ts`** with `RealMemoryStore` class (KV + D1).
5. **Create `web/public/mock/user_profile.json`** with seeded Mock user profile.
6. **Add unit tests** in `web/tests/unit/memory-store.test.ts` covering:
   - Mock: loadRef returns short_term (empty for new session)
   - Mock: saveShortTerm + reload returns saved messages
   - Mock: loadUserProfile returns seeded profile
   - Mock: appendConversation accumulates messages
   - Mock: context_window truncation (4096 tokens)
   - Real: KV get/put with TTL (use Miniflare KV mock)
   - Real: D1 query with WHERE user_id (use Miniflare D1 mock)
   - Real: user_profile lazy load (not loaded until loadUserProfile() called)
   - User isolation: KV key includes user_id; D1 query has WHERE user_id
7. **Update `MockLLM.complete()`** to accept optional `history: Message[]` parameter for multi-turn context. If history provided, include in prompt.
8. **Update `RealLLM.complete()`** (when implemented in Phase 1.5) to accept `history: Message[]` parameter.
9. **Implement `AskStepHandler`** (per ADR-0004) with `onInit`/`onExecute`/`onFinalize` memory integration.
10. **Add Cloudflare KV binding** to `wrangler.toml`: `KV_SESSIONS` namespace.
11. **Verify D1 binding** already exists in `wrangler.toml` for `conversation_history` table access.
12. **Phase 1.5 (future)**: Implement `VectorizeMemoryStore` when trigger conditions met. Activate `MemoryRef.vector_ref` field.

## Validation Criteria

- [ ] `getMemoryStore({ USE_MOCK: "true" })` returns `MockMemoryStore` instance
- [ ] `getMemoryStore({ USE_MOCK: "false", ENVIRONMENT: "production" })` returns `RealMemoryStore` instance
- [ ] `MockMemoryStore.loadRef("sess1", "user1")` returns MemoryRef with `short_term: []` for new session
- [ ] `MockMemoryStore.saveShortTerm("sess1", "user1", [msg1, msg2])` then `loadShortTerm("sess1", "user1")` returns `[msg1, msg2]`
- [ ] `MockMemoryStore.loadUserProfile("user1")` returns seeded profile from `web/public/mock/user_profile.json`
- [ ] `MockMemoryStore` makes zero external HTTP calls (FP-0005 compliance)
- [ ] `RealMemoryStore.loadShortTerm` calls `KV.get("session:{user_id}:{session_id}")`
- [ ] `RealMemoryStore.saveShortTerm` calls `KV.put` with `expirationTtl: 86400`
- [ ] `RealMemoryStore.loadUserProfile` queries `SELECT ... FROM user_profiles WHERE user_id = ?`
- [ ] `RealMemoryStore.appendConversation` inserts into `conversation_history` with user_id + session_id
- [ ] `MemoryRef.loadUserProfile()` is lazy: first call triggers D1 query, second call returns cached value
- [ ] `truncateToTokenBudget(messages, 4096)` drops oldest messages when over budget
- [ ] `truncateToTokenBudget` returns all messages when under budget
- [ ] KV key format includes user_id (no cross-user access even with same session_id)
- [ ] D1 queries include `WHERE user_id = ?` (no cross-user data leakage)
- [ ] `MockMemoryStore` Map has size cap (100 sessions) with LRU eviction
- [ ] No module-level state in `store.ts` (factory returns fresh instance per call)

## Related Decisions

- **ADR-0001** (USE_MOCK dual-mode switch) - Accepted. Mock mode uses `MockMemoryStore`; Real mode uses `RealMemoryStore`. Same env-var-driven switch pattern.
- **ADR-0004** (Agent Loop Design) - Proposed. `LoopContext.memory_ref` field shape defined by this ADR. `StepHandler.onInit`/`onFinalize` are integration points.
- **ADR-0011** (D1 Schema Master) - Proposed. `user_profiles` + `conversation_history` tables (Migration 003) are reused as-is. No schema changes.
- **ADR-0014** (Observability Schema, future) - Memory events (load, save, truncate) should emit TraceStep events.
- **EP01 §ID-3** - Originating design doc (3-layer Memory type).
- **EP03 §2.5** - Storage mapping detail (KV + D1 + Vectorize).
- **EP03 §反模式** - "跨用户共享长期记忆" forbidden (user isolation requirement).
