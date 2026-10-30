"""Paisley TECH Festive Creator Bootcamp advertisement. The narration script.

One entry per spoken line: (id, text, pause_after_seconds). Lines are synthesised separately so the
gaps between them are placed by hand: a pause is a decision, not whatever the TTS engine does.
A line id starts with its scene number. `layout.py` turns this into src/timeline.json.
"""

SCENES = [
    ("s01", "Screen time"),
    ("s02", "What if they created?"),
    ("s03", "The family Christmas website"),
    ("s04", "The holiday blog"),
    ("s05", "One idea becomes another"),
    ("s06", "It needs tools"),
    ("s07", "Paisley TECH reveal"),
    ("s08", "You + AI"),
    ("s09", "Publish and share"),
    ("s10", "The gift"),
    ("s11", "The offer"),
    ("s12", "Creation time"),
    ("s13", "Reserve their place"),
]

# Silence before a scene's first line (the scene change itself).
SCENE_LEAD = {"s01": 0.5, "s02": 0.75, "s03": 0.35, "s04": 0.15, "s05": 0.1, "s06": 0.4, "s07": 0.25,
              "s08": 0.15, "s09": 0.05, "s10": 0.1, "s11": 0.15, "s12": 0.1, "s13": 0.05}
DEFAULT_LEAD = 0.2

LINES = [
    ("s01a", "They already know how to use technology.", 0.15),
    ("s01b", "They watch it. They play it. They scroll through it.", 0.0),
    ("s02a", "But what if this holiday...", 0.75),
    ("s02b", "they created it?", 0.4),
    ("s03a", "Imagine your child building the family Christmas website.", 1.15),
    ("s04a", "Turning their holiday into a story.", 0.95),
    ("s05a", "Making a game their friends actually play.", 0.05),
    ("s05b", "Designing something nobody expected.", 0.05),
    ("s05f", "Inventing something completely their own.", 0.2),
    ("s06a", "Because their imagination doesn't need a ceiling.", 0.15),
    ("s06b", "It needs tools.", 0.12),
    ("s06c", "It needs somewhere to build.", 0.2),
    ("s06d", "It just needs someone to say...", 0.4),
    ("s06e", "Let's see what you can make.", 0.2),
    ("s07a", "That's what Paisley TECH is about.", 0.15),
    ("s07b", "Our coaches are ready to walk with your child, every step of the way to mastery.", 0.4),
    ("s08a", "AI doesn't replace their imagination.", 0.2),
    ("s08b", "It gives their imagination somewhere to go.", 0.2),
    ("s09a", "Then they publish it,", 0.08),
    ("s09b", "and share it with friends and family.", 0.55),
    ("s10a", "Some gifts get opened.", 0.1),
    ("s10b", "Some get forgotten.", 0.15),
    ("s10c", "But what if this Christmas...", 0.1),
    ("s10d", "you gave them something they could build with?", 1.05),
    ("s11a", "Paisley TECH Festive Creator Bootcamp.", 1.3),
    ("s12a", "This holiday, don't just give them screen time.", 0.1),
    ("s12b", "Give them creation time.", 0.05),
    ("s13a", "Reserve their place for fifty dollars.", 0.03),
    ("s13b", "About six thousand five hundred Kenyan shillings.", 0.15),
    ("s13c", "Let them create.", 0.5),
]

# Delivery speed per line, added to BASE_RATE in gen_vo.py (percent).
LINE_RATE = {"s07b": 2, "s09b": 2, "s02a": -10, "s02b": -10, "s06b": -10, "s06c": -12, "s06d": -8, "s06e": -26, "s08a": -6, "s08b": -6,
             "s10a": -4, "s10b": -4, "s10d": -18, "s13c": -16}

BPM = 104


def events(L, E, W):
    """Named moments, in absolute seconds, shared by the picture and the sound."""
    stop = E("s01b") + 0.06
    swipes, at, gap = [], 0.75, 0.72
    while at < stop - 0.1:
        swipes.append(round(at, 3))
        at += gap
        gap = max(0.17, gap * 0.87)
    return {
        "swipes": swipes,
        "stop": stop,                                  # everything cuts to black
        "flicker": stop + 0.28,                        # one tiny light
        "whatIf": W("s02a", "what"),
        "thisHoliday": W("s02a", "this"),
        "justWatch": E("s02a") + 0.14,
        "theyCreated": W("s02b", "they") - 0.05,
        "impact": E("s02b") - 0.02,                  # the question lands, then the screen explodes
        "sketch": L("s03a") + 0.02,
        "siteBuild": W("s03a", "building") + 0.1,
        "family": E("s03a") - 0.05,
        "madeThis": E("s03a") + 0.12,
        "whyNot": E("s03a") + 0.72,
        "blogBuild": L("s04a") + 0.55,
        "aiChips": E("s04a") - 0.75,
        "keeping": E("s04a") - 0.02,
        "game": L("s05a"), "design": L("s05b"), "invent": L("s05f"),
        "burst": W("s05f", "completely"),
        "collapse": E("s05f") - 0.02,
        "ceiling": W("s06a", "ceiling"),
        "tools": L("s06b"), "place": L("s06c"), "someone": L("s06d"),
        "letsSee": L("s06e"),
        "logo": E("s06e") + 0.12,
        "coachIn": L("s07b") - 0.1,
        "walk": W("s07b", "walk"),
        "steps": [round(W("s07b", "walk") + 0.15 + i * (W("s07b", "mastery") - W("s07b", "walk") - 0.15) / 6, 3) for i in range(7)],
        "mastery": W("s07b", "mastery"),
        "aiOptions": L("s08a") + 0.05,
        "youAi": E("s08a") - 0.85,
        "doors": L("s08b") + 0.02,
        "publish": W("s09a", "publish"),
        "share": W("s09b", "share"),
        "friends": W("s09b", "friends"),
        "family2": W("s09b", "family"),
        "giftOpen": W("s10a", "opened"),
        "forgotten": L("s10b"),
        "turnLaptop": L("s10d") - 0.25,
        "tools2": E("s10d") - 0.95,
        "strips": E("s10d") - 0.1,
        "madeThat": E("s10d") + 0.2,
        "offer": L("s11a"),
                "screenTime": W("s12a", "screen"),
        "creationTime": L("s12b"),
        "endCard": L("s13a") - 0.08,
        "reserve": W("s13a", "reserve"),
        "fifty": W("s13a", "fifty"),
        "kes": L("s13b"),
        "letThem": L("s13c"),
    }
