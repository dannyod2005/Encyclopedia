// src/seeds/seed-courses.ts
//
// #109 — expanded from the original 6-course prototype set to ~40 courses
// spread across the three catalogue categories, so filtering/browsing
// feels realistic for a demo. Scope decisions, spelled out since they
// shape what #100 still needs to do:
//   - Every module gets a real, verified-embeddable YouTube video URL
//     (see VIDEO POOLS below) — video playback is one of the "core UX"
//     pillars #109 explicitly gates on, so every module needed a working
//     player, not just a placeholder icon. Topic accuracy wasn't required
//     (per the issue), so these are a curated pool of long-standing public
//     talks/tutorials reused across modules, loosely matched by category
//     (tutorial content for Technical, talks for Business/Leadership).
//   - Only the FIRST module of every course gets a quiz here (2 questions
//     each) — enough to satisfy "most/all courses have quiz questions" at
//     the course level and prove the feature works across the whole
//     catalogue, but NOT full per-module coverage. Populating every
//     remaining module's quiz is deliberately left to #100, which was
//     scoped as the dedicated follow-up for exactly that.
//   - FAQs moved from one generic PLACEHOLDER pair (shared by literally
//     every course) to three category-specific pairs, reused within each
//     category. Still reused rather than fully unique per course — real,
//     non-generic copy, just not bespoke per course, which felt like the
//     right effort/benefit line for 40 courses.
import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { Course } from '../courses/entities/course.entity';
import { CourseModule } from '../courses/entities/course-module.entity';
import { CourseCredit } from '../courses/entities/course-credit.entity';
import { CourseFaq } from '../courses/entities/course-faq.entity';
import { QuizQuestion } from '../quiz/entities/quiz-question.entity';
import { QuizOption } from '../quiz/entities/quiz-option.entity';

type Category = 'Technical' | 'Business' | 'Leadership';
type Level = 'Beginner' | 'Intermediate' | 'Advanced';
type Color = 'ink' | 'gold' | 'success' | 'coral';

interface SeedQuizQuestion {
  question: string;
  options: { text: string; correct: boolean }[];
}

interface SeedModule {
  title: string;
  videoUrl: string;
  quiz?: SeedQuizQuestion[];
}

interface SeedCourse {
  title: string;
  provider: string;
  category: Category;
  level: Level;
  hours: number;
  rating: number;
  learners: number;
  color: Color;
  blurb: string;
  modules: SeedModule[];
  credits: string[];
}

function embed(id: string): string {
  return `https://www.youtube.com/embed/${id}`;
}

// Verified via YouTube's oEmbed API (public, not deleted, not
// embed-restricted) — see #109 for the check. Reused across modules;
// picking specific videos per module was deliberately not attempted (the
// issue explicitly doesn't require topic accuracy for video content).
const TECH = {
  python: embed('rfscVS0vtbw'), // freeCodeCamp — Learn Python
  js1: embed('PkZNo7MFNFg'), // freeCodeCamp — Learn JavaScript
  js2: embed('W6NZfCO5SIk'), // Programming with Mosh — JavaScript Course
  html: embed('P0EGYTb1cBs'), // Dave Gray — Introduction to HTML
  js3: embed('hdI2bqOjy3c'), // Traversy Media — JavaScript Crash Course
};

const TALK = {
  creativity: embed('iG9CE55wbtY'), // TED — Sir Ken Robinson
  jobs: embed('UF8uR6Z6KLc'), // Stanford — Steve Jobs commencement address
  listen: embed('eIho2S0ZahI'), // TED — Julian Treasure
  stress1: embed('RcGyVTAoXEU'), // TED — Kelly McGonigal
  howToSpeak: embed('Unzc731iCUY'), // MIT OCW — Patrick Winston, "How to Speak"
  soundSmart: embed('8S0FDjFBj8o'), // TEDx — Will Stephen
  stress2: embed('8jPQjjsBbIc'), // TED — Daniel Levitin
  sinek: embed('qp0HIF3SfI4'), // TED — Simon Sinek
  bodyLanguage: embed('Ks-_Mh1QhMc'), // TED — Amy Cuddy
  vulnerability: embed('X4Qm9cGRub0'), // TEDx — Brené Brown
};

const CATEGORY_FAQS: Record<Category, { question: string; answer: string }[]> =
  {
    Technical: [
      {
        question: 'Do I need prior coding experience?',
        answer:
          'Check the course level (Beginner/Intermediate/Advanced) in the catalogue before enrolling — Beginner courses assume no prior experience.',
      },
      {
        question: 'Will I get a certificate when I finish?',
        answer:
          'Yes — completing every module and its quiz unlocks a downloadable certificate from your dashboard.',
      },
      {
        question: 'How much time should I set aside each week?',
        answer:
          "Budget roughly the course's listed hours spread across 2–4 weeks, depending on how deep you want to go with the exercises.",
      },
    ],
    Business: [
      {
        question: "Is this relevant if I'm not in a management role yet?",
        answer:
          'Yes — these frameworks are useful for anyone who wants to think more clearly about business decisions, not just people managers.',
      },
      {
        question: 'Will I get a certificate when I finish?',
        answer:
          'Yes — completing every module and its quiz unlocks a downloadable certificate from your dashboard.',
      },
      {
        question: 'How much time should I set aside each week?',
        answer:
          "Budget roughly the course's listed hours spread across 2–4 weeks, depending on how deep you want to go with the exercises.",
      },
    ],
    Leadership: [
      {
        question: 'Do I need to be a manager to take this course?',
        answer:
          'No — skills like feedback, communication, and conflict resolution are useful long before you have direct reports.',
      },
      {
        question: 'Will I get a certificate when I finish?',
        answer:
          'Yes — completing every module and its quiz unlocks a downloadable certificate from your dashboard.',
      },
      {
        question: 'How much time should I set aside each week?',
        answer:
          "Budget roughly the course's listed hours spread across 2–4 weeks, depending on how deep you want to go with the exercises.",
      },
    ],
  };

// Two reusable credit lines per provider — real attribution pattern (who
// teaches it, where content/tooling comes from), just not bespoke prose
// per course. The original 6 courses keep their existing hand-written
// 3-line credits below instead of this lookup.
const PROVIDER_CREDITS: Record<string, string[]> = {
  'Anthropic Academy': [
    'Curriculum & instruction: Anthropic Academy teaching staff',
    'Case studies adapted from published Anthropic engineering write-ups',
  ],
  'Dept. of Data Science': [
    'Curriculum & instruction: Dept. of Data Science faculty',
    'Practice datasets: public domain and CC-BY sources, cited per exercise',
  ],
  'Encyclopedia Business School': [
    'Curriculum & instruction: Encyclopedia Business School faculty',
    'Frameworks and case studies developed in-house for classroom use',
  ],
  'Encyclopedia Web Guild': [
    'Curriculum & instruction: Encyclopedia Web Guild engineering staff',
    'Built on current open-source tooling and official framework documentation',
  ],
  'Encyclopedia DevOps Guild': [
    'Curriculum & instruction: Encyclopedia DevOps Guild engineering staff',
    'Labs built on open-source and free-tier cloud tooling',
  ],
  'Encyclopedia Security Lab': [
    'Curriculum & instruction: Encyclopedia Security Lab staff',
    'Scenarios adapted from publicly documented security incidents and OWASP guidance',
  ],
  'Encyclopedia Growth Academy': [
    'Curriculum & instruction: Encyclopedia Growth Academy staff',
    'Campaign examples anonymized and adapted from industry case studies',
  ],
  'Global Leadership Institute': [
    'Curriculum & instruction: Global Leadership Institute faculty',
    'Frameworks drawn from published leadership and organizational psychology research, cited in-course',
  ],
};

function q(question: string, options: [string, boolean][]): SeedQuizQuestion {
  return {
    question,
    options: options.map(([text, correct]) => ({ text, correct })),
  };
}

