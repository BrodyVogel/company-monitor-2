import aiosqlite
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "portfolio.db")


async def get_db():
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    return db


async def init_db():
    db = await aiosqlite.connect(DB_PATH)
    await db.execute("PRAGMA journal_mode = WAL")
    await db.execute("PRAGMA foreign_keys = ON")

    await db.executescript("""
        CREATE TABLE IF NOT EXISTS companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            ticker TEXT NOT NULL UNIQUE,
            exchange TEXT,
            currency TEXT NOT NULL,
            current_rating TEXT NOT NULL,
            current_price REAL,
            blended_price_target REAL NOT NULL,
            elevator_pitch TEXT,
            materials_date TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS scenarios (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            raw_weight REAL,
            effective_weight REAL,
            implied_price REAL NOT NULL,
            summary TEXT,
            sort_order INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_scenarios_company_id ON scenarios(company_id);

        CREATE TABLE IF NOT EXISTS indicators (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            current_value TEXT,
            bear_threshold TEXT,
            bull_threshold TEXT,
            check_frequency TEXT,
            data_source TEXT,
            status TEXT DEFAULT 'all_clear',
            commentary TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_indicators_company_id ON indicators(company_id);

        CREATE TABLE IF NOT EXISTS variant_perceptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            direction TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            conviction TEXT,
            sort_order INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_variant_perceptions_company_id ON variant_perceptions(company_id);

        CREATE TABLE IF NOT EXISTS catalysts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            event TEXT NOT NULL,
            expected_date TEXT,
            why_it_matters TEXT,
            occurred INTEGER DEFAULT 0,
            outcome_summary TEXT,
            occurred_date TEXT,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_catalysts_company_id ON catalysts(company_id);

        CREATE TABLE IF NOT EXISTS model_financials (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            scenario TEXT NOT NULL,
            fiscal_year TEXT NOT NULL,
            revenue REAL,
            revenue_growth REAL,
            ebitda REAL,
            ebitda_margin REAL,
            net_income REAL,
            eps REAL,
            free_cash_flow REAL,
            fcf_margin REAL,
            sort_order INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_model_financials_company_id ON model_financials(company_id);

        CREATE TABLE IF NOT EXISTS recommendation_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            rating TEXT NOT NULL,
            price_at_start REAL NOT NULL,
            target_at_start REAL NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            price_at_end REAL,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_recommendation_history_company_id ON recommendation_history(company_id);

        CREATE TABLE IF NOT EXISTS change_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            action TEXT NOT NULL,
            summary TEXT NOT NULL,
            details TEXT,
            before_state TEXT,
            is_undone INTEGER DEFAULT 0,
            effective_date TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_change_log_company_id ON change_log(company_id);

        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            price REAL NOT NULL,
            recorded_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_price_history_company_id ON price_history(company_id);
    """)

    # Migrate: add effective_date to change_log if missing
    cols = await db.execute_fetchall("PRAGMA table_info(change_log)")
    col_names = [c[1] if isinstance(c, tuple) else c["name"] for c in cols]
    if "effective_date" not in col_names:
        await db.execute("ALTER TABLE change_log ADD COLUMN effective_date TEXT")

    await db.commit()
    await db.close()
