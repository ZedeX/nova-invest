/**
 * Top navigation header.
 */

import Link from "next/link";
import { MockBadge } from "./MockBadge";
import { ThemeToggle } from "./ThemeToggle";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/chart/AAPL", label: "Chart" },
  { href: "/ask", label: "Ask" },
  { href: "/strategy", label: "Strategy" },
  { href: "/backtest", label: "Backtest" },
  { href: "/broker", label: "Broker" },
  { href: "/playbook", label: "Playbook" },
  { href: "/community", label: "Community" },
];

export function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 backdrop-blur">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-gradient-to-br from-blue-500 to-cyan-400 flex items-center justify-center text-white font-bold text-sm">
              N
            </div>
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">
              nova-invest
            </span>
          </Link>
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3 py-1.5 rounded text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <MockBadge />
          <ThemeToggle />
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-zinc-400 to-zinc-600 flex items-center justify-center text-white text-xs font-medium">
            B
          </div>
        </div>
      </div>
    </header>
  );
}
