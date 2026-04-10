import json
from database import get_db


async def handle_onboard(data: dict) -> dict:
    company = data["company"]
    ticker = company["ticker"]
    name = company["name"]
    currency = company["currency"]
    current_rating = company["current_rating"]
    current_price = company.get("current_price")
    blended_price_target = company["blended_price_target"]
    materials_date = company.get("materials_date")

    db = await get_db()
    try:
        # Check if ticker already exists
        row = await db.execute_fetchall(
            "SELECT id FROM companies WHERE ticker = ?", (ticker,)
        )
        if row:
            return {
                "status": "error",
                "message": f"Company with ticker {ticker} already exists.",
            }

        # Insert company
        cursor = await db.execute(
            """INSERT INTO companies (name, ticker, exchange, currency, current_rating,
               current_price, blended_price_target, elevator_pitch, materials_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                name,
                ticker,
                company.get("exchange"),
                currency,
                current_rating,
                current_price,
                blended_price_target,
                company.get("elevator_pitch"),
                materials_date,
            ),
        )
        company_id = cursor.lastrowid

        # Insert scenarios
        scenarios = data.get("scenarios", [])
        for i, s in enumerate(scenarios):
            await db.execute(
                """INSERT INTO scenarios (company_id, name, raw_weight, effective_weight,
                   implied_price, summary, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    company_id,
                    s["name"],
                    s.get("raw_weight"),
                    s.get("effective_weight"),
                    s["implied_price"],
                    s.get("summary"),
                    i,
                ),
            )

        # Insert indicators
        indicators = data.get("indicators", [])
        for ind in indicators:
            await db.execute(
                """INSERT INTO indicators (company_id, name, current_value, bear_threshold,
                   bull_threshold, check_frequency, data_source, status, commentary)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    company_id,
                    ind["name"],
                    ind.get("current_value"),
                    ind.get("bear_threshold"),
                    ind.get("bull_threshold"),
                    ind.get("check_frequency"),
                    ind.get("data_source"),
                    ind.get("status", "all_clear"),
                    ind.get("commentary"),
                ),
            )

        # Insert variant perceptions
        vps = data.get("variant_perceptions", [])
        for i, vp in enumerate(vps):
            await db.execute(
                """INSERT INTO variant_perceptions (company_id, direction, title,
                   description, conviction, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    company_id,
                    vp["direction"],
                    vp["title"],
                    vp["description"],
                    vp.get("conviction"),
                    i,
                ),
            )

        # Insert catalysts
        catalysts = data.get("catalysts", [])
        for cat in catalysts:
            await db.execute(
                """INSERT INTO catalysts (company_id, event, expected_date, why_it_matters, occurred)
                   VALUES (?, ?, ?, ?, 0)""",
                (
                    company_id,
                    cat["event"],
                    cat.get("expected_date"),
                    cat.get("why_it_matters"),
                ),
            )

        # Insert model financials
        model_financials = data.get("model_financials", [])
        for i, mf in enumerate(model_financials):
            await db.execute(
                """INSERT INTO model_financials (company_id, scenario, fiscal_year,
                   revenue, revenue_growth, ebitda, ebitda_margin, net_income, eps,
                   free_cash_flow, fcf_margin, sort_order)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    company_id,
                    mf["scenario"],
                    mf["fiscal_year"],
                    mf.get("revenue"),
                    mf.get("revenue_growth"),
                    mf.get("ebitda"),
                    mf.get("ebitda_margin"),
                    mf.get("net_income"),
                    mf.get("eps"),
                    mf.get("free_cash_flow"),
                    mf.get("fcf_margin"),
                    i,
                ),
            )

        # Insert first recommendation history entry
        await db.execute(
            """INSERT INTO recommendation_history (company_id, rating, price_at_start,
               target_at_start, started_at)
               VALUES (?, ?, ?, ?, ?)""",
            (company_id, current_rating, current_price, blended_price_target, materials_date),
        )

        # Insert into price history
        await db.execute(
            "INSERT INTO price_history (company_id, price, recorded_at) VALUES (?, ?, ?)",
            (company_id, current_price, materials_date),
        )

        # Currency symbol
        currency_symbols = {"USD": "$", "EUR": "€", "GBP": "£", "AUD": "A$", "CAD": "C$"}
        currency_symbol = currency_symbols.get(currency, currency + " ")

        summary = (
            f"Initiated coverage on {name}. Rating: {current_rating}. "
            f"PT: {currency_symbol}{blended_price_target}. "
            f"{len(scenarios)} scenarios, {len(indicators)} indicators."
        )

        # Write to change_log
        await db.execute(
            """INSERT INTO change_log (company_id, action, summary, details, before_state)
               VALUES (?, 'onboard', ?, ?, NULL)""",
            (company_id, summary, json.dumps(data)),
        )

        await db.commit()

        return {
            "status": "ok",
            "action": "onboard",
            "company_id": company_id,
            "summary": summary,
        }
    finally:
        await db.close()
