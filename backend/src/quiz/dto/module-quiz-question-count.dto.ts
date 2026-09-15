// (module-estimate fix) — one entry per module in a course: how many quiz
// questions it currently has saved. Purpose-built for TrainerCourseEditor's
// module time estimate, which needs a question count for every module as
// soon as the edit form loads — previously that count stayed at 0 until a
// trainer opened each module's "Manage quiz" panel (which is what actually
// fetches its questions), so the estimate silently ignored quiz content on
// first load. This is a lightweight count-only fetch (one query for the
// whole course, not a per-module quiz payload) so the form can preload it
// up front without the cost of eagerly fetching every module's full quiz.
export class ModuleQuizQuestionCountDto {
  moduleId: string;
  questionCount: number;
}
