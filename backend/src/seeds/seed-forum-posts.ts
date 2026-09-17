// src/seeds/seed-forum-posts.ts
//
// #147 — seeds a learner question + trainer reply for every module
// across the #109 course set, authored by the real accounts from #145
// (not synthetic/system posts) so the forum reads like genuine
// activity rather than obviously-fake placeholder text.
//
// Threading: each module gets one top-level post (a learner question,
// parent_post_id = NULL) plus a trainer answer and one or two more
// replies (parent_post_id = the question's id) — see ForumPost's
// self-referential parent_post_id column
// (backend/src/forum/entities/forum-post.entity.ts).
//
// #500 — the trainer-answer-only thread from #147 read as fairly thin
// activity once every course/module actually had one (the "up the
// activity on every page" ask), so every thread now also gets a
// generic-but-plausible learner follow-up reply, plus a ~50% chance of a
// second trainer follow-up tip — see FOLLOWUP_LEARNER_REPLIES/
// FOLLOWUP_TRAINER_REPLIES below. These are reused across every module
// (same "real copy, not bespoke per module" tradeoff as seed-courses.ts's
// CATEGORY_FAQS) rather than hand-writing ~320 more bespoke messages.
//
// Author assignment: round-robins across the #500 seeded learners (as
// the question + follow-up author) and trainers (as the reply author) in
// course/module order, rather than trying to match each course's
// content-provider/track to a specific trainer — simpler, and every
// seeded trainer ends up with forum activity regardless of provider
// linkage from #146/#500.
//
// Depends on #145 (npm run seed:accounts) having already run — trainer
// and learner profiles are looked up by name via the ACCOUNTS list
// exported from seed-accounts.ts, and the script fails fast if any are
// missing. Does NOT depend on #146 (providers) — forum posts are
// linked to modules/authors only, independent of provider linkage.
//
// Only touches Postgres directly (profiles, course_modules,
// forum_posts) via AppDataSource — no Supabase Admin API calls needed,
// unlike seed-accounts.ts / seed-providers.ts.
//
// Idempotent at the table level, matching seed-courses.ts: skips
// entirely if forum_posts already has any rows, rather than trying to
// dedupe individual posts. Run the #144 wipe script first to reseed.
//
//   npm run seed:forum-posts
//
// Requires DATABASE_URL in .env (same as every other seed/migration).

import 'dotenv/config';
import { AppDataSource } from '../data-source';
import { ACCOUNTS } from './seed-accounts';

