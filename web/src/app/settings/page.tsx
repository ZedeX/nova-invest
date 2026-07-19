/**
 * Settings Page.
 * Mock/Real mode toggle + LLM provider config + account settings.
 */

"use client";

import { useState } from "react";

export default function SettingsPage() {
  const [useMock, setUseMock] = useState(true);
  const [llmProvider, setLlmProvider] = useState("local-lmstudio");
  const [defaultModel, setDefaultModel] = useState("claude-sonnet-4-5");

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-zinc-500 mt-1">
          Configure runtime mode, LLM providers, and account preferences.
        </p>
      </div>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <h2 className="text-base font-semibold mb-3">Runtime Mode</h2>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">Use Mock Data</div>
            <p className="text-xs text-zinc-500 mt-1">
              When ON: all data sources return pre-generated Mock data (0 Credit consumption).<br />
              When OFF: real APIs (Yahoo Finance, LLM, Vectorize) are used.
            </p>
          </div>
          <button
            onClick={() => setUseMock(!useMock)}
            className={`relative w-12 h-6 rounded-full transition-colors ${useMock ? "bg-blue-600" : "bg-zinc-300 dark:bg-zinc-700"}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${useMock ? "translate-x-6" : ""}`}
            />
          </button>
        </div>
        <div className="mt-3 px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
          <code className="text-xs font-mono text-amber-800 dark:text-amber-200">
            USE_MOCK={useMock ? "true" : "false"}
          </code>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <h2 className="text-base font-semibold mb-3">LLM Provider</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Active Provider</label>
            <select
              value={llmProvider}
              onChange={e => setLlmProvider(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm"
            >
              <option value="local-lmstudio">Local — LM Studio (http://localhost:1234)</option>
              <option value="volcano-ark">Cloud — Volcano Engine Ark (豆包/Doubao)</option>
              <option value="anthropic">Cloud — Anthropic (Claude)</option>
              <option value="openai">Cloud — OpenAI (GPT)</option>
              <option value="google">Cloud — Google (Gemini)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Default Model (Real mode)</label>
            <select
              value={defaultModel}
              onChange={e => setDefaultModel(e.target.value)}
              className="w-full px-2 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-transparent text-sm font-mono"
            >
              <option value="claude-sonnet-4-5">claude-sonnet-4-5</option>
              <option value="claude-haiku-4-5">claude-haiku-4-5</option>
              <option value="gpt-4o">gpt-4o</option>
              <option value="gemini-2.5-pro">gemini-2.5-pro</option>
              <option value="doubao-pro-32k">doubao-pro-32k</option>
              <option value="local-qwen2.5-14b">local: qwen2.5-14b-instruct</option>
            </select>
          </div>
          <div className="text-xs text-zinc-500">
            Routing rules (defined in <code className="font-mono">src/lib/llm/router.ts</code>):
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li><code>simple_qa</code> → haiku-class model (cheap)</li>
              <li><code>deep_research</code> → sonnet-class model (premium)</li>
              <li><code>tool_call</code> → sonnet-class with tools</li>
              <li><code>clarify</code> → haiku-class fallback</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <h2 className="text-base font-semibold mb-3">Account</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-zinc-500">Email</dt><dd>brenda@example.com</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Plan</dt><dd>Pro ($29/mo)</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Credit Balance</dt><dd className="font-mono">847 / 1000</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Renewal</dt><dd>2026-08-18</dd></div>
        </dl>
      </section>

      <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
        <h2 className="text-base font-semibold mb-3">Deployment</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-zinc-500">Target</dt><dd>Cloudflare Workers (Free Tier)</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">D1 Database</dt><dd className="font-mono">nova-invest-db</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">R2 Bucket</dt><dd className="font-mono">nova-invest-cache</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">KV Namespace</dt><dd className="font-mono">nova-invest-kv</dd></div>
          <div className="flex justify-between"><dt className="text-zinc-500">Vectorize Index</dt><dd className="font-mono">nova-invest-vec</dd></div>
        </dl>
      </section>
    </div>
  );
}
