/* =========================================================
   Paisley Advanced IDE — editor help (Monaco providers)
   ---------------------------------------------------------
   Full IntelliSense
     JavaScript, HTML, CSS, JSON  Monaco's own language services
     Python                       Jedi running in Pyodide (completions, parameter
                                  hints, hover docs, imports across your files),
                                  plus parso syntax checks as you type
   Paisley suggestions (named as such in the IDE, not called IntelliSense)
     Java, C, C++, PHP            keywords, snippets, the common standard library
                                  with parameter hints and hover docs, members after
                                  . -> :: for known types, your own functions,
                                  classes and fields from every file
   Live checks
     C, C++   Clang -fsyntax-only on the open file
     PHP      PHP's own parser (token_get_all with TOKEN_PARSE)
     Python   parso via Jedi
     Java     errors arrive when you run (javac on the code runner)

   PaisleyIntel.setup(monaco, ctx) -> { lint(model), clear() }
     ctx: { files() -> [{name, lang, content}], runner, pathOf(model),
            projectLang(), onPyState(state) }
========================================================= */
(function (g) {
  'use strict';

  /* ---------- library tables: "name(params)|returns|doc" ---------- */
  function lib(lines) {
    var out = {};
    lines.forEach(function (l) {
      /* Types may hold | too (int|float), so the signature ends at its closing bracket. */
      var bar = l.indexOf('|'), open = l.indexOf('('), end = bar;
      if (open !== -1 && open < bar) { var d = 0; for (end = open; end < l.length; end++) { if (l[end] === '(') d++; else if (l[end] === ')' && --d === 0) { end++; break; } } }
      var sig = l.slice(0, end), rest = l.slice(end + 1), last = rest.lastIndexOf('|');
      var m = /^([\w.:~]+)(?:\((.*)\))?$/.exec(sig);
      if (!m) return;
      var params = m[2] == null ? null : (m[2] ? splitParams(m[2]) : []);
      out[m[1]] = { name: m[1], params: params, ret: last === -1 ? '' : rest.slice(0, last), doc: last === -1 ? rest : rest.slice(last + 1), sig: sig };
    });
    return out;
  }
  function splitParams(s) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if ('<([{'.indexOf(c) !== -1) depth++;
      if ('>)]}'.indexOf(c) !== -1) depth--;
      if (c === ',' && depth === 0) { out.push(cur.trim()); cur = ''; } else cur += c;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
  }
  function words(s) { return s.split(/\s+/).filter(Boolean); }

  var C_LIB = lib([
    'printf(const char *format, ...)|int|Prints formatted text. %d int, %f double, %c char, %s text, %x hex, %% a percent sign.',
    'scanf(const char *format, ...)|int|Reads formatted input. Pass addresses: scanf("%d", &n). Returns how many values were read.',
    'puts(const char *s)|int|Prints s and a newline.', 'putchar(int c)|int|Prints one character.', 'getchar()|int|Reads one character, or EOF.',
    'fgets(char *buf, int size, FILE *stream)|char *|Reads a line (keeps the newline) into buf. Use stdin to read typed input. NULL at end of input.',
    'fputs(const char *s, FILE *stream)|int|Writes s to a stream.', 'fprintf(FILE *stream, const char *format, ...)|int|printf to a stream, such as stderr.',
    'sprintf(char *buf, const char *format, ...)|int|printf into a char array.', 'snprintf(char *buf, size_t size, const char *format, ...)|int|printf into a char array, never more than size bytes.',
    'sscanf(const char *s, const char *format, ...)|int|scanf from a string.', 'fscanf(FILE *stream, const char *format, ...)|int|scanf from a file.',
    'fopen(const char *path, const char *mode)|FILE *|Opens a project file. mode "r" read, "w" write, "a" append. NULL if it fails.',
    'fclose(FILE *stream)|int|Closes a file.', 'feof(FILE *stream)|int|Non-zero at the end of the file.',
    'malloc(size_t size)|void *|Allocates size bytes. Free it with free().', 'calloc(size_t count, size_t size)|void *|Allocates zeroed memory for count items.',
    'realloc(void *ptr, size_t size)|void *|Grows or shrinks an allocation.', 'free(void *ptr)|void|Releases memory from malloc/calloc/realloc.',
    'atoi(const char *s)|int|Text to int.', 'atof(const char *s)|double|Text to double.', 'strtol(const char *s, char **end, int base)|long|Text to long, with error checking.',
    'rand()|int|A pseudo-random number from 0 to RAND_MAX. Seed with srand(time(NULL)).', 'srand(unsigned seed)|void|Seeds rand().',
    'abs(int n)|int|Absolute value.', 'exit(int status)|void|Ends the program now.',
    'qsort(void *base, size_t count, size_t size, int (*compare)(const void *, const void *))|void|Sorts an array with your compare function.',
    'strlen(const char *s)|size_t|Length of s, not counting the final \\0.', 'strcpy(char *dest, const char *src)|char *|Copies src into dest. dest must be big enough.',
    'strncpy(char *dest, const char *src, size_t n)|char *|Copies at most n characters.', 'strcat(char *dest, const char *src)|char *|Adds src to the end of dest.',
    'strcmp(const char *a, const char *b)|int|0 if equal, negative if a comes first, positive if b does.', 'strncmp(const char *a, const char *b, size_t n)|int|strcmp on the first n characters.',
    'strchr(const char *s, int c)|char *|First c in s, or NULL.', 'strstr(const char *s, const char *find)|char *|First place find appears in s, or NULL.',
    'memcpy(void *dest, const void *src, size_t n)|void *|Copies n bytes.', 'memset(void *s, int c, size_t n)|void *|Sets n bytes to c.',
    'sqrt(double x)|double|Square root.', 'pow(double base, double exp)|double|base to the power exp.', 'fabs(double x)|double|Absolute value of a double.',
    'floor(double x)|double|Rounds down.', 'ceil(double x)|double|Rounds up.', 'round(double x)|double|Rounds to the nearest whole number.',
    'sin(double x)|double|Sine (radians).', 'cos(double x)|double|Cosine (radians).', 'tan(double x)|double|Tangent (radians).', 'log(double x)|double|Natural logarithm.', 'exp(double x)|double|e to the power x.',
    'isdigit(int c)|int|True for 0-9.', 'isalpha(int c)|int|True for a letter.', 'isspace(int c)|int|True for space, tab or newline.',
    'isupper(int c)|int|True for a capital letter.', 'islower(int c)|int|True for a small letter.', 'toupper(int c)|int|Capital version of c.', 'tolower(int c)|int|Small version of c.',
    'time(time_t *t)|time_t|Seconds since 1970. time(NULL) is the usual call.', 'clock()|clock_t|Processor time used; divide by CLOCKS_PER_SEC.'
  ]);
  var C_KEYWORDS = words('auto break case char const continue default do double else enum extern float for goto if inline int long register return short signed sizeof static struct switch typedef union unsigned void volatile while bool true false NULL EOF stdin stdout stderr size_t FILE RAND_MAX CLOCKS_PER_SEC #include #define #ifndef #endif');
  var C_SNIPS = [
    ['main', 'int main(void) {\n\t${1}\n\treturn 0;\n}', 'The program starts here'],
    ['inc', '#include <${1:stdio.h}>', '#include a header'], ['stdio', '#include <stdio.h>', 'Input and output'], ['stdlib', '#include <stdlib.h>', 'Memory, rand, atoi'],
    ['for', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', 'Counting loop'], ['while', 'while (${1:condition}) {\n\t${2}\n}', 'Loop while true'],
    ['do', 'do {\n\t${1}\n} while (${2:condition});', 'Loop at least once'], ['if', 'if (${1:condition}) {\n\t${2}\n}', 'If statement'],
    ['ifelse', 'if (${1:condition}) {\n\t${2}\n} else {\n\t${3}\n}', 'If / else'], ['switch', 'switch (${1:value}) {\ncase ${2:1}:\n\t${3}\n\tbreak;\ndefault:\n\tbreak;\n}', 'Switch'],
    ['printf', 'printf("${1:%d}\\n", ${2});', 'Print formatted'], ['scanf', 'scanf("${1:%d}", &${2:n});', 'Read a value'],
    ['struct', 'struct ${1:Name} {\n\t${2:int x;}\n};', 'A struct'], ['func', '${1:int} ${2:name}(${3:void}) {\n\t${4}\n}', 'A function'],
    ['guard', '#ifndef ${1:NAME}_H\n#define ${1:NAME}_H\n\n${2}\n\n#endif', 'Header guard'], ['fopen', 'FILE *${1:f} = fopen("${2:data.txt}", "${3:r}");\nif (${1:f} == NULL) {\n\tprintf("Could not open ${2:data.txt}\\n");\n\treturn 1;\n}', 'Open a file safely']
  ];

  var CPP_STD = lib([
    'cout|ostream|Standard output. cout << value << endl;', 'cin|istream|Standard input. cin >> value; reads one word or number.', 'cerr|ostream|Error output.', 'endl|manipulator|A newline, and flushes the output.',
    'getline(istream &in, string &line)|istream&|Reads a whole line (without the newline). getline(cin, line).',
    'string|class|Text that can grow. #include <string>', 'vector|class template|A list that can grow. vector<int> v; #include <vector>',
    'map|class template|Sorted key-value pairs. map<string, int> m; #include <map>', 'unordered_map|class template|Key-value pairs (hash table). #include <unordered_map>',
    'set|class template|Sorted unique values. #include <set>', 'pair|class template|Two values: first and second.', 'array|class template|A fixed-size array. array<int, 5> a;',
    'sort(Iterator first, Iterator last)|void|Sorts a range: sort(v.begin(), v.end()). #include <algorithm>', 'reverse(Iterator first, Iterator last)|void|Reverses a range.',
    'find(Iterator first, Iterator last, const T &value)|Iterator|First position of value, or last if missing.', 'count(Iterator first, Iterator last, const T &value)|size_t|How many times value appears.',
    'max_element(Iterator first, Iterator last)|Iterator|Position of the biggest item. Use *max_element(...) for the value.', 'min_element(Iterator first, Iterator last)|Iterator|Position of the smallest item.',
    'accumulate(Iterator first, Iterator last, T init)|T|Adds up a range, starting from init. #include <numeric>', 'swap(T &a, T &b)|void|Swaps two values.',
    'max(const T &a, const T &b)|T|The larger value.', 'min(const T &a, const T &b)|T|The smaller value.', 'binary_search(Iterator first, Iterator last, const T &value)|bool|True if value is in a sorted range.',
    'unique(Iterator first, Iterator last)|Iterator|Removes repeated neighbours (sort first).', 'fill(Iterator first, Iterator last, const T &value)|void|Sets every item to value.',
    'to_string(value)|string|A number as text.', 'stoi(const string &s)|int|Text to int.', 'stod(const string &s)|double|Text to double.',
    'abs(T x)|T|Absolute value.', 'sqrt(double x)|double|Square root. #include <cmath>', 'pow(double base, double exp)|double|base to the power exp.',
    'rand()|int|A pseudo-random number. Seed with srand(time(0)).', 'make_pair(T1 a, T2 b)|pair|Makes a pair.', 'move(T &&value)|T&&|Lets a value be moved instead of copied.'
  ]);
  var CPP_MEMBERS = {
    string: lib(['size()|size_t|Number of characters.', 'length()|size_t|Number of characters.', 'empty()|bool|True if there are no characters.', 'substr(size_t pos, size_t len)|string|Part of the text, from pos, len characters long.',
      'find(const string &s)|size_t|Position of s, or string::npos.', 'append(const string &s)|string&|Adds s to the end.', 'push_back(char c)|void|Adds one character.', 'pop_back()|void|Removes the last character.',
      'c_str()|const char *|The text as a C string.', 'at(size_t i)|char&|Character at i, checked.', 'insert(size_t pos, const string &s)|string&|Inserts s at pos.', 'erase(size_t pos, size_t len)|string&|Removes len characters from pos.',
      'replace(size_t pos, size_t len, const string &s)|string&|Replaces part of the text.', 'clear()|void|Empties the string.', 'front()|char&|First character.', 'back()|char&|Last character.', 'begin()|iterator|Start, for loops and algorithms.', 'end()|iterator|One past the end.']),
    vector: lib(['push_back(const T &value)|void|Adds value at the end.', 'emplace_back(args...)|void|Builds a new item at the end.', 'pop_back()|void|Removes the last item.', 'size()|size_t|Number of items.', 'empty()|bool|True if there are no items.',
      'clear()|void|Removes every item.', 'at(size_t i)|T&|Item at i, checked.', 'front()|T&|First item.', 'back()|T&|Last item.', 'begin()|iterator|Start, for loops and algorithms.', 'end()|iterator|One past the end.',
      'insert(iterator pos, const T &value)|iterator|Inserts before pos.', 'erase(iterator pos)|iterator|Removes the item at pos.', 'resize(size_t n)|void|Changes the number of items.', 'reserve(size_t n)|void|Makes room for n items.']),
    map: lib(['insert(pair)|pair|Adds a key-value pair.', 'emplace(key, value)|pair|Adds a key-value pair.', 'find(const K &key)|iterator|Position of key, or end().', 'count(const K &key)|size_t|1 if key is there, else 0.',
      'erase(const K &key)|size_t|Removes key.', 'at(const K &key)|V&|Value for key, checked.', 'size()|size_t|Number of pairs.', 'empty()|bool|True if empty.', 'clear()|void|Removes everything.', 'begin()|iterator|Start, for loops.', 'end()|iterator|One past the end.']),
    set: lib(['insert(const T &value)|pair|Adds value if it is not there.', 'erase(const T &value)|size_t|Removes value.', 'count(const T &value)|size_t|1 if present.', 'find(const T &value)|iterator|Position, or end().', 'size()|size_t|Number of values.', 'empty()|bool|True if empty.', 'begin()|iterator|Start.', 'end()|iterator|One past the end.']),
    pair: lib(['first|T1|The first value.', 'second|T2|The second value.'])
  };
  CPP_MEMBERS.unordered_map = CPP_MEMBERS.map; CPP_MEMBERS.deque = CPP_MEMBERS.vector; CPP_MEMBERS.array = CPP_MEMBERS.vector;
  var CPP_KEYWORDS = words('alignas auto bool break case catch char class const constexpr continue default delete do double else enum explicit extern false float for friend if inline int long mutable namespace new nullptr operator override private protected public return short signed sizeof static static_cast struct switch template this true typedef typename union unsigned using virtual void volatile while std string vector map set unordered_map pair size_t #include #pragma');
  var CPP_SNIPS = [
    ['main', 'int main() {\n\t${1}\n\treturn 0;\n}', 'The program starts here'], ['iostream', '#include <iostream>', 'cin and cout'], ['usingstd', 'using namespace std;', 'Use std names without std::'],
    ['cout', 'cout << ${1} << endl;', 'Print a line'], ['cin', 'cin >> ${1:value};', 'Read a value'], ['getline', 'getline(cin, ${1:line});', 'Read a whole line'],
    ['for', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', 'Counting loop'], ['foreach', 'for (const auto &${1:item} : ${2:items}) {\n\t${3}\n}', 'Loop over every item'],
    ['while', 'while (${1:condition}) {\n\t${2}\n}', 'Loop while true'], ['if', 'if (${1:condition}) {\n\t${2}\n}', 'If statement'], ['ifelse', 'if (${1:condition}) {\n\t${2}\n} else {\n\t${3}\n}', 'If / else'],
    ['class', 'class ${1:Name} {\npublic:\n\t${1:Name}();\n\t${2}\nprivate:\n\t${3}\n};', 'A class'], ['struct', 'struct ${1:Name} {\n\t${2}\n};', 'A struct'],
    ['vector', 'vector<${1:int}> ${2:v};', 'A growing list'], ['map', 'map<${1:string}, ${2:int}> ${3:m};', 'Key-value pairs'], ['sort', 'sort(${1:v}.begin(), ${1:v}.end());', 'Sort a vector'],
    ['func', '${1:int} ${2:name}(${3}) {\n\t${4}\n}', 'A function'], ['once', '#pragma once', 'Include this header once']
  ];

  var JAVA_STATIC = {
    'System.out': lib(['println(Object x)|void|Prints x and a new line.', 'print(Object x)|void|Prints x, no new line.', 'printf(String format, Object... args)|PrintStream|Prints formatted text: %d whole number, %.2f decimal, %s text, %n new line.']),
    Math: lib(['abs(number)|number|Absolute value.', 'max(a, b)|number|The larger value.', 'min(a, b)|number|The smaller value.', 'pow(double base, double exp)|double|base to the power exp.', 'sqrt(double x)|double|Square root.',
      'random()|double|A random number from 0 (included) to 1 (not included).', 'round(double x)|long|Nearest whole number.', 'floor(double x)|double|Rounds down.', 'ceil(double x)|double|Rounds up.', 'PI|double|3.14159…']),
    Integer: lib(['parseInt(String s)|int|Text to int.', 'valueOf(int i)|Integer|An Integer object.', 'toString(int i)|String|An int as text.', 'MAX_VALUE|int|The largest int.', 'MIN_VALUE|int|The smallest int.']),
    Double: lib(['parseDouble(String s)|double|Text to double.', 'toString(double d)|String|A double as text.']),
    String: lib(['valueOf(Object x)|String|x as text.', 'format(String format, Object... args)|String|Formatted text, like printf.', 'join(CharSequence sep, elements...)|String|Joins items with sep between them.']),
    Arrays: lib(['sort(array)|void|Sorts an array.', 'toString(array)|String|An array as text, like [1, 2, 3].', 'asList(T... items)|List<T>|A fixed-size list of the items.', 'fill(array, value)|void|Sets every item to value.', 'copyOf(array, int newLength)|array|A copy, shorter or longer.']),
    Collections: lib(['sort(List list)|void|Sorts a list.', 'reverse(List list)|void|Reverses a list.', 'max(Collection c)|T|The biggest item.', 'min(Collection c)|T|The smallest item.', 'shuffle(List list)|void|Puts the items in a random order.']),
    Character: lib(['isDigit(char c)|boolean|True for 0-9.', 'isLetter(char c)|boolean|True for a letter.', 'toUpperCase(char c)|char|Capital version.', 'toLowerCase(char c)|char|Small version.'])
  };
  var JAVA_MEMBERS = {
    String: lib(['length()|int|Number of characters.', 'charAt(int index)|char|Character at index (from 0).', 'substring(int begin, int end)|String|Part of the text from begin up to (not including) end.',
      'indexOf(String s)|int|Position of s, or -1.', 'equals(Object other)|boolean|True if the text is the same. Use this, not ==.', 'equalsIgnoreCase(String other)|boolean|equals, ignoring capitals.',
      'toUpperCase()|String|In capitals.', 'toLowerCase()|String|In small letters.', 'trim()|String|Without spaces at either end.', 'split(String regex)|String[]|Splits into pieces.',
      'contains(CharSequence s)|boolean|True if s is inside.', 'startsWith(String prefix)|boolean|True if it starts with prefix.', 'endsWith(String suffix)|boolean|True if it ends with suffix.',
      'replace(CharSequence target, CharSequence replacement)|String|Replaces every target.', 'isEmpty()|boolean|True if length is 0.', 'compareTo(String other)|int|Alphabetical order: negative, 0 or positive.', 'toCharArray()|char[]|The characters as an array.']),
    Scanner: lib(['nextLine()|String|Reads the rest of the line.', 'next()|String|Reads the next word.', 'nextInt()|int|Reads a whole number.', 'nextDouble()|double|Reads a decimal number.',
      'hasNext()|boolean|True if there is more input.', 'hasNextInt()|boolean|True if the next input is a whole number.', 'hasNextLine()|boolean|True if there is another line.', 'close()|void|Closes the scanner.']),
    ArrayList: lib(['add(E item)|boolean|Adds item at the end.', 'get(int index)|E|Item at index.', 'set(int index, E item)|E|Replaces the item at index.', 'remove(int index)|E|Removes the item at index.',
      'size()|int|Number of items.', 'isEmpty()|boolean|True if there are no items.', 'contains(Object o)|boolean|True if o is in the list.', 'indexOf(Object o)|int|Position of o, or -1.', 'clear()|void|Removes every item.', 'sort(Comparator c)|void|Sorts; pass null for natural order.']),
    HashMap: lib(['put(K key, V value)|V|Stores value under key.', 'get(Object key)|V|Value for key, or null.', 'getOrDefault(Object key, V fallback)|V|Value for key, or fallback.', 'containsKey(Object key)|boolean|True if key is there.',
      'remove(Object key)|V|Removes key.', 'keySet()|Set<K>|All the keys.', 'values()|Collection<V>|All the values.', 'entrySet()|Set<Map.Entry<K,V>>|Key-value pairs, for loops.', 'size()|int|Number of pairs.', 'isEmpty()|boolean|True if empty.']),
    StringBuilder: lib(['append(Object x)|StringBuilder|Adds x to the end.', 'insert(int offset, Object x)|StringBuilder|Inserts x.', 'reverse()|StringBuilder|Reverses the text.', 'toString()|String|The finished text.', 'length()|int|Number of characters.', 'deleteCharAt(int index)|StringBuilder|Removes one character.']),
    array: lib(['length|int|Number of items (no brackets for arrays).'])
  };
  JAVA_MEMBERS.List = JAVA_MEMBERS.ArrayList; JAVA_MEMBERS.Map = JAVA_MEMBERS.HashMap; JAVA_MEMBERS.TreeMap = JAVA_MEMBERS.HashMap; JAVA_MEMBERS.LinkedList = JAVA_MEMBERS.ArrayList;
  var JAVA_KEYWORDS = words('abstract boolean break byte case catch char class continue default do double else enum extends final finally float for if implements import instanceof int interface long new null package private protected public return short static super switch this throw throws try void while true false var String Scanner ArrayList HashMap List Map StringBuilder Math System Integer Double Arrays Collections Object Override');
  var JAVA_SNIPS = [
    ['main', 'public static void main(String[] args) {\n\t${1}\n}', 'The program starts here'], ['psvm', 'public static void main(String[] args) {\n\t${1}\n}', 'main method'],
    ['class', 'public class ${1:Name} {\n\t${2}\n}', 'A class'], ['sout', 'System.out.println(${1});', 'Print a line'], ['souf', 'System.out.printf("${1:%d}%n", ${2});', 'Print formatted'],
    ['scanner', 'Scanner ${1:in} = new Scanner(System.in);', 'Read typed input (import java.util.Scanner)'], ['importscanner', 'import java.util.Scanner;', 'Import Scanner'], ['importutil', 'import java.util.*;', 'Import java.util'],
    ['for', 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n\t${3}\n}', 'Counting loop'], ['foreach', 'for (${1:String} ${2:item} : ${3:items}) {\n\t${4}\n}', 'Loop over every item'],
    ['while', 'while (${1:condition}) {\n\t${2}\n}', 'Loop while true'], ['if', 'if (${1:condition}) {\n\t${2}\n}', 'If statement'], ['ifelse', 'if (${1:condition}) {\n\t${2}\n} else {\n\t${3}\n}', 'If / else'],
    ['method', '${1:public} ${2:void} ${3:name}(${4}) {\n\t${5}\n}', 'A method'], ['try', 'try {\n\t${1}\n} catch (${2:Exception} e) {\n\t${3:System.out.println(e.getMessage());}\n}', 'Try / catch'],
    ['list', 'ArrayList<${1:String}> ${2:list} = new ArrayList<>();', 'A growing list'], ['map', 'HashMap<${1:String}, ${2:Integer}> ${3:map} = new HashMap<>();', 'Key-value pairs'],
    ['ctor', 'public ${1:Name}(${2}) {\n\t${3}\n}', 'A constructor'], ['tostring', '@Override\npublic String toString() {\n\treturn ${1:""};\n}', 'toString method']
  ];

  var PHP_LIB = lib([
    'echo|construct|Prints one or more values: echo $a, "\\n";', 'print_r(mixed $value, bool $return = false)|string|bool|Prints arrays and objects readably.', 'var_dump(mixed ...$values)|void|Prints values with their types.',
    'printf(string $format, mixed ...$values)|int|Prints formatted text: %d, %.2f, %s.', 'sprintf(string $format, mixed ...$values)|string|Formatted text.', 'number_format(float $num, int $decimals = 0)|string|A number with thousands separators.',
    'readline(string $prompt = "")|string|false|Reads a line of typed input.', 'fgets(resource $stream)|string|false|Reads a line; fgets(STDIN) for typed input.',
    'strlen(string $s)|int|Number of bytes in s.', 'strtoupper(string $s)|string|In capitals.', 'strtolower(string $s)|string|In small letters.', 'ucfirst(string $s)|string|First letter capital.', 'ucwords(string $s)|string|Every word capitalised.',
    'str_repeat(string $s, int $times)|string|s repeated.', 'str_replace(mixed $search, mixed $replace, mixed $subject)|mixed|Replaces every search.', 'substr(string $s, int $start, ?int $length = null)|string|Part of s.',
    'strpos(string $haystack, string $needle)|int|false|Position of needle, or false.', 'str_contains(string $haystack, string $needle)|bool|True if needle is inside.',
    'str_starts_with(string $haystack, string $needle)|bool|True if it starts with needle.', 'str_ends_with(string $haystack, string $needle)|bool|True if it ends with needle.',
    'explode(string $separator, string $s)|array|Splits text into an array.', 'implode(string $separator, array $items)|string|Joins an array into text.', 'trim(string $s)|string|Without spaces at either end.',
    'str_pad(string $s, int $length, string $pad = " ")|string|Pads s to length.', 'str_split(string $s, int $length = 1)|array|Splits into chunks.', 'strrev(string $s)|string|Reversed.', 'htmlspecialchars(string $s)|string|Makes text safe to put in HTML.',
    'count(array $a)|int|Number of items.', 'array_push(array &$a, mixed ...$values)|int|Adds to the end.', 'array_pop(array &$a)|mixed|Removes the last item.', 'array_shift(array &$a)|mixed|Removes the first item.',
    'array_unshift(array &$a, mixed ...$values)|int|Adds to the start.', 'array_merge(array ...$arrays)|array|Joins arrays.', 'array_keys(array $a)|array|The keys.', 'array_values(array $a)|array|The values.',
    'array_map(?callable $fn, array $a)|array|Applies fn to every item.', 'array_filter(array $a, ?callable $fn = null)|array|Keeps items where fn is true.', 'array_reduce(array $a, callable $fn, mixed $initial = null)|mixed|Folds the array into one value.',
    'array_sum(array $a)|int|float|Adds up the items.', 'array_search(mixed $value, array $a)|int|string|false|Key of value, or false.', 'in_array(mixed $value, array $a)|bool|True if value is in a.',
    'array_slice(array $a, int $offset, ?int $length = null)|array|Part of an array.', 'array_reverse(array $a)|array|Reversed.', 'array_unique(array $a)|array|Without repeats.', 'array_key_exists(string|int $key, array $a)|bool|True if the key is there.',
    'sort(array &$a)|bool|Sorts values.', 'rsort(array &$a)|bool|Sorts values, biggest first.', 'usort(array &$a, callable $compare)|bool|Sorts with your compare function.', 'ksort(array &$a)|bool|Sorts by key.', 'asort(array &$a)|bool|Sorts values, keeping keys.',
    'range(mixed $start, mixed $end, int $step = 1)|array|An array of a range.', 'min(mixed ...$values)|mixed|The smallest.', 'max(mixed ...$values)|mixed|The biggest.', 'abs(int|float $n)|int|float|Absolute value.',
    'round(int|float $n, int $precision = 0)|float|Rounds.', 'floor(int|float $n)|float|Rounds down.', 'ceil(int|float $n)|float|Rounds up.', 'sqrt(float $n)|float|Square root.', 'pow(mixed $base, mixed $exp)|mixed|base to the power exp.',
    'intdiv(int $a, int $b)|int|Whole-number division.', 'rand(int $min, int $max)|int|A random whole number.', 'random_int(int $min, int $max)|int|A secure random whole number.',
    'is_numeric(mixed $v)|bool|True for numbers and numeric text.', 'is_int(mixed $v)|bool|True for an int.', 'is_string(mixed $v)|bool|True for text.', 'is_array(mixed $v)|bool|True for an array.',
    'isset(mixed $var)|bool|True if the variable exists and is not null.', 'empty(mixed $var)|bool|True for "", 0, null, [] or false.', 'unset(mixed $var)|void|Destroys a variable.',
    'intval(mixed $v)|int|To int.', 'floatval(mixed $v)|float|To float.', 'strval(mixed $v)|string|To text.', 'json_encode(mixed $v)|string|To JSON text.', 'json_decode(string $json, ?bool $assoc = null)|mixed|From JSON text.',
    'date(string $format, ?int $timestamp = null)|string|A formatted date: date("Y-m-d").', 'time()|int|Seconds since 1970.', 'strtotime(string $text)|int|false|Text like "next monday" to a timestamp.',
    'file_get_contents(string $path)|string|false|A whole file as text.', 'file_put_contents(string $path, mixed $data)|int|false|Writes data to a file.', 'file_exists(string $path)|bool|True if the file exists.',
    'preg_match(string $pattern, string $subject, array &$matches = null)|int|false|1 if the regex matches.', 'preg_replace(mixed $pattern, mixed $replacement, mixed $subject)|mixed|Regex replace.',
    'function_exists(string $name)|bool|True if the function exists.', 'define(string $name, mixed $value)|bool|Defines a constant.'
  ]);
  var PHP_KEYWORDS = words('abstract and array as break case catch class clone const continue declare default do echo else elseif empty enum extends final finally fn for foreach function global if implements include include_once instanceof interface isset list match namespace new null or print private protected public readonly require require_once return static switch throw trait try unset use var while yield true false self parent PHP_EOL STDIN STDOUT STDERR');
  var PHP_SNIPS = [
    ['php', '<?php\n${1}', 'Start PHP code'], ['echo', 'echo ${1}, PHP_EOL;', 'Print a line'], ['func', 'function ${1:name}(${2}): ${3:void} {\n\t${4}\n}', 'A function'],
    ['class', 'class ${1:Name} {\n\tpublic function __construct(${2}) {\n\t\t${3}\n\t}\n}', 'A class'], ['foreach', 'foreach (${1:\\$items} as ${2:\\$item}) {\n\t${3}\n}', 'Loop over an array'],
    ['foreachkv', 'foreach (${1:\\$items} as ${2:\\$key} => ${3:\\$value}) {\n\t${4}\n}', 'Loop over keys and values'], ['for', 'for (\\$${1:i} = 0; \\$${1:i} < ${2:10}; \\$${1:i}++) {\n\t${3}\n}', 'Counting loop'],
    ['if', 'if (${1:condition}) {\n\t${2}\n}', 'If statement'], ['ifelse', 'if (${1:condition}) {\n\t${2}\n} else {\n\t${3}\n}', 'If / else'], ['while', 'while (${1:condition}) {\n\t${2}\n}', 'Loop while true'],
    ['readline', '\\$${1:name} = readline("${2:What is your name? }");', 'Read typed input'], ['require', 'require "${1:file.php}";', 'Use another file'], ['match', 'match (${1:\\$value}) {\n\t${2:1} => ${3},\n\tdefault => ${4},\n};', 'match expression'],
    ['try', 'try {\n\t${1}\n} catch (${2:Exception} \\$e) {\n\techo \\$e->getMessage(), PHP_EOL;\n}', 'Try / catch'], ['html', '?>\n<!DOCTYPE html>\n<html>\n<body>\n\t${1}\n</body>\n</html>', 'An HTML page']
  ];

  var PY_LIB = lib([
    'print(*values, sep=" ", end="\\n")|None|Prints values.', 'input(prompt="")|str|Reads a line of typed input as text.', 'len(obj)|int|Number of items.', 'range(start, stop, step=1)|range|Numbers from start up to (not including) stop.',
    'int(x)|int|To a whole number.', 'float(x)|float|To a decimal number.', 'str(x)|str|To text.', 'list(iterable)|list|A list.', 'dict(**kwargs)|dict|A dictionary.', 'set(iterable)|set|A set.', 'tuple(iterable)|tuple|A tuple.',
    'sorted(iterable, key=None, reverse=False)|list|A sorted list.', 'sum(iterable, start=0)|number|Adds up the items.', 'min(*items)|object|The smallest.', 'max(*items)|object|The biggest.', 'abs(x)|number|Absolute value.',
    'round(x, ndigits=None)|number|Rounds.', 'enumerate(iterable, start=0)|enumerate|Pairs of (index, item).', 'zip(*iterables)|zip|Items side by side.', 'open(file, mode="r")|file|Opens a project file.', 'isinstance(obj, cls)|bool|True if obj is a cls.', 'type(obj)|type|The type of obj.'
  ]);
  var PY_KEYWORDS = words('False None True and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield self');
  var PY_SNIPS = [
    ['def', 'def ${1:name}(${2}):\n\t${3:pass}', 'A function'], ['class', 'class ${1:Name}:\n\tdef __init__(self${2}):\n\t\t${3:pass}', 'A class'], ['ifmain', 'if __name__ == "__main__":\n\t${1:main()}', 'Run only as the main file'],
    ['for', 'for ${1:item} in ${2:items}:\n\t${3:pass}', 'Loop over items'], ['forrange', 'for ${1:i} in range(${2:10}):\n\t${3:pass}', 'Counting loop'], ['while', 'while ${1:condition}:\n\t${2:pass}', 'Loop while true'],
    ['if', 'if ${1:condition}:\n\t${2:pass}', 'If statement'], ['ifelse', 'if ${1:condition}:\n\t${2:pass}\nelse:\n\t${3:pass}', 'If / else'], ['try', 'try:\n\t${1:pass}\nexcept ${2:ValueError} as e:\n\tprint(e)', 'Try / except'],
    ['withopen', 'with open("${1:data.txt}") as f:\n\tfor line in f:\n\t\t${2:print(line.strip())}', 'Read a file line by line'], ['inputint', '${1:n} = int(input("${2:Enter a number: }"))', 'Read a whole number']
  ];

  var HTML_TAGS = words('div p h1 h2 h3 h4 a img button ul ol li span section header footer nav main article aside form input label textarea select option table tr td th br hr strong em small pre code video audio canvas figure figcaption style script link meta title');

  /* ---------- reading the builder's own code ---------- */
  function blockEnd(src, open) {
    var depth = 0;
    for (var i = open; i < src.length; i++) {
      var c = src.charAt(i);
      if (c === '{') depth++;
      else if (c === '}') { depth--; if (depth === 0) return i; }
    }
    return src.length;
  }
  var NOT_FN = /^(if|for|while|switch|return|sizeof|catch|else|do|new|delete|throw|case|elseif|foreach|match|using|typedef|static_assert)$/;
  function stripComments(s) { return String(s).replace(/\/\*[\s\S]*?\*\//g, function (m) { return m.replace(/[^\n]/g, ' '); }).replace(/\/\/[^\n]*/g, function (m) { return m.replace(/./g, ' '); }); }

  /* -> { fns: {name: {params, ret, doc, where}}, types: {Name: {members}}, vars: {name: type} } */
  function symbols(files, lang) {
    var fns = {}, types = {}, vars = {};
    files.forEach(function (f) {
      var src = stripComments(f.content), m, re;
      if (lang === 'c' || lang === 'cpp') {
        re = /^[ \t]*(?:(?:static|inline|extern|virtual|constexpr|explicit)\s+)*([A-Za-z_][\w:<>,\s\*&]*?[\s\*&]+)?([A-Za-z_~][\w:~]*)\s*\(([^;{}()]*)\)\s*(?:const\s*)?(?:override\s*)?[{;]/gm;
        while ((m = re.exec(src))) {
          var full = m[2], nm = full.split('::').pop();
          if (NOT_FN.test(nm) || !m[1] && !/::/.test(full)) continue;
          var owner = /::/.test(full) ? full.split('::')[0] : null;
          var rec = { name: nm, params: splitParams(m[3] || ''), ret: (m[1] || '').trim(), doc: 'Defined in ' + f.name, where: f.name };
          if (owner) { (types[owner] = types[owner] || { members: {} }).members[nm] = rec; } else if (!fns[nm] || /\{\s*$/.test(m[0])) fns[nm] = rec;
        }
        re = /\b(class|struct)\s+([A-Za-z_]\w*)[^;{]*\{/g;
        while ((m = re.exec(src))) {
          var body = src.slice(m.index + m[0].length, blockEnd(src, m.index + m[0].length - 1));
          var t = types[m[2]] = types[m[2]] || { members: {} }, mm;
          var mre = /(?:^|[;{}:])\s*(?:(?:static|virtual|inline|const|constexpr)\s+)*([A-Za-z_][\w:<>,\s\*&]*?[\s\*&]+)([A-Za-z_]\w*)\s*(\(([^)]*)\))?\s*(?:const)?\s*[;{=]/g;
          while ((mm = mre.exec(body))) {
            if (/^(public|private|protected|return)$/.test(mm[2])) continue;
            t.members[mm[2]] = { name: mm[2], params: mm[3] ? splitParams(mm[4] || '') : null, ret: mm[1].trim(), doc: (m[1] === 'struct' ? 'Field of struct ' : 'Member of ') + m[2], where: f.name };
          }
        }
        re = /^\s*#define\s+([A-Za-z_]\w*)(\(([^)]*)\))?\s*(.*)$/gm;
        while ((m = re.exec(src))) fns[m[1]] = { name: m[1], params: m[2] ? splitParams(m[3]) : null, ret: 'macro', doc: '#define ' + m[1] + (m[2] || '') + ' ' + m[4], where: f.name };
        re = /\b(?:struct\s+)?((?:std::)?(?:string|vector|map|unordered_map|set|pair|deque|array)\b|[A-Z]\w*)(?:<[^;(){}]*>)?\s*[&*]?\s+([A-Za-z_]\w*)\s*(?=[;=({,)\[])/g;
        while ((m = re.exec(src))) vars[m[2]] = m[1].replace('std::', '');
        re = /\bstruct\s+([A-Za-z_]\w*)\s*\*?\s*([A-Za-z_]\w*)\s*[;=,)\[]/g;
        while ((m = re.exec(src))) vars[m[2]] = m[1];
      } else if (lang === 'java') {
        re = /\b(class|interface|enum|record)\s+([A-Z]\w*)[^{]*\{/g;
        while ((m = re.exec(src))) {
          var start = m.index + m[0].length - 1, b = src.slice(start + 1, blockEnd(src, start)), jt = types[m[2]] = types[m[2]] || { members: {} }, jm;
          var mre2 = /(?:public|private|protected|static|final|abstract|synchronized|\s)*\b([\w<>\[\],.?]+)\s+([a-z_]\w*)\s*\(([^)]*)\)\s*(?:throws[\w\s,.]+)?\{/g;
          while ((jm = mre2.exec(b))) if (!NOT_FN.test(jm[2])) jt.members[jm[2]] = { name: jm[2], params: splitParams(jm[3]), ret: jm[1], doc: 'Method of ' + m[2], where: f.name, statik: /static/.test(b.slice(Math.max(0, jm.index - 1), jm.index + jm[0].length)) };
          var fre = /(?:private|public|protected)\s+(?:static\s+)?(?:final\s+)?([\w<>\[\],.]+)\s+([a-zA-Z_]\w*)\s*[;=]/g;
          while ((jm = fre.exec(b))) jt.members[jm[2]] = { name: jm[2], params: null, ret: jm[1], doc: 'Field of ' + m[2], where: f.name };
        }
        re = /\b([A-Z]\w*(?:<[^;(){}=]*>)?|int\[\]|double\[\]|String\[\]|char\[\]|boolean\[\])\s+([a-z_]\w*)\s*(?=[;=,):])/g;
        while ((m = re.exec(src))) vars[m[2]] = /\[\]$/.test(m[1]) ? 'array' : m[1].replace(/<.*$/, '');
      } else if (lang === 'php') {
        re = /\bclass\s+([A-Za-z_]\w*)[^{]*\{/g;
        while ((m = re.exec(src))) {
          var ps = m.index + m[0].length - 1, pb = src.slice(ps + 1, blockEnd(src, ps)), pt = types[m[1]] = types[m[1]] || { members: {} }, pm;
          var pre = /function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([\w?|\\]+))?/g;
          while ((pm = pre.exec(pb))) {
            pt.members[pm[1]] = { name: pm[1], params: splitParams(pm[2]), ret: pm[3] || '', doc: 'Method of ' + m[1], where: f.name };
            if (pm[1] === '__construct') { var cp, cre = /(?:public|private|protected)\s+(?:readonly\s+)?(?:[\w?|\\]+\s+)?\$(\w+)/g; while ((cp = cre.exec(pm[2]))) pt.members[cp[1]] = { name: cp[1], params: null, ret: '', doc: 'Property of ' + m[1], where: f.name }; }
          }
          var prre = /(?:public|private|protected|var)\s+(?:static\s+)?(?:readonly\s+)?(?:[\w?|\\]+\s+)?\$(\w+)/g;
          while ((pm = prre.exec(pb))) pt.members[pm[1]] = pt.members[pm[1]] || { name: pm[1], params: null, ret: '', doc: 'Property of ' + m[1], where: f.name };
        }
        re = /^\s*function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*([\w?|\\]+))?/gm;
        while ((m = re.exec(src))) fns[m[1]] = { name: m[1], params: splitParams(m[2]), ret: m[3] || '', doc: 'Defined in ' + f.name, where: f.name };
        re = /\$(\w+)\s*=\s*new\s+([A-Za-z_]\w*)/g;
        while ((m = re.exec(src))) vars[m[1]] = m[2];
        re = /\b([A-Z]\w*)\s+\$(\w+)/g;
        while ((m = re.exec(src))) vars[m[2]] = m[1];
      }
    });
    return { fns: fns, types: types, vars: vars };
  }

  function sigLabel(r) { return r.params == null ? r.name : r.name + '(' + r.params.join(', ') + ')'; }

  /* ---------- the call around the cursor, for parameter hints ---------- */
  function callAt(text) {
    var depth = 0, commas = 0;
    for (var i = text.length - 1; i >= 0; i--) {
      var c = text.charAt(i);
      if (c === ')' || c === ']' || c === '}') depth++;
      else if (c === '(' || c === '[' || c === '{') {
        if (depth === 0) {
          if (c !== '(') return null;
          var m = /([\w$.]+(?:->\w+|::\w+)?)\s*$/.exec(text.slice(0, i));
          return m ? { callee: m[1], index: commas } : null;
        }
        depth--;
      } else if (c === ',' && depth === 0) commas++;
      else if ((c === ';' || c === '\n' && depth === 0 && /[;{}]\s*$/.test(text.slice(0, i))) && depth === 0) return null;
    }
    return null;
  }

  function setup(monaco, ctx) {
    var K = monaco.languages.CompletionItemKind, SNIP = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
    var symCache = { key: '', lang: '', val: null };
    function syms(lang) {
      var list = ctx.files().filter(function (f) { return f.lang === lang || (lang === 'cpp' && f.lang === 'c') || (lang === 'c' && /\.h$/.test(f.name)); });
      var key = list.map(function (f) { return f.name + ':' + f.content.length + ':' + f.content.slice(-40); }).join('|');
      if (symCache.key !== key || symCache.lang !== lang) symCache = { key: key, lang: lang, val: symbols(list, lang === 'c' && ctx.projectLang() === 'cpp' ? 'cpp' : lang) };
      return symCache.val;
    }
    function rangeAt(model, pos) {
      var w = model.getWordUntilPosition(pos);
      return new monaco.Range(pos.lineNumber, w.startColumn, pos.lineNumber, w.endColumn);
    }
    function fnItem(r, range, kind, sort) {
      var takes = r.params != null;
      return {
        label: r.name, kind: kind || (takes ? K.Function : K.Variable), range: range, sortText: sort || '3',
        detail: (r.ret ? r.ret + ' ' : '') + sigLabel(r),
        documentation: r.doc ? { value: r.doc } : undefined,
        insertText: takes ? r.name + (r.params.length ? '($0)' : '()') : r.name,
        insertTextRules: takes ? SNIP : undefined,
        command: takes && r.params.length ? { id: 'editor.action.triggerParameterHints', title: '' } : undefined
      };
    }
    function snipItems(list, range) {
      return list.map(function (s) { return { label: s[0], kind: K.Snippet, insertText: s[1], insertTextRules: SNIP, range: range, detail: s[2], documentation: { value: '```\n' + s[1].replace(/\$\{\d+:?([^}]*)\}/g, '$1').replace(/\$\d/g, '') + '\n```' }, sortText: '4' }; });
    }
    function kwItems(list, range) { return list.map(function (k) { return { label: k, kind: K.Keyword, insertText: k, range: range, sortText: '5' }; }); }
    function libItems(tbl, range, sort) { return Object.keys(tbl).map(function (n) { return fnItem(tbl[n], range, tbl[n].params ? K.Function : (/class|template/.test(tbl[n].ret) ? K.Class : K.Variable), sort || '2'); }); }

    /* What is before the dot, and what type it is. */
    function memberCtx(lang, before) {
      var m;
      if (lang === 'java') {
        if ((m = /(System\.out)\.\w*$/.exec(before))) return { tbl: JAVA_STATIC['System.out'] };
        if ((m = /\b([A-Z]\w*)\.\w*$/.exec(before)) && JAVA_STATIC[m[1]]) return { tbl: JAVA_STATIC[m[1]] };
        if ((m = /\b([A-Za-z_]\w*)\.\w*$/.exec(before))) {
          var s = syms('java'), t = /^[A-Z]/.test(m[1]) ? m[1] : s.vars[m[1]];
          if (m[1] === 'this') return { user: Object.keys(s.types).map(function (k) { return s.types[k].members; }) };
          if (t && JAVA_MEMBERS[t]) return { tbl: JAVA_MEMBERS[t] };
          if (t && s.types[t]) return { user: [s.types[t].members] };
          return { none: true };
        }
      } else if (lang === 'cpp' || lang === 'c') {
        if (/\bstd::\w*$/.test(before)) return { tbl: CPP_STD };
        if ((m = /\b([A-Za-z_]\w*)(?:\[[^\]]*\])?\s*(?:\.|->)\w*$/.exec(before))) {
          var cs = syms(lang), ct = cs.vars[m[1]];
          if (m[1] === 'this') return { user: Object.keys(cs.types).map(function (k) { return cs.types[k].members; }) };
          if (ct && CPP_MEMBERS[ct]) return { tbl: CPP_MEMBERS[ct] };
          if (ct && cs.types[ct]) return { user: [cs.types[ct].members] };
          return { none: true };
        }
        if ((m = /\b([A-Z]\w*)::\w*$/.exec(before))) { var cs2 = syms(lang); if (cs2.types[m[1]]) return { user: [cs2.types[m[1]].members] }; }
      } else if (lang === 'php') {
        if ((m = /\$(\w+)->\w*$/.exec(before))) {
          var psy = syms('php'), pt = m[1] === 'this' ? null : psy.vars[m[1]];
          if (m[1] === 'this') return { user: Object.keys(psy.types).map(function (k) { return psy.types[k].members; }) };
          if (pt && psy.types[pt]) return { user: [psy.types[pt].members] };
          return { none: true };
        }
        if ((m = /\b([A-Z]\w*)::\w*$/.exec(before))) { var ps2 = syms('php'); if (ps2.types[m[1]]) return { user: [ps2.types[m[1]].members] }; }
      }
      return null;
    }

    var TABLES = {
      c: { lib: C_LIB, kw: C_KEYWORDS, snips: C_SNIPS },
      cpp: { lib: Object.assign({}, C_LIB, CPP_STD), kw: CPP_KEYWORDS, snips: CPP_SNIPS.concat(C_SNIPS.filter(function (s) { return ['struct', 'guard', 'switch', 'do'].indexOf(s[0]) !== -1; })) },
      java: { lib: {}, kw: JAVA_KEYWORDS, snips: JAVA_SNIPS, statics: JAVA_STATIC },
      php: { lib: PHP_LIB, kw: PHP_KEYWORDS, snips: PHP_SNIPS },
      py: { lib: PY_LIB, kw: PY_KEYWORDS, snips: PY_SNIPS }
    };

    function smart(lang, model, pos) {
      var range = rangeAt(model, pos), T = TABLES[lang];
      var before = model.getValueInRange(new monaco.Range(pos.lineNumber, 1, pos.lineNumber, pos.column));
      var mc = lang === 'py' ? null : memberCtx(lang, before);
      if (mc) {
        if (mc.none) return { suggestions: [] };
        var items = mc.tbl ? libItems(mc.tbl, range, '1') : [];
        (mc.user || []).forEach(function (mem) { Object.keys(mem).forEach(function (k) { items.push(fnItem(mem[k], range, mem[k].params ? K.Method : K.Field, '1')); }); });
        return { suggestions: items };
      }
      if (lang === 'php' && /\$\w*$/.test(before)) {
        var vr = new monaco.Range(pos.lineNumber, pos.column - /\$(\w*)$/.exec(before)[1].length, pos.lineNumber, pos.column), seen = {}, vs = [];
        model.getValue().replace(/\$([A-Za-z_]\w*)/g, function (m0, n) { if (!seen[n]) { seen[n] = 1; vs.push({ label: n, kind: K.Variable, insertText: n, range: vr, sortText: '1' }); } return m0; });
        return { suggestions: vs };
      }
      var s = lang === 'py' ? { fns: {}, types: {} } : syms(lang), out = [];
      Object.keys(s.fns).forEach(function (n) { out.push(fnItem(s.fns[n], range, null, '1')); });
      Object.keys(s.types).forEach(function (n) { out.push({ label: n, kind: K.Class, insertText: n, range: range, detail: 'class ' + n, sortText: '1' }); });
      out = out.concat(libItems(T.lib, range), snipItems(T.snips, range), kwItems(T.kw, range));
      if (T.statics) Object.keys(T.statics).forEach(function (n) { out.push({ label: n, kind: K.Class, insertText: n, range: range, sortText: '2', detail: n === 'System.out' ? 'Standard output' : 'java.lang / java.util' }); });
      return { suggestions: out };
    }
    function findLib(lang, callee) {
      var T = TABLES[lang], name = callee.split(/\.|->|::/).pop(), recv = callee.slice(0, Math.max(0, callee.length - name.length)).replace(/(\.|->|::)$/, '');
      if (lang === 'java' && recv) {
        if (JAVA_STATIC[recv] && JAVA_STATIC[recv][name]) return JAVA_STATIC[recv][name];
        var js = syms('java'), t = js.vars[recv] || recv;
        if (JAVA_MEMBERS[t] && JAVA_MEMBERS[t][name]) return JAVA_MEMBERS[t][name];
        if (js.types[t] && js.types[t].members[name]) return js.types[t].members[name];
        return null;
      }
      if ((lang === 'cpp' || lang === 'c') && recv) {
        var cs = syms(lang), ct = cs.vars[recv];
        if (recv === 'std' && CPP_STD[name]) return CPP_STD[name];
        if (ct && CPP_MEMBERS[ct] && CPP_MEMBERS[ct][name]) return CPP_MEMBERS[ct][name];
        if (ct && cs.types[ct] && cs.types[ct].members[name]) return cs.types[ct].members[name];
        if (cs.types[recv] && cs.types[recv].members[name]) return cs.types[recv].members[name];
      }
      if (lang === 'php' && recv) {
        var ps = syms('php'), pt = ps.vars[recv.replace('$', '')] || recv;
        if (ps.types[pt] && ps.types[pt].members[name]) return ps.types[pt].members[name];
        if (/\$this/.test(recv)) { for (var k in ps.types) if (ps.types[k].members[name]) return ps.types[k].members[name]; }
      }
      if (lang !== 'py') { var us = syms(lang); if (us.fns[name]) return us.fns[name]; for (var k2 in us.types) if (k2 === name) return null; }
      return T.lib[name] || null;
    }

    function signatureHelp(lang) {
      return {
        signatureHelpTriggerCharacters: ['(', ','], signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp: function (model, pos) {
          var text = model.getValueInRange(new monaco.Range(Math.max(1, pos.lineNumber - 20), 1, pos.lineNumber, pos.column));
          var c = callAt(text); if (!c) return null;
          var r = findLib(lang, c.callee); if (!r || !r.params) return null;
          return { value: { signatures: [{ label: (r.ret ? r.ret + ' ' : '') + sigLabel(r), documentation: { value: r.doc || '' }, parameters: r.params.map(function (p) { return { label: p }; }) }], activeSignature: 0, activeParameter: Math.min(c.index, Math.max(0, r.params.length - 1)) }, dispose: function () { } };
        }
      };
    }
    function hover(lang) {
      return {
        provideHover: function (model, pos) {
          var w = model.getWordAtPosition(pos); if (!w) return null;
          var line = model.getLineContent(pos.lineNumber), before = line.slice(0, w.startColumn - 1);
          var recv = /([\w$]+)\s*(\.|->|::)\s*$/.exec(before);
          var r = findLib(lang, (recv ? recv[1] + recv[2] : '') + w.word);
          if (!r) return null;
          return { range: new monaco.Range(pos.lineNumber, w.startColumn, pos.lineNumber, w.endColumn), contents: [{ value: '```' + (MONACO_ID[lang] || '') + '\n' + (r.ret ? r.ret + ' ' : '') + sigLabel(r) + '\n```' }, { value: r.doc || '' }] };
        }
      };
    }
    var MONACO_ID = { c: 'c', cpp: 'cpp', java: 'java', php: 'php', py: 'python' };

    var disposers = [];
    ['c', 'cpp', 'java', 'php'].forEach(function (lang) {
      var id = MONACO_ID[lang];
      disposers.push(monaco.languages.registerCompletionItemProvider(id, {
        triggerCharacters: lang === 'php' ? ['>', ':', '$'] : lang === 'java' ? ['.'] : ['.', '>', ':'],
        provideCompletionItems: function (model, pos) { return smart(lang, model, pos); }
      }));
      disposers.push(monaco.languages.registerSignatureHelpProvider(id, signatureHelp(lang)));
      disposers.push(monaco.languages.registerHoverProvider(id, hover(lang)));
    });

    /* ---------- Python: Jedi when it is ready, Paisley suggestions until then ---------- */
    var pyDirty = true;
    function pyFiles() { if (!pyDirty) return null; pyDirty = false; return ctx.files().filter(function (f) { return f.lang === 'py'; }).map(function (f) { return { name: f.name, content: f.content }; }); }
    var JK = { module: K.Module, class: K.Class, instance: K.Variable, function: K.Function, param: K.Variable, path: K.File, keyword: K.Keyword, property: K.Property, statement: K.Variable };
    function pyReady() { return ctx.runner.state('python') === 'ready' && jediOn; }
    var jediOn = false, jediWarming = null;
    function warmJedi() {
      if (jediOn || jediWarming) return jediWarming;
      if (ctx.onPyState) ctx.onPyState('loading');
      jediWarming = ctx.runner.py('check', ['main.py', ''], pyFiles()).then(function () { jediOn = true; if (ctx.onPyState) ctx.onPyState('ready'); }, function (e) { jediWarming = null; pyDirty = true; if (ctx.onPyState) ctx.onPyState('error', e); });
      return jediWarming;
    }
    disposers.push(monaco.languages.registerCompletionItemProvider('python', {
      triggerCharacters: ['.'],
      provideCompletionItems: function (model, pos) {
        if (!jediOn) { warmJedi(); return smart('py', model, pos); }
        var range = rangeAt(model, pos), seq = ++pySeq;
        return ctx.runner.py('complete', [ctx.pathOf(model), model.getValue(), pos.lineNumber, pos.column - 1], pyFiles()).then(function (list) {
          var items = (list || []).map(function (c, i) {
            return { label: c[0], kind: JK[c[1]] || K.Text, insertText: c[0], range: range, sortText: (c[0].charAt(0) === '_' ? '9' : '1') + ('000' + i).slice(-4), detail: c[1], _i: i, _seq: seq };
          });
          var before = model.getValueInRange(new monaco.Range(pos.lineNumber, 1, pos.lineNumber, pos.column));
          if (!/\.\w*$/.test(before)) items = items.concat(snipItems(PY_SNIPS, range));
          return { suggestions: items };
        }, function () { return smart('py', model, pos); });
      },
      resolveCompletionItem: function (item) {
        if (item._i == null || item._seq !== pySeq) return item;
        return ctx.runner.py('detail', [item._i]).then(function (d) {
          if (d && d.detail) item.detail = d.detail;
          if (d && d.doc) item.documentation = { value: d.doc.replace(/\n/g, '  \n') };
          return item;
        }, function () { return item; });
      }
    }));
    var pySeq = 0;
    disposers.push(monaco.languages.registerSignatureHelpProvider('python', {
      signatureHelpTriggerCharacters: ['(', ','], signatureHelpRetriggerCharacters: [','],
      provideSignatureHelp: function (model, pos) {
        if (!jediOn) return signatureHelp('py').provideSignatureHelp(model, pos);
        return ctx.runner.py('sig', [ctx.pathOf(model), model.getValue(), pos.lineNumber, pos.column - 1], pyFiles()).then(function (sigs) {
          if (!sigs || !sigs.length) return null;
          return { value: { signatures: sigs.map(function (s) { return { label: s.label, documentation: { value: s.doc || '' }, parameters: s.params.map(function (p) { return { label: p }; }) }; }), activeSignature: 0, activeParameter: Math.max(0, sigs[0].index == null ? 0 : sigs[0].index) }, dispose: function () { } };
        }, function () { return null; });
      }
    }));
    disposers.push(monaco.languages.registerHoverProvider('python', {
      provideHover: function (model, pos) {
        if (!jediOn) return hover('py').provideHover(model, pos);
        var w = model.getWordAtPosition(pos); if (!w) return null;
        return ctx.runner.py('hover', [ctx.pathOf(model), model.getValue(), pos.lineNumber, w.startColumn - 1], pyFiles()).then(function (h) {
          if (!h) return null;
          return { range: new monaco.Range(pos.lineNumber, w.startColumn, pos.lineNumber, w.endColumn), contents: [{ value: '```python\n' + h.title + '\n```' }].concat(h.doc ? [{ value: h.doc.replace(/\n/g, '  \n') }] : []) };
        }, function () { return null; });
      }
    }));

    /* ---------- HTML: a tag name on its own becomes the whole tag ---------- */
    disposers.push(monaco.languages.registerCompletionItemProvider('html', {
      provideCompletionItems: function (model, pos) {
        var before = model.getValueInRange(new monaco.Range(pos.lineNumber, 1, pos.lineNumber, pos.column));
        var m = /(^|>)\s*(!|[a-z][a-z0-9]*)$/i.exec(before);
        if (!m) return { suggestions: [] };
        var range = new monaco.Range(pos.lineNumber, pos.column - m[2].length, pos.lineNumber, pos.column);
        if (m[2] === '!') return { suggestions: [{ label: '!', kind: K.Snippet, range: range, insertTextRules: SNIP, detail: 'Whole page', insertText: '<!DOCTYPE html>\n<html lang="en">\n<head>\n\t<meta charset="UTF-8">\n\t<meta name="viewport" content="width=device-width, initial-scale=1.0">\n\t<title>${1:My page}</title>\n</head>\n<body>\n\t$0\n</body>\n</html>' }] };
        var VOID = /^(img|input|br|hr|meta|link)$/;
        return { suggestions: HTML_TAGS.filter(function (t) { return t.indexOf(m[2].toLowerCase()) === 0; }).map(function (t) {
          var ins = VOID.test(t) ? (t === 'img' ? '<img src="$1" alt="$2">' : t === 'link' ? '<link rel="stylesheet" href="$1">' : t === 'input' ? '<input type="${1:text}">' : '<' + t + '>') : t === 'a' ? '<a href="$1">$2</a>' : '<' + t + '>$0</' + t + '>';
          return { label: t, kind: K.Snippet, range: range, insertText: ins, insertTextRules: SNIP, detail: ins.replace(/\$\{?\d:?([^}]*)\}?/g, '$1'), sortText: '0' };
        }) };
      }
    }));

    /* ---------- live checks ---------- */
    var lintTimers = {};
    function setMarkers(model, owner, list) {
      if (model.isDisposed()) return;
      monaco.editor.setModelMarkers(model, owner, (list || []).map(function (d) {
        var ln = Math.min(Math.max(1, d.line || 1), model.getLineCount());
        var col = Math.max(1, d.col || 1), end = d.endLine ? Math.min(d.endLine, model.getLineCount()) : ln;
        var endCol = d.endCol && d.endLine ? d.endCol : model.getLineMaxColumn(ln);
        if (!d.endLine && d.col) { var w = model.getWordAtPosition({ lineNumber: ln, column: col }); endCol = w ? w.endColumn : Math.min(col + 1, model.getLineMaxColumn(ln)); }
        return { severity: d.severity === 'warning' ? monaco.MarkerSeverity.Warning : d.severity === 'note' ? monaco.MarkerSeverity.Info : monaco.MarkerSeverity.Error, message: d.message, startLineNumber: ln, startColumn: col, endLineNumber: end, endColumn: Math.max(endCol, col + 1), source: d.source || '' };
      }));
      if (ctx.onMarkers) ctx.onMarkers();
    }
    function lint(model) {
      var lang = ctx.langOfModel(model), path = ctx.pathOf(model), id = model.id;
      clearTimeout(lintTimers[id]);
      if (lang === 'py') { pyDirty = true; if (!jediOn) return; }
      lintTimers[id] = setTimeout(function () {
        if (model.isDisposed()) return;
        if (lang === 'py' && jediOn) ctx.runner.py('check', [path, model.getValue()], pyFiles()).then(function (d) { setMarkers(model, 'pz-live', (d || []).map(function (x) { x.source = 'Python'; return x; })); }, function () { });
        else if ((lang === 'c' || lang === 'cpp') && ctx.runner.state('cpp') === 'ready' && /\.(c|cpp|cc|cxx)$/i.test(path)) {
          ctx.runner.compile(lang === 'c' && ctx.projectLang() === 'cpp' ? 'cpp' : lang, ctx.files().filter(function (f) { return !f.binary; }).map(function (f) { return { name: f.name, content: f.name === path ? model.getValue() : f.content }; }), path)
            .then(function (r) { setMarkers(model, 'pz-live', (r.diagnostics || []).filter(function (d) { return d.file === path && d.severity !== 'note'; }).map(function (x) { x.source = 'Clang'; return x; })); }, function () { });
        } else if (lang === 'php' && ctx.runner.state('php') === 'ready') ctx.runner.phpCheck(model.getValue()).then(function (d) { setMarkers(model, 'pz-live', (d || []).map(function (x) { x.source = 'PHP'; return x; })); }, function () { });
      }, lang === 'py' ? 600 : 1100);
    }

    return {
      lint: lint,
      warmJedi: warmJedi,
      jediReady: function () { return jediOn; },
      /* The tools worker was replaced: Jedi has to load again in the new one. */
      resetJedi: function () { jediOn = false; jediWarming = null; pyDirty = true; if (ctx.onPyState) ctx.onPyState('idle'); },
      filesChanged: function () { pyDirty = true; },
      setMarkers: setMarkers,
      dispose: function () { disposers.forEach(function (d) { d.dispose(); }); }
    };
  }

  g.PaisleyIntel = { setup: setup, _symbols: symbols, _callAt: callAt };
})(window);
