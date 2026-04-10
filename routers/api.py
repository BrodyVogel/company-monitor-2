import json
from datetime import datetime

from fastapi import APIRouter, File, Request, UploadFile
from fastapi.responses import JSONResponse

from database import get_db
from services.import_handler import handle_import
from services.rating_logic import compute_suggested_rating, compute_upside
from services.undo import handle_undo

router = APIRouter(prefix="/api")


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


@router.post("/import")
async def import_data(request: Request, file: UploadFile = File(None)):
    """Accept JSON file upload (multipart) or raw JSON body."""
    if file is not None:
        content = await file.read()
        data = json.loads(content)
    else:
        data = await request.json()

    result = await handle_import(data)
    if result.get("status") == "error":
        return JSONResponse(status_code=400, content=result)
    return result


@router.get("/companies")
async def list_companies():
    db = await get_db()
    try:
        companies = [
            dict(r) for r in await db.execute_fetchall("SELECT * FROM companies ORDER BY name")
        ]

        result = []
        for c in companies:
            suggested_rating = compute_suggested_rating(c["current_price"], c["blended_price_target"])
            upside_pct = compute_upside(c["current_price"], c["blended_price_target"])

            # Signal from indicators
            indicators = await db.execute_fetchall(
                "SELECT status FROM indicators WHERE company_id = ?", (c["id"],)
            )
            statuses = [r["status"] for r in indicators]
            if any(s == "action_required" for s in statuses):
                signal = "red"
            elif any(s == "watch" for s in statuses):
                signal = "yellow"
            else:
                signal = "green"

            # Count active change_log entries (updates only, not onboards)
            change_count_rows = await db.execute_fetchall(
                """SELECT COUNT(*) as cnt FROM change_log
                   WHERE company_id = ? AND action = 'update' AND is_undone = 0""",
                (c["id"],),
            )
            changes_count = change_count_rows[0]["cnt"]

            result.append({
                **c,
                "suggested_rating": suggested_rating,
                "upside_pct": upside_pct,
                "signal": signal,
                "changes_count": changes_count,
            })

        return result
    finally:
        await db.close()


@router.get("/companies/{ticker}")
async def get_company(ticker: str):
    db = await get_db()
    try:
        company = await _find_company_by_ticker(db, ticker)
        if not company:
            return JSONResponse(status_code=404, content={"error": f"Company {ticker} not found."})

        company_id = company["id"]
        suggested_rating = compute_suggested_rating(
            company["current_price"], company["blended_price_target"]
        )
        upside_pct = compute_upside(company["current_price"], company["blended_price_target"])

        scenarios = [
            dict(r)
            for r in await db.execute_fetchall(
                "SELECT * FROM scenarios WHERE company_id = ? ORDER BY sort_order",
                (company_id,),
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
        rec_history_rows = [
            dict(r)
            for r in await db.execute_fetchall(
                "SELECT * FROM recommendation_history WHERE company_id = ? ORDER BY id",
                (company_id,),
            )
        ]

        # Compute return percentages for recommendation history
        recommendation_history = []
        for rec in rec_history_rows:
            exit_price = rec["price_at_end"] if rec["ended_at"] else company["current_price"]
            if rec["price_at_start"] and rec["price_at_start"] != 0 and exit_price is not None:
                return_pct = (exit_price - rec["price_at_start"]) / rec["price_at_start"]
            else:
                return_pct = None

            # Compute current_period_days
            current_period_days = None
            if rec["started_at"]:
                try:
                    started = datetime.strptime(rec["started_at"], "%Y-%m-%d")
                    current_period_days = (datetime.now() - started).days
                except ValueError:
                    pass

            recommendation_history.append({
                **rec,
                "return_pct": return_pct,
                "current_period_days": current_period_days,
            })

        # Total return since initiation
        total_return_since_initiation = None
        if rec_history_rows:
            first_price = rec_history_rows[0]["price_at_start"]
            if first_price and first_price != 0 and company["current_price"] is not None:
                total_return_since_initiation = (
                    (company["current_price"] - first_price) / first_price
                )

        change_log = [
            dict(r)
            for r in await db.execute_fetchall(
                "SELECT * FROM change_log WHERE company_id = ? ORDER BY id DESC",
                (company_id,),
            )
        ]

        return {
            "company": {
                **company,
                "suggested_rating": suggested_rating,
                "upside_pct": upside_pct,
            },
            "scenarios": scenarios,
            "indicators": indicators,
            "variant_perceptions": variant_perceptions,
            "catalysts": catalysts,
            "model_financials": model_financials,
            "recommendation_history": recommendation_history,
            "total_return_since_initiation": total_return_since_initiation,
            "change_log": change_log,
        }
    finally:
        await db.close()


@router.delete("/companies/{ticker}")
async def delete_company(ticker: str):
    db = await get_db()
    try:
        company = await _find_company_by_ticker(db, ticker)
        if not company:
            return JSONResponse(status_code=404, content={"error": f"Company {ticker} not found."})

        await db.execute("DELETE FROM companies WHERE id = ?", (company["id"],))
        await db.commit()
        return {"status": "ok", "message": f"Deleted {company['ticker']} and all related data."}
    finally:
        await db.close()


@router.get("/changes")
async def get_changes():
    db = await get_db()
    try:
        rows = await db.execute_fetchall(
            """SELECT cl.*, c.name as company_name, c.ticker as company_ticker
               FROM change_log cl
               JOIN companies c ON cl.company_id = c.id
               WHERE cl.action = 'update' AND cl.is_undone = 0
               ORDER BY cl.id DESC
               LIMIT 20"""
        )
        return [dict(r) for r in rows]
    finally:
        await db.close()


@router.post("/undo/{change_log_id}")
async def undo_change(change_log_id: int):
    result = await handle_undo(change_log_id)
    code = result.pop("code", None)
    if result.get("status") == "error":
        return JSONResponse(status_code=code or 400, content=result)
    return result
