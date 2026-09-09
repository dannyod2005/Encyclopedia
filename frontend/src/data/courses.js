export const ENROLLED_DEFAULT = [
  { courseId: "c1", progress: 0.62, status: "in-progress", lastAccessed: "Yesterday" },
  { courseId: "c3", progress: 1, status: "complete", lastAccessed: "3 days ago" },
  { courseId: "c5", progress: 0.2, status: "in-progress", lastAccessed: "Today" },
  { courseId: "c6", progress: 1, status: "complete", lastAccessed: "1 week ago" },
];

// #386 — client-supplied homepage copy refresh (Home Page Copy.pdf):
// quote/role swapped to the client's new testimonials. Names and star
// ratings were unchanged between the old placeholder copy and the new
// mockup (same 3 people, same 5/5/4 split), so only quote+role differ
// here. "role" now holds the learner's school (CCHS/HCJC) rather than a
// job title — the new copy frames this as an extra-curricular platform
// for students, not a corporate L&D tool, matching the hero rewrite in
// HomeScreen.jsx. "Well- designed." keeps the client's own spacing/
// hyphenation verbatim rather than silently correcting it.
export const TESTIMONIALS = [
  { name: "Priya N.", role: "CCHS", quote: "The content was practical, well-structured, and provided useful insights into starting and growing a business.", rating: 5 },
  { name: "Marcus T.", role: "HCJC", quote: "Well- designed. The real-world examples and practical exercises made the concepts easy to understand and apply.", rating: 5 },
  { name: "Elena R.", role: "HCJC", quote: "A valuable learning experience. The course was engaging and relevant.", rating: 4 },
];
