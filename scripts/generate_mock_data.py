"""
Nova-Invest Mock Data Generator
Generates Mock K-line JSON files for 10 popular US stock symbols.
Output: web/public/mock/klines/{SYMBOL}_1d.json

Usage:
  python scripts/generate_mock_data.py

Output schema:
  {
    "ticker": "AAPL",
    "timeframe": "1d",
    "source": "mock",
    "generated_at": "2025-12-15T00:00:00Z",
    "data": [
      { "t": "2024-01-02", "o": 187.15, "h": 188.44, "l": 186.86, "c": 187.31, "v": 82488700 }
    ]
  }
"""
import json
import os
import random
from datetime import datetime, timedelta
from pathlib import Path

# Output directory (relative to project root)
OUTPUT_DIR = Path(__file__).parent.parent / "web" / "public" / "mock" / "klines"
QA_DIR = Path(__file__).parent.parent / "web" / "public" / "mock" / "qa_samples"
COMMUNITY_DIR = Path(__file__).parent.parent / "web" / "public" / "mock" / "community"

# 10 symbols in the Mockup pool (per Epic 02 decision)
SYMBOLS = ["AAPL", "MSFT", "NVDA", "GOOG", "META",
           "AMZN", "TSLA", "NFLX", "AMD", "INTC"]

# Realistic base prices (late 2024 references)
BASE_PRICES = {
    "AAPL": 187.0, "MSFT": 420.0, "NVDA": 130.0, "GOOG": 175.0,
    "META": 580.0, "AMZN": 185.0, "TSLA": 250.0, "NFLX": 900.0,
    "AMD": 220.0, "INTC": 50.0,
}

# Annualized volatility estimates (for realistic-looking K-lines)
ANNUAL_VOL = {
    "AAPL": 0.28, "MSFT": 0.25, "NVDA": 0.50, "GOOG": 0.30,
    "META": 0.40, "AMZN": 0.35, "TSLA": 0.65, "NFLX": 0.45,
    "AMD": 0.55, "INTC": 0.45,
}

# Average daily volume (in millions)
AVG_VOLUME = {
    "AAPL": 55, "MSFT": 25, "NVDA": 350, "GOOG": 25,
    "META": 15, "AMZN": 50, "TSLA": 100, "NFLX": 5,
    "AMD": 50, "INTC": 50,
}


def is_weekday(d):
    """Return True if date is Mon-Fri."""
    return d.weekday() < 5


def generate_klines(symbol, start_date, end_date):
    """Generate realistic-looking daily K-lines using geometric Brownian motion."""
    random.seed(hash(symbol) & 0xFFFFFFFF)  # Deterministic per symbol

    base_price = BASE_PRICES[symbol]
    annual_vol = ANNUAL_VOL[symbol]
    daily_vol = annual_vol / (252 ** 0.5)
    avg_vol = AVG_VOLUME[symbol] * 1_000_000

    # Slight upward drift (10% annual)
    daily_drift = 0.10 / 252

    klines = []
    current_date = start_date
    price = base_price

    while current_date <= end_date:
        if not is_weekday(current_date):
            current_date += timedelta(days=1)
            continue

        # Daily return
        ret = random.gauss(daily_drift, daily_vol)
        open_price = price
        close_price = open_price * (1 + ret)

        # High/Low with intraday volatility
        intraday_range = abs(ret) + daily_vol
        high_price = max(open_price, close_price) * (1 + abs(random.gauss(0, daily_vol * 0.5)))
        low_price = min(open_price, close_price) * (1 - abs(random.gauss(0, daily_vol * 0.5)))

        # Volume: higher on big move days
        volume = int(avg_vol * (1 + abs(ret) * 10) * random.uniform(0.5, 1.5))

        klines.append({
            "t": current_date.strftime("%Y-%m-%d"),
            "o": round(open_price, 2),
            "h": round(high_price, 2),
            "l": round(low_price, 2),
            "c": round(close_price, 2),
            "v": volume,
        })

        price = close_price
        current_date += timedelta(days=1)

    return klines


def write_kline_json(symbol, klines):
    """Write a single K-line JSON file."""
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    output = {
        "ticker": symbol,
        "timeframe": "1d",
        "source": "mock",
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "data": klines,
    }
    path = OUTPUT_DIR / f"{symbol}_1d.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2)
    return path, len(klines)


