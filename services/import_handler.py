from services.onboard import handle_onboard
from services.update import handle_update


async def handle_import(data: dict) -> dict:
    action = data.get("action")
    if action == "onboard":
        return await handle_onboard(data)
    elif action == "update":
        return await handle_update(data)
    else:
        return {"status": "error", "message": f"Unknown action: {action}"}
