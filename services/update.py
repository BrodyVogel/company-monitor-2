import json
from datetime import datetime
from database import get_db


async def _find_company_by_ticker(db, ticker: str):
    """Fuzzy ticker matching: exact, then base-part LIKE, then case-insensitive."""
    row = await db.execute_fetchall(
        "SELECT * FROM companies WHERE ticker = ?", (ticker,)
    )
    if row:
        return dict(row[0])

    base = ticker.split("-")[0] if "-" in ticker else ticker
    row = await db.execute_fetchall(
        "SELECT * FROM companies WHERE ticker LIKE ?", (f"{base}%",)
    )
    if row:
        return dict(row[0])

    row = await db.execute_fetchall(
        "SELECT * FROM companies WHERE LOWER(ticker) = LOWER(?)", (ticker,)
    )
    if row:
        return dict(row[0])

    return None


async def _snapshot_company(db, company_id: int) -> dict:
    """Take a full snapshot of a company's current state."""
    company = await db.execute_fetchall(
        "SELECT * FROM companies WHERE id = ?", (company_id,)
    )
    company = dict(company[0]) if company else {}

    scenarios = [
        dict(r)
        for r in await db.execute_fetchall(
            "SELECT * FROM scenarios WHERE company_id = ? ORDER BY sort_order", (company_id,)
        )
    ]
    indicators = [
        dict(r)
        for r in await db.execute_fetchall(
            "SELECT * FROM indicators WHERE company_id = ?", (company_id,)
        )
    ]
    variant_perceptions = [
        dict(r)
        for r in await db.execute_fetchall(
            "SELECT * FROM variant_perceptions WHERE company_id = ? ORDER BY sort_order",
            (company_id,),
        )
    ]
    catalysts = [
        dict(r)
        for r in await db.execute_fetchall(
            "SELECT * FROM catalysts WHERE company_id = ?", (company_id,)
        )
    ]
    model_financials = [
        dict(r)
        for r in await db.execute_fetchall(
            "SELECT * FROM model_financials WHERE company_id = ? ORDER BY sort_order",
            (company_id,),
        )
    ]
    recommendation_history = [
        dict(r)
        for r in await db.execute_fetchall(
            "SELECT * FROM recommendation_history WHERE company_id = ? ORDER BY id",
            (company_id,),
        )
    ]

    return {
        "company": company,
        "scenarios": scenarios,
        "indicators": indicators,
        "variant_perceptions": variant_perceptions,
        "catalysts": catalysts,
        "model_financials": model_financials,
        "recommendation_history": recommendation_history,
    }


