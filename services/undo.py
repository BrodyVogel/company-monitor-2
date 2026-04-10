import json
from database import get_db


async def handle_undo(change_log_id: int) -> dict:
    db = await get_db()
    try:
        # Validate entry exists
        rows = await db.execute_fetchall(
            "SELECT * FROM change_log WHERE id = ?", (change_log_id,)
        )
        if not rows:
            return {"status": "error", "code": 404, "message": "Change log entry not found."}

        entry = dict(rows[0])

        # Check if already undone
        if entry["is_undone"] == 1:
            return {"status": "error", "code": 400, "message": "Already undone."}

        company_id = entry["company_id"]
        action = entry["action"]

        # Check if this is the most recent non-undone entry for this company
        latest = await db.execute_fetchall(
            """SELECT id FROM change_log
               WHERE company_id = ? AND is_undone = 0
               ORDER BY id DESC LIMIT 1""",
            (company_id,),
        )
        if latest and latest[0]["id"] != change_log_id:
            return {
                "status": "error",
                "code": 400,
                "message": f"Can only undo the most recent entry. Undo entry {latest[0]['id']} first.",
            }

        if action == "onboard":
            # Get company name for summary
            comp = await db.execute_fetchall(
                "SELECT name FROM companies WHERE id = ?", (company_id,)
            )
            comp_name = comp[0]["name"] if comp else "Unknown"

            # Delete company — CASCADE deletes everything
            await db.execute("DELETE FROM companies WHERE id = ?", (company_id,))

            summary = f"Undid onboard of {comp_name}."
            await db.commit()
            return {"status": "ok", "action": "undo", "summary": summary}

        elif action == "update":
            before_state = json.loads(entry["before_state"])

            # Restore company fields
            bc = before_state["company"]
            await db.execute(
                """UPDATE companies SET name=?, ticker=?, exchange=?, currency=?,
                   current_rating=?, current_price=?, blended_price_target=?,
                   elevator_pitch=?, materials_date=?, updated_at=datetime('now')
                   WHERE id=?""",
                (
                    bc["name"], bc["ticker"], bc["exchange"], bc["currency"],
                    bc["current_rating"], bc["current_price"], bc["blended_price_target"],
                    bc["elevator_pitch"], bc["materials_date"], company_id,
                ),
            )

            # Restore scenarios
            await db.execute("DELETE FROM scenarios WHERE company_id = ?", (company_id,))
            for s in before_state["scenarios"]:
                await db.execute(
                    """INSERT INTO scenarios (company_id, name, raw_weight, effective_weight,
                       implied_price, summary, sort_order, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        company_id, s["name"], s["raw_weight"], s["effective_weight"],
                        s["implied_price"], s["summary"], s["sort_order"],
                        s["created_at"], s["updated_at"],
                    ),
                )

            # Restore indicators
            await db.execute("DELETE FROM indicators WHERE company_id = ?", (company_id,))
            for ind in before_state["indicators"]:
                await db.execute(
                    """INSERT INTO indicators (company_id, name, current_value, bear_threshold,
                       bull_threshold, check_frequency, data_source, status, commentary,
                       created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        company_id, ind["name"], ind["current_value"],
                        ind["bear_threshold"], ind["bull_threshold"],
                        ind["check_frequency"], ind["data_source"],
                        ind["status"], ind["commentary"],
                        ind["created_at"], ind["updated_at"],
                    ),
                )

            # Restore variant perceptions
            await db.execute(
                "DELETE FROM variant_perceptions WHERE company_id = ?", (company_id,)
            )
            for vp in before_state["variant_perceptions"]:
                await db.execute(
                    """INSERT INTO variant_perceptions (company_id, direction, title,
                       description, conviction, sort_order, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        company_id, vp["direction"], vp["title"], vp["description"],
                        vp["conviction"], vp["sort_order"],
                        vp["created_at"], vp["updated_at"],
                    ),
                )

            # Restore catalysts
            await db.execute("DELETE FROM catalysts WHERE company_id = ?", (company_id,))
            for cat in before_state["catalysts"]:
                await db.execute(
                    """INSERT INTO catalysts (company_id, event, expected_date, why_it_matters,
                       occurred, outcome_summary, occurred_date, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        company_id, cat["event"], cat["expected_date"],
                        cat["why_it_matters"], cat["occurred"],
                        cat["outcome_summary"], cat["occurred_date"],
                        cat["created_at"], cat["updated_at"],
                    ),
                )

            # Restore model financials
            await db.execute(
                "DELETE FROM model_financials WHERE company_id = ?", (company_id,)
            )
            for mf in before_state["model_financials"]:
                await db.execute(
                    """INSERT INTO model_financials (company_id, scenario, fiscal_year,
                       revenue, revenue_growth, ebitda, ebitda_margin, net_income, eps,
                       free_cash_flow, fcf_margin, sort_order, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (
                        company_id, mf["scenario"], mf["fiscal_year"],
                        mf["revenue"], mf["revenue_growth"], mf["ebitda"],
                        mf["ebitda_margin"], mf["net_income"], mf["eps"],
                        mf["free_cash_flow"], mf["fcf_margin"], mf["sort_order"],
                        mf["created_at"], mf["updated_at"],
                    ),
                )

            # Restore recommendation history if rating was changed
            update_data = json.loads(entry["details"])
            update_date = update_data.get("update_date")
            company_changes = update_data.get("company_changes", {})
            if "current_rating" in company_changes:
                # Delete the newest recommendation_history entry (the one opened by the update)
                await db.execute(
                    """DELETE FROM recommendation_history
                       WHERE company_id = ? AND started_at = ?""",
                    (company_id, update_date),
                )
                # Reopen the previous one
                await db.execute(
                    """UPDATE recommendation_history
                       SET ended_at = NULL, price_at_end = NULL
                       WHERE company_id = ? AND ended_at = ?""",
                    (company_id, update_date),
                )

            # Mark as undone
            await db.execute(
                "UPDATE change_log SET is_undone = 1 WHERE id = ?", (change_log_id,)
            )

            # Write undo entry to change_log
            created_at = entry["created_at"]
            await db.execute(
                """INSERT INTO change_log (company_id, action, summary, details, before_state)
                   VALUES (?, 'undo', ?, NULL, NULL)""",
                (company_id, f"Undid update from {created_at}."),
            )

            await db.commit()
            return {
                "status": "ok",
                "action": "undo",
                "summary": f"Undid update from {created_at}.",
            }
        else:
            return {"status": "error", "code": 400, "message": f"Cannot undo action type: {action}"}
    finally:
        await db.close()
