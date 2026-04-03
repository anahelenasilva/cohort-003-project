import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

import {
  createComment,
  getCommentById,
  getCommentCount,
  getCommentsForLesson,
  hideComment,
  restoreComment,
} from "./commentService";

function createLesson(moduleId: number, position: number) {
  return testDb
    .insert(schema.lessons)
    .values({
      moduleId,
      title: `Lesson ${position}`,
      position,
    })
    .returning()
    .get();
}

function createModule(courseId: number) {
  return testDb
    .insert(schema.modules)
    .values({
      courseId,
      title: "Module 1",
      position: 1,
    })
    .returning()
    .get();
}

describe("commentService", () => {
  let mod: ReturnType<typeof createModule>;
  let lesson: ReturnType<typeof createLesson>;

  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
    mod = createModule(base.course.id);
    lesson = createLesson(mod.id, 1);
  });

  describe("createComment", () => {
    it("creates a top-level comment", () => {
      const comment = createComment(base.user.id, lesson.id, "Great lesson!");

      expect(comment).toBeDefined();
      expect(comment.userId).toBe(base.user.id);
      expect(comment.lessonId).toBe(lesson.id);
      expect(comment.content).toBe("Great lesson!");
      expect(comment.parentId).toBeNull();
    });

    it("creates a reply to a top-level comment", () => {
      const parent = createComment(base.user.id, lesson.id, "Question here");
      const reply = createComment(
        base.instructor.id,
        lesson.id,
        "Here is the answer",
        parent.id
      );

      expect(reply.parentId).toBe(parent.id);
    });

    it("rejects a reply to a reply", () => {
      const parent = createComment(base.user.id, lesson.id, "Top level");
      const reply = createComment(
        base.instructor.id,
        lesson.id,
        "Reply",
        parent.id
      );

      expect(() =>
        createComment(base.user.id, lesson.id, "Nested reply", reply.id)
      ).toThrow("Cannot reply to a reply");
    });

    it("rejects a reply to a non-existent parent", () => {
      expect(() =>
        createComment(base.user.id, lesson.id, "Orphan reply", 9999)
      ).toThrow("Parent comment not found");
    });

    it("rejects a reply when parent belongs to a different lesson", () => {
      const otherLesson = createLesson(mod.id, 2);
      const parent = createComment(
        base.user.id,
        otherLesson.id,
        "On other lesson"
      );

      expect(() =>
        createComment(base.user.id, lesson.id, "Cross-lesson reply", parent.id)
      ).toThrow("Parent comment belongs to a different lesson");
    });
  });

  describe("hideComment", () => {
    it("sets hiddenAt and hiddenByUserId", () => {
      const comment = createComment(base.user.id, lesson.id, "To be hidden");
      const hidden = hideComment(comment.id, base.instructor.id);

      expect(hidden).toBeDefined();
      expect(hidden!.hiddenAt).not.toBeNull();
      expect(hidden!.hiddenByUserId).toBe(base.instructor.id);
    });
  });

  describe("restoreComment", () => {
    it("clears hiddenAt and hiddenByUserId", () => {
      const comment = createComment(base.user.id, lesson.id, "Hide then restore");
      hideComment(comment.id, base.instructor.id);
      const restored = restoreComment(comment.id);

      expect(restored).toBeDefined();
      expect(restored!.hiddenAt).toBeNull();
      expect(restored!.hiddenByUserId).toBeNull();
    });
  });

  describe("getCommentById", () => {
    it("returns the comment", () => {
      const created = createComment(base.user.id, lesson.id, "Find me");
      const found = getCommentById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
    });

    it("returns undefined for non-existent id", () => {
      expect(getCommentById(9999)).toBeUndefined();
    });
  });

  describe("getCommentsForLesson", () => {
    it("returns empty array for lesson with no comments", () => {
      const threads = getCommentsForLesson(lesson.id, false, 50, 0);
      expect(threads).toEqual([]);
    });

    it("returns top-level comments with replies nested", () => {
      const parent = createComment(base.user.id, lesson.id, "Parent");
      createComment(base.instructor.id, lesson.id, "Reply", parent.id);

      const threads = getCommentsForLesson(lesson.id, false, 50, 0);

      expect(threads).toHaveLength(1);
      expect(threads[0].content).toBe("Parent");
      expect(threads[0].replies).toHaveLength(1);
      expect(threads[0].replies[0].content).toBe("Reply");
    });

    it("excludes hidden comments when includeHidden is false", () => {
      const comment = createComment(base.user.id, lesson.id, "Will hide");
      hideComment(comment.id, base.instructor.id);

      const threads = getCommentsForLesson(lesson.id, false, 50, 0);

      expect(threads).toHaveLength(0);
    });

    it("shows hidden parent as removed placeholder when it has visible replies", () => {
      const parent = createComment(base.user.id, lesson.id, "Hidden parent");
      createComment(base.instructor.id, lesson.id, "Visible reply", parent.id);
      hideComment(parent.id, base.instructor.id);

      const threads = getCommentsForLesson(lesson.id, false, 50, 0);

      expect(threads).toHaveLength(1);
      expect(threads[0].removed).toBe(true);
      expect(threads[0].content).toBeNull();
      expect(threads[0].user).toBeNull();
      expect(threads[0].replies).toHaveLength(1);
    });

    it("includes hidden comments when includeHidden is true", () => {
      const comment = createComment(base.user.id, lesson.id, "Hidden");
      hideComment(comment.id, base.instructor.id);

      const threads = getCommentsForLesson(lesson.id, true, 50, 0);

      expect(threads).toHaveLength(1);
      expect(threads[0].hidden).toBe(true);
      expect(threads[0].content).toBe("Hidden");
      expect(threads[0].user).not.toBeNull();
    });

    it("excludes hidden replies when includeHidden is false", () => {
      const parent = createComment(base.user.id, lesson.id, "Parent");
      const reply = createComment(
        base.instructor.id,
        lesson.id,
        "Hidden reply",
        parent.id
      );
      hideComment(reply.id, base.instructor.id);

      const threads = getCommentsForLesson(lesson.id, false, 50, 0);

      expect(threads).toHaveLength(1);
      expect(threads[0].replies).toHaveLength(0);
    });

    it("orders comments oldest first", () => {
      createComment(base.user.id, lesson.id, "First");
      createComment(base.instructor.id, lesson.id, "Second");

      const threads = getCommentsForLesson(lesson.id, false, 50, 0);

      expect(threads).toHaveLength(2);
      expect(threads[0].content).toBe("First");
      expect(threads[1].content).toBe("Second");
    });

    it("paginates top-level comments", () => {
      createComment(base.user.id, lesson.id, "First");
      createComment(base.instructor.id, lesson.id, "Second");
      createComment(base.user.id, lesson.id, "Third");

      const page1 = getCommentsForLesson(lesson.id, false, 2, 0);
      const page2 = getCommentsForLesson(lesson.id, false, 2, 2);

      expect(page1).toHaveLength(2);
      expect(page2).toHaveLength(1);
      expect(page1[0].content).toBe("First");
      expect(page2[0].content).toBe("Third");
    });
  });

  describe("getCommentCount", () => {
    it("returns 0 for lesson with no comments", () => {
      expect(getCommentCount(lesson.id, false)).toBe(0);
    });

    it("counts only top-level comments", () => {
      const parent = createComment(base.user.id, lesson.id, "Parent");
      createComment(base.instructor.id, lesson.id, "Reply", parent.id);
      createComment(base.user.id, lesson.id, "Another top-level");

      expect(getCommentCount(lesson.id, false)).toBe(2);
    });

    it("excludes hidden comments when includeHidden is false", () => {
      const comment = createComment(base.user.id, lesson.id, "Hidden");
      createComment(base.instructor.id, lesson.id, "Visible");
      hideComment(comment.id, base.instructor.id);

      expect(getCommentCount(lesson.id, false)).toBe(1);
    });

    it("includes hidden comments when includeHidden is true", () => {
      const comment = createComment(base.user.id, lesson.id, "Hidden");
      createComment(base.instructor.id, lesson.id, "Visible");
      hideComment(comment.id, base.instructor.id);

      expect(getCommentCount(lesson.id, true)).toBe(2);
    });
  });
});
