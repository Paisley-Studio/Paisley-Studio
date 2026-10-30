"""TECH Lesson 2, "Make something with AI." The narration script.

Same format as Lesson 1 (production/script.py): one entry per spoken line, (id, text, pause_after_seconds).
A line id starts with its scene number. `layout.py` turns this into src/lesson2/timeline.json.

The lesson runs exactly TARGET seconds. Whatever time the voice and the fixed pauses leave over is shared
out between the FLEX pauses: the moments where the student is asked to think, look or read, which is
where extra breathing room belongs.

Running example: LUMORA, a small flying creature from the Glow Forest. Version 1 has two wings, a desert
and a scary face; version 2 fixes those but has a short plain tail; version 3 is the idea.
"""

TARGET = 420.0

SCENES = [
    ("s01", "Now let's use it"),
    ("s02", "Your mission"),
    ("s03", "Design it first"),
    ("s04", "Be specific"),
    ("s05", "Your first creation"),
    ("s06", "Is it perfect?"),
    ("s07", "Check. Think. Improve."),
    ("s08", "Create, check, improve"),
    ("s09", "AI doesn't know your idea"),
    ("s10", "Your challenge"),
    ("s11", "Be honest about AI"),
    ("s12", "Your creation card"),
    ("s13", "Your turn"),
    ("s14", "That's creating with AI"),
]

# Extra silence before a scene's first line (the scene change itself).
SCENE_LEAD = {"s01": 2.6, "s05": 1.3, "s14": 1.3}
DEFAULT_LEAD = 0.95