async def handle_update(data: dict) -> dict:
    ticker = data.get("ticker")
    if not ticker:
        return {"status": "error", "message": "Missing ticker field."}

    db = await get_db()
    try:
        company = await _find_company_by_ticker(db, ticker)
        if not company:
            return {"status": "error", "message": f"Company with ticker {ticker} not found."}

        company_id = company["id"]
        update_date = data.get("update_date", datetime.now().strftime("%Y-%m-%d"))

        # Snapshot before state
        before_state = await _snapshot_company(db, company_id)

        counts = {
            "company_fields_updated": 0,
            "scenarios_replaced": 0,
            "indicators_added": 0,
            "indicators_removed": 0,
            "indicators_modified": 0,
            "indicators_skipped": [],
            "indicators_unmatched": [],
            "variant_perceptions_replaced": 0,
            "catalysts_added": 0,
            "catalysts_removed": 0,
            "catalysts_occurred": 0,
            "catalysts_unmatched": [],
            "model_financials_replaced": 0,
        }

        old_rating = company["current_rating"]
        old_price = company["current_price"]

        # Apply company_changes
        company_changes = data.get("company_changes", {})
        if company_changes:
            update_fields = []
            update_values = []
            allowed_fields = [
                "name", "exchange", "currency", "current_rating", "current_price",
                "blended_price_target", "elevator_pitch", "materials_date",
            ]
            for field in allowed_fields:
                if field in company_changes:
                    update_fields.append(f"{field} = ?")
                    update_values.append(company_changes[field])
                    counts["company_fields_updated"] += 1

            if update_fields:
                update_fields.append("updated_at = datetime('now')")
                update_values.append(company_id)
                await db.execute(
                    f"UPDATE companies SET {', '.join(update_fields)} WHERE id = ?",
                    update_values,
                )

            # If current_price changed, insert into price_history
            if "current_price" in company_changes:
                await db.execute(
                    "INSERT INTO price_history (company_id, price, recorded_at) VALUES (?, ?, ?)",
                    (company_id, company_changes["current_price"], update_date),
                )

        new_rating = company_changes.get("current_rating", old_rating)
        new_price = company_changes.get("current_price", old_price)
        new_target = company_changes.get("blended_price_target", company["blended_price_target"])

        # If rating changed, close old recommendation_history and open new one
        if "current_rating" in company_changes and company_changes["current_rating"] != old_rating:
            await db.execute(
                """UPDATE recommendation_history
                   SET ended_at = ?, price_at_end = ?
                   WHERE company_id = ? AND ended_at IS NULL""",
                (update_date, new_price, company_id),
            )
            await db.execute(
                """INSERT INTO recommendation_history
                   (company_id, rating, price_at_start, target_at_start, started_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (company_id, new_rating, new_price, new_target, update_date),
            )

        # Scenarios replace
        if "scenarios_replace" in data:
            await db.execute("DELETE FROM scenarios WHERE company_id = ?", (company_id,))
            for i, s in enumerate(data["scenarios_replace"]):
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
            counts["scenarios_replaced"] = len(data["scenarios_replace"])

        # Indicators add
        for ind in data.get("indicators_add", []):
            existing = await db.execute_fetchall(
                "SELECT id FROM indicators WHERE company_id = ? AND LOWER(name) = LOWER(?)",
                (company_id, ind["name"]),
            )
            if existing:
                counts["indicators_skipped"].append(ind["name"])
                continue
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
            counts["indicators_added"] += 1

        # Indicators remove
        for ind_name in data.get("indicators_remove", []):
            cursor = await db.execute(
                "DELETE FROM indicators WHERE company_id = ? AND LOWER(name) = LOWER(?)",
                (company_id, ind_name),
            )
            if cursor.rowcount == 0:
                counts["indicators_unmatched"].append(ind_name)
            else:
                counts["indicators_removed"] += cursor.rowcount

        # Indicators modify
        for mod in data.get("indicators_modify", []):
            mod_name = mod["name"]
            existing = await db.execute_fetchall(
                "SELECT id FROM indicators WHERE company_id = ? AND LOWER(name) = LOWER(?)",
                (company_id, mod_name),
            )
            if not existing:
                counts["indicators_unmatched"].append(mod_name)
                continue
            ind_id = existing[0]["id"]
            update_fields = []
            update_values = []
            allowed = [
                "current_value", "bear_threshold", "bull_threshold",
                "check_frequency", "data_source", "status", "commentary",
            ]
            for field in allowed:
                if field in mod:
                    update_fields.append(f"{field} = ?")
                    update_values.append(mod[field])
            if update_fields:
                update_fields.append("updated_at = datetime('now')")
                update_values.append(ind_id)
                await db.execute(
                    f"UPDATE indicators SET {', '.join(update_fields)} WHERE id = ?",
                    update_values,
                )
                counts["indicators_modified"] += 1

        # Variant perceptions replace
        if "variant_perceptions_replace" in data:
            await db.execute(
                "DELETE FROM variant_perceptions WHERE company_id = ?", (company_id,)
            )
            for i, vp in enumerate(data["variant_perceptions_replace"]):
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
            counts["variant_perceptions_replaced"] = len(data["variant_perceptions_replace"])

        # Catalysts add
        for cat in data.get("catalysts_add", []):
            await db.execute(
                """INSERT INTO catalysts (company_id, event, expected_date, why_it_matters, occurred)
                   VALUES (?, ?, ?, ?, 0)""",
                (company_id, cat["event"], cat.get("expected_date"), cat.get("why_it_matters")),
            )
            counts["catalysts_added"] += 1

        # Catalysts remove
        for event_name in data.get("catalysts_remove", []):
            cursor = await db.execute(
                "DELETE FROM catalysts WHERE company_id = ? AND LOWER(event) = LOWER(?)",
                (company_id, event_name),
            )
            if cursor.rowcount == 0:
                counts["catalysts_unmatched"].append(event_name)
            else:
                counts["catalysts_removed"] += cursor.rowcount

        # Catalysts occurred
        for occ in data.get("catalysts_occurred", []):
            cursor = await db.execute(
                """UPDATE catalysts SET occurred = 1, occurred_date = ?, outcome_summary = ?
                   WHERE company_id = ? AND LOWER(event) = LOWER(?)""",
                (
                    occ.get("occurred_date"),
                    occ.get("outcome_summary"),
                    company_id,
                    occ["event"],
                ),
            )
            if cursor.rowcount > 0:
                counts["catalysts_occurred"] += 1
            else:
                counts["catalysts_unmatched"].append(occ["event"])

        # Model financials replace
        if "model_financials_replace" in data:
            new_rows = data["model_financials_replace"]
            scenarios_in_data = set(r["scenario"] for r in new_rows)
            if len(scenarios_in_data) >= 3:
                # Full replacement
                await db.execute(
                    "DELETE FROM model_financials WHERE company_id = ?", (company_id,)
                )
                for i, mf in enumerate(new_rows):
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
            else:
                # Partial update: match by scenario + fiscal_year
                for mf in new_rows:
                    update_fields = []
                    update_values = []
                    for field in [
                        "revenue", "revenue_growth", "ebitda", "ebitda_margin",
                        "net_income", "eps", "free_cash_flow", "fcf_margin",
                    ]:
                        if field in mf:
                            update_fields.append(f"{field} = ?")
                            update_values.append(mf[field])
                    if update_fields:
                        update_fields.append("updated_at = datetime('now')")
                        update_values.extend([company_id, mf["scenario"], mf["fiscal_year"]])
                        await db.execute(
                            f"""UPDATE model_financials SET {', '.join(update_fields)}
                                WHERE company_id = ? AND scenario = ? AND fiscal_year = ?""",
                            update_values,
                        )
            counts["model_financials_replaced"] = len(new_rows)

        # Update materials_date if not in company_changes
        if "materials_date" not in company_changes:
            await db.execute(
                "UPDATE companies SET materials_date = ?, updated_at = datetime('now') WHERE id = ?",
                (update_date, company_id),
            )

        # Change log
        update_summary = data.get("update_summary", "Update applied.")
        await db.execute(
            """INSERT INTO change_log (company_id, action, summary, details, before_state)
               VALUES (?, 'update', ?, ?, ?)""",
            (company_id, update_summary, json.dumps(data), json.dumps(before_state)),
        )

        await db.commit()

        return {
            "status": "ok",
            "action": "update",
            "summary": update_summary,
            "counts": counts,
        }
    finally:
        await db.close()