def generate_qa_samples():
    """Generate Mock Ask Agent QA samples for 4 intent types."""
    QA_DIR.mkdir(parents=True, exist_ok=True)

    samples = [
        {
            "filename": "aapl_price.json",
            "query_signature": "current_price_aapl",
            "query_pattern": r"AAPL.*(?:当前|现在).*(?:价格|股价|多少钱)|AAPL.*price",
            "intent": "simple_qa",
            "response": {
                "summary": "AAPL 当前价格约为 $187.31（基于最新 Mock 数据）。",
                "numeric_facts": [
                    {
                        "value": 187.31,
                        "unit": "USD",
                        "source": "mock",
                        "quote": "AAPL Close 187.31",
                        "confidence": 0.95,
                    }
                ],
                "citations": [
                    {
                        "source": "mock",
                        "url": "/mock/klines/AAPL_1d.json",
                        "quote": "Last close: 187.31",
                    }
                ],
                "confidence": 0.95,
            },
        },
        {
            "filename": "nvda_earnings.json",
            "query_pattern": r"NVDA.*(?:财报|earnings|营收)",
            "intent": "deep_research",
            "response": {
                "summary": "NVDA 最近一季财报表现强劲，营收同比增长超 100%，主要由数据中心 AI 加速卡需求驱动。",
                "numeric_facts": [
                    {"value": 35.08, "unit": "B USD", "source": "mock",
                     "quote": "Revenue $35.08B", "confidence": 0.92},
                    {"value": 0.65, "unit": "USD EPS", "source": "mock",
                     "quote": "EPS $0.65", "confidence": 0.90}
                ],
                "citations": [
                    {"source": "mock", "url": "/mock/earnings/nvda.json", "quote": "Q4 FY25 Revenue"}
                ],
                "confidence": 0.88,
            },
        },
        {
            "filename": "tsla_news.json",
            "query_pattern": r"TSLA.*(?:新闻|news|最近)",
            "intent": "tool_call",
            "response": {
                "summary": "TSLA 最近新闻：交付量超预期，但价格调整引发市场关注。",
                "numeric_facts": [],
                "citations": [
                    {"source": "mock", "url": "/mock/news/tsla.json", "quote": "Tesla deliveries beat estimates"}
                ],
                "confidence": 0.85,
            },
        },
        {
            "filename": "clarify.json",
            "query_pattern": r"(?:怎么办|应该如何|help)",
            "intent": "clarify",
            "response": {
                "summary": "你能更具体地描述你想了解的内容吗？例如：是想分析某个标的、回测某个策略，还是查询某个财报？",
                "numeric_facts": [],
                "citations": [],
                "confidence": 0.5,
            },
        },
        {
            "filename": "portfolio_risk.json",
            "query_pattern": r"(?:持仓|portfolio).*(?:风险|risk)",
            "intent": "deep_research",
            "response": {
                "summary": "基于你的持仓（AAPL 100 股 + NVDA 50 股），当前组合 Beta 约 1.15，最大回撤预估 12%。",
                "numeric_facts": [
                    {"value": 1.15, "unit": "ratio", "source": "mock",
                     "quote": "Portfolio Beta 1.15", "confidence": 0.85},
                    {"value": 12.0, "unit": "percent", "source": "mock",
                     "quote": "Estimated Max Drawdown 12%", "confidence": 0.75}
                ],
                "citations": [
                    {"source": "mock", "url": "/mock/portfolio/risk.json", "quote": "Risk analysis"}
                ],
                "confidence": 0.80,
            },
        },
    ]

    for sample in samples:
        path = QA_DIR / sample["filename"]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(sample, f, indent=2, ensure_ascii=False)
        print(f"Generated QA sample: {path}")