LINES = [
    # 01 NOW LET'S USE IT: a blank canvas
    ("s01a", "In the last lesson, we learned what AI is.", 0.75),
    ("s01b", "Now... let's actually use it.", 1.25),
    ("s01c", "But here's the challenge.", 0.6),
    ("s01d", "We're not going to ask AI to do everything for us.", 0.75),
    ("s01e", "We're going to give it an idea.", 0.55),
    ("s01f", "Your idea.", 1.25),

    # 02 YOUR MISSION
    ("s02a", "Today, you're making your first AI creation.", 0.5),
    ("s02b", "Here's your mission.", 0.45),
    ("s02c", "Create your dream creature.", 0.9),
    ("s02d", "It could fly. It could swim. It could be a robot, a jungle beast, "
             "or something nobody has ever imagined.", 0.7),
    ("s02e", "But there's a twist.", 0.55),
    ("s02f", "You have to design it before you ask AI to make it.", 0.6),
    ("s02g", "Otherwise, the AI does all the imagining. Not you.", 0.7),
    ("s02h", "Today, you're the creator.", 1.0),

    # 03 DESIGN IT FIRST: five questions, then Lumora, then the student imagines theirs
    ("s03a", "Before you touch any AI tool, answer five quick questions.", 0.6),
    ("s03b", "One. Name. What is your creature called?", 0.45),
    ("s03c", "Two. Habitat. Where does it live?", 0.45),
    ("s03d", "Three. Special ability. What can it do that normal animals can't?", 0.45),
    ("s03e", "Four. Appearance. Size, shape, colour, eyes, wings.", 0.45),
    ("s03f", "And five. Personality. Friendly? Brave? A little bit mischievous?", 0.7),
    ("s03g", "Here's mine.", 0.4),
    ("s03h", "Lumora. It lives in the Glow Forest, and it can turn invisible. It's small, with four wings, "
             "huge curious eyes, blue feathers and a long golden tail. And it's curious and playful.", 0.9),
    ("s03i", "Now you. Take a moment, and imagine yours.", 1.0),  # FLEX: think time
    ("s03j", "Got one? Hold on to it.", 0.9),

    # 04 BE SPECIFIC: three prompts, three results (a different creature, so Lumora's first try stays a surprise)
    ("s04a", "Now, here's the first big secret of creating with AI.", 0.55),
    ("s04b", "Watch what happens with a lazy instruction.", 0.5),
    ("s04c", "Make me a cool creature.", 2.3),  # it generates
    ("s04d", "Hmm. It's... a creature. Technically.", 0.7),
    ("s04e", "The AI had to guess everything, so it guessed something ordinary.", 0.6),
    ("s04f", "Let's add a little more.", 0.45),
    ("s04g", "Make an underwater creature that glows.", 2.3),  # it generates
    ("s04h", "Better.", 0.6),
    ("s04j", "Now really describe it. A round, friendly creature from a deep sea cave. Orange, with purple spots, "
             "tiny wings instead of fins, and a belly that glows like a lantern.", 2.5),  # it generates
    ("s04k", "See the difference?", 1.1),
    ("s04l", "Same AI. Different instructions. The better you explain your idea, the better you can guide it.", 0.6),
    ("s04n", "Your idea, plus clear instructions... equals better results.", 1.2),

    # 05 YOUR FIRST CREATION: the studio, the prompt is typed, IDEA > WORDS > AI > CREATION
    ("s05a", "Okay. Your turn.", 0.6),
    ("s05b", "Take the creature you imagined, and describe it to the AI.", 0.6),
    ("s05c", "Welcome to your studio.", 0.6),
    ("s05d", "Here's how I'd describe Lumora.", 7.2),  # the prompt types itself, keys only
    ("s05e", "Your idea becomes words.", 0.45),
    ("s05f", "The words go to the AI.", 0.45),
    ("s05g", "And the AI turns them into...", 3.0),  # it generates
    ("s05h", "a creation.", 2.8),  # let them look at it
    ("s05i", "That's your first AI creation.", 1.3),

    # 06 IS IT PERFECT?
    ("s06a", "But don't stop there.", 0.6),
    ("s06b", "Look at it closely. Is it perfect?", 1.6),  # FLEX
    ("s06c", "Probably not.", 0.7),
    ("s06d", "Compare it with the description. Can you spot what's different?", 1.0),  # FLEX: spot it
    ("s06e", "AI can miss things.", 0.75),
    ("s06f", "Remember? AI can be powerful... and still get things wrong.", 0.8),

    # 07 CHECK. THINK. IMPROVE.
    ("s07a", "So this is where you come back in.", 0.55),
    ("s07b", "First, check.", 0.5),
    ("s07c", "I wanted four wings. It made two.", 0.5),
    ("s07d", "I wanted a glowing rainforest. This looks like a desert.", 0.5),
    ("s07e", "I wanted friendly. This one looks... a little scary.", 0.9),
    ("s07f", "Then, think. What needs to change?", 1.0),  # FLEX
    ("s07g", "Then, improve.", 0.5),
    ("s07h", "Keep the creature's design, but change it to four wings, and place it inside a glowing rainforest. "
             "Make its expression friendly.", 2.6),  # it generates
    ("s07i", "Much closer.", 0.9),

    # 08 CREATE, CHECK, IMPROVE: version 3, then the journey
    ("s08a", "But check again. The tail is short, and it isn't golden.", 0.5),
    ("s08b", "Improve. Make the tail long and golden, and let it glow.", 2.5),  # it generates
    ("s08c", "Now that's Lumora.", 1.3),
    ("s08e", "Version one. Check. Think. Version two. Improve. Version three.", 0.9),
    ("s08f", "That's how creators use AI.", 0.5),
    ("s08g", "You don't just accept the first result.", 0.45),
    ("s08h", "You look at it.", 0.3),
    ("s08i", "You decide what's working.", 0.3),
    ("s08j", "You decide what isn't.", 0.4),
    ("s08k", "Then you improve it.", 0.8),
    ("s08l", "Create. Check. Improve.", 1.4),

    # 09 AI DOESN'T KNOW YOUR IDEA
    ("s09a", "And here's something really important.", 0.55),
    ("s09b", "AI doesn't know your idea.", 0.9),
    ("s09c", "It can only work with what you tell it.", 0.5),
    ("s09d", "It can't see inside your imagination. It didn't know Lumora's tail was golden... until you said so.", 0.65),
    ("s09e", "That's why you have to direct it.", 0.6),
    ("s09f", "Your idea is the plan. AI is the tool.", 0.7),
    ("s09g", "You are the creator.", 1.4),

    # 10 YOUR CHALLENGE
    ("s10a", "Now, here's your challenge.", 0.55),
    ("s10b", "Create a creature with a unique name. A habitat. One special ability. "
             "Three things about how it looks. And a personality.", 0.6),
    ("s10c", "Then use AI to create it.", 0.55),
    ("s10d", "And you have to improve the first result at least once.", 0.6),
    ("s10e", "Not one prompt, and done.", 0.45),
    ("s10f", "Create. Check. Improve.", 1.2),  # FLEX: read the checklist

    # 11 BE HONEST ABOUT AI: the reflection
    ("s11a", "Then answer three short questions.", 0.5),
    ("s11b", "What did you do?", 0.35),
    ("s11c", "What did AI do?", 0.35),
    ("s11d", "And what did you change?", 0.8),
    ("s11e", "Like this. I came up with the creature idea. AI helped generate the image. "
             "I changed my description, because the first result was wrong.", 0.7),
    ("s11f", "Simple. Honest. Good creators always say how they used AI.", 0.9),

    # 12 YOUR CREATION CARD: card, save, project space
    ("s12a", "Then your creature gets its own card.", 0.5),
    ("s12b", "Name. Habitat. Ability. Personality. And who made it.", 0.6),
    ("s12c", "Save it to your TECH project space.", 0.5),
    ("s12d", "It's saved as a self-led student project... or a mission project, if your coach set it.", 0.55),
    ("s12e", "Either way, it doesn't disappear when this lesson ends.", 0.45),
    ("s12f", "This is your first project.", 1.2),

    # 13 YOUR TURN: leave the video, do it, the coach sees it
    ("s13b", "Pause this video, and open your TECH workspace.", 0.5),
    ("s13c", "Design your creature. Write your instruction, and generate it with an approved AI tool.", 0.5),
    ("s13d", "Check it, and improve it at least once.", 0.5),
    ("s13e", "Then write your reflection, and save.", 0.7),
    ("s13f", "When you're finished, your coach can see what you created. "
             "Your idea, your first try, your improved version, and your reflection.", 0.6),
    ("s13g", "Every TECH project follows the same path.", 0.45),
    ("s13h", "Learn. Practice. Build. Submit. Review. Improve. Master.", 1.2),

    # 14 THAT'S CREATING WITH AI
    ("s14a", "Let's go back to Lumora.", 0.6),
    ("s14b", "The idea.", 0.55),
    ("s14c", "The first try.", 0.55),
    ("s14d", "Your creation.", 1.1),
    ("s14e", "You didn't just ask AI to make something.", 0.5),
    ("s14f", "You had an idea.", 0.3),
    ("s14g", "You gave it direction.", 0.3),
    ("s14h", "You checked the result.", 0.3),
    ("s14i", "And you made it better.", 1.2),
    ("s14j", "That's creating with AI.", 0.9),
    ("s14k", "You, plus AI.", 1.6),
    ("s14l", "You had the idea. AI helped you build it. You made it yours.", 1.1),
    ("s14m", "So... what will you create next?", 3.0),  # FLEX: the ending holds
]

# Where spare time goes, by weight (the lesson must come out at exactly TARGET seconds).
FLEX = {"s03i": 4, "s06b": 1.5, "s06d": 3, "s07f": 1, "s10f": 2, "s13e": 1, "s14m": 2}

# Per-line delivery, in percent on top of gen_vo.BASE_RATE.
LINE_RATE = {
    "s01b": -10, "s01f": -14, "s02c": -8, "s02h": -8, "s03g": -6, "s03i": -8,
    "s04d": -8, "s04k": -8, "s04n": -6, "s05a": -6, "s05h": -12, "s05i": -6,
    "s06b": -6, "s06c": -10, "s06e": -8, "s07e": -4, "s07i": -6, "s08c": -8, "s08l": -12,
    "s09b": -10, "s09g": -12, "s10f": -12, "s12f": -8, "s13h": -6,
    "s14b": -10, "s14c": -10, "s14d": -12, "s14j": -10, "s14k": -14, "s14l": -6, "s14m": -12,
    "s02d": 4, "s03h": 2, "s04j": 2, "s05d": 0, "s07h": 2, "s10b": 2, "s13c": 2, "s13f": 2,
}