// (course title + module title) -> a learner question and trainer
// answer relevant to that module's actual subject matter. Keyed by the
// pair (joined with "|||") rather than module title alone, since a
// couple of module titles repeat across different courses (e.g.
// "Prioritization frameworks" appears in both Strategic Thinking for
// Leaders and Time Management for Leaders) — module title alone isn't
// a unique key.
const FORUM_CONTENT: Record<string, { question: string; answer: string }> = {
  'AI Engineering with Claude|||Prompting foundations': {
    question:
      'When should I use a system prompt versus just putting instructions in my first user message?',
    answer:
      "Use the system prompt for anything that should hold for the whole conversation — tone, role, constraints. Put task-specific details in the user message so they're easy to swap out per request.",
  },
  'AI Engineering with Claude|||Tool use & function calling': {
    question:
      'My tool calls keep failing validation — is there a way to make the model more reliable at filling in the arguments?',
    answer:
      'Tighten your JSON schema (required fields, enums, descriptions) — the more precise the schema, the more reliable the arguments. Also give one or two example calls in the tool description.',
  },
  'AI Engineering with Claude|||Retrieval & context design': {
    question:
      'How small should I make my chunks when embedding documents for retrieval?',
    answer:
      "There's no single right size — too small loses context, too large dilutes relevance. Start around 200-500 tokens with some overlap and tune based on what your retrieval actually returns.",
  },
  'AI Engineering with Claude|||Agents & evaluation': {
    question: 'How do you know when an agent is "good enough" to ship?',
    answer:
      "Build a held-out set of realistic tasks and track success rate over time — don't rely on a handful of manual spot checks, since agents can look fine in a demo and fail on edge cases.",
  },
  'AI Engineering with Claude|||Capstone project': {
    question:
      'Is it okay if my capstone only handles the happy path, given the time we have?',
    answer:
      "Handle the happy path fully, but at least demonstrate you've thought about failure modes — a couple of deliberate edge-case tests will strengthen the submission more than extra features.",
  },
  'Python for Everybody|||Getting started with Python': {
    question:
      'I keep getting "IndentationError" — what\'s actually causing that?',
    answer:
      'Python uses indentation to define code blocks, so mixing tabs and spaces (or inconsistent spacing) breaks it. Stick to 4 spaces per level and most editors will keep it consistent for you.',
  },
  'Python for Everybody|||Data structures': {
    question: 'When would I use a dictionary instead of a list?',
    answer:
      'Use a dictionary when you need to look things up by a meaningful key instead of a numeric position — for example storing student grades by name rather than by list index.',
  },
  'Python for Everybody|||Using web APIs': {
    question:
      'My API request works in the browser but fails in my script — any idea why?',
    answer:
      "Most likely you're missing a required header (like an API key) or your script isn't handling the response format correctly. Print the raw response before parsing it as JSON to see what's actually coming back.",
  },
  'Python for Everybody|||Databases': {
    question:
      "Do I need to learn SQL if I'm already comfortable with Python data structures?",
    answer:
      'Yes — for anything beyond a small dataset, the database can filter and join far more efficiently than pulling everything into Python first. Think of SQL as doing the heavy lifting before your Python code even runs.',
  },
  'Python for Everybody|||Capstone: visualize data': {
    question:
      'How do I decide what to visualize when the dataset has dozens of columns?',
    answer:
      "Start from the question you're trying to answer, not the columns available — pick the two or three variables that actually speak to that question rather than charting everything.",
  },
  'Data Visualization with Python|||Chart fundamentals': {
    question:
      'Is a pie chart ever the right choice, or should I avoid them entirely?',
    answer:
      'Pie charts work fine for a small number of categories that clearly sum to a whole, but they get hard to read past 4-5 slices — a bar chart is usually a safer default.',
  },
  'Data Visualization with Python|||Matplotlib & seaborn': {
    question: 'When should I reach for seaborn instead of plain Matplotlib?',
    answer:
      "Seaborn is great when you want good-looking statistical charts (like distributions or correlations) with less code — it's built on Matplotlib, so you can always drop down to Matplotlib for fine-grained control.",
  },
  'Data Visualization with Python|||Design & annotation': {
    question:
      'How much should I annotate a chart before it starts feeling cluttered?',
    answer:
      'Only annotate the points that matter to your story — one or two callouts on the key data point is usually more effective than labeling every value.',
  },
  'Data Visualization with Python|||Capstone: a report': {
    question:
      'Should the report include the code I used to generate the charts?',
    answer:
      'Not in the main body — keep the report focused on findings and visuals, and link to or appendix the code separately for anyone who wants to reproduce it.',
  },
  'JavaScript Fundamentals|||Variables, types & operators': {
    question:
      "What's actually the difference between let and const if I'm not reassigning the variable anyway?",
    answer:
      "Using const signals intent — it tells anyone reading the code (including future you) that the value shouldn't change, and it'll throw an error if you accidentally try to reassign it.",
  },
  'JavaScript Fundamentals|||Functions & scope': {
    question:
      'Why did my variable come back as undefined outside the function even though I set it inside?',
    answer:
      "Variables declared with let/const inside a function are scoped to that function — they don't exist outside it. If you need the value outside, return it from the function.",
  },
  'JavaScript Fundamentals|||Arrays & objects': {
    question:
      "What's the easiest way to remove a specific item from an array by value, not by index?",
    answer:
      'filter() is usually cleanest — array.filter(item => item !== valueToRemove) returns a new array without that value, without mutating the original.',
  },
  'JavaScript Fundamentals|||DOM basics': {
    question:
      "My event listener doesn't fire on elements added after the page loads — why?",
    answer:
      "You attached the listener directly to elements that didn't exist yet. Use event delegation — attach the listener to a parent element and check event.target — so it works for elements added later too.",
  },
  'Modern Web Development with React|||Components & JSX': {
    question:
      'Why does React complain when I return two sibling elements from a component?',
    answer:
      "A component can only return one root element — wrap the siblings in a <div> or a fragment (<>...</>) if you don't want an extra DOM node.",
  },
  'Modern Web Development with React|||State & props': {
    question: 'When should something be state versus just a prop passed down?',
    answer:
      "If a component owns the data and it can change over time, it's state. If a component just receives data from its parent to display or use, it's a prop — don't duplicate state that's already available as a prop.",
  },
  'Modern Web Development with React|||Hooks in practice': {
    question:
      'My useEffect runs on every render even though I only want it to run once — what am I missing?',
    answer:
      "Pass an empty dependency array ([]) as the second argument — without it, the effect re-runs after every render because there's no dependency list to compare against.",
  },
  'Modern Web Development with React|||Routing & data fetching': {
    question:
      'Should I fetch data in the component itself or higher up in the route?',
    answer:
      'For most small apps, fetching in the component that needs the data (inside a useEffect) is simplest. As the app grows, moving fetches to route loaders keeps components focused on rendering.',
  },
  'Introduction to SQL & Databases|||Querying with SELECT': {
    question: 'Is SELECT * ever a bad idea, or is it just a style preference?',
    answer:
      "It's more than style — selecting only the columns you need is faster, uses less memory, and makes your query resilient to schema changes you don't care about.",
  },
  'Introduction to SQL & Databases|||Filtering & sorting': {
    question:
      'Why does my WHERE clause with a date comparison return no rows even though I know matching data exists?',
    answer:
      'Check the actual stored format — dates are often stored as timestamps, so an exact string match can silently fail. Try a range comparison (>= and <) instead of equality.',
  },
  'Introduction to SQL & Databases|||Joins': {
    question:
      "What's the practical difference between INNER JOIN and LEFT JOIN?",
    answer:
      "INNER JOIN only returns rows with a match in both tables; LEFT JOIN keeps every row from the left table even if there's no match, filling the right side with NULLs.",
  },
  'Introduction to SQL & Databases|||Aggregation & grouping': {
    question:
      'Why do I get an error when I add a non-aggregated column to a query with GROUP BY?',
    answer:
      "Every selected column has to either be in the GROUP BY clause or wrapped in an aggregate function — the database doesn't know which single value to show for an ungrouped column across multiple rows.",
  },
  'Cloud Computing Foundations (AWS)|||Cloud concepts': {
    question:
      'Is cloud computing always cheaper than running your own servers?',
    answer:
      'Not always — pay-as-you-go is great for variable or unpredictable workloads, but steady, high-volume workloads can sometimes be cheaper on owned hardware. The main win is flexibility, not automatic cost savings.',
  },
  'Cloud Computing Foundations (AWS)|||Compute & storage basics': {
    question:
      'When would I use object storage like S3 instead of a regular database?',
    answer:
      'Object storage is for files — images, backups, logs, large blobs — not for data you need to query or update in place. Use a database when you need structured queries; object storage when you need durable file storage.',
  },
  'Cloud Computing Foundations (AWS)|||Networking essentials': {
    question:
      "What's the point of a VPC if my app is already behind a load balancer?",
    answer:
      "A VPC isolates your resources into a private network you control, so only what you explicitly expose (like through the load balancer) is reachable from outside — it's a security boundary, not a routing tool.",
  },
  'Cloud Computing Foundations (AWS)|||Cost & security basics': {
    question: 'How do I avoid an unexpectedly huge cloud bill as a beginner?',
    answer:
      "Set up billing alerts before you start experimenting, and shut down or destroy resources (especially databases and large instances) when you're done testing — idle resources are the most common source of surprise costs.",
  },
  'DevOps & CI/CD Pipelines|||CI/CD concepts': {
    question:
      "What's actually the difference between continuous delivery and continuous deployment?",
    answer:
      'Continuous delivery means every change is automatically tested and ready to release, but a human still triggers the release. Continuous deployment goes one step further and releases automatically once it passes.',
  },
  'DevOps & CI/CD Pipelines|||Building a pipeline': {
    question:
      'Should every commit trigger a full pipeline run, even for tiny changes?',
    answer:
      'Generally yes for correctness, but you can speed things up by caching dependencies and only running the full test suite on the branches that matter, like main or a release branch.',
  },
  'DevOps & CI/CD Pipelines|||Automated testing in CI': {
    question:
      'Our CI is slow because of a flaky end-to-end test — should we just remove it?',
    answer:
      'Fix or quarantine it instead of deleting it outright — a flaky test is still catching something real some of the time. Move it to a separate, non-blocking job while you investigate.',
  },
  'DevOps & CI/CD Pipelines|||Deployment strategies': {
    question:
      "What's the actual benefit of a canary release over just deploying to everyone at once?",
    answer:
      "It limits the blast radius — if something's broken, only a small percentage of users are affected before you catch it and roll back, instead of every user hitting the bug at once.",
  },
  'Machine Learning Foundations|||Supervised vs unsupervised learning': {
    question: 'How do I know if my problem is supervised or unsupervised?',
    answer:
      "If you have labeled examples of the outcome you're trying to predict, it's supervised. If you're just trying to find structure or groupings in unlabeled data, it's unsupervised.",
  },
  'Machine Learning Foundations|||Regression & classification': {
    question:
      'Can I use a classification model output as a regression input, or are they totally separate approaches?',
    answer:
      "They solve different problems, but you can combine them — for example, classify a customer's segment and then run a regression model within that segment. Just don't expect one model to naturally do both.",
  },
  'Machine Learning Foundations|||Model evaluation': {
    question: 'My model has 95% accuracy — is that automatically good?',
    answer:
      'Not necessarily — check the class balance first. If only 5% of cases are positive, a model that always predicts "negative" would already hit 95% accuracy while being useless. Look at precision/recall too.',
  },
  'Machine Learning Foundations|||Overfitting & regularization': {
    question:
      'How can I tell if my model is overfitting versus just being a genuinely strong fit?',
    answer:
      'Compare training accuracy to validation accuracy — if training performance is much higher than validation performance, that gap is the tell-tale sign of overfitting.',
  },
  'Cybersecurity Essentials|||Threats & attack vectors': {
    question:
      'Is phishing really still one of the biggest threats, given how much awareness training exists now?',
    answer:
      'Yes — it remains one of the most common entry points precisely because it targets people, not systems. Technical defenses help, but a single convincing email can still bypass all of them.',
  },
  'Cybersecurity Essentials|||Authentication & access control': {
    question:
      'Is MFA still worth requiring if our passwords are already strong?',
    answer:
      'Yes — a strong password can still be phished, leaked in a breach, or reused elsewhere. MFA protects you even when the password itself is compromised.',
  },
  'Cybersecurity Essentials|||Securing web applications': {
    question:
      'If we use an ORM, are we automatically protected from SQL injection?',
    answer:
      "Mostly, yes, as long as you consistently use parameterized queries through the ORM — but any place you drop into raw SQL with string concatenation reopens the risk, so it's not automatic in every case.",
  },
  'Cybersecurity Essentials|||Incident response basics': {
    question:
      "What's the very first thing we should do when we suspect a breach, before anything else?",
    answer:
      "Contain it — isolate the affected system so the damage doesn't spread — before you start deep investigation. You can preserve logs for later analysis, but stopping the bleeding comes first.",
  },
  'Git & Version Control for Teams|||Git basics': {
    question: "What's actually the difference between git add and git commit?",
    answer:
      "git add stages changes — tells Git which changes you want included in the next snapshot. git commit actually saves that staged snapshot to the project's history.",
  },
  'Git & Version Control for Teams|||Branching & merging': {
    question:
      'How long is too long to keep a feature branch open before merging?',
    answer:
      "As a rule of thumb, if it's been open more than a few days, it's probably drifted far enough from main to make merging painful — smaller, more frequent merges are almost always easier.",
  },
  'Git & Version Control for Teams|||Pull requests & code review': {
    question: 'How detailed should a PR description be for a small bug fix?',
    answer:
      "Even for a small fix, briefly explain what was broken and why your change fixes it — reviewers shouldn't have to reverse-engineer the bug from the diff alone.",
  },
  'Git & Version Control for Teams|||Resolving conflicts': {
    question:
      "I'm scared of messing up a merge conflict resolution — any tips for staying safe?",
    answer:
      'Make sure your branch is committed before you start, so you can always abort the merge and try again. Read both versions carefully rather than blindly picking one side, and test after resolving.',
  },
  'Backend Engineering with Node.js|||Node.js & npm basics': {
    question:
      "Why does my project have a node_modules folder that's way bigger than my actual code?",
    answer:
      "That's normal — node_modules contains every dependency (and their dependencies) your project needs to run. It's regenerable from package.json, which is why it's usually gitignored.",
  },
  'Backend Engineering with Node.js|||Building REST APIs with Express': {
    question:
      'Should validation logic live in the route handler or somewhere else?',
    answer:
      'Keep it out of the route handler where possible — middleware or a dedicated validation layer keeps your route handlers focused on the actual business logic instead of repeating validation everywhere.',
  },
  'Backend Engineering with Node.js|||Working with databases': {
    question: 'Is it bad to open a new database connection for every request?',
    answer:
      "Yes, at any real scale — that's expensive and can exhaust the database's connection limit quickly. Use a connection pool so requests share a small set of reusable connections.",
  },
  'Backend Engineering with Node.js|||Authentication & middleware': {
    question:
      "What's the actual difference between authentication and authorization middleware?",
    answer:
      "Authentication checks who you are (verifying the token/session); authorization checks what you're allowed to do (like whether this user can edit this resource). They're often separate middleware for exactly that reason.",
  },
  'Mobile App Development with Flutter|||Dart & Flutter basics': {
    question:
      'Do I need to know Dart really well before starting Flutter, or can I learn them together?',
    answer:
      "You can absolutely learn them together — Dart's syntax is approachable if you know any C-style language, and most of what trips people up early on is Flutter's widget model, not Dart itself.",
  },
  'Mobile App Development with Flutter|||Widgets & layout': {
    question:
      "My layout keeps overflowing on smaller screens — what's the fix?",
    answer:
      'Wrap the overflowing content in something scrollable (like a ListView) or a flexible widget (like Expanded/Flexible) instead of a fixed-size Row/Column — that lets it adapt to the available space.',
  },
  'Mobile App Development with Flutter|||State management': {
    question:
      'Do I really need a state management library for a small app, or is setState enough?',
    answer:
      "For a small app, setState is genuinely enough — reach for a dedicated state management approach once you notice you're passing state through many widget layers just to reach a distant child.",
  },
  'Mobile App Development with Flutter|||Publishing your app': {
    question:
      'How long does app store review usually take, so I can plan around it?',
    answer:
      "It varies by platform and can range from a few hours to a few days — build in buffer time before any hard deadline, and don't assume a same-day approval.",
  },
  'API Design & REST Fundamentals|||REST principles': {
    question: 'What does "stateless" actually mean in practice for a REST API?',
    answer:
      "It means the server doesn't remember anything about the client between requests — every request must carry all the information (like auth tokens) needed to process it on its own.",
  },
  'API Design & REST Fundamentals|||Resources & HTTP verbs': {
    question:
      "Is it wrong to use POST for something that's technically just fetching data?",
    answer:
      "It goes against REST conventions — GET should be safe and idempotent for fetching. If you're using POST because the query is too complex for a URL, that's a sign to reconsider the endpoint design.",
  },
  'API Design & REST Fundamentals|||Status codes & error handling': {
    question: 'Should validation errors return 400 or 422?',
    answer:
      'Either is defensible, but 422 (Unprocessable Entity) is more precise for "well-formed request, but the data itself is invalid" — many APIs use 400 as a catch-all instead, which is fine too as long as you\'re consistent.',
  },
  'API Design & REST Fundamentals|||Versioning & documentation': {
    question:
      'Is versioning the URL (like /v2/) still the standard approach, or has that fallen out of favor?',
    answer:
      "URL versioning is still widely used because it's simple and explicit, though header-based versioning is common too. Whichever you pick, the important part is committing to it consistently across the API.",
  },
  'Product Analytics Fundamentals|||Metrics that matter': {
    question: 'How do I convince my team to stop tracking vanity metrics?',
    answer:
      "Tie every metric you propose dropping to a decision it currently doesn't inform — once it's clear a number isn't changing anyone's actions, it's much easier to get buy-in to retire it.",
  },
  'Product Analytics Fundamentals|||Funnels & retention': {
    question: 'Is a big drop-off at one funnel step always a problem?',
    answer:
      "Not always — some drop-off is expected and healthy (like people browsing without buying). Compare the rate against a baseline or similar step before assuming it's a real problem.",
  },
  'Product Analytics Fundamentals|||Running experiments': {
    question:
      'How long should we run an A/B test before calling a result significant?',
    answer:
      'Long enough to reach your pre-calculated sample size, not just until the numbers look good — stopping early because a result looks promising is one of the most common ways to get a false positive.',
  },
  'Product Analytics Fundamentals|||Presenting findings': {
    question:
      "How do I present a finding that doesn't fully support what the team hoped to hear?",
    answer:
      "Lead with the data, not an apology — presenting it clearly and neutrally, along with what you'd recommend doing next, builds more trust than softening or burying the result.",
  },
  'Negotiation Essentials|||Preparing your position': {
    question:
      'How much should I actually share about my constraints going into a negotiation?',
    answer:
      "Share enough to build trust and find common ground, but keep your walk-away point to yourself — knowing your own BATNA gives you leverage precisely because the other side doesn't know it.",
  },
  'Negotiation Essentials|||Anchoring & concessions': {
    question:
      'Is it risky to make the first offer, or should I always wait for the other side?',
    answer:
      'Going first can actually work in your favor — it anchors the conversation around your number. The risk is anchoring too aggressively without any research to back it up.',
  },
  'Negotiation Essentials|||Closing the deal': {
    question: 'How do I close without seeming pushy?',
    answer:
      'Summarize what\'s been agreed and propose a clear, specific next step — that reads as organized, not pushy. Vague language like "let\'s touch base" is what actually stalls momentum.',
  },
  'Financial Literacy for Managers|||Reading a P&L statement': {
    question:
      "What's the first thing I should look at when I open a P&L I've never seen before?",
    answer:
      'Start at the top line (revenue) and bottom line (net income), then work through gross margin — that gives you the shape of the business before you get lost in the line items.',
  },
  'Financial Literacy for Managers|||Budgeting basics': {
    question: 'How often should a team budget actually be revisited?',
    answer:
      "Monthly is common for active tracking, with a deeper quarterly review — waiting until year-end to check variance means you've lost most of the chance to correct course.",
  },
  'Financial Literacy for Managers|||Understanding cash flow': {
    question:
      'How can a company be profitable on paper but still struggle to pay its bills?',
    answer:
      'Profit is recorded when revenue is earned, not when cash actually arrives — if customers pay slowly or expenses hit before revenue lands, you can be profitable and still cash-poor at the same time.',
  },
  'Financial Literacy for Managers|||Making the business case': {
    question:
      "What's the biggest mistake people make when pitching a new initiative?",
    answer:
      'Leading with enthusiasm instead of numbers — decision-makers want to see the expected cost, benefit, and risk clearly laid out before they engage with how exciting the idea is.',
  },
  'Marketing Strategy Foundations|||Understanding your market': {
    question:
      "How narrow should a target market be when we're just starting out?",
    answer:
      'Narrower than feels comfortable — trying to appeal to everyone usually means your messaging resonates with no one. Nail one segment first, then expand.',
  },
  'Marketing Strategy Foundations|||Positioning & messaging': {
    question: 'How is positioning different from just writing a good tagline?',
    answer:
      "A tagline is one expression of positioning, not the strategy itself — positioning is the underlying decision about who you're for and why you're different, which should show up consistently across everything, not just a slogan.",
  },
  'Marketing Strategy Foundations|||Channel strategy': {
    question:
      'Should a small company try to be present on every marketing channel?',
    answer:
      'No — spreading thin across every channel usually means doing all of them poorly. Focus on the one or two channels where your actual audience spends time and do those well.',
  },
  'Marketing Strategy Foundations|||Measuring what matters': {
    question:
      "Our engagement numbers look great but sales haven't moved — what should we check?",
    answer:
      "That's often a sign you're optimizing for a vanity metric — check whether engagement is actually happening with people who are likely to buy, not just people who are easy to engage.",
  },
  'Agile Project Management|||Agile principles': {
    question:
      'Isn\'t "responding to change" just an excuse for not planning properly?',
    answer:
      "It's the opposite — Agile still plans, just in shorter cycles so the plan can absorb new information instead of ignoring it until the end. The alternative (a rigid year-long plan) often breaks harder when reality changes.",
  },
  'Agile Project Management|||Scrum roles & ceremonies': {
    question:
      'What happens if the Product Owner and Scrum Master roles overlap on a small team?',
    answer:
      "It happens on small teams, but it's worth being deliberate about which hat is on at a given moment — Product Owner prioritizes what to build, Scrum Master protects how the team works. Blurring them can create conflicting incentives.",
  },
  'Agile Project Management|||Backlogs & sprint planning': {
    question: 'How far ahead should the backlog realistically be groomed?',
    answer:
      'Enough for the next sprint or two to be well-defined — anything further out should stay rough, since detailed grooming on distant work is often wasted effort as priorities shift.',
  },
  'Agile Project Management|||Retrospectives & continuous improvement': {
    question:
      "Our retros keep surfacing the same issues without anything changing — what's going wrong?",
    answer:
      "That usually means action items aren't being tracked or owned — a retro that doesn't produce a concrete, assigned follow-up is really just a venting session.",
  },
  'Business Writing That Gets Results|||Writing with clarity': {
    question: 'How do I make my emails shorter without sounding curt?',
    answer:
      "Cut the throat-clearing at the start (context the reader doesn't need yet) and lead with your point — brevity reads as respectful of the reader's time, not rude, as long as the tone stays warm.",
  },
  'Business Writing That Gets Results|||Structuring emails & memos': {
    question: 'Should the ask always come first, even in a longer email?',
    answer:
      'For most business emails, yes — busy readers often only read the first line or two. If you need to build context first, at least flag the ask in the subject line or opening sentence.',
  },
  'Business Writing That Gets Results|||Persuasive writing basics': {
    question:
      "How do I write persuasively without sounding like I'm selling something?",
    answer:
      "Focus on the reader's benefit, not your own agenda — persuasive writing that centers what's in it for them reads as helpful, not salesy.",
  },
  'Introduction to Digital Marketing|||Digital channels overview': {
    question: 'With so many channels, how do we pick where to start?',
    answer:
      "Start with where your actual customers already spend time, not where it's trendy to be — a smaller, well-researched channel list beats trying to cover everything from day one.",
  },
  'Introduction to Digital Marketing|||SEO basics': {
    question: 'How long does SEO actually take to show results?',
    answer:
      "Realistically months, not weeks — it's a compounding investment. If you need fast visibility, pair it with paid channels while the organic work builds up in the background.",
  },
  'Introduction to Digital Marketing|||Paid advertising fundamentals': {
    question: 'Is a lower CPC always a sign the campaign is doing well?',
    answer:
      'Not on its own — a cheap click that never converts is worse than a pricier one that does. Look at cost per conversion, not just cost per click.',
  },
  'Introduction to Digital Marketing|||Email & lifecycle marketing': {
    question:
      "Isn't sending fewer emails always better for avoiding unsubscribes?",
    answer:
      "Not necessarily — relevance matters more than frequency. A well-segmented, useful email is welcomed; an irrelevant one feels like spam even if it's rare.",
  },
  'Sales Fundamentals|||Understanding the buyer': {
    question:
      'How do you tell a genuinely interested prospect from someone just being polite?',
    answer:
      'Listen for specific questions about implementation, timeline, or budget — vague enthusiasm without any of those follow-up questions is often just politeness, not real intent.',
  },
  'Sales Fundamentals|||Discovery & qualifying': {
    question: 'Is it rude to ask about budget early in a sales conversation?',
    answer:
      "Not if you frame it as making sure you don't waste their time — most buyers appreciate directness once you've established some rapport, rather than dragging the question out.",
  },
  'Sales Fundamentals|||Handling objections': {
    question:
      "What if the objection is something I genuinely can't fix, like the price?",
    answer:
      "Then the conversation shifts to value, not price — help them see the cost of not solving the problem. If it's truly not a fit, it's better to know that early than force it.",
  },
  'Sales Fundamentals|||Closing techniques': {
    question: 'Does an assumptive close ever come across as too pushy?',
    answer:
      "It can, if the groundwork hasn't been laid — it works best after the buyer has already signaled they're ready, not as a way to force a decision they haven't reached yet.",
  },
  'Customer Success Strategy|||Onboarding for retention': {
    question:
      "What's the single biggest predictor of whether a customer sticks around?",
    answer:
      'How quickly they reach real value in onboarding — "time to value" is one of the strongest predictors of retention, more than almost any feature on the product itself.',
  },
  'Customer Success Strategy|||Measuring customer health': {
    question: 'Should every customer get the same health score criteria?',
    answer:
      'Not necessarily — different customer segments can have different signals of health. A good score reflects what actually predicts churn for that segment, not a one-size-fits-all formula.',
  },
  'Customer Success Strategy|||Managing renewals & expansion': {
    question: 'How early is too early to start a renewal conversation?',
    answer:
      "It's rarely too early — starting well before the contract ends gives you time to address concerns and show value, rather than scrambling at the last minute.",
  },
  'Customer Success Strategy|||Reducing churn': {
    question: 'Is it worth trying to save every customer who wants to cancel?',
    answer:
      "Not always — sometimes a customer isn't a good fit and saving them just delays inevitable churn. Focus retention efforts on customers who are a good fit but hit a fixable problem.",
  },
  'Business Model Design|||Value propositions': {
    question: 'How is a value proposition different from a list of features?',
    answer:
      'Features describe what the product does; a value proposition describes the specific problem it solves and for whom — customers care about the second one, not the first.',
  },
  'Business Model Design|||Revenue models': {
    question: 'Is a subscription model always better than a one-time purchase?',
    answer:
      'Not always — it depends on how the customer gets ongoing value. Subscriptions work well for continuously delivered value; a one-time purchase can be the right fit for something used once and done.',
  },
  'Business Model Design|||Cost structures': {
    question: 'Why does it matter whether a cost is fixed or variable?',
    answer:
      'It changes how the business behaves at scale — fixed costs get diluted as volume grows, while variable costs scale with it. That distinction drives a lot of pricing and growth decisions.',
  },
  'Business Model Design|||Mapping the business model canvas': {
    question:
      'Is the business model canvas just for startups, or useful for existing businesses too?',
    answer:
      "It's useful anytime you want to rethink or communicate how a business creates and captures value — existing businesses use it to spot gaps or plan a pivot, not just at the founding stage.",
  },
  'Data-Driven Decision Making|||Framing the right question': {
    question:
      'Why does the framing of a question matter if the data is the same either way?',
    answer:
      'Because the framing determines what you even measure — a poorly framed question can lead you to collect the wrong data entirely, no matter how rigorous the analysis afterward.',
  },
  'Data-Driven Decision Making|||Choosing the right metric': {
    question:
      "How do I avoid picking a metric that's easy to measure but not actually useful?",
    answer:
      "Ask what decision the metric would change — if you can't name one, it's probably not the right metric to track, no matter how easy it is to pull.",
  },
  'Data-Driven Decision Making|||Avoiding common statistical traps': {
    question:
      "What's a statistical trap people fall into most often in business settings?",
    answer:
      "Mistaking correlation for causation — two metrics moving together doesn't mean one is driving the other, and acting like it does can lead to fixing the wrong problem.",
  },
  'Data-Driven Decision Making|||Communicating data to stakeholders': {
    question:
      'How technical should a data presentation to executives actually be?',
    answer:
      "Lead with the business implication, not the methodology — most executives want to know what to do next, and they'll ask about the details if they need to.",
  },
  'Supply Chain Fundamentals|||Supply chain basics': {
    question: 'Where does a supply chain actually start and end?',
    answer:
      "It spans everything from raw materials to the final customer — it's easy to think of it as just shipping, but sourcing and manufacturing are just as much a part of it.",
  },
  'Supply Chain Fundamentals|||Inventory management': {
    question: 'Is it always better to hold more inventory as a safety buffer?',
    answer:
      'Not necessarily — excess inventory ties up capital and increases storage costs. The goal is balancing stockout risk against those costs, not maximizing buffer size.',
  },
  'Supply Chain Fundamentals|||Logistics & distribution': {
    question:
      'Is using multiple distribution channels always worth the added complexity?',
    answer:
      'It depends on your customers — if different segments need different channels, the added reach can be worth it. If one channel already reaches everyone well, added channels may just add cost.',
  },
  'Supply Chain Fundamentals|||Managing supplier relationships': {
    question:
      "Isn't relying on one reliable supplier simpler than managing several?",
    answer:
      'Simpler, but riskier — a single point of failure means any disruption on their end stops your supply chain entirely. A little redundancy is usually worth the added coordination.',
  },
  'Entrepreneurship Essentials|||Validating an idea': {
    question: 'How do you validate an idea before spending money building it?',
    answer:
      'Talk to potential customers before writing any code — even informal conversations can reveal whether the problem is real and worth solving, long before an MVP is needed.',
  },
  'Entrepreneurship Essentials|||Building a minimum viable product': {
    question:
      'How do I decide what to leave out of an MVP without gutting the idea?',
    answer:
      "Keep only what's needed to test your core hypothesis — if a feature doesn't help you learn whether the idea works, it can wait for a later version.",
  },
  'Entrepreneurship Essentials|||Fundraising basics': {
    question: 'What do early investors actually care about most?',
    answer:
      'Usually the team and the size of the opportunity more than the product itself at this stage — investors are often betting on whether this team can execute and adapt, not just the current pitch deck.',
  },
  'Entrepreneurship Essentials|||Finding product-market fit': {
    question:
      "How do you know when you've actually found product-market fit versus just early enthusiasm?",
    answer:
      "Look for customers actively using and recommending the product without much prompting — early enthusiasm fades fast if the product isn't solving a real, persistent problem.",
  },
  'Leading High-Performing Teams|||Setting direction': {
    question: 'How specific should a team goal be to actually be useful?',
    answer:
      'Specific enough that two people would independently agree on whether it was hit — vague goals like "improve quality" are hard to rally a team around because no one agrees what success looks like.',
  },
  'Leading High-Performing Teams|||Delegation & trust': {
    question:
      "How do I delegate without it feeling like I'm just dumping work?",
    answer:
      "Give context on why the task matters and the outcome you need, not just a list of steps — that's what makes delegation feel like trust instead of just offloading.",
  },
  'Leading High-Performing Teams|||Feedback that lands': {
    question: 'Why does feedback I think is constructive sometimes land badly?',
    answer:
      "Often it's timing or specificity — vague or delayed feedback feels more like judgment than help. Tying it to a specific, recent behavior makes it easier to hear and act on.",
  },
  'Leading High-Performing Teams|||Running effective 1:1s': {
    question: 'My 1:1s keep turning into status updates — how do I fix that?',
    answer:
      'Let the direct report set the agenda for at least part of the time — status updates can happen async; 1:1 time is more valuable spent on what they actually want to raise.',
  },
  'Coaching & Mentoring Skills|||Coaching vs mentoring': {
    question: 'When should I coach someone versus just giving them the answer?',
    answer:
      'Coach when they have the ability to work through it themselves and would grow from doing so; give a direct answer when time is tight or the stakes of getting it wrong are high.',
  },
  'Coaching & Mentoring Skills|||Asking powerful questions': {
    question:
      'How do I avoid my questions sounding leading, even when I have an opinion?',
    answer:
      'Notice if your question already contains the answer you want — genuinely open questions ("what have you considered?") leave more room than ones that steer toward a specific response.',
  },
  'Coaching & Mentoring Skills|||Active listening': {
    question:
      'I catch myself planning what to say next instead of actually listening — how do I stop that?',
    answer:
      'Try summarizing what you heard before responding — it forces you to actually process their point first, and it shows them you were listening, not just waiting for your turn.',
  },
  'Coaching & Mentoring Skills|||Setting growth goals': {
    question:
      "What if someone's growth goal isn't aligned with what the business needs right now?",
    answer:
      "Look for the overlap rather than picking one over the other — there's often a version of the goal that serves both, and a goal with zero personal motivation rarely sticks anyway.",
  },
  'Conflict Resolution at Work|||Understanding conflict styles': {
    question: 'Is avoiding conflict ever actually the right call?',
    answer:
      "Occasionally, for very low-stakes disagreements — but as a default habit it tends to let real issues fester and resurface later, usually worse than if they'd been addressed early.",
  },
  'Conflict Resolution at Work|||De-escalating tension': {
    question:
      'What do you do when someone is too heated to have a productive conversation?',
    answer:
      "Acknowledge their frustration first, out loud, before trying to problem-solve — people generally can't engage with solutions until they feel heard.",
  },
  'Conflict Resolution at Work|||Facilitating a resolution conversation': {
    question:
      'How neutral does a facilitator actually need to be if they already have an opinion?',
    answer:
      "As neutral as possible in how you run the conversation, even if you have a private view — the moment participants sense you've picked a side, they stop trusting the process.",
  },
  'Conflict Resolution at Work|||Following up after conflict': {
    question:
      'Is it awkward to bring up a conflict again after it seems resolved?',
    answer:
      "A brief, low-key check-in usually reads as care, not awkwardness — it's the silence after a supposedly resolved conflict that tends to let doubts quietly build.",
  },
  'Strategic Thinking for Leaders|||Thinking in systems': {
    question: 'How is systems thinking different from just being thorough?',
    answer:
      "Thoroughness means considering more details; systems thinking means considering how those details affect each other — it's about relationships and feedback loops, not just a longer list of factors.",
  },
  'Strategic Thinking for Leaders|||Prioritization frameworks': {
    question:
      'What do you do when everything on the list feels equally urgent?',
    answer:
      "That's usually a sign you need an external framework, not more gut-checking — plotting items by impact and urgency almost always reveals that they weren't actually equal once compared side by side.",
  },
  'Strategic Thinking for Leaders|||Anticipating second-order effects': {
    question:
      'How far out should I try to think through consequences before it becomes pointless speculation?',
    answer:
      'One or two steps out is usually the sweet spot — enough to catch the obvious unintended consequences without spiraling into unfalsifiable predictions.',
  },
  'Strategic Thinking for Leaders|||Communicating strategy': {
    question:
      'Why does a strategy that felt clear to leadership often confuse the rest of the team?',
    answer:
      "Leadership usually has months of context the team doesn't — a strategy needs to be repeated, with concrete examples, several times before it lands the way it does for the people who wrote it.",
  },
  'Emotional Intelligence at Work|||Self-awareness': {
    question:
      "How do you build self-awareness if you genuinely don't notice your own reactions in the moment?",
    answer:
      'Start after the fact — reviewing a tense moment later and naming what you felt builds the pattern recognition that eventually shows up in real time.',
  },
  'Emotional Intelligence at Work|||Managing your reactions': {
    question:
      'Is it dishonest to pause before reacting if what I actually feel is frustration?',
    answer:
      "No — pausing isn't about hiding the emotion, it's about choosing how to express it constructively instead of reacting on impulse. You can still be honest about the frustration once you've chosen your words.",
  },
  'Emotional Intelligence at Work|||Reading the room': {
    question:
      'What are some signs I should actually be watching for when "reading the room"?',
    answer:
      "Body language, who's talking versus who's gone quiet, and whether energy shifts after certain topics — those often say more than what's actually being said out loud.",
  },
  'Emotional Intelligence at Work|||Building empathy': {
    question: 'Can empathy get in the way of making a hard decision?',
    answer:
      "It shouldn't stop the decision, but it should shape how you communicate it — understanding someone's perspective doesn't mean agreeing with it, it means delivering the outcome with more care.",
  },
  'Change Management Essentials|||Why change efforts fail': {
    question:
      "What's the most common reason a well-planned change initiative still falls apart?",
    answer:
      "Usually unclear or inconsistent communication about why the change is happening — people resist what they don't understand more than they resist the change itself.",
  },
  'Change Management Essentials|||Building a change narrative': {
    question: 'How much detail should a change narrative include upfront?',
    answer:
      'Enough to answer "why" and "what does this mean for me" — the deeper operational detail can come later; leading with too much detail too early tends to overwhelm rather than reassure.',
  },
  'Change Management Essentials|||Managing resistance': {
    question:
      'Should resistance always be addressed, or is some of it just noise to push through?',
    answer:
      'Worth listening to first — resistance sometimes surfaces a real risk in the plan. Pushing through without listening risks losing valuable signal along with the noise.',
  },
  'Change Management Essentials|||Sustaining new behaviors': {
    question:
      'Why do teams often slide back to old habits months after a change was "successfully" rolled out?',
    answer:
      'Because the reinforcement stopped — without ongoing systems, habits, or recognition supporting the new way of working, the old default naturally reasserts itself over time.',
  },
  'Building Inclusive Teams|||Understanding bias': {
    question:
      'If bias is unconscious, how can anyone actually address it in themselves?',
    answer:
      "You can't eliminate it by willpower alone, but structured processes (like consistent interview criteria) reduce the room bias has to operate in — the goal is building safeguards, not just self-correcting in the moment.",
  },
  'Building Inclusive Teams|||Inclusive hiring practices': {
    question:
      'Does structured interviewing actually reduce bias, or does it just make hiring feel more bureaucratic?',
    answer:
      'It genuinely helps — comparing every candidate against the same criteria, rather than an open-ended "vibe check," makes it much harder for unconscious bias to quietly steer decisions.',
  },
  'Building Inclusive Teams|||Creating psychological safety': {
    question:
      "How do you build psychological safety on a team that's used to a more top-down culture?",
    answer:
      "Start small — visibly respond well the first few times someone raises a concern or admits a mistake. Trust that it's safe to speak up is built through repeated evidence, not a single announcement.",
  },
  'Building Inclusive Teams|||Equitable recognition & growth': {
    question:
      'How do you know if recognition is actually being distributed fairly on a team?',
    answer:
      "Look at the pattern over time, not one instance — if the same few people are consistently recognized or promoted while similar contributions from others go unnoticed, that's worth investigating.",
  },
  'Public Speaking & Executive Presence|||Structuring a message': {
    question: 'How long should the opening of a presentation actually be?',
    answer:
      "Short — get to your core message within the first minute. A long wind-up before the main point is one of the fastest ways to lose an audience's attention.",
  },
  'Public Speaking & Executive Presence|||Managing nerves': {
    question: 'Does the nervousness ever actually go away with experience?',
    answer:
      "For most people it lessens but doesn't fully disappear — the difference experience makes is learning to channel it into energy rather than trying to eliminate it entirely.",
  },
  'Public Speaking & Executive Presence|||Body language & delivery': {
    question:
      "Is it possible to fake confident body language if I don't feel confident?",
    answer:
      "To a real extent, yes — posture and pacing genuinely shape how an audience perceives you, and often how you feel too. It's not about faking sincerity, just presenting your actual message clearly.",
  },
  'Public Speaking & Executive Presence|||Handling Q&A': {
    question: "What should I do if I get a question that's clearly hostile?",
    answer:
      'Stay calm, acknowledge the underlying concern if there is one, and answer the substance rather than the tone — reacting defensively usually escalates it further than the question itself did.',
  },
  'Time Management for Leaders|||Prioritization frameworks': {
    question: 'What do you do when literally everything feels high priority?',
    answer:
      "That's usually a sign nothing has actually been prioritized yet — plotting tasks against urgency and importance almost always reveals that only a handful truly belong at the top.",
  },
  'Time Management for Leaders|||Protecting focus time': {
    question:
      'How do you protect focus time without seeming unavailable to your team?',
    answer:
      'Be transparent about it — block the time clearly on your calendar and let people know when you are reachable. Most teams respect visible boundaries more than vague unavailability.',
  },
  'Time Management for Leaders|||Delegation as a time tool': {
    question:
      'How do I delegate more without it taking longer than just doing it myself?',
    answer:
      'The upfront time investment in context and expectations pays off — it only feels slower the first time; after that, it frees up real time on every repeat of that task.',
  },
  'Time Management for Leaders|||Managing your calendar': {
    question:
      'Is it worth declining recurring meetings that no longer feel useful?',
    answer:
      'Yes — recurring meetings tend to outlive their usefulness quietly. Periodically reviewing and pruning them is one of the highest-leverage things you can do for your calendar.',
  },
  'Giving and Receiving Feedback|||Why feedback is hard': {
    question: 'Why does feedback feel so much harder to give than to receive?',
    answer:
      'Because the giver risks the relationship in the moment, while the benefit to the receiver is delayed — that asymmetry is exactly why so many people default to avoiding it.',
  },
  'Giving and Receiving Feedback|||Structuring constructive feedback': {
    question:
      'Is there an actual formula for giving constructive feedback, or is it more of a feel thing?',
    answer:
      "A simple structure helps — describe the specific behavior, its impact, and a suggestion. It's not rigid, but having that shape keeps feedback concrete instead of vague.",
  },
  'Giving and Receiving Feedback|||Receiving feedback well': {
    question:
      'How do you receive feedback you strongly disagree with without getting defensive?',
    answer:
      'Separate hearing it from agreeing with it — you can fully listen and ask clarifying questions without committing to act on it immediately. Reacting defensively in the moment just shuts down useful information.',
  },
  'Giving and Receiving Feedback|||Building a feedback habit': {
    question:
      "How do you make feedback feel normal on a team that's not used to it?",
    answer:
      "Model it yourself first, including asking for feedback on your own work — teams pick up on what leaders visibly do, more than on what's written in a values doc.",
  },
  'Leading Remote & Hybrid Teams|||Remote communication norms': {
    question:
      'How do you set communication norms without it feeling like more bureaucracy?',
    answer:
      'Frame it around reducing ambiguity, not adding rules — clear norms on response times and channels actually save people the anxiety of guessing, which reads as helpful rather than bureaucratic.',
  },
  'Leading Remote & Hybrid Teams|||Building trust without proximity': {
    question:
      "Is it possible to build real trust with someone you've never met in person?",
    answer:
      "Yes — consistent follow-through and transparent communication build trust just as effectively remotely, it just takes more intentional effort since you don't get the informal in-person cues.",
  },
  'Leading Remote & Hybrid Teams|||Running effective virtual meetings': {
    question:
      'Why do virtual meetings feel so much less productive than in-person ones?',
    answer:
      "Often it's a lack of structure — without a clear agenda and defined outcome, virtual meetings drift more easily than in-person ones, where social cues naturally keep things on track.",
  },
  'Leading Remote & Hybrid Teams|||Measuring outcomes, not hours': {
    question:
      "How do you evaluate a remote team member's performance if you can't see how many hours they're online?",
    answer:
      "Focus on outcomes and deliverables instead — hours online is a weak proxy for productivity even in person, and it becomes actively misleading once you can't observe it directly.",
  },
  'Decision-Making Under Uncertainty|||Framing decisions under uncertainty': {
    question:
      "How do you make a good decision when you genuinely don't have enough information?",
    answer:
      'Decide with the best available evidence and build in a review point — waiting for full certainty often costs more than the risk of being wrong and adjusting.',
  },
  'Decision-Making Under Uncertainty|||Weighing incomplete information': {
    question:
      'Is it better to estimate a range or commit to a single number when information is incomplete?',
    answer:
      'A range is usually more honest and useful — a single point estimate hides the uncertainty, which can lead people to over-trust a number that was really just a guess.',
  },
  'Decision-Making Under Uncertainty|||Avoiding common biases': {
    question: 'How do you catch your own confirmation bias in the moment?',
    answer:
      "Deliberately look for evidence that would prove you wrong, not just evidence that confirms your view — it feels unnatural at first, but it's one of the most reliable checks against it.",
  },
  'Decision-Making Under Uncertainty|||Deciding and committing': {
    question:
      'What if I commit to a decision and it turns out to be the wrong one?',
    answer:
      "That's a normal part of deciding under uncertainty — the goal isn't being right every time, it's reviewing what you learned and adjusting, rather than avoiding decisions altogether.",
  },
  'Building a Coaching Culture|||What a coaching culture looks like': {
    question:
      'How do you tell if a team actually has a coaching culture, versus just saying it does?',
    answer:
      "Look at how managers spend their 1:1 time — in a real coaching culture, they're asking questions that help people think it through, not just handing out answers.",
  },
  'Building a Coaching Culture|||Training managers to coach': {
    question: "Isn't coaching something people either naturally have or don't?",
    answer:
      "It's a learnable skill like any other — some people pick it up faster, but deliberate practice and feedback meaningfully improve almost anyone's coaching ability over time.",
  },
  'Building a Coaching Culture|||Embedding coaching in routines': {
    question:
      'How do you keep coaching from becoming just another one-off training people forget about?',
    answer:
      'Build it into existing routines, like regular 1:1s, instead of treating it as a separate initiative — habits that live inside routines people already have stick far better than standalone events.',
  },
  'Building a Coaching Culture|||Measuring culture change': {
    question:
      'How do you actually measure something as fuzzy as "culture change"?',
    answer:
      "Combine survey data with concrete behavioral signals, like whether people are increasingly seeking out and acting on feedback — neither alone tells the full story, but together they're a reasonable proxy.",
  },
};