const SAMPLE_COURSES: SeedCourse[] = [
  // ---------------- TECHNICAL (14) ----------------
  {
    title: 'AI Engineering with Claude',
    provider: 'Anthropic Academy',
    category: 'Technical',
    level: 'Intermediate',
    hours: 24,
    rating: 4.9,
    learners: 2840,
    color: 'ink',
    blurb:
      'Ship real projects with Claude — from prompting fundamentals to agentic tool use.',
    modules: [
      {
        title: 'Prompting foundations',
        videoUrl: TECH.python,
        quiz: [
          q('What is a "system prompt" typically used for?', [
            ['Setting persistent context or behavior for the model', true],
            ['Formatting the final output as JSON', false],
            ['Rate-limiting API requests', false],
            ['Compressing the conversation history', false],
          ]),
          q(
            'Which technique reduces hallucination by grounding answers in real documents?',
            [
              ['Retrieval-augmented generation', true],
              ['Temperature scaling', false],
              ['Token truncation', false],
              ['Batch inference', false],
            ],
          ),
        ],
      },
      {
        title: 'Tool use & function calling',
        videoUrl: TECH.js1,
        quiz: [
          q(
            'What allows a model to call external functions or APIs during a conversation?',
            [
              ['Tool use / function calling', true],
              ['Fine-tuning', false],
              ['Prompt caching', false],
              ['Temperature adjustment', false],
            ],
          ),
          q('Why define a strict JSON schema for a tool?', [
            [
              'So the model produces arguments the tool can reliably parse',
              true,
            ],
            ['To make responses shorter', false],
            ['To disable the tool', false],
            ['To increase the context window', false],
          ]),
        ],
      },
      {
        title: 'Retrieval & context design',
        videoUrl: TECH.js2,
        quiz: [
          q('What is the main goal of retrieval in a RAG pipeline?', [
            ["Fetching relevant documents to ground the model's answer", true],
            ['Compressing the model weights', false],
            ['Speeding up token generation', false],
            ['Formatting the output as markdown', false],
          ]),
          q('Why chunk documents before embedding them?', [
            ['Smaller chunks retrieve more precisely relevant context', true],
            ['Chunking removes the need for embeddings', false],
            ['It reduces API costs to zero', false],
            ['It prevents hallucination entirely', false],
          ]),
        ],
      },
      {
        title: 'Agents & evaluation',
        videoUrl: TECH.html,
        quiz: [
          q('An "agentic" workflow is one where the model:', [
            [
              'Plans and takes multiple actions toward a goal with limited supervision',
              true,
            ],
            ['Only ever returns plain text', false],
            ['Cannot call any tools', false],
            ['Requires a human to approve every token', false],
          ]),
          q('Why evaluate an agent on a held-out test set?', [
            ["To measure how it performs on cases it wasn't tuned on", true],
            ['To make the agent faster', false],
            ['To reduce token costs', false],
            ['To skip prompt engineering', false],
          ]),
        ],
      },
      {
        title: 'Capstone project',
        videoUrl: TECH.js3,
        quiz: [
          q('What is the purpose of a capstone project in this course?', [
            ['Applying everything learned to a real, end-to-end build', true],
            ['Testing typing speed', false],
            ['Grading attendance', false],
            ['Replacing the final quiz', false],
          ]),
          q('Which is a good practice before submitting a capstone project?', [
            ['Testing it against edge cases and unexpected input', true],
            ['Skipping documentation', false],
            ['Removing all error handling', false],
            ['Hardcoding all inputs', false],
          ]),
        ],
      },
    ],
    credits: [
      'Curriculum & instruction: Anthropic Academy teaching staff',
      'Case studies adapted from published Anthropic engineering write-ups',
      "Capstone rubric reviewed by Encyclopedia's technical advisory board",
    ],
  },
  {
    title: 'Python for Everybody',
    provider: 'Dept. of Data Science',
    category: 'Technical',
    level: 'Beginner',
    hours: 32,
    rating: 4.8,
    learners: 18400,
    color: 'gold',
    blurb:
      'A five-course path from first script to working with databases and APIs.',
    modules: [
      {
        title: 'Getting started with Python',
        videoUrl: TECH.js3,
        quiz: [
          q('Which of these is a valid Python variable name?', [
            ['_total', true],
            ['2total', false],
            ['total-1', false],
            ['total value', false],
          ]),
          q('What does the print() function do?', [
            ['Outputs text to the console', true],
            ['Deletes a variable', false],
            ['Imports a module', false],
            ['Starts a loop', false],
          ]),
        ],
      },
      {
        title: 'Data structures',
        videoUrl: TECH.python,
        quiz: [
          q('Which Python data structure stores key-value pairs?', [
            ['Dictionary', true],
            ['List', false],
            ['Tuple', false],
            ['Set', false],
          ]),
          q('What is a key difference between a list and a tuple in Python?', [
            ['Lists are mutable, tuples are immutable', true],
            ['Tuples can only hold numbers', false],
            ['Lists cannot be indexed', false],
            ['Tuples are always sorted', false],
          ]),
        ],
      },
      {
        title: 'Using web APIs',
        videoUrl: TECH.js1,
        quiz: [
          q('What format do most modern web APIs use for data exchange?', [
            ['JSON', true],
            ['INI', false],
            ['DOCX', false],
            ['EXE', false],
          ]),
          q('What does an HTTP GET request typically do?', [
            ['Retrieves data from a server', true],
            ['Deletes a resource', false],
            ['Always modifies the database', false],
            ['Installs a package', false],
          ]),
        ],
      },
      {
        title: 'Databases',
        videoUrl: TECH.js2,
        quiz: [
          q(
            'What Python library is commonly used to connect to a SQL database?',
            [
              ['sqlite3 (or a driver like psycopg2)', true],
              ['matplotlib', false],
              ['requests', false],
              ['tkinter', false],
            ],
          ),
          q('What is the purpose of a primary key in a database table?', [
            ['Uniquely identifying each row', true],
            ['Formatting output', false],
            ['Storing images', false],
            ['Compressing data', false],
          ]),
        ],
      },
      {
        title: 'Capstone: visualize data',
        videoUrl: TECH.html,
        quiz: [
          q('What is a good first step before visualizing a dataset?', [
            ['Cleaning and understanding the data', true],
            ['Picking random colors', false],
            ['Deleting all missing values without review', false],
            ['Skipping straight to publishing', false],
          ]),
          q(
            'Why choose a line chart over a bar chart for data that changes over time?',
            [
              ['It better shows change over time', true],
              ['It uses fewer colors', false],
              ['It hides outliers', false],
              ['It requires no axis labels', false],
            ],
          ),
        ],
      },
    ],
    credits: [
      'Curriculum & instruction: Dept. of Data Science faculty',
      'Practice datasets: public domain and CC-BY sources, cited per exercise',
      'Auto-graded exercises built on the open-source pytest framework',
    ],
  },
  {
    title: 'Data Visualization with Python',
    provider: 'Dept. of Data Science',
    category: 'Technical',
    level: 'Intermediate',
    hours: 14,
    rating: 4.8,
    learners: 5390,
    color: 'gold',
    blurb:
      'Matplotlib, seaborn, and the design principles behind charts people trust.',
    modules: [
      {
        title: 'Chart fundamentals',
        videoUrl: TECH.html,
        quiz: [
          q('Which chart type is best for showing a trend over time?', [
            ['Line chart', true],
            ['Pie chart', false],
            ['Scatter plot', false],
            ['Box plot', false],
          ]),
          q("What's a common mistake when choosing chart colors?", [
            ['Using non-colorblind-safe palettes', true],
            ['Using too few data points', false],
            ['Labeling the axes', false],
            ['Adding a title', false],
          ]),
        ],
      },
      {
        title: 'Matplotlib & seaborn',
        videoUrl: TECH.js3,
        quiz: [
          q('What is seaborn built on top of?', [
            ['Matplotlib', true],
            ['Django', false],
            ['Flask', false],
            ['NumPy alone', false],
          ]),
          q('What does plt.show() do in Matplotlib?', [
            ['Renders the current figure', true],
            ['Saves the figure to disk', false],
            ['Deletes the figure', false],
            ['Starts a web server', false],
          ]),
        ],
      },
      {
        title: 'Design & annotation',
        videoUrl: TECH.python,
        quiz: [
          q('Why add axis labels and a title to a chart?', [
            [
              'To make the chart understandable without extra explanation',
              true,
            ],
            ['To increase file size', false],
            ['To slow down rendering', false],
            ['Axis labels are optional and rarely needed', false],
          ]),
          q('What is "chartjunk"?', [
            ['Unnecessary visual elements that distract from the data', true],
            ['A type of chart library', false],
            ['A file format', false],
            ['A color palette', false],
          ]),
        ],
      },
      {
        title: 'Capstone: a report',
        videoUrl: TECH.js1,
        quiz: [
          q('What should a good data report lead with?', [
            ['The key finding or takeaway', true],
            ['A list of every raw data point', false],
            ["The author's biography", false],
            ['A blank page', false],
          ]),
          q('Why cite your data sources in a report?', [
            ['So readers can verify and trust the findings', true],
            ["It's required by matplotlib", false],
            ['It changes the chart colors', false],
            ['It compresses the file', false],
          ]),
        ],
      },
    ],
    credits: [
      'Curriculum & instruction: Dept. of Data Science faculty',
      'Built on the open-source Matplotlib and seaborn libraries',
      'Design principles adapted from public data-visualization style guides',
    ],
  },
  {
    title: 'JavaScript Fundamentals',
    provider: 'Encyclopedia Web Guild',
    category: 'Technical',
    level: 'Beginner',
    hours: 12,
    rating: 4.6,
    learners: 8700,
    color: 'ink',
    blurb:
      'Variables, functions, and the DOM — a solid foundation before frameworks.',
    modules: [
      {
        title: 'Variables, types & operators',
        videoUrl: TECH.js2,
        quiz: [
          q(
            'Which keyword declares a block-scoped variable in modern JavaScript?',
            [
              ['let', true],
              ['var', false],
              ['def', false],
              ['dim', false],
            ],
          ),
          q('What does "===" check in JavaScript?', [
            ['Value and type equality', true],
            ['Value equality only', false],
            ['Reference equality only', false],
            ['Assignment', false],
          ]),
        ],
      },
      {
        title: 'Functions & scope',
        videoUrl: TECH.html,
        quiz: [
          q('What does a function\'s "scope" determine?', [
            ['Which variables are accessible from within it', true],
            ['How fast it runs', false],
            ['Its return type', false],
            ['Its file size', false],
          ]),
          q('What is a closure in JavaScript?', [
            [
              "A function that retains access to its outer scope's variables",
              true,
            ],
            ['A syntax error', false],
            ['A type of loop', false],
            ['A CSS property', false],
          ]),
        ],
      },
      {
        title: 'Arrays & objects',
        videoUrl: TECH.js3,
        quiz: [
          q('Which method adds an item to the end of a JavaScript array?', [
            ['push()', true],
            ['shift()', false],
            ['pop()', false],
            ['slice()', false],
          ]),
          q('How do you access a property on a JavaScript object?', [
            ['Dot notation or bracket notation', true],
            ['Only with a for loop', false],
            ['Only via JSON.parse', false],
            ['Arrays cannot hold objects', false],
          ]),
        ],
      },
      {
        title: 'DOM basics',
        videoUrl: TECH.python,
        quiz: [
          q('What does "DOM" stand for?', [
            ['Document Object Model', true],
            ['Data Output Method', false],
            ['Direct Object Mapping', false],
            ['Dynamic Order Management', false],
          ]),
          q('Which method selects an element by its id in the DOM?', [
            ['document.getElementById()', true],
            ['document.createElement()', false],
            ['document.write()', false],
            ['window.alert()', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Web Guild'],
  },
  {
    title: 'Modern Web Development with React',
    provider: 'Encyclopedia Web Guild',
    category: 'Technical',
    level: 'Intermediate',
    hours: 18,
    rating: 4.7,
    learners: 6120,
    color: 'gold',
    blurb:
      'Components, hooks, and data fetching — build a real single-page app.',
    modules: [
      {
        title: 'Components & JSX',
        videoUrl: TECH.js1,
        quiz: [
          q('What does JSX compile down to?', [
            ['JavaScript function calls (e.g. React.createElement)', true],
            ['HTML templates', false],
            ['CSS-in-JS', false],
            ['WebAssembly', false],
          ]),
          q('How do you pass data from a parent to a child component?', [
            ['Props', true],
            ['State', false],
            ['Context only', false],
            ['Refs', false],
          ]),
        ],
      },
      {
        title: 'State & props',
        videoUrl: TECH.js2,
        quiz: [
          q('What hook is used to add local state to a function component?', [
            ['useState', true],
            ['useEffect', false],
            ['useContext', false],
            ['useMemo', false],
          ]),
          q('Can a child component modify the props it receives directly?', [
            ["No — props are read-only from the child's perspective", true],
            ['Yes, freely', false],
            ['Only if wrapped in useState', false],
            ['Only in class components', false],
          ]),
        ],
      },
      {
        title: 'Hooks in practice',
        videoUrl: TECH.html,
        quiz: [
          q('What is useEffect commonly used for?', [
            ['Running side effects like data fetching after render', true],
            ['Declaring CSS styles', false],
            ['Compiling JSX', false],
            ['Routing between pages', false],
          ]),
          q('What array controls how often useEffect re-runs?', [
            ['The dependency array', true],
            ['The props array', false],
            ['The state array', false],
            ['The children array', false],
          ]),
        ],
      },
      {
        title: 'Routing & data fetching',
        videoUrl: TECH.js3,
        quiz: [
          q('What does client-side routing let you do?', [
            ['Change views without a full page reload', true],
            ['Query a database directly', false],
            ['Compile TypeScript', false],
            ['Style components', false],
          ]),
          q('What is a common way to fetch data when a component mounts?', [
            ['Call fetch/axios inside a useEffect hook', true],
            ['Call fetch inside the JSX return', false],
            ['Use CSS media queries', false],
            ['Use useState alone with no effect', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Web Guild'],
  },
  {
    title: 'Introduction to SQL & Databases',
    provider: 'Dept. of Data Science',
    category: 'Technical',
    level: 'Beginner',
    hours: 10,
    rating: 4.7,
    learners: 9040,
    color: 'ink',
    blurb: 'Query, filter, and join relational data with confidence.',
    modules: [
      {
        title: 'Querying with SELECT',
        videoUrl: TECH.python,
        quiz: [
          q('Which clause filters rows before grouping?', [
            ['WHERE', true],
            ['HAVING', false],
            ['GROUP BY', false],
            ['ORDER BY', false],
          ]),
          q('What does SELECT * do?', [
            ['Returns all columns', true],
            ['Returns all tables', false],
            ['Deletes all rows', false],
            ['Counts all rows', false],
          ]),
        ],
      },
      {
        title: 'Filtering & sorting',
        videoUrl: TECH.js1,
        quiz: [
          q('Which clause sorts query results?', [
            ['ORDER BY', true],
            ['GROUP BY', false],
            ['WHERE', false],
            ['FROM', false],
          ]),
          q('What does WHERE age > 18 do in a SQL query?', [
            ['Filters rows to only those where age is greater than 18', true],
            ['Sorts rows by age', false],
            ['Deletes rows where age is 18', false],
            ['Creates a new column', false],
          ]),
        ],
      },
      {
        title: 'Joins',
        videoUrl: TECH.js2,
        quiz: [
          q('What does an INNER JOIN return?', [
            ['Only rows with matching values in both tables', true],
            ['All rows from both tables regardless of match', false],
            ['Only rows from the left table', false],
            ['Only unmatched rows', false],
          ]),
          q('What is typically used to join two tables?', [
            [
              'A shared key, like a foreign key referencing a primary key',
              true,
            ],
            ['Alphabetical order', false],
            ['Table size', false],
            ['Column color', false],
          ]),
        ],
      },
      {
        title: 'Aggregation & grouping',
        videoUrl: TECH.html,
        quiz: [
          q('What does the COUNT() function return?', [
            ['The number of rows matching a condition', true],
            ['The average of a column', false],
            ['The largest value in a column', false],
            ['A random row', false],
          ]),
          q('What is GROUP BY used for?', [
            [
              'Aggregating rows that share a value in one or more columns',
              true,
            ],
            ['Sorting alphabetically', false],
            ['Filtering NULL values only', false],
            ['Renaming columns', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Dept. of Data Science'],
  },
  {
    title: 'Cloud Computing Foundations (AWS)',
    provider: 'Encyclopedia DevOps Guild',
    category: 'Technical',
    level: 'Beginner',
    hours: 16,
    rating: 4.5,
    learners: 4310,
    color: 'gold',
    blurb:
      'Core cloud concepts and hands-on basics with compute, storage, and networking.',
    modules: [
      {
        title: 'Cloud concepts',
        videoUrl: TECH.js3,
        quiz: [
          q('What does "elasticity" mean in cloud computing?', [
            ['Automatically scaling resources up or down with demand', true],
            ['Physically moving servers', false],
            ['Encrypting all data at rest', false],
            ['Load testing an app', false],
          ]),
          q(
            'Which is a core benefit of cloud over on-premise infrastructure?',
            [
              ['Pay only for what you use', true],
              ['Zero cost', false],
              ['No internet required', false],
              ['Unlimited free storage', false],
            ],
          ),
        ],
      },
      {
        title: 'Compute & storage basics',
        videoUrl: TECH.python,
        quiz: [
          q('What AWS service provides scalable virtual servers?', [
            ['EC2', true],
            ['S3', false],
            ['Route 53', false],
            ['CloudFront', false],
          ]),
          q('What is object storage (like S3) best suited for?', [
            [
              'Storing large amounts of unstructured data like files and backups',
              true,
            ],
            ['Running a relational database', false],
            ['Real-time video calls', false],
            ['DNS resolution', false],
          ]),
        ],
      },
      {
        title: 'Networking essentials',
        videoUrl: TECH.js1,
        quiz: [
          q('What is a VPC in cloud computing?', [
            ['An isolated virtual network within the cloud provider', true],
            ['A type of storage bucket', false],
            ['A billing dashboard', false],
            ['A programming language', false],
          ]),
          q('What does a load balancer do?', [
            ['Distributes incoming traffic across multiple servers', true],
            ['Encrypts all stored data', false],
            ['Compiles application code', false],
            ['Deletes unused resources', false],
          ]),
        ],
      },
      {
        title: 'Cost & security basics',
        videoUrl: TECH.js2,
        quiz: [
          q('What is the "pay-as-you-go" model in cloud computing?', [
            ['Paying only for the resources actually used', true],
            ['A flat annual fee regardless of usage', false],
            ['Free usage forever', false],
            ['Paying upfront for hardware', false],
          ]),
          q('What is the principle of least privilege in cloud security?', [
            ['Granting only the access necessary to perform a task', true],
            ['Giving every user admin access', false],
            ['Disabling all logging', false],
            ['Using one shared password for all accounts', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia DevOps Guild'],
  },
  {
    title: 'DevOps & CI/CD Pipelines',
    provider: 'Encyclopedia DevOps Guild',
    category: 'Technical',
    level: 'Intermediate',
    hours: 14,
    rating: 4.6,
    learners: 3980,
    color: 'ink',
    blurb:
      'Automate builds, tests, and deployments so releases stop being scary.',
    modules: [
      {
        title: 'CI/CD concepts',
        videoUrl: TECH.html,
        quiz: [
          q('What does "CI" stand for?', [
            ['Continuous Integration', true],
            ['Continuous Installation', false],
            ['Code Inspection', false],
            ['Cloud Infrastructure', false],
          ]),
          q("What's the main benefit of automating deployments?", [
            ['Fewer manual errors and faster releases', true],
            ['Lower code quality', false],
            ['No need for testing', false],
            ['Slower feedback loops', false],
          ]),
        ],
      },
      {
        title: 'Building a pipeline',
        videoUrl: TECH.js3,
        quiz: [
          q('What typically triggers a CI pipeline to run?', [
            ['A code push or pull request', true],
            ['A scheduled server reboot', false],
            ['A user login', false],
            ['A DNS change', false],
          ]),
          q('What is a "build artifact"?', [
            ['The output produced by compiling/packaging code', true],
            ['A bug report', false],
            ['A test case', false],
            ['A commit message', false],
          ]),
        ],
      },
      {
        title: 'Automated testing in CI',
        videoUrl: TECH.python,
        quiz: [
          q('Why run automated tests in a CI pipeline?', [
            ['To catch regressions before code is merged or deployed', true],
            ['To slow down releases intentionally', false],
            ['To replace code review entirely', false],
            ['Tests are optional and rarely useful in CI', false],
          ]),
          q(
            'What is a common signal that a build should be blocked from merging?',
            [
              ['One or more tests failing', true],
              ['All tests passing', false],
              ['A short commit message', false],
              ['A large diff', false],
            ],
          ),
        ],
      },
      {
        title: 'Deployment strategies',
        videoUrl: TECH.js1,
        quiz: [
          q('What is a "blue-green" deployment?', [
            [
              'Running two environments and switching traffic between them',
              true,
            ],
            ['Deploying only on weekends', false],
            ['A type of database migration', false],
            ['A code review technique', false],
          ]),
          q('What is the main benefit of a canary release?', [
            [
              'Rolling out changes to a small subset of users first to catch issues early',
              true,
            ],
            ['Deploying to all users at once', false],
            ['Skipping testing', false],
            ['Reducing server costs to zero', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia DevOps Guild'],
  },
  {
    title: 'Machine Learning Foundations',
    provider: 'Dept. of Data Science',
    category: 'Technical',
    level: 'Intermediate',
    hours: 20,
    rating: 4.8,
    learners: 7210,
    color: 'gold',
    blurb:
      'Regression, classification, and evaluation — the fundamentals before deep learning.',
    modules: [
      {
        title: 'Supervised vs unsupervised learning',
        videoUrl: TECH.js2,
        quiz: [
          q('In supervised learning, the training data includes:', [
            ['Labeled examples', true],
            ['Only raw features', false],
            ['Random noise', false],
            ['Unlabeled clusters', false],
          ]),
          q('Which is an example of an unsupervised learning task?', [
            ['Clustering customers by behavior', true],
            ['Predicting house prices', false],
            ['Classifying spam emails', false],
            ['Forecasting sales', false],
          ]),
        ],
      },
      {
        title: 'Regression & classification',
        videoUrl: TECH.html,
        quiz: [
          q('Regression models are used to predict:', [
            ['A continuous numeric value', true],
            ['A category or class label', false],
            ['A database schema', false],
            ['A file format', false],
          ]),
          q('Classification models are used to predict:', [
            ['A discrete category or class', true],
            ['A continuous number', false],
            ['A random seed', false],
            ['A file size', false],
          ]),
        ],
      },
      {
        title: 'Model evaluation',
        videoUrl: TECH.js3,
        quiz: [
          q('What does "accuracy" measure in a classification model?', [
            ['The proportion of correct predictions', true],
            ["The model's training speed", false],
            ['The size of the dataset', false],
            ['The number of features used', false],
          ]),
          q(
            'Why use a separate test set instead of evaluating on training data?',
            [
              ['To estimate how the model performs on unseen data', true],
              ['Test sets train the model faster', false],
              ["It's required by law", false],
              ['It reduces the number of features', false],
            ],
          ),
        ],
      },
      {
        title: 'Overfitting & regularization',
        videoUrl: TECH.python,
        quiz: [
          q('What is "overfitting"?', [
            [
              'A model that fits training data well but generalizes poorly',
              true,
            ],
            ['A model that trains too quickly', false],
            ['A model with too few parameters', false],
            ['A dataset with no missing values', false],
          ]),
          q('What is one common technique to reduce overfitting?', [
            ['Regularization', true],
            ['Removing all validation data', false],
            ['Training on less diverse data', false],
            ['Increasing model complexity indefinitely', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Dept. of Data Science'],
  },
  {
    title: 'Cybersecurity Essentials',
    provider: 'Encyclopedia Security Lab',
    category: 'Technical',
    level: 'Beginner',
    hours: 12,
    rating: 4.6,
    learners: 5540,
    color: 'ink',
    blurb:
      'Common threats, access control, and the basics of securing a web app.',
    modules: [
      {
        title: 'Threats & attack vectors',
        videoUrl: TECH.js1,
        quiz: [
          q('What is "phishing"?', [
            ['Tricking someone into revealing sensitive information', true],
            ['A type of firewall', false],
            ['A password hashing algorithm', false],
            ['A network protocol', false],
          ]),
          q('What does "least privilege" mean?', [
            ['Giving users only the access they need', true],
            ['Giving everyone admin rights', false],
            ['Disabling all logging', false],
            ['Using the weakest password policy', false],
          ]),
        ],
      },
      {
        title: 'Authentication & access control',
        videoUrl: TECH.js2,
        quiz: [
          q(
            'What does multi-factor authentication (MFA) add beyond a password?',
            [
              ['A second, independent proof of identity', true],
              ["Nothing — it's the same as a password", false],
              ['A faster login process', false],
              ['Automatic password sharing', false],
            ],
          ),
          q('What is role-based access control (RBAC)?', [
            ["Granting permissions based on a user's role", true],
            ['Granting all users the same access', false],
            ['A type of firewall', false],
            ['A password hashing method', false],
          ]),
        ],
      },
      {
        title: 'Securing web applications',
        videoUrl: TECH.html,
        quiz: [
          q('What is SQL injection?', [
            [
              'An attack that inserts malicious SQL through unsanitized input',
              true,
            ],
            ['A method of backing up a database', false],
            ['A type of load balancing', false],
            ['A CSS vulnerability', false],
          ]),
          q('What does HTTPS provide that HTTP does not?', [
            ['Encrypted communication between client and server', true],
            ['Faster page loads', false],
            ['Automatic backups', false],
            ['Free hosting', false],
          ]),
        ],
      },
      {
        title: 'Incident response basics',
        videoUrl: TECH.js3,
        quiz: [
          q('What is typically the first step in incident response?', [
            ['Identifying and containing the incident', true],
            ['Publicly announcing it before investigation', false],
            ['Deleting all logs', false],
            ['Ignoring it until it recurs', false],
          ]),
          q('Why keep logs during a security incident?', [
            [
              'They help reconstruct what happened and support investigation',
              true,
            ],
            ['They slow down attackers', false],
            ['They are required only for billing', false],
            ['They replace the need for monitoring', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Security Lab'],
  },
  {
    title: 'Git & Version Control for Teams',
    provider: 'Encyclopedia DevOps Guild',
    category: 'Technical',
    level: 'Beginner',
    hours: 6,
    rating: 4.7,
    learners: 11200,
    color: 'gold',
    blurb:
      'Branching, pull requests, and resolving conflicts without the panic.',
    modules: [
      {
        title: 'Git basics',
        videoUrl: TECH.python,
        quiz: [
          q('What does "git commit" do?', [
            ['Saves a snapshot of staged changes', true],
            ['Uploads code to a website', false],
            ['Deletes the working directory', false],
            ['Creates a new repository', false],
          ]),
          q('What is a "branch" in Git?', [
            ['An independent line of development', true],
            ['A backup of the whole repo', false],
            ['A type of merge conflict', false],
            ['A remote server', false],
          ]),
        ],
      },
      {
        title: 'Branching & merging',
        videoUrl: TECH.js1,
        quiz: [
          q('What is the purpose of creating a feature branch?', [
            [
              "Isolating new work from the main codebase until it's ready",
              true,
            ],
            ['Deleting old commits', false],
            ['Backing up the entire repository', false],
            ['Renaming the repository', false],
          ]),
          q('What does "merging" a branch do?', [
            ['Combines changes from one branch into another', true],
            ['Deletes the branch permanently', false],
            ['Reverts all commits', false],
            ['Creates a new repository', false],
          ]),
        ],
      },
      {
        title: 'Pull requests & code review',
        videoUrl: TECH.js2,
        quiz: [
          q('What is the main purpose of a pull request?', [
            ['Proposing changes for review before merging', true],
            ['Automatically deploying code to production', false],
            ['Deleting a branch', false],
            ['Compiling the project', false],
          ]),
          q('Why is code review valuable?', [
            ['It catches bugs and shares knowledge across the team', true],
            ['It slows down every release with no benefit', false],
            ['It replaces automated testing entirely', false],
            ['It is only useful for junior developers', false],
          ]),
        ],
      },
      {
        title: 'Resolving conflicts',
        videoUrl: TECH.html,
        quiz: [
          q('When does a merge conflict occur?', [
            [
              'When the same lines of a file are changed differently in two branches',
              true,
            ],
            ['Whenever you commit', false],
            ['Whenever you clone a repo', false],
            ['Only when using a GUI tool', false],
          ]),
          q('What is a safe first step when resolving a merge conflict?', [
            [
              'Carefully review both versions of the conflicting code before choosing',
              true,
            ],
            ['Delete one branch immediately', false],
            ["Force-push over the other branch's changes blindly", false],
            ['Ignore the conflict markers', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia DevOps Guild'],
  },
  {
    title: 'Backend Engineering with Node.js',
    provider: 'Encyclopedia Web Guild',
    category: 'Technical',
    level: 'Intermediate',
    hours: 16,
    rating: 4.6,
    learners: 4890,
    color: 'ink',
    blurb:
      'Build REST APIs with Express, talk to a database, and add authentication.',
    modules: [
      {
        title: 'Node.js & npm basics',
        videoUrl: TECH.js3,
        quiz: [
          q('What is npm primarily used for?', [
            ['Managing JavaScript packages and dependencies', true],
            ['Compiling CSS', false],
            ['Hosting websites', false],
            ['Running unit tests only', false],
          ]),
          q('Node.js runs JavaScript:', [
            ['Outside the browser, on a server', true],
            ['Only inside Chrome', false],
            ['Only on mobile devices', false],
            ['Only at compile time', false],
          ]),
        ],
      },
      {
        title: 'Building REST APIs with Express',
        videoUrl: TECH.python,
        quiz: [
          q('What is Express.js primarily used for?', [
            ['Building web servers and APIs in Node.js', true],
            ['Styling web pages', false],
            ['Managing databases directly', false],
            ['Compiling TypeScript', false],
          ]),
          q('What does app.get("/users", handler) define in Express?', [
            ['A route that responds to GET requests at /users', true],
            ['A database table', false],
            ['A CSS selector', false],
            ['A background job', false],
          ]),
        ],
      },
      {
        title: 'Working with databases',
        videoUrl: TECH.js1,
        quiz: [
          q('What is an ORM used for?', [
            ['Mapping database rows to application objects', true],
            ['Compiling JavaScript', false],
            ['Styling components', false],
            ['Sending emails', false],
          ]),
          q('Why use connection pooling with a database?', [
            [
              'To reuse connections efficiently instead of opening a new one per request',
              true,
            ],
            ['To slow down queries intentionally', false],
            ["It's required for all SELECT statements", false],
            ['To disable transactions', false],
          ]),
        ],
      },
      {
        title: 'Authentication & middleware',
        videoUrl: TECH.js2,
        quiz: [
          q('What is middleware in an Express app?', [
            [
              'A function that runs between the request and the final route handler',
              true,
            ],
            ['A database table', false],
            ['A frontend framework', false],
            ['A deployment platform', false],
          ]),
          q(
            'What is a common way to represent a logged-in user across requests?',
            [
              ['A signed token (e.g. JWT) or session', true],
              ['Storing the password in plain text in every request', false],
              [
                'Re-entering credentials on every API call with no token',
                false,
              ],
              ['A hardcoded username in the URL', false],
            ],
          ),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Web Guild'],
  },
  {
    title: 'Mobile App Development with Flutter',
    provider: 'Encyclopedia Web Guild',
    category: 'Technical',
    level: 'Intermediate',
    hours: 18,
    rating: 4.5,
    learners: 3210,
    color: 'gold',
    blurb:
      'Build a real cross-platform app with Dart, widgets, and state management.',
    modules: [
      {
        title: 'Dart & Flutter basics',
        videoUrl: TECH.html,
        quiz: [
          q('Flutter apps are primarily written in:', [
            ['Dart', true],
            ['Swift', false],
            ['Kotlin', false],
            ['Python', false],
          ]),
          q('What is a "widget" in Flutter?', [
            ['A building block of the UI', true],
            ['A backend service', false],
            ['A database table', false],
            ['A build tool', false],
          ]),
        ],
      },
      {
        title: 'Widgets & layout',
        videoUrl: TECH.js3,
        quiz: [
          q('In Flutter, how is the UI typically composed?', [
            ['By nesting widgets inside each other', true],
            ['By writing raw HTML', false],
            ['By editing XML layout files only', false],
            ['UI cannot be composed programmatically', false],
          ]),
          q(
            'What is the difference between a StatelessWidget and a StatefulWidget?',
            [
              [
                'A StatefulWidget can change its internal state over time',
                true,
              ],
              ['StatelessWidgets can hold mutable state', false],
              ['They are functionally identical', false],
              ["StatefulWidgets can't rebuild", false],
            ],
          ),
        ],
      },
      {
        title: 'State management',
        videoUrl: TECH.python,
        quiz: [
          q('Why is state management important in larger Flutter apps?', [
            [
              'It keeps UI updates consistent as data changes across many widgets',
              true,
            ],
            ["It's only relevant for styling", false],
            ['It replaces the need for widgets', false],
            ['It only matters for iOS apps', false],
          ]),
          q('What does calling setState() do in a StatefulWidget?', [
            ['Triggers a rebuild of the widget with updated data', true],
            ['Deletes the widget', false],
            ['Publishes the app to the store', false],
            ['Compiles the Dart code', false],
          ]),
        ],
      },
      {
        title: 'Publishing your app',
        videoUrl: TECH.js1,
        quiz: [
          q('What is required before publishing an app to an app store?', [
            [
              "Meeting the store's packaging, signing, and review requirements",
              true,
            ],
            ['Nothing — apps publish automatically', false],
            ['Deleting all test code only', false],
            ['Removing all images', false],
          ]),
          q('Why test on real devices before publishing?', [
            [
              "Emulators don't always reflect real-world performance and hardware behavior",
              true,
            ],
            ['Emulators are always identical to real devices', false],
            ["It's only needed for Android", false],
            ["It's a store requirement with no practical benefit", false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Web Guild'],
  },
  {
    title: 'API Design & REST Fundamentals',
    provider: 'Encyclopedia Web Guild',
    category: 'Technical',
    level: 'Beginner',
    hours: 8,
    rating: 4.5,
    learners: 2980,
    color: 'ink',
    blurb:
      'Resources, verbs, status codes, and versioning — designing APIs people enjoy using.',
    modules: [
      {
        title: 'REST principles',
        videoUrl: TECH.js2,
        quiz: [
          q('REST APIs are typically:', [
            ['Stateless between requests', true],
            ['Always stateful', false],
            ['Only usable over FTP', false],
            ['Limited to XML payloads', false],
          ]),
          q(
            'Which HTTP verb is conventionally used to update an existing resource?',
            [
              ['PUT or PATCH', true],
              ['GET', false],
              ['OPTIONS', false],
              ['HEAD', false],
            ],
          ),
        ],
      },
      {
        title: 'Resources & HTTP verbs',
        videoUrl: TECH.html,
        quiz: [
          q('In REST, a "resource" is typically represented by:', [
            ['A URL, like /users/123', true],
            ['A CSS class', false],
            ['A database engine', false],
            ['A compiler flag', false],
          ]),
          q(
            'Which HTTP verb is conventionally used to create a new resource?',
            [
              ['POST', true],
              ['GET', false],
              ['DELETE', false],
              ['HEAD', false],
            ],
          ),
        ],
      },
      {
        title: 'Status codes & error handling',
        videoUrl: TECH.js3,
        quiz: [
          q('What does a 404 status code mean?', [
            ['The requested resource was not found', true],
            ['The request succeeded', false],
            ['The server crashed', false],
            ['The user is unauthorized', false],
          ]),
          q('What does a 500 status code generally indicate?', [
            ['An unexpected server-side error', true],
            ['A successful request', false],
            ['A client input error', false],
            ['A redirect', false],
          ]),
        ],
      },
      {
        title: 'Versioning & documentation',
        videoUrl: TECH.python,
        quiz: [
          q('Why version an API (e.g. /v1/, /v2/)?', [
            [
              'To make breaking changes without disrupting existing clients',
              true,
            ],
            ['To slow down development', false],
            ["It's purely cosmetic", false],
            ['To increase server costs', false],
          ]),
          q('Why is API documentation important?', [
            [
              'It helps consumers understand how to use the API correctly',
              true,
            ],
            ['It replaces the need for testing', false],
            ["It's only useful for internal APIs", false],
            ['It has no effect on adoption', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Web Guild'],
  },

  // ---------------- BUSINESS (13) ----------------
  {
    title: 'Product Analytics Fundamentals',
    provider: 'Encyclopedia Business School',
    category: 'Business',
    level: 'Beginner',
    hours: 10,
    rating: 4.7,
    learners: 6210,
    color: 'success',
    blurb:
      'Read a funnel, run an A/B test, and turn dashboards into decisions.',
    modules: [
      {
        title: 'Metrics that matter',
        videoUrl: TALK.creativity,
        quiz: [
          q('A "vanity metric" is one that:', [
            ["Looks good but doesn't drive decisions", true],
            ['Directly measures revenue', false],
            ['Is always misleading', false],
            ['Only applies to marketing', false],
          ]),
          q('What does "retention rate" measure?', [
            ['The share of users who come back over time', true],
            ['Total signups', false],
            ['Page load speed', false],
            ['Ad click-through rate', false],
          ]),
        ],
      },
      {
        title: 'Funnels & retention',
        videoUrl: TALK.jobs,
        quiz: [
          q('What does a "funnel" typically visualize?', [
            [
              'The steps users take toward a goal, and where they drop off',
              true,
            ],
            ['Total revenue only', false],
            ['Server uptime', false],
            ['Employee headcount', false],
          ]),
          q('A high drop-off at one funnel step usually signals:', [
            ['A friction point worth investigating', true],
            ['A successful feature', false],
            ['A billing error', false],
            ['Nothing worth reviewing', false],
          ]),
        ],
      },
      {
        title: 'Running experiments',
        videoUrl: TALK.listen,
        quiz: [
          q('What is the purpose of a control group in an A/B test?', [
            ['A baseline to compare the tested change against', true],
            ['To receive the new feature first', false],
            ['To be excluded from analysis', false],
            ['To increase sample size only', false],
          ]),
          q('What does "statistical significance" help determine?', [
            [
              'Whether an observed difference is likely real, not just chance',
              true,
            ],
            ['The exact revenue impact', false],
            ['The color scheme of a dashboard', false],
            ['Server response time', false],
          ]),
        ],
      },
      {
        title: 'Presenting findings',
        videoUrl: TALK.stress1,
        quiz: [
          q("When presenting data findings, it's best to lead with:", [
            ['The key insight and its implication', true],
            ['Every raw number collected', false],
            ['A disclaimer about data quality only', false],
            ['An unrelated anecdote', false],
          ]),
          q('Why tie findings back to a business decision?', [
            ['It makes the analysis actionable, not just informative', true],
            ["It's required by every dashboard tool", false],
            ['It hides uncertainty', false],
            ['It removes the need for context', false],
          ]),
        ],
      },
    ],
    credits: [
      'Curriculum & instruction: Encyclopedia Business School faculty',
      'Sample dashboards built with anonymized, synthetic data',
      'Experiment design framework adapted with permission from course advisors',
    ],
  },
  {
    title: 'Negotiation Essentials',
    provider: 'Encyclopedia Business School',
    category: 'Business',
    level: 'Beginner',
    hours: 6,
    rating: 4.5,
    learners: 3010,
    color: 'success',
    blurb:
      'Prepare, anchor, and close — a short course for everyday negotiations.',
    modules: [
      {
        title: 'Preparing your position',
        videoUrl: TALK.howToSpeak,
        quiz: [
          q('What is a BATNA?', [
            ['Your Best Alternative To a Negotiated Agreement', true],
            ['A type of contract clause', false],
            ['A pricing model', false],
            ['A negotiation tactic banned in most countries', false],
          ]),
          q('Why is "anchoring" effective in negotiation?', [
            [
              'The first number mentioned strongly influences the outcome',
              true,
            ],
            ['It ends the negotiation immediately', false],
            ['It guarantees a fair deal', false],
            ["It's illegal so opponents concede faster", false],
          ]),
        ],
      },
      {
        title: 'Anchoring & concessions',
        videoUrl: TALK.soundSmart,
        quiz: [
          q(
            'Why might making concessions gradually, not all at once, matter in negotiation?',
            [
              ['It signals value is being exchanged, not given away', true],
              ['It has no effect on outcomes', false],
              ['It always ends the negotiation faster', false],
              ["It's illegal in most contexts", false],
            ],
          ),
          q('What is a "concession" in negotiation?', [
            ['Something you give up to move toward agreement', true],
            ['A legal contract clause', false],
            ['A type of anchor', false],
            ['A rejection of the deal', false],
          ]),
        ],
      },
      {
        title: 'Closing the deal',
        videoUrl: TALK.stress2,
        quiz: [
          q('What is a good sign that a negotiation is ready to close?', [
            ['Both sides have addressed their key concerns', true],
            ['One side has given up completely', false],
            ['The conversation has gone on the longest', false],
            ['No terms have been discussed yet', false],
          ]),
          q('Why summarize agreed terms before closing?', [
            ['To confirm mutual understanding and avoid later disputes', true],
            ['To restart the negotiation', false],
            ["It's optional and rarely useful", false],
            ['To introduce new demands', false],
          ]),
        ],
      },
    ],
    credits: [
      'Curriculum & instruction: Encyclopedia Business School faculty',
      'Negotiation scenarios developed in-house for classroom use',
      'Icon set: Lucide (ISC License)',
    ],
  },
  {
    title: 'Financial Literacy for Managers',
    provider: 'Encyclopedia Business School',
    category: 'Business',
    level: 'Beginner',
    hours: 8,
    rating: 4.6,
    learners: 5420,
    color: 'success',
    blurb:
      'Read a P&L, build a budget, and make the business case with confidence.',
    modules: [
      {
        title: 'Reading a P&L statement',
        videoUrl: TALK.sinek,
        quiz: [
          q('What does "P&L" stand for?', [
            ['Profit and Loss', true],
            ['Payroll and Liabilities', false],
            ['Price and Leverage', false],
            ['Planning and Logistics', false],
          ]),
          q('Gross margin is calculated as:', [
            ['(Revenue − Cost of Goods Sold) ÷ Revenue', true],
            ['Revenue ÷ Total Costs', false],
            ['Net Income ÷ Revenue', false],
            ['Total Assets − Total Liabilities', false],
          ]),
        ],
      },
      {
        title: 'Budgeting basics',
        videoUrl: TALK.bodyLanguage,
        quiz: [
          q('What is the main purpose of a budget?', [
            ['Planning and controlling how money will be spent', true],
            ['Tracking employee attendance', false],
            ['Replacing a business plan', false],
            ['Setting product prices', false],
          ]),
          q('What is a "variance" in budgeting?', [
            ['The difference between budgeted and actual figures', true],
            ['A type of tax', false],
            ['A legal filing', false],
            ['A hiring metric', false],
          ]),
        ],
      },
      {
        title: 'Understanding cash flow',
        videoUrl: TALK.vulnerability,
        quiz: [
          q('What does "cash flow" refer to?', [
            ['The movement of money in and out of a business over time', true],
            ['Total company revenue only', false],
            ['Stock price', false],
            ['Employee salaries only', false],
          ]),
          q('Why can a profitable company still run out of cash?', [
            ['Revenue may be recorded before cash is actually collected', true],
            ['Profit and cash are always identical', false],
            [
              "It's impossible for a profitable company to run out of cash",
              false,
            ],
            ['Cash flow only matters for startups', false],
          ]),
        ],
      },
      {
        title: 'Making the business case',
        videoUrl: TALK.creativity,
        quiz: [
          q('A strong business case should clearly show:', [
            ['The expected costs, benefits, and risks of a proposal', true],
            ['Only the costs', false],
            ['Only the benefits', false],
            ['The org chart', false],
          ]),
          q('Why quantify the expected ROI in a business case?', [
            [
              'It helps decision-makers compare it against other priorities',
              true,
            ],
            ["It's a legal requirement", false],
            ['It guarantees approval', false],
            ['It replaces the need for a plan', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Business School'],
  },
  {
    title: 'Marketing Strategy Foundations',
    provider: 'Encyclopedia Growth Academy',
    category: 'Business',
    level: 'Beginner',
    hours: 10,
    rating: 4.5,
    learners: 4870,
    color: 'success',
    blurb:
      'Positioning, messaging, and channel strategy — the fundamentals before campaigns.',
    modules: [
      {
        title: 'Understanding your market',
        videoUrl: TALK.jobs,
        quiz: [
          q('A "target market" is:', [
            ['The specific group of customers a product is designed for', true],
            ['Every possible customer', false],
            ['Only existing customers', false],
            ["A competitor's customer base", false],
          ]),
          q('What is market segmentation used for?', [
            ['Grouping customers by shared characteristics', true],
            ['Increasing prices', false],
            ['Reducing product features', false],
            ['Hiding a product from competitors', false],
          ]),
        ],
      },
      {
        title: 'Positioning & messaging',
        videoUrl: TALK.listen,
        quiz: [
          q('What does "positioning" define for a product?', [
            [
              "How it's perceived relative to alternatives in the customer's mind",
              true,
            ],
            ['Its warehouse location', false],
            ['Its manufacturing cost', false],
            ['Its legal structure', false],
          ]),
          q('Effective messaging typically speaks to:', [
            ["The customer's needs and desired outcomes", true],
            ['Only internal company jargon', false],
            ['Competitor weaknesses exclusively', false],
            ['Generic industry buzzwords', false],
          ]),
        ],
      },
      {
        title: 'Channel strategy',
        videoUrl: TALK.stress1,
        quiz: [
          q('What does "channel strategy" determine?', [
            ['Which platforms and paths are used to reach customers', true],
            ["The company's org chart", false],
            ['Product pricing only', false],
            ['Legal compliance', false],
          ]),
          q('Why might a company use multiple marketing channels?', [
            [
              'Different channels reach different segments of the audience',
              true,
            ],
            ['To spend the entire budget as fast as possible', false],
            ["It's required by regulation", false],
            ['One channel always works for everyone', false],
          ]),
        ],
      },
      {
        title: 'Measuring what matters',
        videoUrl: TALK.howToSpeak,
        quiz: [
          q('What is a "vanity metric" in marketing?', [
            [
              "A number that looks impressive but doesn't indicate real business impact",
              true,
            ],
            ['Total revenue', false],
            ['Customer lifetime value', false],
            ['Conversion rate', false],
          ]),
          q('Why tie marketing metrics to business outcomes?', [
            ['To ensure marketing spend is actually driving results', true],
            ["It's only useful for large companies", false],
            ['It replaces creative work entirely', false],
            ['Metrics have no relation to strategy', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Growth Academy'],
  },
  {
    title: 'Agile Project Management',
    provider: 'Encyclopedia Business School',
    category: 'Business',
    level: 'Intermediate',
    hours: 12,
    rating: 4.6,
    learners: 6740,
    color: 'success',
    blurb:
      'Scrum roles, sprint planning, and retrospectives that actually improve the team.',
    modules: [
      {
        title: 'Agile principles',
        videoUrl: TALK.soundSmart,
        quiz: [
          q('Agile favors:', [
            ['Responding to change over following a rigid plan', true],
            ['Long fixed release cycles', false],
            ['No customer feedback until launch', false],
            ['Detailed upfront specs with no changes allowed', false],
          ]),
          q('A "sprint" in Scrum is:', [
            ['A fixed, short time-boxed period of work', true],
            ['An unlimited work period', false],
            ['A single meeting', false],
            ['A type of bug', false],
          ]),
        ],
      },
      {
        title: 'Scrum roles & ceremonies',
        videoUrl: TALK.stress2,
        quiz: [
          q(
            'In Scrum, who is responsible for maximizing the value of the product?',
            [
              ['The Product Owner', true],
              ['The Scrum Master', false],
              ['The CEO', false],
              ['Any random team member', false],
            ],
          ),
          q('What is the purpose of a daily stand-up?', [
            ['A short sync on progress, plans, and blockers', true],
            ['A formal performance review', false],
            ['A sales pitch to customers', false],
            ['A quarterly planning session', false],
          ]),
        ],
      },
      {
        title: 'Backlogs & sprint planning',
        videoUrl: TALK.sinek,
        quiz: [
          q('What is a "product backlog"?', [
            ['A prioritized list of work to be done', true],
            ['A log of bugs only', false],
            ['A finished feature list', false],
            ['A meeting agenda', false],
          ]),
          q('What happens during sprint planning?', [
            [
              'The team selects and commits to backlog items for the upcoming sprint',
              true,
            ],
            ["The team reviews last year's performance", false],
            ['The team writes the annual budget', false],
            ['The company sets its mission statement', false],
          ]),
        ],
      },
      {
        title: 'Retrospectives & continuous improvement',
        videoUrl: TALK.bodyLanguage,
        quiz: [
          q('What is the main goal of a sprint retrospective?', [
            [
              'Reflecting on what went well and what to improve next sprint',
              true,
            ],
            ['Assigning blame for missed deadlines', false],
            ["Planning the next quarter's roadmap", false],
            ['Reviewing the product backlog', false],
          ]),
          q('Why hold retrospectives regularly instead of once a year?', [
            ['Frequent, small improvements compound over time', true],
            ['Annual reviews are more effective', false],
            ["It's required by Scrum certification bodies only", false],
            ['It has no impact on team performance', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Business School'],
  },
  {
    title: 'Business Writing That Gets Results',
    provider: 'Encyclopedia Business School',
    category: 'Business',
    level: 'Beginner',
    hours: 5,
    rating: 4.4,
    learners: 3890,
    color: 'success',
    blurb: 'Write emails and memos people actually read — and act on.',
    modules: [
      {
        title: 'Writing with clarity',
        videoUrl: TALK.vulnerability,
        quiz: [
          q('Which of these best improves clarity in business writing?', [
            ['Leading with the key point', true],
            ['Using more jargon', false],
            ['Longer sentences', false],
            ['Passive voice throughout', false],
          ]),
          q("What's a good rule of thumb for email length?", [
            ['As short as it can be while still being clear', true],
            ['Always over 500 words', false],
            ['Never more than one sentence', false],
            ["Match the recipient's word count", false],
          ]),
        ],
      },
      {
        title: 'Structuring emails & memos',
        videoUrl: TALK.creativity,
        quiz: [
          q('What is a good structure for a business email?', [
            ['Clear subject, key point up front, then supporting detail', true],
            ['A long introduction before the main point', false],
            ['No subject line', false],
            ['Random ordering of points', false],
          ]),
          q('Why use short paragraphs in business writing?', [
            ["They're easier to scan and understand quickly", true],
            ['They look less professional', false],
            ["They're required by law", false],
            ['They reduce word count to zero', false],
          ]),
        ],
      },
      {
        title: 'Persuasive writing basics',
        videoUrl: TALK.jobs,
        quiz: [
          q('What is a key element of persuasive business writing?', [
            [
              'Clearly connecting the request to a benefit for the reader',
              true,
            ],
            ['Using as much jargon as possible', false],
            ['Avoiding any call to action', false],
            ['Writing as long as possible', false],
          ]),
          q('Why anticipate objections in persuasive writing?', [
            ['It lets you address concerns before they become blockers', true],
            ['It weakens your argument', false],
            ["It's unnecessary if the case is strong", false],
            ['It only applies to legal writing', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Business School'],
  },
  {
    title: 'Introduction to Digital Marketing',
    provider: 'Encyclopedia Growth Academy',
    category: 'Business',
    level: 'Beginner',
    hours: 9,
    rating: 4.5,
    learners: 5980,
    color: 'success',
    blurb:
      'SEO, paid ads, and email — a practical tour of the core digital channels.',
    modules: [
      {
        title: 'Digital channels overview',
        videoUrl: TALK.listen,
        quiz: [
          q('What does "organic traffic" mean?', [
            ['Visitors who arrive without paid advertising', true],
            ['Traffic only from social media', false],
            ['Bot traffic', false],
            ['Traffic from paid ads only', false],
          ]),
          q('What is a "conversion" in digital marketing?', [
            ['A visitor completing a desired action', true],
            ['A page view', false],
            ['A blocked ad', false],
            ['A bounced session', false],
          ]),
        ],
      },
      {
        title: 'SEO basics',
        videoUrl: TALK.stress1,
        quiz: [
          q('What does SEO stand for?', [
            ['Search Engine Optimization', true],
            ['Social Engagement Output', false],
            ['Site Encryption Overview', false],
            ['Sales Efficiency Objective', false],
          ]),
          q('What is a common factor that influences SEO ranking?', [
            ['Relevant, high-quality content and backlinks', true],
            ['Font color', false],
            ['Number of images on unrelated pages', false],
            ['Page load time has no effect', false],
          ]),
        ],
      },
      {
        title: 'Paid advertising fundamentals',
        videoUrl: TALK.howToSpeak,
        quiz: [
          q('What does CPC stand for in paid advertising?', [
            ['Cost Per Click', true],
            ['Customer Purchase Cycle', false],
            ['Content Publishing Calendar', false],
            ['Channel Performance Card', false],
          ]),
          q('Why set a target audience for a paid ad campaign?', [
            [
              'To reach people more likely to convert, improving efficiency',
              true,
            ],
            ["It's required by every ad platform with no benefit", false],
            ['It guarantees a sale', false],
            ['Targeting reduces ad visibility to zero', false],
          ]),
        ],
      },
      {
        title: 'Email & lifecycle marketing',
        videoUrl: TALK.soundSmart,
        quiz: [
          q('What is "lifecycle marketing"?', [
            [
              'Tailoring messaging to where a customer is in their journey',
              true,
            ],
            ['Sending the same email to everyone', false],
            ['A one-time onboarding email', false],
            ['A type of paid ad', false],
          ]),
          q('Why segment an email list?', [
            [
              'To send more relevant messages to different groups of subscribers',
              true,
            ],
            ["It's required for spam compliance only", false],
            ['It slows down delivery intentionally', false],
            ['Segmentation has no effect on open rates', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Growth Academy'],
  },
  {
    title: 'Sales Fundamentals',
    provider: 'Encyclopedia Growth Academy',
    category: 'Business',
    level: 'Beginner',
    hours: 8,
    rating: 4.4,
    learners: 4210,
    color: 'success',
    blurb:
      'Discovery, objection handling, and closing — the basics of a real sales conversation.',
    modules: [
      {
        title: 'Understanding the buyer',
        videoUrl: TALK.stress2,
        quiz: [
          q('What is "qualifying" a lead?', [
            ["Assessing whether they're a good fit and ready to buy", true],
            ['Giving them a discount', false],
            ['Sending a contract immediately', false],
            ['Ending the conversation', false],
          ]),
          q('An "objection" in a sales conversation is:', [
            ['A concern the buyer raises before deciding', true],
            ['Always a rejection', false],
            ['A legal requirement', false],
            ['The final step of a sale', false],
          ]),
        ],
      },
      {
        title: 'Discovery & qualifying',
        videoUrl: TALK.sinek,
        quiz: [
          q('What is the goal of a discovery call?', [
            [
              "Understanding the prospect's needs and whether there's a fit",
              true,
            ],
            ['Closing the deal immediately', false],
            ['Sending an invoice', false],
            ['Skipping straight to pricing', false],
          ]),
          q('What does BANT (Budget, Authority, Need, Timeline) help assess?', [
            ['Whether a lead is qualified to buy', true],
            ['Product pricing', false],
            ['Marketing channel performance', false],
            ['Website traffic', false],
          ]),
        ],
      },
      {
        title: 'Handling objections',
        videoUrl: TALK.bodyLanguage,
        quiz: [
          q('What is a good first response to a sales objection?', [
            ['Listen fully and understand the underlying concern', true],
            ['Immediately offer a discount', false],
            ['Argue that the objection is wrong', false],
            ['End the call', false],
          ]),
          q(
            'A common objection category is price. What often actually drives it?',
            [
              ['Unclear perceived value relative to cost', true],
              ['The buyer never has budget concerns', false],
              ["It's always a firm no", false],
              ['It means the deal is lost', false],
            ],
          ),
        ],
      },
      {
        title: 'Closing techniques',
        videoUrl: TALK.vulnerability,
        quiz: [
          q('What is an "assumptive close"?', [
            [
              'Proceeding as though the buyer has already decided to move forward',
              true,
            ],
            ['Waiting indefinitely for the buyer to speak first', false],
            ['Offering unlimited discounts', false],
            ['Ending the conversation with no next step', false],
          ]),
          q('Why define a clear next step at the end of a sales call?', [
            ['It keeps the deal moving instead of stalling', true],
            ["It's optional and rarely matters", false],
            ['It replaces the need for follow-up', false],
            ['It guarantees the sale', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Growth Academy'],
  },
  {
    title: 'Customer Success Strategy',
    provider: 'Encyclopedia Growth Academy',
    category: 'Business',
    level: 'Intermediate',
    hours: 10,
    rating: 4.5,
    learners: 2870,
    color: 'success',
    blurb:
      'Onboarding, health scores, and renewals — keeping customers past the first sale.',
    modules: [
      {
        title: 'Onboarding for retention',
        videoUrl: TALK.creativity,
        quiz: [
          q('"Time to value" refers to:', [
            ['How quickly a customer gets real benefit from a product', true],
            ['The length of a sales cycle', false],
            ['The cost of onboarding', false],
            ['The number of support tickets', false],
          ]),
          q('A "health score" in customer success typically combines:', [
            ['Usage, engagement, and support signals', true],
            ['Only revenue', false],
            ['Only NPS', false],
            ['Only contract length', false],
          ]),
        ],
      },
      {
        title: 'Measuring customer health',
        videoUrl: TALK.jobs,
        quiz: [
          q('What might a declining product usage trend indicate?', [
            ['Rising churn risk for that customer', true],
            ['Guaranteed renewal', false],
            ['A billing error', false],
            ['Nothing worth monitoring', false],
          ]),
          q('What is a "health score" typically built from?', [
            ['A combination of usage, engagement, and support signals', true],
            ['Only the contract value', false],
            ["Only the sales rep's opinion", false],
            ['Random assignment', false],
          ]),
        ],
      },
      {
        title: 'Managing renewals & expansion',
        videoUrl: TALK.listen,
        quiz: [
          q(
            'Why start renewal conversations well before the contract end date?',
            [
              [
                'To address concerns and demonstrate value ahead of the decision',
                true,
              ],
              ['Contracts renew automatically regardless of timing', false],
              ['It has no effect on renewal likelihood', false],
              ["It's only needed for annual contracts", false],
            ],
          ),
          q('What is "expansion revenue"?', [
            [
              'Additional revenue from existing customers upgrading or buying more',
              true,
            ],
            ['Revenue from brand-new customers only', false],
            ['One-time discounted revenue', false],
            ['Revenue that has churned', false],
          ]),
        ],
      },
      {
        title: 'Reducing churn',
        videoUrl: TALK.stress1,
        quiz: [
          q('What is "churn" in a subscription business?', [
            ["Customers who cancel or don't renew", true],
            ['New customer signups', false],
            ['Total revenue', false],
            ['Support ticket volume', false],
          ]),
          q(
            'Why is proactive outreach often more effective than reactive support for reducing churn?',
            [
              [
                'It catches at-risk customers before they decide to leave',
                true,
              ],
              ['It costs more with no benefit', false],
              ['Reactive support always works better', false],
              ['Proactive outreach is only for new customers', false],
            ],
          ),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Growth Academy'],
  },
  {
    title: 'Business Model Design',
    provider: 'Encyclopedia Business School',
    category: 'Business',
    level: 'Intermediate',
    hours: 10,
    rating: 4.5,
    learners: 3120,
    color: 'success',
    blurb: 'Value propositions, revenue models, and the business model canvas.',
    modules: [
      {
        title: 'Value propositions',
        videoUrl: TALK.howToSpeak,
        quiz: [
          q('A strong value proposition clearly states:', [
            ['The specific problem you solve and for whom', true],
            ['Every feature of the product', false],
            ["The company's founding date", false],
            ['Internal org structure', false],
          ]),
          q('Which is an example of a subscription revenue model?', [
            ['Monthly recurring fee for access', true],
            ['One-time purchase', false],
            ['Bartering goods', false],
            ['Government grant', false],
          ]),
        ],
      },
      {
        title: 'Revenue models',
        videoUrl: TALK.soundSmart,
        quiz: [
          q('What is a "freemium" revenue model?', [
            ['Offering a free tier with paid upgrades for more features', true],
            ['Charging a one-time fee only', false],
            ['Giving everything away for free permanently', false],
            ['A model with no product', false],
          ]),
          q('Which is an example of a transactional revenue model?', [
            ['Charging a fee per individual purchase', true],
            ['A flat monthly subscription', false],
            ['A membership fee regardless of use', false],
            ['Advertising-only revenue', false],
          ]),
        ],
      },
      {
        title: 'Cost structures',
        videoUrl: TALK.stress2,
        quiz: [
          q('What is a "fixed cost"?', [
            [
              "A cost that doesn't change with production or sales volume",
              true,
            ],
            ['A cost that scales directly with units sold', false],
            ['A one-time investment only', false],
            ['Revenue minus profit', false],
          ]),
          q('What is a "variable cost"?', [
            ['A cost that changes with the level of production or sales', true],
            ['Rent, which stays the same each month', false],
            ['A cost paid only once', false],
            ['A tax-exempt cost', false],
          ]),
        ],
      },
      {
        title: 'Mapping the business model canvas',
        videoUrl: TALK.sinek,
        quiz: [
          q('What does the Business Model Canvas help teams do?', [
            [
              'Visualize all the key building blocks of a business on one page',
              true,
            ],
            ['File tax returns', false],
            ['Write a legal contract', false],
            ['Design a company logo', false],
          ]),
          q(
            'Which of these is a building block in the Business Model Canvas?',
            [
              ['Customer Segments', true],
              ['Employee birthdays', false],
              ['Office floor plan', false],
              ['Font choices', false],
            ],
          ),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Business School'],
  },
  {
    title: 'Data-Driven Decision Making',
    provider: 'Encyclopedia Business School',
    category: 'Business',
    level: 'Intermediate',
    hours: 9,
    rating: 4.6,
    learners: 3560,
    color: 'success',
    blurb:
      'Ask the right question, pick the right metric, and avoid common statistical traps.',
    modules: [
      {
        title: 'Framing the right question',
        videoUrl: TALK.bodyLanguage,
        quiz: [
          q('Correlation between two metrics means:', [
            [
              "They move together, but one doesn't necessarily cause the other",
              true,
            ],
            ['One definitely causes the other', false],
            ['They are unrelated', false],
            ['The data is invalid', false],
          ]),
          q('Why is sample size important in an experiment?', [
            ['Small samples can produce unreliable, noisy results', true],
            ['It has no effect on results', false],
            ['Larger samples are always wrong', false],
            ['It only matters for surveys', false],
          ]),
        ],
      },
      {
        title: 'Choosing the right metric',
        videoUrl: TALK.vulnerability,
        quiz: [
          q('What makes a metric "actionable"?', [
            ['Changes in it clearly point to a decision or action', true],
            ["It's the easiest number to calculate", false],
            ['It never changes', false],
            ["It's only visible to executives", false],
          ]),
          q('Why is it risky to optimize for a single metric in isolation?', [
            [
              'It can create unintended trade-offs elsewhere in the business',
              true,
            ],
            ['Single metrics are always the safest choice', false],
            ['It guarantees balanced outcomes', false],
            ['It has no downside', false],
          ]),
        ],
      },
      {
        title: 'Avoiding common statistical traps',
        videoUrl: TALK.creativity,
        quiz: [
          q('What is "survivorship bias"?', [
            [
              'Drawing conclusions only from the subset that "survived," ignoring what didn\'t',
              true,
            ],
            ['A bias toward the newest data only', false],
            ['A random sampling error', false],
            ['A type of data encryption', false],
          ]),
          q('Why is a small sample size risky for drawing conclusions?', [
            ["It can produce results that don't hold up with more data", true],
            ['Small samples are always more accurate', false],
            ['Sample size never matters', false],
            ['It only affects qualitative research', false],
          ]),
        ],
      },
      {
        title: 'Communicating data to stakeholders',
        videoUrl: TALK.jobs,
        quiz: [
          q(
            'What should a data presentation to executives typically emphasize?',
            [
              [
                'The business implication of the findings, not just the numbers',
                true,
              ],
              ['Every technical detail of the analysis', false],
              ['The programming language used', false],
              ['Raw, unlabeled tables only', false],
            ],
          ),
          q('Why use visuals when communicating data findings?', [
            [
              'They help audiences grasp patterns faster than raw numbers',
              true,
            ],
            ['Visuals are only for external audiences', false],
            ['They replace the need for accuracy', false],
            ["They're required by law", false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Business School'],
  },
  {
    title: 'Supply Chain Fundamentals',
    provider: 'Encyclopedia Business School',
    category: 'Business',
    level: 'Beginner',
    hours: 8,
    rating: 4.3,
    learners: 2140,
    color: 'success',
    blurb:
      'From raw materials to the customer — inventory, logistics, and supplier relationships.',
    modules: [
      {
        title: 'Supply chain basics',
        videoUrl: TALK.listen,
        quiz: [
          q('A supply chain includes:', [
            ['Every step from raw materials to the final customer', true],
            ['Only shipping', false],
            ['Only manufacturing', false],
            ['Only retail', false],
          ]),
          q('"Just-in-time" inventory aims to:', [
            ['Minimize stock by receiving goods only as needed', true],
            ['Maximize warehouse stock', false],
            ['Eliminate suppliers', false],
            ['Increase lead times', false],
          ]),
        ],
      },
      {
        title: 'Inventory management',
        videoUrl: TALK.stress1,
        quiz: [
          q('What is a risk of holding too much inventory?', [
            ['Tied-up capital and increased storage costs', true],
            ['Never running out of stock', false],
            ['Lower storage costs', false],
            ['No risk at all', false],
          ]),
          q('What does "stockout" mean?', [
            ['Running out of inventory for a product', true],
            ['Having excess inventory', false],
            ['A pricing strategy', false],
            ['A shipping method', false],
          ]),
        ],
      },
      {
        title: 'Logistics & distribution',
        videoUrl: TALK.howToSpeak,
        quiz: [
          q('What does "logistics" primarily manage?', [
            [
              'The movement and storage of goods through the supply chain',
              true,
            ],
            ['Product design', false],
            ['Marketing campaigns', false],
            ['Employee hiring', false],
          ]),
          q('Why might a company use multiple distribution channels?', [
            [
              'To reach different customer segments and reduce dependency on one channel',
              true,
            ],
            ["It's always cheaper to use only one channel", false],
            ['Regulations require it everywhere', false],
            ['It eliminates the need for logistics', false],
          ]),
        ],
      },
      {
        title: 'Managing supplier relationships',
        videoUrl: TALK.soundSmart,
        quiz: [
          q('Why diversify suppliers rather than relying on just one?', [
            ['To reduce risk if one supplier fails or has delays', true],
            ['It always increases costs with no benefit', false],
            ['Single-supplier reliance has no risk', false],
            ["It's required by international law", false],
          ]),
          q('What is a key factor in evaluating a supplier?', [
            ['Reliability and consistency of delivery', true],
            ['Only their logo design', false],
            ['Their office location exclusively', false],
            ['Random selection', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Business School'],
  },
  {
    title: 'Entrepreneurship Essentials',
    provider: 'Encyclopedia Business School',
    category: 'Business',
    level: 'Beginner',
    hours: 12,
    rating: 4.6,
    learners: 5340,
    color: 'success',
    blurb: 'Validate an idea, build an MVP, and find product-market fit.',
    modules: [
      {
        title: 'Validating an idea',
        videoUrl: TALK.stress2,
        quiz: [
          q('An MVP is:', [
            [
              'The smallest version of a product that tests a core hypothesis',
              true,
            ],
            ['The final polished product', false],
            ['A legal document', false],
            ['A marketing slogan', false],
          ]),
          q('Why talk to potential customers before building a product?', [
            ['To validate whether the problem is real and worth solving', true],
            ["It's legally required", false],
            ['To finalize pricing', false],
            ['To hire your first employee', false],
          ]),
        ],
      },
      {
        title: 'Building a minimum viable product',
        videoUrl: TALK.sinek,
        quiz: [
          q('What is the main purpose of building an MVP?', [
            ['Testing a core hypothesis with minimal investment', true],
            ['Launching the most feature-complete product possible', false],
            ['Skipping customer feedback', false],
            ['Maximizing initial development cost', false],
          ]),
          q('What should be prioritized when scoping an MVP?', [
            [
              'The smallest set of features that tests the core value proposition',
              true,
            ],
            ['Every feature customers might eventually want', false],
            ['Visual polish over functionality', false],
            ['Features competitors already have', false],
          ]),
        ],
      },
      {
        title: 'Fundraising basics',
        videoUrl: TALK.bodyLanguage,
        quiz: [
          q('What is "equity" in the context of startup fundraising?', [
            ['Ownership stake given in exchange for investment', true],
            ['A type of loan that must be repaid with interest', false],
            ['A government grant', false],
            ['A marketing budget', false],
          ]),
          q('What do early-stage investors typically evaluate?', [
            ['The team, market size, and traction', true],
            ['Only the company logo', false],
            ['The office location exclusively', false],
            ["The founder's favorite color", false],
          ]),
        ],
      },
      {
        title: 'Finding product-market fit',
        videoUrl: TALK.vulnerability,
        quiz: [
          q('What does "product-market fit" mean?', [
            [
              'A product that strongly satisfies real demand in its target market',
              true,
            ],
            ['A product with the most features', false],
            ['A product priced the lowest in its category', false],
            ['A product with a finished logo', false],
          ]),
          q('What is a strong early signal of product-market fit?', [
            ['Customers actively using and recommending the product', true],
            ['High marketing spend', false],
            ['A large founding team', false],
            ['A long list of planned features', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Business School'],
  },

  // ---------------- LEADERSHIP (13) ----------------
  {
    title: 'Leading High-Performing Teams',
    provider: 'Encyclopedia Business School',
    category: 'Leadership',
    level: 'Advanced',
    hours: 8,
    rating: 4.6,
    learners: 4120,
    color: 'coral',
    blurb:
      'Practical frameworks for feedback, delegation, and 1:1s that actually work.',
    modules: [
      {
        title: 'Setting direction',
        videoUrl: TALK.creativity,
        quiz: [
          q('A clear team goal should be:', [
            ['Specific and measurable', true],
            ['Vague enough to allow any outcome', false],
            ['Set only by senior leadership', false],
            ['Reviewed once a year', false],
          ]),
          q('Why does delegation matter for a leader?', [
            [
              'It builds team capability and frees the leader for higher-leverage work',
              true,
            ],
            ["It reduces the leader's accountability", false],
            ['Only needed for large teams', false],
            ['It replaces the need for feedback', false],
          ]),
        ],
      },
      {
        title: 'Delegation & trust',
        videoUrl: TALK.jobs,
        quiz: [
          q('What is a common barrier to effective delegation?', [
            ['A leader believing they must do everything themselves', true],
            ['Having a skilled team', false],
            ['Clear expectations', false],
            ['Trusting the team', false],
          ]),
          q('What should accompany a delegated task for it to succeed?', [
            ['Clear expectations and the authority to act', true],
            ['No instructions at all', false],
            ['Constant micromanagement', false],
            ['Withholding context', false],
          ]),
        ],
      },
      {
        title: 'Feedback that lands',
        videoUrl: TALK.listen,
        quiz: [
          q('Effective feedback is generally:', [
            ['Specific, timely, and focused on behavior', true],
            ['Vague and delayed', false],
            ['Focused on personality', false],
            ['Delivered only in writing', false],
          ]),
          q('Why deliver feedback close to the event it relates to?', [
            ["It's more relevant and actionable while details are fresh", true],
            ['Delayed feedback is always more effective', false],
            ['Timing has no effect on impact', false],
            ["It's only a formality", false],
          ]),
        ],
      },
      {
        title: 'Running effective 1:1s',
        videoUrl: TALK.stress1,
        quiz: [
          q('What is a primary purpose of a 1:1 meeting?', [
            [
              'Giving the direct report space to raise what matters to them',
              true,
            ],
            ['Delivering only status updates from the manager', false],
            ['Replacing performance reviews entirely', false],
            ['A purely social chat with no structure', false],
          ]),
          q('Why keep 1:1s consistent and recurring?', [
            [
              'It builds trust and creates a reliable space for ongoing dialogue',
              true,
            ],
            ['One-off meetings are always more effective', false],
            ['Consistency has no impact on team relationships', false],
            ["It's only useful for new hires", false],
          ]),
        ],
      },
    ],
    credits: [
      'Curriculum & instruction: Encyclopedia Business School faculty',
      'Frameworks drawn from published leadership research, cited in-course',
      "Role-play scenarios developed with Encyclopedia's coaching partners",
    ],
  },
  {
    title: 'Coaching & Mentoring Skills',
    provider: 'Global Leadership Institute',
    category: 'Leadership',
    level: 'Intermediate',
    hours: 8,
    rating: 4.6,
    learners: 3210,
    color: 'coral',
    blurb:
      'Ask better questions, listen actively, and help others find their own answers.',
    modules: [
      {
        title: 'Coaching vs mentoring',
        videoUrl: TALK.howToSpeak,
        quiz: [
          q('Coaching typically focuses on:', [
            ['Helping someone find their own answers', true],
            ['Giving direct instructions only', false],
            ['Evaluating performance for a raise', false],
            ['Assigning tasks', false],
          ]),
          q('A "powerful question" in coaching is usually:', [
            ['Open-ended and thought-provoking', true],
            ['A yes/no question', false],
            ['Rhetorical', false],
            ["About the coach's own experience", false],
          ]),
        ],
      },
      {
        title: 'Asking powerful questions',
        videoUrl: TALK.soundSmart,
        quiz: [
          q('What makes a question "powerful" in a coaching context?', [
            ["It's open-ended and prompts genuine reflection", true],
            ['It has an obvious yes/no answer', false],
            ["It's about the coach's own experience", false],
            ["It's leading toward a predetermined answer", false],
          ]),
          q('Why avoid leading questions in coaching?', [
            [
              "They can steer someone toward the coach's answer instead of their own",
              true,
            ],
            ['Leading questions always produce better insight', false],
            ['They save time with no downside', false],
            ["They're required for good coaching", false],
          ]),
        ],
      },
      {
        title: 'Active listening',
        videoUrl: TALK.stress2,
        quiz: [
          q('What does active listening involve beyond just hearing words?', [
            ["Fully focusing on and reflecting back what's being said", true],
            ['Planning your response while the other person talks', false],
            ['Interrupting to share your own story', false],
            ['Multitasking during the conversation', false],
          ]),
          q(
            'Why paraphrase what someone said during a coaching conversation?',
            [
              ["To confirm understanding and show you're engaged", true],
              ['To change the subject', false],
              ["It's a filler technique with no purpose", false],
              ['To correct their point of view', false],
            ],
          ),
        ],
      },
      {
        title: 'Setting growth goals',
        videoUrl: TALK.sinek,
        quiz: [
          q('What makes a growth goal effective?', [
            ["It's specific and tied to the person's own motivation", true],
            ["It's set entirely by the manager with no input", false],
            ['It has no timeline', false],
            ["It's vague enough to fit anything", false],
          ]),
          q('Why revisit growth goals periodically?', [
            ['To track progress and adjust as circumstances change', true],
            ['Goals should never change once set', false],
            ["It's unnecessary once a goal is written down", false],
            ['Revisiting goals slows down growth', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Global Leadership Institute'],
  },
  {
    title: 'Conflict Resolution at Work',
    provider: 'Global Leadership Institute',
    category: 'Leadership',
    level: 'Intermediate',
    hours: 6,
    rating: 4.5,
    learners: 2890,
    color: 'coral',
    blurb:
      'De-escalate tension and facilitate conversations that actually resolve things.',
    modules: [
      {
        title: 'Understanding conflict styles',
        videoUrl: TALK.bodyLanguage,
        quiz: [
          q('Avoiding conflict entirely tends to:', [
            ['Let issues fester and resurface later', true],
            ['Always resolve the issue quietly', false],
            ['Improve trust immediately', false],
            ['Have no long-term effect', false],
          ]),
          q('A "win-win" approach to conflict aims to:', [
            [
              "Find a solution that addresses both parties' underlying needs",
              true,
            ],
            ['Ensure one side loses less', false],
            ['Avoid discussing the issue', false],
            ['Let a manager decide unilaterally', false],
          ]),
        ],
      },
      {
        title: 'De-escalating tension',
        videoUrl: TALK.vulnerability,
        quiz: [
          q(
            'What is a useful first step when de-escalating a tense conversation?',
            [
              [
                "Staying calm and acknowledging the other person's perspective",
                true,
              ],
              ['Raising your voice to regain control', false],
              ['Ending the conversation immediately', false],
              ['Assigning blame right away', false],
            ],
          ),
          q(
            'Why acknowledge emotions before addressing the facts of a conflict?',
            [
              [
                'People are more able to problem-solve once they feel heard',
                true,
              ],
              ['Emotions are irrelevant to workplace conflict', false],
              ['It wastes time better spent on facts', false],
              ['It escalates tension further', false],
            ],
          ),
        ],
      },
      {
        title: 'Facilitating a resolution conversation',
        videoUrl: TALK.creativity,
        quiz: [
          q("What is the facilitator's role in a resolution conversation?", [
            ['Guiding both sides toward a mutually acceptable outcome', true],
            ['Deciding who is right unilaterally', false],
            ["Taking one side's position", false],
            ['Avoiding any discussion of the issue', false],
          ]),
          q('Why set ground rules before a difficult conversation?', [
            ['It creates a safer, more structured space for dialogue', true],
            ['Ground rules are unnecessary formalities', false],
            ['They guarantee agreement', false],
            ['They replace the need for listening', false],
          ]),
        ],
      },
      {
        title: 'Following up after conflict',
        videoUrl: TALK.jobs,
        quiz: [
          q('Why follow up after a conflict has been "resolved"?', [
            [
              'To confirm the agreement is holding and address any recurrence early',
              true,
            ],
            ['Follow-up is unnecessary once a conversation ends', false],
            ['It reopens old wounds unnecessarily', false],
            ["It's only needed for formal HR cases", false],
          ]),
          q('What is a sign a resolution may not be holding?', [
            ['The same underlying issue starts resurfacing', true],
            ['Both parties report satisfaction', false],
            ['Communication has improved', false],
            ['No further incidents occur', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Global Leadership Institute'],
  },
  {
    title: 'Strategic Thinking for Leaders',
    provider: 'Global Leadership Institute',
    category: 'Leadership',
    level: 'Advanced',
    hours: 9,
    rating: 4.6,
    learners: 2430,
    color: 'coral',
    blurb:
      'Systems thinking, prioritization, and anticipating second-order effects.',
    modules: [
      {
        title: 'Thinking in systems',
        videoUrl: TALK.listen,
        quiz: [
          q('Systems thinking encourages leaders to:', [
            ['Consider how parts of an organization affect each other', true],
            ['Focus only on isolated tasks', false],
            ['Ignore feedback loops', false],
            ['Make decisions without context', false],
          ]),
          q('A "second-order effect" is:', [
            [
              'An indirect consequence that follows from an initial decision',
              true,
            ],
            ['The very first outcome of a decision', false],
            ['Something with no real impact', false],
            ['A type of financial metric', false],
          ]),
        ],
      },
      {
        title: 'Prioritization frameworks',
        videoUrl: TALK.stress1,
        quiz: [
          q(
            'What is the goal of a prioritization framework for a strategic leader?',
            [
              [
                'Focusing limited time and resources on what matters most',
                true,
              ],
              ['Assigning tasks alphabetically', false],
              ['Avoiding any trade-offs', false],
              ['Delegating all decisions to a committee', false],
            ],
          ),
          q(
            'Why revisit priorities periodically rather than setting them once?',
            [
              [
                'Circumstances and information change, so priorities should adapt',
                true,
              ],
              ['Priorities should never change once set', false],
              ['Revisiting priorities wastes leadership time', false],
              ['It has no effect on strategic outcomes', false],
            ],
          ),
        ],
      },
      {
        title: 'Anticipating second-order effects',
        videoUrl: TALK.howToSpeak,
        quiz: [
          q('Why consider second-order effects before making a decision?', [
            [
              'Initial actions can trigger further consequences worth anticipating',
              true,
            ],
            ['Only immediate effects ever matter', false],
            ['Second-order effects never occur in practice', false],
            ['It slows decisions with no benefit', false],
          ]),
          q('What is a risk of ignoring second-order effects?', [
            ['Unintended consequences that undermine the original goal', true],
            ['Faster decision-making with no downside', false],
            ['Better short-term outcomes always follow', false],
            ['There is no real risk', false],
          ]),
        ],
      },
      {
        title: 'Communicating strategy',
        videoUrl: TALK.soundSmart,
        quiz: [
          q('Why is clarity important when communicating strategy to a team?', [
            [
              'It helps everyone understand priorities and align their work',
              true,
            ],
            ['Ambiguity motivates better performance', false],
            ['Strategy should stay confidential from the team', false],
            ['Clarity has no effect on execution', false],
          ]),
          q('What is a common reason strategy communication fails?', [
            ["It's communicated once and never reinforced", true],
            ["It's repeated too often", false],
            ["It's explained with real examples", false],
            ['Leaders ask for questions', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Global Leadership Institute'],
  },
  {
    title: 'Emotional Intelligence at Work',
    provider: 'Global Leadership Institute',
    category: 'Leadership',
    level: 'Beginner',
    hours: 7,
    rating: 4.7,
    learners: 5210,
    color: 'coral',
    blurb:
      'Self-awareness, empathy, and managing your reactions under pressure.',
    modules: [
      {
        title: 'Self-awareness',
        videoUrl: TALK.stress2,
        quiz: [
          q('Self-awareness at work involves:', [
            ['Recognizing your own emotions and how they affect others', true],
            ['Ignoring your emotions entirely', false],
            ["Only tracking others' emotions", false],
            ['Suppressing all feedback', false],
          ]),
          q('Emotional intelligence is generally considered:', [
            ['A skill that can be developed with practice', true],
            ["A fixed trait you're born with", false],
            ['Irrelevant to leadership', false],
            ['Only useful in customer service roles', false],
          ]),
        ],
      },
      {
        title: 'Managing your reactions',
        videoUrl: TALK.sinek,
        quiz: [
          q(
            'What is a healthy way to manage a strong emotional reaction at work?',
            [
              [
                'Pausing before responding to choose a deliberate reaction',
                true,
              ],
              ['Reacting immediately without reflection', false],
              ['Suppressing the emotion permanently', false],
              ['Avoiding the person indefinitely', false],
            ],
          ),
          q('Why does self-regulation matter for leaders?', [
            [
              'It helps them respond thoughtfully rather than react impulsively under pressure',
              true,
            ],
            ['It has no effect on team dynamics', false],
            ['Leaders should show no emotion ever', false],
            ['It only matters in crisis situations', false],
          ]),
        ],
      },
      {
        title: 'Reading the room',
        videoUrl: TALK.bodyLanguage,
        quiz: [
          q('What does "reading the room" involve?', [
            ['Picking up on group dynamics and unspoken cues', true],
            ['Only listening to the loudest voice', false],
            ['Ignoring nonverbal signals', false],
            ['Following a fixed script regardless of context', false],
          ]),
          q('Why is reading the room useful in a meeting?', [
            [
              'It helps you adjust your approach to how people are actually reacting',
              true,
            ],
            ['It has no practical use', false],
            ['It replaces the need for an agenda', false],
            ['It only applies to large meetings', false],
          ]),
        ],
      },
      {
        title: 'Building empathy',
        videoUrl: TALK.vulnerability,
        quiz: [
          q('What does empathy at work primarily involve?', [
            [
              "Genuinely understanding another person's perspective and feelings",
              true,
            ],
            ['Agreeing with everyone regardless of the situation', false],
            ['Avoiding difficult conversations', false],
            ['Focusing only on your own perspective', false],
          ]),
          q('How can empathy improve team performance?', [
            [
              'It builds trust and helps address real concerns behind behavior',
              true,
            ],
            ['It has no measurable effect', false],
            ['It always slows down decision-making', false],
            ['It replaces the need for accountability', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Global Leadership Institute'],
  },
  {
    title: 'Change Management Essentials',
    provider: 'Encyclopedia Business School',
    category: 'Leadership',
    level: 'Intermediate',
    hours: 8,
    rating: 4.5,
    learners: 3020,
    color: 'coral',
    blurb:
      'Why change efforts fail, and how to build one that actually sticks.',
    modules: [
      {
        title: 'Why change efforts fail',
        videoUrl: TALK.creativity,
        quiz: [
          q('A common reason change initiatives fail is:', [
            ['Lack of clear, consistent communication about the "why"', true],
            ['Too much communication', false],
            ['Moving too slowly', false],
            ['Involving employees too early', false],
          ]),
          q('Resistance to change is usually best handled by:', [
            ['Understanding and addressing the underlying concern', true],
            ['Ignoring it until it goes away', false],
            ['Mandating compliance with no explanation', false],
            ['Punishing dissent', false],
          ]),
        ],
      },
      {
        title: 'Building a change narrative',
        videoUrl: TALK.jobs,
        quiz: [
          q('What should a strong change narrative clearly explain?', [
            ['Why the change is happening and what it means for people', true],
            ['Only the new org chart', false],
            ['Nothing — change should be self-explanatory', false],
            ['Only the executive rationale, not the impact on staff', false],
          ]),
          q(
            'Why repeat the change narrative multiple times, in multiple ways?',
            [
              [
                'People need repeated exposure to fully absorb and trust new information',
                true,
              ],
              ['One announcement is always sufficient', false],
              ['Repetition confuses employees', false],
              ["It's a legal requirement", false],
            ],
          ),
        ],
      },
      {
        title: 'Managing resistance',
        videoUrl: TALK.listen,
        quiz: [
          q(
            'What is often the most effective response to resistance to change?',
            [
              [
                'Understanding and addressing the specific underlying concern',
                true,
              ],
              ['Ignoring it and hoping it fades', false],
              ['Punishing anyone who raises concerns', false],
              ['Mandating compliance with no explanation', false],
            ],
          ),
          q('Why can early resistance sometimes be valuable?', [
            ['It can surface real risks or gaps in the change plan', true],
            ['Resistance is always irrational and should be dismissed', false],
            ['It should always be silenced immediately', false],
            ['It has no informational value', false],
          ]),
        ],
      },
      {
        title: 'Sustaining new behaviors',
        videoUrl: TALK.stress1,
        quiz: [
          q('What helps make a change stick long-term?', [
            [
              'Reinforcing new behaviors through systems, habits, and recognition',
              true,
            ],
            ['Announcing the change once and moving on', false],
            ['Removing all support after the initial rollout', false],
            ['Assuming people will remember on their own', false],
          ]),
          q('Why track progress after a change has been implemented?', [
            ['To catch backsliding and reinforce the new way of working', true],
            ['Once implemented, no further monitoring is needed', false],
            ['Tracking undermines trust', false],
            ["It's only relevant during the rollout phase", false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Business School'],
  },
  {
    title: 'Building Inclusive Teams',
    provider: 'Global Leadership Institute',
    category: 'Leadership',
    level: 'Intermediate',
    hours: 7,
    rating: 4.7,
    learners: 3980,
    color: 'coral',
    blurb: 'Understand bias, hire inclusively, and build psychological safety.',
    modules: [
      {
        title: 'Understanding bias',
        videoUrl: TALK.howToSpeak,
        quiz: [
          q('"Unconscious bias" refers to:', [
            [
              'Automatic judgments formed outside our conscious awareness',
              true,
            ],
            ['Deliberate discrimination', false],
            ['A formal HR policy', false],
            ['A type of performance review', false],
          ]),
          q('Psychological safety on a team means:', [
            ['People feel safe to speak up without fear of punishment', true],
            ['Everyone always agrees', false],
            ['No feedback is ever given', false],
            ['Conflict is avoided entirely', false],
          ]),
        ],
      },
      {
        title: 'Inclusive hiring practices',
        videoUrl: TALK.soundSmart,
        quiz: [
          q('What is one way to reduce bias in hiring?', [
            [
              'Using structured, consistent interview criteria for all candidates',
              true,
            ],
            ['Relying purely on gut feeling', false],
            ['Skipping any evaluation criteria', false],
            ['Interviewing only people from the same background', false],
          ]),
          q('Why diversify where you source candidates from?', [
            [
              'It widens the pool of qualified candidates and perspectives',
              true,
            ],
            ["It's purely a compliance checkbox with no benefit", false],
            ['Sourcing diversity has no relation to hiring outcomes', false],
            ['It guarantees a specific hiring outcome', false],
          ]),
        ],
      },
      {
        title: 'Creating psychological safety',
        videoUrl: TALK.stress2,
        quiz: [
          q('What does psychological safety on a team mean?', [
            [
              'People feel safe to speak up, ask questions, or admit mistakes',
              true,
            ],
            ['Everyone always agrees with each other', false],
            ['No one ever receives feedback', false],
            ['Conflict is avoided at all costs', false],
          ]),
          q('How can a leader help build psychological safety?', [
            [
              'Responding constructively when someone raises a concern or mistake',
              true,
            ],
            ['Publicly criticizing mistakes', false],
            ['Discouraging questions in meetings', false],
            ['Only rewarding agreement', false],
          ]),
        ],
      },
      {
        title: 'Equitable recognition & growth',
        videoUrl: TALK.sinek,
        quiz: [
          q('What does equitable recognition aim to ensure?', [
            [
              'Contributions are recognized fairly regardless of background or visibility',
              true,
            ],
            ['Only the most vocal team members are recognized', false],
            ['Recognition is given randomly', false],
            ['Recognition is based solely on tenure', false],
          ]),
          q('Why review growth and promotion patterns across a team?', [
            [
              'To catch and correct unintended disparities in opportunity',
              true,
            ],
            ['Reviewing patterns is unnecessary once hiring is done', false],
            ['It has no bearing on retention', false],
            ['It only matters for large organizations', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Global Leadership Institute'],
  },
  {
    title: 'Public Speaking & Executive Presence',
    provider: 'Global Leadership Institute',
    category: 'Leadership',
    level: 'Intermediate',
    hours: 6,
    rating: 4.6,
    learners: 4670,
    color: 'coral',
    blurb:
      'Structure a message, manage nerves, and handle Q&A with confidence.',
    modules: [
      {
        title: 'Structuring a message',
        videoUrl: TALK.bodyLanguage,
        quiz: [
          q('A strong presentation opening should:', [
            ['Grab attention and state the core message early', true],
            ['Start with a long list of credentials', false],
            ["Apologize for taking people's time", false],
            ['Bury the main point until the end', false],
          ]),
          q("What's a reliable way to reduce speaking nerves?", [
            ['Thorough preparation and practice', true],
            ['Avoiding eye contact', false],
            ['Speaking as fast as possible', false],
            ['Memorizing word-for-word with no flexibility', false],
          ]),
        ],
      },
      {
        title: 'Managing nerves',
        videoUrl: TALK.vulnerability,
        quiz: [
          q('What is an effective way to reduce speaking anxiety?', [
            ['Thorough preparation and rehearsal', true],
            ['Avoiding preparation to stay spontaneous', false],
            ['Memorizing every word with no flexibility', false],
            ['Speaking as fast as possible to finish quickly', false],
          ]),
          q('Why can reframing nervous energy as excitement help?', [
            [
              'It channels the same physiological arousal into a more useful mindset',
              true,
            ],
            ['It eliminates all physical symptoms of nerves', false],
            ['It has no psychological basis', false],
            ['It only works for experienced speakers', false],
          ]),
        ],
      },
      {
        title: 'Body language & delivery',
        videoUrl: TALK.creativity,
        quiz: [
          q(
            'What does open body language typically communicate to an audience?',
            [
              ['Confidence and approachability', true],
              ['Nervousness', false],
              ['Disinterest', false],
              ['Nothing — body language has no effect', false],
            ],
          ),
          q('Why vary vocal tone and pacing during a talk?', [
            ['It keeps the audience engaged and emphasizes key points', true],
            ['A flat, constant tone is more persuasive', false],
            ['Variation distracts from the message', false],
            ['It has no impact on audience attention', false],
          ]),
        ],
      },
      {
        title: 'Handling Q&A',
        videoUrl: TALK.jobs,
        quiz: [
          q(
            "What is a good approach when you don't know the answer to a question?",
            [
              ['Acknowledge it honestly and offer to follow up', true],
              ['Make up a plausible-sounding answer', false],
              ['Ignore the question', false],
              ['Deflect by criticizing the question', false],
            ],
          ),
          q('Why repeat or rephrase a question before answering it?', [
            [
              'It ensures you understood it and helps the whole audience hear it',
              true,
            ],
            ['It wastes time with no benefit', false],
            ["It's only necessary in large venues", false],
            ['It signals you disagree with the question', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Global Leadership Institute'],
  },
  {
    title: 'Time Management for Leaders',
    provider: 'Encyclopedia Business School',
    category: 'Leadership',
    level: 'Beginner',
    hours: 5,
    rating: 4.4,
    learners: 4390,
    color: 'coral',
    blurb: 'Prioritize what matters and protect focus time on a busy calendar.',
    modules: [
      {
        title: 'Prioritization frameworks',
        videoUrl: TALK.listen,
        quiz: [
          q('The Eisenhower Matrix sorts tasks by:', [
            ['Urgency and importance', true],
            ['Alphabetical order', false],
            ['Who assigned them', false],
            ['How long they take', false],
          ]),
          q('"Deep work" generally refers to:', [
            [
              'Focused, uninterrupted work on cognitively demanding tasks',
              true,
            ],
            ['Multitasking across many small tasks', false],
            ['Any work done after hours', false],
            ['Only physical labor', false],
          ]),
        ],
      },
      {
        title: 'Protecting focus time',
        videoUrl: TALK.stress1,
        quiz: [
          q('Why block dedicated focus time on a calendar?', [
            [
              'To protect time for deep, uninterrupted work on important tasks',
              true,
            ],
            ['To avoid ever meeting with the team', false],
            ['It has no effect on productivity', false],
            ["It's only useful for individual contributors", false],
          ]),
          q('What is a common threat to protected focus time?', [
            ['Ad hoc interruptions and unplanned meetings', true],
            ['A well-planned calendar', false],
            ['Clear priorities', false],
            ['Delegated tasks', false],
          ]),
        ],
      },
      {
        title: 'Delegation as a time tool',
        videoUrl: TALK.howToSpeak,
        quiz: [
          q('How does delegation help with time management?', [
            ["It frees up a leader's time for higher-leverage work", true],
            ['It always takes longer than doing the task yourself', false],
            ['It has no relationship to time management', false],
            ['It removes accountability from the leader', false],
          ]),
          q(
            'What is important to provide when delegating a task to save time later?',
            [
              ['Clear context and expectations up front', true],
              ['No information, to encourage independence', false],
              ['A vague deadline', false],
              ['Constant check-ins with no autonomy', false],
            ],
          ),
        ],
      },
      {
        title: 'Managing your calendar',
        videoUrl: TALK.soundSmart,
        quiz: [
          q(
            'What is a useful practice for keeping a calendar aligned with priorities?',
            [
              ['Regularly reviewing and pruning low-value meetings', true],
              ['Accepting every meeting invite automatically', false],
              ['Never reviewing the calendar', false],
              ['Scheduling every hour with no buffer', false],
            ],
          ),
          q('Why build buffer time between meetings?', [
            [
              'It allows time to process, prepare, and avoid running late',
              true,
            ],
            ['Buffers waste the whole day', false],
            ['Back-to-back meetings are always more productive', false],
            ['Buffer time has no practical benefit', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Encyclopedia Business School'],
  },
  {
    title: 'Giving and Receiving Feedback',
    provider: 'Global Leadership Institute',
    category: 'Leadership',
    level: 'Beginner',
    hours: 5,
    rating: 4.6,
    learners: 4980,
    color: 'coral',
    blurb:
      "Structure feedback that's specific and kind — and take it well yourself.",
    modules: [
      {
        title: 'Why feedback is hard',
        videoUrl: TALK.stress2,
        quiz: [
          q("Feedback is most effective when it's:", [
            ['Specific, timely, and focused on behavior', true],
            ['Vague and delivered months later', false],
            ['Focused on personality traits', false],
            ['Given only during annual reviews', false],
          ]),
          q('A good way to receive feedback is to:', [
            ['Listen fully before responding or defending', true],
            ['Interrupt to explain immediately', false],
            ['Dismiss feedback you disagree with', false],
            ['Avoid asking clarifying questions', false],
          ]),
        ],
      },
      {
        title: 'Structuring constructive feedback',
        videoUrl: TALK.sinek,
        quiz: [
          q('What is a widely used structure for constructive feedback?', [
            [
              'Describing the specific behavior, its impact, and a suggestion',
              true,
            ],
            ['Vague general statements about personality', false],
            ['Public criticism with no specifics', false],
            ['Feedback given only once a year', false],
          ]),
          q('Why focus feedback on behavior rather than character?', [
            [
              'Behavior can change; character judgments feel like personal attacks',
              true,
            ],
            ['Character feedback is always more effective', false],
            ['Behavior-focused feedback is less actionable', false],
            ["There's no meaningful difference", false],
          ]),
        ],
      },
      {
        title: 'Receiving feedback well',
        videoUrl: TALK.bodyLanguage,
        quiz: [
          q('What is a helpful mindset when receiving feedback?', [
            [
              "Listening fully before responding, even if it's uncomfortable",
              true,
            ],
            ['Immediately defending your actions', false],
            ['Dismissing feedback you disagree with right away', false],
            ['Assuming the feedback is always wrong', false],
          ]),
          q('Why ask clarifying questions when receiving feedback?', [
            ['To fully understand the concern before responding', true],
            ["Questions signal you're rejecting the feedback", false],
            ["It's unnecessary once feedback is given", false],
            ['It delays resolution with no benefit', false],
          ]),
        ],
      },
      {
        title: 'Building a feedback habit',
        videoUrl: TALK.vulnerability,
        quiz: [
          q(
            'Why give feedback regularly rather than only during annual reviews?',
            [
              [
                'It allows for timely course correction and avoids surprises',
                true,
              ],
              ['Annual reviews are always sufficient', false],
              ['Frequent feedback overwhelms people', false],
              ['It has no effect on performance', false],
            ],
          ),
          q('What helps make feedback a normal part of team culture?', [
            [
              'Leaders modeling both giving and receiving feedback openly',
              true,
            ],
            ['Only giving feedback when something goes wrong', false],
            ['Keeping feedback private and rare', false],
            ['Avoiding feedback about leaders themselves', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Global Leadership Institute'],
  },
  {
    title: 'Leading Remote & Hybrid Teams',
    provider: 'Global Leadership Institute',
    category: 'Leadership',
    level: 'Intermediate',
    hours: 7,
    rating: 4.5,
    learners: 3650,
    color: 'coral',
    blurb:
      'Communication norms, trust, and measuring outcomes instead of hours online.',
    modules: [
      {
        title: 'Remote communication norms',
        videoUrl: TALK.creativity,
        quiz: [
          q('Clear async communication norms help remote teams by:', [
            ['Reducing ambiguity about response times and expectations', true],
            ['Eliminating the need for meetings entirely', false],
            ['Requiring everyone to be online 24/7', false],
            ['Replacing all writing with video calls', false],
          ]),
          q(
            "For distributed teams, it's generally better to measure performance by:",
            [
              ['Outcomes and results', true],
              ['Hours spent logged in', false],
              ['Number of messages sent', false],
              ['Time zone overlap', false],
            ],
          ),
        ],
      },
      {
        title: 'Building trust without proximity',
        videoUrl: TALK.jobs,
        quiz: [
          q('What helps build trust on a remote team?', [
            ['Consistent follow-through and transparent communication', true],
            ['Requiring cameras on at all times', false],
            ['Monitoring every keystroke', false],
            ['Avoiding any personal connection', false],
          ]),
          q('Why is over-communication often recommended for remote teams?', [
            [
              'It compensates for the informal context normally picked up in person',
              true,
            ],
            [
              'Remote teams need less communication than in-person teams',
              false,
            ],
            ['It has no effect on remote collaboration', false],
            ['It always leads to information overload with no upside', false],
          ]),
        ],
      },
      {
        title: 'Running effective virtual meetings',
        videoUrl: TALK.listen,
        quiz: [
          q('What helps keep a virtual meeting effective?', [
            ['A clear agenda and defined outcomes', true],
            ['No agenda, to keep things flexible', false],
            [
              'Inviting as many people as possible regardless of relevance',
              false,
            ],
            ['Avoiding any structure', false],
          ]),
          q('Why send materials ahead of a virtual meeting when possible?', [
            [
              'It lets participants prepare, making discussion time more productive',
              true,
            ],
            ["Pre-reads always waste people's time", false],
            ["It's unnecessary for virtual meetings specifically", false],
            ['It replaces the need for a meeting entirely', false],
          ]),
        ],
      },
      {
        title: 'Measuring outcomes, not hours',
        videoUrl: TALK.stress1,
        quiz: [
          q(
            'Why measure remote team performance by outcomes rather than hours online?',
            [
              ['Outcomes better reflect actual value delivered', true],
              ['Hours online always reflect true productivity', false],
              ['Outcomes are impossible to measure remotely', false],
              ['It has no bearing on fairness', false],
            ],
          ),
          q('What is a risk of measuring remote workers by time logged in?', [
            ['It can reward presence over actual results', true],
            ['It always improves output quality', false],
            ['It has no downside', false],
            ['It eliminates the need for goals', false],
          ]),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Global Leadership Institute'],
  },
  {
    title: 'Decision-Making Under Uncertainty',
    provider: 'Global Leadership Institute',
    category: 'Leadership',
    level: 'Advanced',
    hours: 8,
    rating: 4.6,
    learners: 2760,
    color: 'coral',
    blurb:
      'Frame decisions, weigh incomplete information, and avoid common biases.',
    modules: [
      {
        title: 'Framing decisions under uncertainty',
        videoUrl: TALK.howToSpeak,
        quiz: [
          q('A "reversible" decision is generally best made:', [
            ['Quickly, since mistakes are cheap to correct', true],
            ['Only after months of analysis', false],
            ['Never, without full certainty', false],
            ['By committee only', false],
          ]),
          q('Confirmation bias leads decision-makers to:', [
            ['Favor information that supports what they already believe', true],
            ['Weigh all evidence equally', false],
            ['Always choose the riskiest option', false],
            ['Ignore their own opinions', false],
          ]),
        ],
      },
      {
        title: 'Weighing incomplete information',
        videoUrl: TALK.soundSmart,
        quiz: [
          q(
            'When facing incomplete information, a reasonable approach is to:',
            [
              [
                'Make the best decision possible with available evidence and adjust as new information arrives',
                true,
              ],
              ['Wait indefinitely for complete certainty', false],
              ['Ignore all available data', false],
              ['Always default to the riskiest option', false],
            ],
          ),
          q(
            'Why estimate a range of outcomes rather than a single point prediction?',
            [
              ['It better reflects genuine uncertainty in the situation', true],
              ['Single predictions are always more accurate', false],
              ['Ranges are only useful in finance', false],
              ['It removes the need for judgment', false],
            ],
          ),
        ],
      },
      {
        title: 'Avoiding common biases',
        videoUrl: TALK.stress2,
        quiz: [
          q('What is "anchoring bias"?', [
            [
              'Relying too heavily on the first piece of information encountered',
              true,
            ],
            ['Always choosing the newest information', false],
            ['A bias toward negative outcomes only', false],
            ['A statistical sampling method', false],
          ]),
          q(
            'How can seeking out disconfirming evidence help decision-making?',
            [
              [
                'It counteracts the tendency to only notice information that confirms existing beliefs',
                true,
              ],
              ['It always leads to worse decisions', false],
              ["It's unnecessary once a decision feels right", false],
              ['It has no relation to confirmation bias', false],
            ],
          ),
        ],
      },
      {
        title: 'Deciding and committing',
        videoUrl: TALK.sinek,
        quiz: [
          q(
            'Why is committing to a decision important, even under uncertainty?',
            [
              [
                'Indecision itself carries a cost, and clear commitment enables action',
                true,
              ],
              ['Commitment guarantees the decision was correct', false],
              ["It's better to never decide than risk being wrong", false],
              ['Commitment has no effect on execution', false],
            ],
          ),
          q(
            'What is a healthy way to handle a decision that turns out to be wrong?',
            [
              ['Review what was learned and adjust course', true],
              ['Ignore the outcome entirely', false],
              ['Avoid all future decisions', false],
              ['Blame the situation with no reflection', false],
            ],
          ),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Global Leadership Institute'],
  },
  {
    title: 'Building a Coaching Culture',
    provider: 'Global Leadership Institute',
    category: 'Leadership',
    level: 'Advanced',
    hours: 9,
    rating: 4.7,
    learners: 2340,
    color: 'coral',
    blurb:
      'Train managers to coach, and embed it into how the team actually works.',
    modules: [
      {
        title: 'What a coaching culture looks like',
        videoUrl: TALK.bodyLanguage,
        quiz: [
          q('In a coaching culture, managers primarily:', [
            [
              'Ask questions that help others grow, rather than just giving answers',
              true,
            ],
            ['Make every decision for their team', false],
            ['Avoid all feedback conversations', false],
            ['Focus only on quarterly reviews', false],
          ]),
          q('A key sign of a strong coaching culture is:', [
            ['Employees regularly seek and act on feedback', true],
            ['No one ever disagrees', false],
            ['Managers are rarely available', false],
            ['Coaching happens once a year', false],
          ]),
        ],
      },
      {
        title: 'Training managers to coach',
        videoUrl: TALK.vulnerability,
        quiz: [
          q('What is a core coaching skill managers need to develop?', [
            [
              'Asking questions that help others think through problems themselves',
              true,
            ],
            ['Giving answers as quickly as possible', false],
            ['Avoiding one-on-one conversations', false],
            ['Delegating all coaching to HR', false],
          ]),
          q(
            'Why invest in formal training for managers to coach, rather than assuming it comes naturally?',
            [
              [
                'Coaching is a learnable skill that improves with practice and feedback',
                true,
              ],
              ["Coaching ability is fixed and can't be developed", false],
              ['Untrained coaching is always just as effective', false],
              ['Training has no measurable impact', false],
            ],
          ),
        ],
      },
      {
        title: 'Embedding coaching in routines',
        videoUrl: TALK.creativity,
        quiz: [
          q('How can coaching become part of everyday team routines?', [
            [
              'Building it into regular 1:1s and team check-ins, not just special sessions',
              true,
            ],
            ['Reserving it only for annual reviews', false],
            ['Treating it as unrelated to daily work', false],
            ['Limiting it to underperforming employees only', false],
          ]),
          q(
            'Why is embedding coaching into routines more effective than one-off workshops?',
            [
              ['Consistent practice builds habits that stick over time', true],
              [
                'One-off workshops always have a larger long-term impact',
                false,
              ],
              ['Routines have no effect on skill development', false],
              ['It removes the need for manager buy-in', false],
            ],
          ),
        ],
      },
      {
        title: 'Measuring culture change',
        videoUrl: TALK.jobs,
        quiz: [
          q(
            'What is one way to measure whether a coaching culture is taking hold?',
            [
              [
                'Tracking whether employees increasingly seek and act on feedback',
                true,
              ],
              ['Counting the number of training slides presented', false],
              ['Measuring only executive satisfaction', false],
              ['Culture change cannot be measured', false],
            ],
          ),
          q(
            'Why use both qualitative and quantitative signals to measure culture change?',
            [
              [
                'Culture shifts show up in both survey data and lived experience, which each capture different things',
                true,
              ],
              ['Only quantitative data is ever meaningful', false],
              ['Qualitative data is unreliable and should be ignored', false],
              ['Combining signals adds no value', false],
            ],
          ),
        ],
      },
    ],
    credits: PROVIDER_CREDITS['Global Leadership Institute'],
  },
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Each course is its own transaction (rather than one giant 40-course
// transaction, or the original one-auto-commit-per-.save() behavior).
// This fixes a real failure seen while seeding: a dropped connection
// ("Connection terminated unexpectedly" — cloud Postgres closing an idle
// connection mid-script, see the keepAlive fix in data-source.ts) partway
// through a course used to leave that course half-written (e.g. the
// course + modules rows committed, but its quiz/credits/faqs missing) —
// worse, the "skip if any courses exist" guard below then blocked any
// retry from fixing it without a full wipe. Per-course transactions make
// a mid-course failure atomic (that course rolls back cleanly), and the
// retry wrapper absorbs a transient drop without losing everything
// already seeded.
async function seedCourseWithRetry(
  sample: SeedCourse,
  attempt = 1,
): Promise<void> {
  try {
    await AppDataSource.transaction(async (manager) => {
      const course = await manager.save(
        manager.create(Course, {
          title: sample.title,
          provider: sample.provider,
          category: sample.category,
          level: sample.level,
          hours: sample.hours,
          rating: sample.rating,
          learners: sample.learners,
          color: sample.color,
          blurb: sample.blurb,
        }),
      );

      const modules = await manager.save(
        sample.modules.map((m, index) =>
          manager.create(CourseModule, {
            course,
            position: index,
            title: m.title,
            videoUrl: m.videoUrl,
          }),
        ),
      );

      let quizCount = 0;
      for (let i = 0; i < sample.modules.length; i++) {
        const quiz = sample.modules[i].quiz;
        if (!quiz) continue;

        for (let qi = 0; qi < quiz.length; qi++) {
          const question = await manager.save(
            manager.create(QuizQuestion, {
              module: modules[i],
              question: quiz[qi].question,
              position: qi,
            }),
          );

          await manager.save(
            quiz[qi].options.map((opt, oi) =>
              manager.create(QuizOption, {
                question,
                optionText: opt.text,
                isCorrect: opt.correct,
                position: oi,
              }),
            ),
          );
        }
        quizCount++;
      }

      const credits = sample.credits.map((line, index) =>
        manager.create(CourseCredit, { course, position: index, line }),
      );
      await manager.save(credits);

      const faqs = CATEGORY_FAQS[sample.category].map((faq, index) =>
        manager.create(CourseFaq, {
          course,
          position: index,
          question: faq.question,
          answer: faq.answer,
        }),
      );
      await manager.save(faqs);

      console.log(
        `Seeded "${sample.title}" — ${modules.length} modules, ${quizCount} with quizzes.`,
      );
    });
  } catch (err) {
    if (attempt >= 3) throw err;
    console.warn(
      `  "${sample.title}" failed (attempt ${attempt}/3) — ${(err as Error).message}. Retrying...`,
    );
    await sleep(1000 * attempt);
    await seedCourseWithRetry(sample, attempt + 1);
  }
}

async function seed() {
  await AppDataSource.initialize();

  const courseRepo = AppDataSource.getRepository(Course);

  const existingCount = await courseRepo.count();
  if (existingCount > 0) {
    console.log(
      `Skipping seed: ${existingCount} course(s) already exist. This script only seeds an empty table — run the #144 wipe script first if you want to reseed.`,
    );
    await AppDataSource.destroy();
    return;
  }

  for (const sample of SAMPLE_COURSES) {
    await seedCourseWithRetry(sample);
  }

  console.log(`Done. Seeded ${SAMPLE_COURSES.length} courses.`);
  await AppDataSource.destroy();
}

seed().catch((err) => {
  console.error('Seed script failed:', err);
  process.exit(1);
});
