"""TECH Lesson 1, "What is AI?" The narration script.

One entry per spoken line: (id, text, pause_after_seconds). Lines are synthesised separately so the
gaps between them are placed by hand: a pause is a decision, not whatever the TTS engine does.
A line id starts with its scene number. `layout.py` turns this into src/timeline.json.
"""

SCENES = [
    ("s01", "Wait... what is AI?"),
    ("s02", "So... what is AI?"),
    ("s03", "The robot and the dogs"),
    ("s04", "Patterns are everywhere"),
    ("s05", "AI is not magic"),
    ("s06", "AI is already around you"),
    ("s07", "AI can create"),
    ("s08", "But AI can be wrong"),
    ("s09", "AI is not you"),
    ("s10", "What could you create?"),
    ("s11", "Welcome to TECH"),
]

# Extra silence before a scene's first line (the scene change itself).
SCENE_LEAD = {"s01": 1.4, "s11": 1.2}
DEFAULT_LEAD = 1.1

LINES = [
    # 01 WAIT... WHAT IS AI?
    ("s01a", "Wait... what actually is AI?", 0.88),
    ("s01b", "Your phone. The videos that get recommended to you. The map that finds the fastest way home. "
             "Your camera. Your voice assistant. Your music. Even your email.", 0.75),
    ("s01c", "You've probably used AI before... even if you didn't know it.", 0.75),

    # 02 SO... WHAT IS AI?
    ("s02a", "So, what is it?", 0.56),
    ("s02b", "AI stands for Artificial Intelligence.", 0.56),
    ("s02c", "At its simplest, it's technology designed to do things that normally need some human intelligence.", 0.62),
    ("s02d", "Like recognizing what's in a picture.", 0.44),
    ("s02e", "Predicting what comes next.", 0.44),
    ("s02f", "Or creating something new.", 0.62),

    # 03 THE ROBOT AND THE DOGS
    ("s03a", "Here's a simple way to think about it.", 0.5),
    ("s03b", "Imagine you're teaching a little robot what a dog is.", 0.5),
    ("s03c", "You show it a picture. Dog.", 0.38),
    ("s03d", "Another one. Dog.", 0.31),
    ("s03e", "And another. Dog.", 0.5),
    ("s03f", "Then a few cats. Cat. Cat.", 0.75),
    ("s03g", "Now, a new animal appears. One it has never seen before.", 1.12),
    ("s03h", "And the robot says... dog.", 0.88),
    ("s03i", "Nobody gave it a rule. It found a pattern in the examples.", 0.56),
    ("s03j", "And that's a big idea in AI. When you give a system lots of examples, it can start finding patterns in them.", 0.5),
    ("s03k", "It doesn't learn exactly the way you do. But examples and patterns are where it starts.", 0.62),

    # 04 PATTERNS ARE EVERYWHERE
    ("s04a", "Try this one.", 0.38),
    ("s04b", "Two. Four. Six. Eight.", 0.44),
    ("s04c", "What comes next?", 1.88),
    ("s04d", "Ten. Easy, right?", 0.44),
    ("s04e", "Your brain spotted a pattern.", 0.88),
    ("s04f", "Now imagine millions of examples. Photos, words, sounds, numbers. "
             "Far more than any person could ever look through.", 0.5),
    ("s04g", "AI can work through enormous amounts of information like this, "
             "and find patterns that would be really hard for a person to spot by hand.", 0.62),

    # 05 AI IS NOT MAGIC
    ("s05a", "And once it has found patterns, it can do something surprising.", 0.62),
    ("s05b", "A blank canvas becomes a picture.", 0.31),
    ("s05c", "An empty page becomes a story.", 0.31),
    ("s05d", "An empty editor fills up with code.", 0.31),
    ("s05e", "A blank design becomes a poster.", 0.31),
    ("s05f", "A silent timeline becomes a melody.", 1.0),
    ("s05g", "It can look like magic.", 1.38),
    ("s05h", "But it isn't magic.", 0.75),
    ("s05i", "AI is a tool, built by people. It uses patterns learned from huge amounts of information "
             "to generate things, or to help you with them.", 0.62),

    # 06 AI IS ALREADY AROUND YOU
    ("s06a", "And AI isn't just robots in movies. It's already part of your everyday life.", 0.56),
    ("s06b", "When your phone unlocks, it's recognizing your face.", 0.44),
    ("s06c", "When YouTube recommends a video, it's predicting what you'll enjoy.", 0.44),
    ("s06d", "Maps predict the traffic, and find you a faster route.", 0.44),
    ("s06e", "Music apps pick songs you might like.", 0.44),
    ("s06f", "Your email catches spam before you ever see it.", 0.44),
    ("s06g", "Your camera can tell a face from a sunset.", 0.44),
    ("s06h", "And when you talk to a voice assistant, AI is turning your speech into words it can understand.", 0.62),
    ("s06i", "AI isn't only robots. It's all around you.", 0.75),

    # 07 AI CAN CREATE
    ("s07a", "And here's where things get really interesting.", 0.62),
    ("s07b", "AI can help you brainstorm ideas.", 0.25),
    ("s07c", "Write. Research.", 0.25),
    ("s07d", "Code. Design.", 0.25),
    ("s07e", "Make images. Explore music.", 0.25),
    ("s07f", "And work through tricky problems.", 0.75),
    ("s07g", "Which means a lot of things that once felt out of reach... are suddenly within reach.", 0.75),

    # 08 BUT AI CAN BE WRONG
    ("s08a", "But here's something really important.", 0.62),
    ("s08b", "Let's ask an AI a simple question.", 0.38),
    ("s08c", "How many legs does a spider have?", 3.25),  # the AI types its answer here
    ("s08d", "Sounds confident.", 0.62),
    ("s08e", "But it's wrong. Spiders have eight legs.", 0.88),
    ("s08f", "AI can sound extremely confident... and still give you the wrong answer.", 0.88),
    ("s08g", "That's why smart creators don't blindly copy AI.", 0.5),
    ("s08h", "They ask good questions.", 0.31),
    ("s08i", "They check the answer.", 0.31),
    ("s08j", "They think it through.", 0.31),
    ("s08k", "And they decide.", 0.62),
    ("s08l", "They use their own judgment.", 0.75),

    # 09 AI IS NOT YOU
    ("s09a", "Because AI is not you.", 0.75),
    ("s09b", "AI generates. You decide.", 0.56),
    ("s09c", "AI suggests. You judge.", 0.56),
    ("s09d", "AI helps. You create.", 0.88),
    ("s09e", "The goal isn't to replace your brain with AI.", 0.5),
    ("s09f", "The goal is to make your brain even more capable.", 0.75),
    ("s09g", "You, plus AI.", 1.0),

    # 10 WHAT COULD YOU CREATE?
    ("s10a", "So, picture an empty space. Your space.", 0.5),
    ("s10b", "A website. A game. A comic. A blog. A poster. A research project. A music project. "
             "A business idea. An invention. Your own AI assistant. "
             "Or something special for your friends and family.", 1.0),
    ("s10c", "What could you create?", 4.25),  # let it breathe

    # 11 WELCOME TO TECH
    ("s11a", "Welcome to TECH.", 0.56),
    ("s11b", "Learn. Create. Build.", 1.0),
    ("s11c", "Let's make something.", 3.25),
]

# Per-line delivery, in percent on top of gen_vo.BASE_RATE. edge-tts takes only rate and pitch, so emphasis comes from slowing the
# lines that matter and keeping the lists brisk.
LINE_RATE = {
    "s01a": -8, "s01c": -4, "s03h": -10, "s04c": -6, "s04d": -2,
    "s05g": -10, "s05h": -14, "s08d": -4, "s08f": -6,
    "s09a": -8, "s09g": -12, "s10c": -14, "s11a": -10, "s11b": -16, "s11c": -8,
    "s01b": 6, "s10b": 4, "s06c": 2,
}
