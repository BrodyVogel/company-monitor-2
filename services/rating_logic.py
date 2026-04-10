RATING_TIERS = ["Strong Buy", "Outperform", "Inline", "Underperform", "Sell"]


def compute_upside(current_price, blended_price_target):
    if current_price is None or current_price == 0 or blended_price_target is None:
        return None
    return (blended_price_target - current_price) / current_price


def compute_suggested_rating(current_price, blended_price_target):
    upside = compute_upside(current_price, blended_price_target)
    if upside is None:
        return "Inline"
    if upside >= 0.35:
        return "Strong Buy"
    if upside >= 0.20:
        return "Outperform"
    if upside >= -0.10:
        return "Inline"
    if upside >= -0.20:
        return "Underperform"
    return "Sell"