// #500 — generic-but-plausible follow-up replies, reused across every
// module's thread to add a second and (sometimes) third reply without
// hand-writing bespoke content per module. Deliberately short and
// content-free enough to read naturally as a reply to ANY of the
// questions in FORUM_CONTENT above, since the pairing is randomized
// rather than matched by topic.
const FOLLOWUP_LEARNER_REPLIES = [
  'This was exactly what I needed too, thanks for asking!',
  'Ran into the same thing — glad this got answered.',
  'Bookmarking this thread, it comes up a lot.',
  "Good question, I was wondering the same going into this module.",
  'This cleared it up for me as well, appreciate the explanation.',
  "Wish I'd seen this before I got stuck on the same thing.",
];
const FOLLOWUP_TRAINER_REPLIES = [
  "One more tip: it's worth revisiting this once you've done the module's exercise, it clicks a lot faster in context.",
  'Good follow-up question above — happy to go deeper on this in office hours if anyone wants to.',
  "This trips people up a lot at this stage, so don't worry if it takes a second pass to fully land.",
  "Also worth checking the module's linked resources if you want more detail than we cover in the video.",
];

interface ModuleRow {
  module_id: string;
  module_title: string;
  course_title: string;
}

async function main() {
  await AppDataSource.initialize();

  const existingCount = await AppDataSource.query<{ count: string }[]>(
    'SELECT COUNT(*)::int AS count FROM "forum_posts"',
  );
  if (Number(existingCount[0].count) > 0) {
    console.log(
      `Skipping seed: forum_posts already has ${existingCount[0].count} row(s). ` +
        'This script only seeds an empty table — run the #144 wipe script first if you want to reseed.',
    );
    await AppDataSource.destroy();
    return;
  }

  const names = ACCOUNTS.map((a) => a.name);
  const profileRows = await AppDataSource.query<
    { id: string; name: string; role: string }[]
  >('SELECT id, name, role FROM "profiles" WHERE name = ANY($1)', [names]);
  const idByName = new Map(profileRows.map((p) => [p.name, p.id]));

  const missingProfiles = names.filter((name) => !idByName.has(name));
  if (missingProfiles.length > 0) {
    throw new Error(
      `Missing seeded profile(s): ${missingProfiles.join(', ')}. ` +
        'Run "npm run seed:accounts" (#145) before seeding forum posts.',
    );
  }

  const learners = ACCOUNTS.filter((a) => a.role === 'learner').map((a) =>
    idByName.get(a.name)!,
  );
  const trainers = ACCOUNTS.filter((a) => a.role === 'trainer').map((a) =>
    idByName.get(a.name)!,
  );

  const moduleRows = await AppDataSource.query<ModuleRow[]>(`
    SELECT cm.id AS module_id, cm.title AS module_title, c.title AS course_title
    FROM "course_modules" cm
    JOIN "courses" c ON c.id = cm.course_id
    ORDER BY c.title, cm.position
  `);

  const missingContent: string[] = [];
  let seeded = 0;

  for (let i = 0; i < moduleRows.length; i++) {
    const row = moduleRows[i];
    const key = `${row.course_title}|||${row.module_title}`;
    const content = FORUM_CONTENT[key];

    if (!content) {
      missingContent.push(key);
      continue;
    }

    const learnerId = learners[i % learners.length];
    const trainerId = trainers[(i + 2) % trainers.length];
    // #500 — a different learner than the one who asked, for the
    // follow-up reply below, so it doesn't read as someone replying to
    // their own question.
    const followupLearnerId = learners[(i + 1) % learners.length];
    const followupTrainerId = trainers[(i + 3) % trainers.length];

    const [{ id: questionId }] = await AppDataSource.query<{ id: string }[]>(
      `INSERT INTO "forum_posts" (module_id, user_id, parent_post_id, content)
       VALUES ($1, $2, NULL, $3) RETURNING id`,
      [row.module_id, learnerId, content.question],
    );

    await AppDataSource.query(
      `INSERT INTO "forum_posts" (module_id, user_id, parent_post_id, content)
       VALUES ($1, $2, $3, $4)`,
      [row.module_id, trainerId, questionId, content.answer],
    );

    // #500 — "up the activity on every page": every thread also gets a
    // learner follow-up reply, and about half get a second trainer
    // follow-up tip too, instead of stopping at a single Q&A pair.
    await AppDataSource.query(
      `INSERT INTO "forum_posts" (module_id, user_id, parent_post_id, content)
       VALUES ($1, $2, $3, $4)`,
      [
        row.module_id,
        followupLearnerId,
        questionId,
        FOLLOWUP_LEARNER_REPLIES[i % FOLLOWUP_LEARNER_REPLIES.length],
      ],
    );

    if (i % 2 === 0) {
      await AppDataSource.query(
        `INSERT INTO "forum_posts" (module_id, user_id, parent_post_id, content)
         VALUES ($1, $2, $3, $4)`,
        [
          row.module_id,
          followupTrainerId,
          questionId,
          FOLLOWUP_TRAINER_REPLIES[i % FOLLOWUP_TRAINER_REPLIES.length],
        ],
      );
    }

    seeded++;
  }

  if (missingContent.length > 0) {
    console.warn(
      `Warning: ${missingContent.length} module(s) had no matching forum content ` +
        `(seed-forum-posts.ts's FORUM_CONTENT map is missing an entry): ${missingContent.join(', ')}`,
    );
  }

  console.log(
    `Done. Seeded ${seeded} question+reply thread(s) across ${moduleRows.length} module(s).`,
  );
  await AppDataSource.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