def generate_community_data():
    """Generate Mock community Playbook data."""
    COMMUNITY_DIR.mkdir(parents=True, exist_ok=True)

    playbooks = [
        {
            "package_id": "pkg_mock_001",
            "playbook_id": "pb_mock_macross",
            "title": "NVDA Momentum Master",
            "description": "50/200 SMA crossover strategy for NVDA, optimized for momentum capture.",
            "author": {"id": "mock-brenda", "name": "Brenda Liu", "avatar": "/mock/avatars/brenda.png"},
            "tags": ["momentum", "single-stock", "sma"],
            "version": "1.0.0",
            "installed_count": 234,
            "rating_avg": 4.5,
            "rating_count": 87,
            "created_at": "2025-10-15T10:00:00Z",
            "performance": {
                "total_return": 28.5,
                "sharpe": 1.62,
                "max_drawdown": 8.3,
                "win_rate": 58
            }
        },
        {
            "package_id": "pkg_mock_002",
            "playbook_id": "pb_mock_rsi",
            "title": "RSI Reversal Strategy",
            "description": "Buy on RSI < 30 (oversold), sell on RSI > 70 (overbought).",
            "author": {"id": "mock-brenda", "name": "Brenda Liu", "avatar": "/mock/avatars/brenda.png"},
            "tags": ["reversal", "oversold", "rsi"],
            "version": "1.0.0",
            "installed_count": 189,
            "rating_avg": 4.2,
            "rating_count": 65,
            "created_at": "2025-10-20T10:00:00Z",
            "performance": {
                "total_return": 15.3,
                "sharpe": 1.05,
                "max_drawdown": 5.8,
                "win_rate": 62
            }
        },
        {
            "package_id": "pkg_mock_003",
            "playbook_id": "pb_mock_bollinger",
            "title": "Bollinger Breakout",
            "description": "Trade breakouts above upper Bollinger Band, exit at middle band.",
            "author": {"id": "mock-alex", "name": "Alex Chen", "avatar": "/mock/avatars/alex.png"},
            "tags": ["breakout", "volatility", "bollinger"],
            "version": "1.0.0",
            "installed_count": 156,
            "rating_avg": 4.0,
            "rating_count": 52,
            "created_at": "2025-11-01T10:00:00Z",
            "performance": {
                "total_return": 19.7,
                "sharpe": 1.18,
                "max_drawdown": 7.2,
                "win_rate": 55
            }
        },
        {
            "package_id": "pkg_mock_004",
            "playbook_id": "pb_mock_combo",
            "title": "Multi-Strategy Combo",
            "description": "50% MA Cross + 30% RSI + 20% Bollinger, diversified approach.",
            "author": {"id": "mock-charles", "name": "Charles Wang", "avatar": "/mock/avatars/charles.png"},
            "tags": ["diversified", "multi-strategy", "balanced"],
            "version": "1.0.0",
            "installed_count": 98,
            "rating_avg": 4.8,
            "rating_count": 34,
            "created_at": "2025-11-15T10:00:00Z",
            "performance": {
                "total_return": 22.1,
                "sharpe": 1.42,
                "max_drawdown": 6.5,
                "win_rate": 60
            }
        },
    ]

    # Write individual playbooks
    for pb in playbooks:
        path = COMMUNITY_DIR / f"{pb['package_id']}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(pb, f, indent=2, ensure_ascii=False)
        print(f"Generated community Playbook: {path}")

    # Write index
    index_path = COMMUNITY_DIR / "index.json"
    index = {
        "playbooks": playbooks,
        "total": len(playbooks),
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    with open(index_path, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=2, ensure_ascii=False)
    print(f"Generated community index: {index_path}")


def main():
    print("=" * 60)
    print("Nova-Invest Mock Data Generator")
    print("=" * 60)

    # Generate K-lines: 1 year of daily data per symbol
    start_date = datetime(2025, 1, 1)
    end_date = datetime(2025, 12, 31)

    print(f"\n[1/3] Generating K-line data for {len(SYMBOLS)} symbols...")
    print(f"      Period: {start_date.date()} to {end_date.date()}")
    print(f"      Output: {OUTPUT_DIR}")

    total_records = 0
    total_size = 0
    for symbol in SYMBOLS:
        klines = generate_klines(symbol, start_date, end_date)
        path, count = write_kline_json(symbol, klines)
        size = path.stat().st_size
        total_records += count
        total_size += size
        print(f"  {symbol}: {count} records, {size/1024:.1f} KB")

    print(f"\nTotal: {total_records} records, {total_size/1024:.1f} KB")

    # Generate QA samples
    print(f"\n[2/3] Generating Ask Agent QA samples...")
    print(f"      Output: {QA_DIR}")
    generate_qa_samples()

    # Generate community Playbook data
    print(f"\n[3/3] Generating community Playbook data...")
    print(f"      Output: {COMMUNITY_DIR}")
    generate_community_data()

    print("\n" + "=" * 60)
    print("Mock data generation complete!")
    print("=" * 60)
    print(f"\nNext steps:")
    print(f"  1. Verify files in web/public/mock/")
    print(f"  2. Run: cd web && pnpm dev")
    print(f"  3. Visit: http://localhost:3000")
    print(f"  4. Dashboard should load with Mock K-line data")


if __name__ == "__main__":
    main()
