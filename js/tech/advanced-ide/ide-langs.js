/* =========================================================
   Paisley Advanced IDE — languages
   ---------------------------------------------------------
   One table for every language the Advanced IDE knows: how a file
   name maps to a language, its icon, its Monaco mode, how it runs,
   how much editor help it gets, starter projects and beginner hints.

   File lang ids match Code Lab's (html, css, js, json, md, txt) and add
   py, java, c, cpp, php. An unknown extension is plain text, never HTML.
========================================================= */
(function (g) {
  'use strict';

  /* help: 'full'  = full IntelliSense (a real language service)
           'smart' = Paisley suggestions: keywords, snippets, the standard library,
                     names from your own files, parameter hints and hover docs */
  var LANGS = {
    html: { label: 'HTML', monaco: 'html', icon: 'fab fa-html5', color: '#E34F26', ext: ['html', 'htm'], run: 'web', help: 'full',
      helpNote: 'Full IntelliSense from the HTML language service, plus Emmet-style tag snippets.', runNote: 'Live preview in a sandboxed page.' },
    css: { label: 'CSS', monaco: 'css', icon: 'fab fa-css3-alt', color: '#1572B6', ext: ['css'], run: 'web', help: 'full',
      helpNote: 'Full IntelliSense from the CSS language service, with colour pickers and live problem checks.', runNote: 'Styles the live preview.' },
    js: { label: 'JavaScript', monaco: 'javascript', icon: 'fab fa-js', color: '#E8B90C', ext: ['js', 'mjs'], run: 'web', help: 'full',
      helpNote: 'Full IntelliSense from the TypeScript language service: types, parameter hints, hover docs and errors as you type.', runNote: 'Runs in a sandboxed page; console output shows in the terminal.' },
    py: { label: 'Python', monaco: 'python', icon: 'fab fa-python', color: '#3776AB', ext: ['py'], run: 'python', help: 'full',
      helpNote: 'Full IntelliSense from Jedi (completions, parameter hints, hover docs, imports across your files) and live syntax checks.', runNote: 'Python 3 (Pyodide) in your browser, with input().' },
    java: { label: 'Java', monaco: 'java', icon: 'fab fa-java', color: '#E76F00', ext: ['java'], run: 'java', help: 'smart',
      helpNote: 'Paisley suggestions: keywords, snippets, common classes (String, Scanner, ArrayList, HashMap, Math), your own classes and methods, parameter hints. Errors show when you run.', runNote: 'Compiled and run on the Paisley code runner, an isolated sandbox.' },
    c: { label: 'C', monaco: 'c', badge: 'C', color: '#5C6BC0', ext: ['c', 'h'], run: 'c', help: 'smart',
      helpNote: 'Paisley suggestions: keywords, snippets, the C standard library with parameter hints and docs, your own functions, and live compiler checks from Clang.', runNote: 'Compiled by Clang to WebAssembly in your browser.' },
    cpp: { label: 'C++', monaco: 'cpp', badge: 'C++', color: '#00599C', ext: ['cpp', 'cc', 'cxx', 'hpp', 'hh', 'hxx'], run: 'cpp', help: 'smart',
      helpNote: 'Paisley suggestions: keywords, snippets, iostream, string, vector, map and algorithm with parameter hints and docs, your own functions and classes, and live compiler checks from Clang.', runNote: 'Compiled by Clang (C++17) to WebAssembly in your browser.' },
    php: { label: 'PHP', monaco: 'php', icon: 'fab fa-php', color: '#777BB4', ext: ['php'], run: 'php', help: 'smart',
      helpNote: 'Paisley suggestions: keywords, snippets, about 150 built-in functions with parameter hints and docs, your own functions and classes, and live syntax checks from PHP itself.', runNote: 'PHP 8.4 (php-wasm) in your browser.' },
    json: { label: 'JSON', monaco: 'json', icon: 'fas fa-code', color: '#8A6200', ext: ['json'], help: 'full' },
    md: { label: 'Markdown', monaco: 'markdown', icon: 'fab fa-markdown', color: '#3D4A48', ext: ['md'] },
    txt: { label: 'Plain text', monaco: 'plaintext', icon: 'fas fa-file-lines', color: '#5A6E6A', ext: ['txt', 'csv', 'in', 'dat', 'log'] }
  };
  /* The eight languages a project can be made in, in the order shown. */
  var PROJECT_LANGS = ['py', 'java', 'c', 'cpp', 'php', 'js', 'html', 'css'];

  function extOf(name) { var m = /\.([^./]+)$/.exec(String(name || '').toLowerCase()); return m ? m[1] : ''; }
  /* A .h header belongs to C++ in a C++ project. */
  function langOf(name, projectLang) {
    var e = extOf(name);
    if (e === 'h' && projectLang === 'cpp') return 'cpp';
    for (var k in LANGS) if (LANGS[k].ext.indexOf(e) !== -1) return k;
    return 'txt';
  }
  function info(lang) { return LANGS[lang] || LANGS.txt; }
  function icon(lang, extra) {
    var m = info(lang);
    if (m.badge) return '<span class="ai-badge' + (extra ? ' ' + extra : '') + '" style="--c:' + m.color + '" aria-hidden="true">' + m.badge + '</span>';
    return '<i class="' + m.icon + ' ai-ic' + (extra ? ' ' + extra : '') + '" style="color:' + m.color + '" aria-hidden="true"></i>';
  }
  /* Which runner a project uses, and which file it starts from. */
  function runnerFor(lang) { var m = info(lang); return m.run || null; }
  function defaultEntry(projectLang, files) {
    var names = files.map(function (f) { return f.name; });
    var pick = function (re) { return names.filter(function (n) { return re.test(n); })[0]; };
    if (projectLang === 'py') return pick(/^main\.py$/) || pick(/\.py$/);
    if (projectLang === 'java') {
      var withMain = files.filter(function (f) { return /\.java$/.test(f.name) && /static\s+void\s+main\s*\(/.test(f.content); })[0];
      return withMain ? withMain.name : pick(/\.java$/);
    }
    if (projectLang === 'c') return pick(/^main\.c$/) || pick(/\.c$/);
    if (projectLang === 'cpp') return pick(/^main\.(cpp|cc|cxx)$/) || pick(/\.(cpp|cc|cxx)$/);
    if (projectLang === 'php') return pick(/^index\.php$/) || pick(/^main\.php$/) || pick(/\.php$/);
    return pick(/^index\.html?$/) || pick(/\.html?$/) || pick(/\.js$/);
  }

  /* ---------------------------------------------------------
     Starter projects: each runs as soon as it is made.
     --------------------------------------------------------- */
  var T = {
    py: [
      { id: 'hello', title: 'Hello, Python', blurb: 'Asks your name and greets you.', files: [
        ['main.py', '# Welcome to Python in the Advanced Paisley IDE.\n# Press Run (F5). Type your answers in the terminal below.\n\nname = input("What is your name? ")\nprint(f"Hello, {name}! Welcome to Paisley Tech Studio.")\n\nage = int(input("How old are you? "))\nprint(f"In ten years you will be {age + 10}.")\n']] },
      { id: 'guess', title: 'Guess the number', blurb: 'A loop, random numbers and if statements.', files: [
        ['main.py', 'import random\n\nsecret = random.randint(1, 20)\ntries = 0\nprint("I am thinking of a number from 1 to 20.")\n\nwhile True:\n    guess = int(input("Your guess: "))\n    tries += 1\n    if guess < secret:\n        print("Higher!")\n    elif guess > secret:\n        print("Lower!")\n    else:\n        print(f"You got it in {tries} tries.")\n        break\n']] },
      { id: 'modules', title: 'Two files', blurb: 'Your own module, imported into main.py.', files: [
        ['main.py', 'from shapes import area_of_circle, area_of_rectangle\n\nprint("Circle, radius 3:", round(area_of_circle(3), 2))\nprint("Rectangle, 4 by 5:", area_of_rectangle(4, 5))\n'],
        ['shapes.py', 'import math\n\n\ndef area_of_circle(radius):\n    """Area of a circle with this radius."""\n    return math.pi * radius ** 2\n\n\ndef area_of_rectangle(width, height):\n    """Area of a width by height rectangle."""\n    return width * height\n']] }
    ],
    java: [
      { id: 'hello', title: 'Hello, Java', blurb: 'Reads your name with a Scanner.', files: [
        ['Main.java', 'import java.util.Scanner;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner in = new Scanner(System.in);\n        System.out.print("What is your name? ");\n        String name = in.nextLine();\n        System.out.println("Hello, " + name + "! Welcome to Paisley Tech Studio.");\n    }\n}\n']] },
      { id: 'grades', title: 'Grade calculator', blurb: 'Arrays, loops and methods.', files: [
        ['Main.java', 'public class Main {\n    static double average(int[] marks) {\n        int total = 0;\n        for (int m : marks) {\n            total += m;\n        }\n        return (double) total / marks.length;\n    }\n\n    public static void main(String[] args) {\n        int[] marks = {72, 85, 64, 90, 78};\n        double avg = average(marks);\n        System.out.printf("Average: %.1f%n", avg);\n        System.out.println(avg >= 70 ? "Great work!" : "Keep going!");\n    }\n}\n']] },
      { id: 'classes', title: 'Two classes', blurb: 'A Student class used from Main.', files: [
        ['Main.java', 'public class Main {\n    public static void main(String[] args) {\n        Student s = new Student("Amani", 14);\n        s.addPoints(25);\n        System.out.println(s);\n    }\n}\n'],
        ['Student.java', 'public class Student {\n    private final String name;\n    private final int age;\n    private int points;\n\n    public Student(String name, int age) {\n        this.name = name;\n        this.age = age;\n    }\n\n    public void addPoints(int p) {\n        points += p;\n    }\n\n    @Override\n    public String toString() {\n        return name + " (" + age + ") has " + points + " points";\n    }\n}\n']] }
    ],
    c: [
      { id: 'hello', title: 'Hello, C', blurb: 'printf and scanf.', files: [
        ['main.c', '#include <stdio.h>\n\nint main(void) {\n    char name[50];\n    int age;\n\n    printf("What is your name? ");\n    scanf("%49s", name);\n    printf("How old are you? ");\n    scanf("%d", &age);\n\n    printf("Hello, %s! In ten years you will be %d.\\n", name, age + 10);\n    return 0;\n}\n']] },
      { id: 'table', title: 'Temperature table', blurb: 'Loops and floating-point numbers.', files: [
        ['main.c', '#include <stdio.h>\n\nint main(void) {\n    printf("Celsius  Fahrenheit\\n");\n    for (int c = 0; c <= 100; c += 10) {\n        double f = c * 9.0 / 5.0 + 32;\n        printf("%7d  %10.1f\\n", c, f);\n    }\n    return 0;\n}\n']] },
      { id: 'files', title: 'Two files and a header', blurb: 'main.c uses functions from shapes.c.', files: [
        ['main.c', '#include <stdio.h>\n#include "shapes.h"\n\nint main(void) {\n    printf("Square, side 4: %d\\n", square_area(4));\n    printf("Triangle, base 6 height 3: %.1f\\n", triangle_area(6, 3));\n    return 0;\n}\n'],
        ['shapes.h', '#ifndef SHAPES_H\n#define SHAPES_H\n\nint square_area(int side);\ndouble triangle_area(double base, double height);\n\n#endif\n'],
        ['shapes.c', '#include "shapes.h"\n\nint square_area(int side) {\n    return side * side;\n}\n\ndouble triangle_area(double base, double height) {\n    return base * height / 2;\n}\n']] }
    ],
    cpp: [
      { id: 'hello', title: 'Hello, C++', blurb: 'cin, cout and strings.', files: [
        ['main.cpp', '#include <iostream>\n#include <string>\nusing namespace std;\n\nint main() {\n    string name;\n    cout << "What is your name? ";\n    getline(cin, name);\n    cout << "Hello, " << name << "! Welcome to Paisley Tech Studio." << endl;\n    return 0;\n}\n']] },
      { id: 'list', title: 'Shopping list', blurb: 'A vector you add to and sort.', files: [
        ['main.cpp', '#include <algorithm>\n#include <iostream>\n#include <string>\n#include <vector>\nusing namespace std;\n\nint main() {\n    vector<string> items;\n    string item;\n    cout << "Type items, then an empty line to finish." << endl;\n    while (getline(cin, item) && !item.empty()) {\n        items.push_back(item);\n    }\n    sort(items.begin(), items.end());\n    cout << "You need " << items.size() << " things:" << endl;\n    for (const string& s : items) {\n        cout << " - " << s << endl;\n    }\n    return 0;\n}\n']] },
      { id: 'classes', title: 'A class', blurb: 'A Robot class with its own header.', files: [
        ['main.cpp', '#include <iostream>\n#include "Robot.h"\n\nint main() {\n    Robot r("Zuri");\n    r.move(3);\n    r.move(-1);\n    std::cout << r.report() << std::endl;\n    return 0;\n}\n'],
        ['Robot.h', '#pragma once\n#include <string>\n\nclass Robot {\npublic:\n    explicit Robot(std::string name);\n    void move(int steps);\n    std::string report() const;\n\nprivate:\n    std::string name_;\n    int position_ = 0;\n};\n'],
        ['Robot.cpp', '#include "Robot.h"\n\nRobot::Robot(std::string name) : name_(std::move(name)) {}\n\nvoid Robot::move(int steps) {\n    position_ += steps;\n}\n\nstd::string Robot::report() const {\n    return name_ + " is at position " + std::to_string(position_);\n}\n']] }
    ],
    php: [
      { id: 'hello', title: 'Hello, PHP', blurb: 'Variables, functions and echo.', files: [
        ['index.php', '<?php\n// Press Run (F5). Your output shows in the terminal.\n\nfunction greet(string $name): string {\n    return "Hello, $name! Welcome to Paisley Tech Studio.";\n}\n\n$name = readline("What is your name? ");\necho greet($name), PHP_EOL;\n\n$scores = [72, 85, 64];\necho "Average score: ", array_sum($scores) / count($scores), PHP_EOL;\n']] },
      { id: 'page', title: 'A web page', blurb: 'PHP that builds HTML. Open it as a page.', files: [
        ['index.php', '<?php\n$title = "My Paisley page";\n$skills = ["HTML", "CSS", "PHP"];\n?>\n<!DOCTYPE html>\n<html>\n<head>\n  <title><?= htmlspecialchars($title) ?></title>\n  <style>body { font-family: sans-serif; padding: 2rem; }</style>\n</head>\n<body>\n  <h1><?= htmlspecialchars($title) ?></h1>\n  <p>Today is <?= date("l") ?>.</p>\n  <ul>\n    <?php foreach ($skills as $s): ?>\n      <li><?= htmlspecialchars($s) ?></li>\n    <?php endforeach; ?>\n  </ul>\n</body>\n</html>\n']] },
      { id: 'classes', title: 'Two files', blurb: 'A class in its own file.', files: [
        ['index.php', '<?php\nrequire "BankAccount.php";\n\n$acc = new BankAccount("Wanjiru");\n$acc->deposit(500);\n$acc->withdraw(120);\necho $acc->summary(), PHP_EOL;\n'],
        ['BankAccount.php', '<?php\n\nclass BankAccount {\n    private float $balance = 0;\n\n    public function __construct(private string $owner) {}\n\n    public function deposit(float $amount): void {\n        $this->balance += $amount;\n    }\n\n    public function withdraw(float $amount): void {\n        if ($amount > $this->balance) {\n            echo "Not enough money.", PHP_EOL;\n            return;\n        }\n        $this->balance -= $amount;\n    }\n\n    public function summary(): string {\n        return "{$this->owner} has {$this->balance}";\n    }\n}\n']] }
    ],
    js: [
      { id: 'console', title: 'Console program', blurb: 'JavaScript that prints to the terminal.', files: [
        ['main.js', '// Press Run (F5). console.log output shows in the terminal.\n\nfunction average(numbers) {\n  const total = numbers.reduce((sum, n) => sum + n, 0);\n  return total / numbers.length;\n}\n\nconst scores = [72, 85, 64, 90];\nconsole.log("Scores:", scores.join(", "));\nconsole.log("Average:", average(scores).toFixed(1));\n']] },
      { id: 'page', title: 'Interactive page', blurb: 'A button that counts your clicks.', files: [
        ['index.html', '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Click counter</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Click counter</h1>\n  <button id="btn">Click me</button>\n  <p id="count">0 clicks</p>\n  <script src="script.js"></script>\n</body>\n</html>\n'],
        ['style.css', 'body {\n  font-family: system-ui, sans-serif;\n  display: grid;\n  place-items: center;\n  min-height: 90vh;\n}\n\nbutton {\n  font-size: 1.2rem;\n  padding: .7rem 1.4rem;\n  border-radius: 12px;\n  border: 0;\n  background: #55BFB3;\n  cursor: pointer;\n}\n'],
        ['script.js', 'const btn = document.getElementById("btn");\nconst count = document.getElementById("count");\nlet clicks = 0;\n\nbtn.addEventListener("click", () => {\n  clicks++;\n  count.textContent = clicks + (clicks === 1 ? " click" : " clicks");\n  console.log("Clicked", clicks);\n});\n']] }
    ],
    html: [
      { id: 'page', title: 'Web page', blurb: 'HTML, CSS and JavaScript together.', files: [
        ['index.html', '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My page</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <header>\n    <h1>Hello, studio!</h1>\n    <p>Edit index.html and press Run.</p>\n  </header>\n  <script src="script.js"></script>\n</body>\n</html>\n'],
        ['style.css', 'body {\n  font-family: system-ui, sans-serif;\n  margin: 0;\n  padding: 2rem;\n  background: #F4F8F7;\n  color: #1D2A28;\n}\n\nh1 {\n  color: #245F5A;\n}\n'],
        ['script.js', 'console.log("The page is ready.");\n']] }
    ],
    css: [
      { id: 'cards', title: 'Style playground', blurb: 'Flexbox cards to restyle.', files: [
        ['index.html', '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <title>Cards</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <main class="cards">\n    <article class="card"><h2>Code</h2><p>Build apps and games.</p></article>\n    <article class="card"><h2>Design</h2><p>Make things beautiful.</p></article>\n    <article class="card"><h2>Create</h2><p>Share your ideas.</p></article>\n  </main>\n</body>\n</html>\n'],
        ['style.css', '/* Change these rules and press Run to see the result. */\nbody {\n  font-family: system-ui, sans-serif;\n  background: #F4F8F7;\n  padding: 2rem;\n}\n\n.cards {\n  display: flex;\n  gap: 1rem;\n  flex-wrap: wrap;\n}\n\n.card {\n  flex: 1 1 180px;\n  background: white;\n  border-radius: 16px;\n  padding: 1.2rem;\n  box-shadow: 0 4px 20px rgba(36, 95, 90, .08);\n  transition: transform .2s;\n}\n\n.card:hover {\n  transform: translateY(-4px);\n}\n']] }
    ]
  };
  function templates(lang) { return T[lang] || []; }
  function templateFiles(lang, id) {
    var t = (T[lang] || []).filter(function (x) { return x.id === id; })[0] || (T[lang] || [])[0];
    return t ? t.files.map(function (f) { return { name: f[0], lang: langOf(f[0], lang), content: f[1] }; }) : [];
  }

  /* ---------------------------------------------------------
     Beginner hints, shown when a project is new to the builder.
     --------------------------------------------------------- */
  var HINTS = {
    py: ['Python uses indentation (4 spaces) instead of { } to group code.', 'input() always gives you text. Use int(...) or float(...) to turn it into a number.', 'Put each module in its own .py file and import it by name, without .py.'],
    java: ['The file name must match the public class: class Main lives in Main.java.', 'Every program starts at public static void main(String[] args).', 'Statements end with a semicolon ;'],
    c: ['Every program starts at int main(void).', 'Use printf to print and scanf to read. Remember the & before a variable in scanf.', 'Declare shared functions in a .h header and #include it.'],
    cpp: ['Every program starts at int main().', 'cout << prints, cin >> reads one word, getline(cin, s) reads a whole line.', 'Exceptions (try / throw) are switched off in the browser compiler; return error codes instead.'],
    php: ['PHP code goes between <?php and ?>. Everything outside is sent as it is.', 'Variables start with $, and statements end with ;', 'Use echo to print, readline() or fgets(STDIN) to read a line. If a program prints HTML, open it as a page.'],
    js: ['console.log(...) prints to the terminal.', 'Use const for values that do not change and let for ones that do.', 'For a web page, add index.html and link your script with <script src="script.js">.'],
    html: ['Every page needs <!DOCTYPE html>, <head> and <body>.', 'Link styles with <link rel="stylesheet" href="style.css">.', 'Type a tag name like section and press Tab or Enter to finish it.'],
    css: ['A rule is selector { property: value; }', 'Hover a colour to open the colour picker.', 'display: flex and display: grid lay things out in rows and columns.']
  };

  /* ---------------------------------------------------------
     Friendly explanations for common errors.
     --------------------------------------------------------- */
  var EXPLAIN = {
    py: [
      [/IndentationError|unexpected indent|expected an indented block/, 'Python groups code by indentation. Check that the lines inside this if, loop or function are indented by the same amount (4 spaces).'],
      [/NameError: name '([^']+)'/, function (m) { return 'Python does not know the name "' + m[1] + '". Check the spelling and capital letters, and that you created it before this line.'; }],
      [/SyntaxError: (?:'\(' was never closed|unexpected EOF|was never closed)/, 'A bracket or quote was opened and never closed. Look for a missing ) ] } or " on this line or the one above.'],
      [/SyntaxError: expected ':'/, 'Lines that start a block (if, for, while, def, class) end with a colon :'],
      [/SyntaxError/, 'Python could not understand this line. Look for a missing bracket, quote, colon or comma.'],
      [/TypeError: can only concatenate str|unsupported operand type\(s\) for \+: 'int' and 'str'|must be str, not int/, 'You are joining text and a number. Use str(number) or an f-string like f"Score: {score}".'],
      [/ValueError: invalid literal for int\(\)/, 'int() was given text that is not a whole number. Check what was typed in.'],
      [/ZeroDivisionError/, 'The program divided by zero. Check the number you divide by before dividing.'],
      [/IndexError/, 'The program asked for an item past the end of a list. Lists start at 0, so the last item is len(list) - 1.'],
      [/KeyError: (.*)/, function (m) { return 'The dictionary has no key ' + m[1] + '. Use dict.get(key) or check with "if key in dict".'; }],
      [/ModuleNotFoundError: No module named '([^']+)'/, function (m) { return 'There is no module called "' + m[1] + '". For your own file, check that ' + m[1] + '.py exists. Some packages from pip are not available in the browser.'; }],
      [/EOFError/, 'The program wanted more input than it was given. Type your answer in the terminal when it asks, or add lines in the Input tab.'],
      [/RecursionError/, 'A function kept calling itself without stopping. Check its base case.'],
      [/AttributeError: '(\w+)' object has no attribute '(\w+)'/, function (m) { return 'A ' + m[1] + ' has no "' + m[2] + '". Check the spelling, or what kind of value you have here.'; }]
    ],
    java: [
      [/cannot find symbol/, 'Java does not know this name. Check the spelling and capital letters, and that the variable or method exists and is in scope.'],
      [/';' expected/, 'A statement is missing its semicolon ; at the end.'],
      [/class (\w+) is public, should be declared in a file named/, function (m) { return 'A public class must live in a file with the same name: put class ' + m[1] + ' in ' + m[1] + '.java.'; }],
      [/incompatible types/, 'The value does not match the variable\'s type. For example, a String cannot go into an int; use Integer.parseInt(text).'],
      [/missing return statement/, 'This method promises to return a value, but one path ends without return.'],
      [/NullPointerException/, 'The program used an object that is null. Make sure it was created with new before you use it.'],
      [/ArrayIndexOutOfBoundsException/, 'The program asked for an array item past the end. Arrays start at 0, so the last item is length - 1.'],
      [/NoSuchElementException/, 'The Scanner wanted more input than it was given. Add lines in the Input tab before you run.'],
      [/InputMismatchException/, 'The Scanner expected a number but read text.'],
      [/ArithmeticException: \/ by zero/, 'The program divided by zero.']
    ],
    c: [
      [/expected ';'/, 'A statement is missing its semicolon ; at the end.'],
      [/use of undeclared identifier '(\w+)'/, function (m) { return 'C does not know "' + m[1] + '". Check the spelling, declare it before use, or #include the header that defines it.'; }],
      [/call to undeclared function '(\w+)'|implicit declaration of function '(\w+)'/, function (m) { return 'The function "' + (m[1] || m[2]) + '" is used before C knows about it. #include its header, or declare it above main.'; }],
      [/undefined symbol: (\w+)/, function (m) { return 'The linker could not find "' + m[1] + '". Check that the .c file that defines it is in the project and the name matches.'; }],
      [/format specifies type/, 'The printf/scanf format does not match the value: %d is for int, %f for double, %s for text, %c for one character.'],
      [/memory access out of bounds/, 'The program read or wrote memory it does not own: an array index past the end, or a bad pointer.'],
      [/unreachable/, 'The program stopped abnormally (for example abort() or a failed assert).']
    ],
    php: [
      [/Undefined variable \$(\w+)/, function (m) { return 'The variable $' + m[1] + ' has no value yet. Set it before you use it, and check its spelling.'; }],
      [/Call to undefined function (\w+)\(\)/, function (m) { return 'PHP has no function called ' + m[1] + '(). Check the spelling, or require the file that defines it.'; }],
      [/syntax error, unexpected (.*)/, 'PHP could not understand this line. Look for a missing ; or a bracket or quote that was not closed on this line or the one above.'],
      [/DivisionByZeroError/, 'The program divided by zero.'],
      [/Failed opening required '([^']+)'/, function (m) { return 'PHP could not find the file ' + m[1] + '. Check its name and folder in the explorer.'; }],
      [/Undefined array key (.*)/, function (m) { return 'The array has no key ' + m[1] + '. Use isset() or ?? to check first.'; }]
    ],
    js: [
      [/(\w+) is not defined/, function (m) { return 'JavaScript does not know "' + m[1] + '". Check the spelling and capital letters, and that you declared it with const or let.'; }],
      [/Cannot read propert(?:y|ies) of (null|undefined)/, 'The code used something that is null or undefined. If it is a page element, check the id in getElementById and that the element exists.'],
      [/is not a function/, 'The code called something that is not a function. Check the spelling of the method name.'],
      [/Unexpected token|missing \) after/, 'JavaScript could not understand this line. Look for a missing bracket, quote or comma.']
    ]
  };
  EXPLAIN.cpp = EXPLAIN.c.concat([
    [/cannot use 'throw' with exceptions disabled|cannot use 'try' with exceptions disabled|__cxa_throw/, 'Exceptions (try / throw / catch) are switched off in the browser C++ compiler. Return an error value or check conditions with if instead.'],
    [/no member named '(\w+)' in '([^']+)'/, function (m) { return '"' + m[2] + '" has no member called ' + m[1] + '. Check the spelling.'; }],
    [/no matching function for call to '(\w+)'/, function (m) { return 'No version of ' + m[1] + '() takes these arguments. Check how many arguments you pass and their types.'; }],
    [/'(\w+)' was not declared|unknown type name '(\w+)'/, function (m) { return '"' + (m[1] || m[2]) + '" is not known here. Did you #include the right header, or add "using namespace std;" or std:: in front?'; }]
  ]);
  EXPLAIN.html = EXPLAIN.css = EXPLAIN.js;
  function explain(lang, text) {
    var rules = EXPLAIN[lang] || [], s = String(text || '');
    for (var i = 0; i < rules.length; i++) {
      var m = rules[i][0].exec(s);
      if (m) return typeof rules[i][1] === 'function' ? rules[i][1](m) : rules[i][1];
    }
    return '';
  }

  g.PaisleyLangs = {
    LANGS: LANGS, PROJECT_LANGS: PROJECT_LANGS, HINTS: HINTS,
    langOf: langOf, info: info, icon: icon, extOf: extOf, runnerFor: runnerFor, defaultEntry: defaultEntry,
    templates: templates, templateFiles: templateFiles, explain: explain
  };
})(window);
