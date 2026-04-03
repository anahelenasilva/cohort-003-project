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
  getAverageRating,
  getAverageRatingsForCourses,
  getUserReview,
  upsertReview,
} from "./reviewService";

describe("reviewService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  describe("upsertReview", () => {
    it("creates a new review", () => {
      const review = upsertReview(base.user.id, base.course.id, 4);

      expect(review).toBeDefined();
      expect(review.userId).toBe(base.user.id);
      expect(review.courseId).toBe(base.course.id);
      expect(review.rating).toBe(4);
    });

    it("updates an existing review", () => {
      upsertReview(base.user.id, base.course.id, 3);
      const updated = upsertReview(base.user.id, base.course.id, 5);

      expect(updated!.rating).toBe(5);

      const all = testDb
        .select()
        .from(schema.courseReviews)
        .all();
      expect(all).toHaveLength(1);
    });
  });

  describe("getAverageRating", () => {
    it("returns null average and zero count when no reviews", () => {
      const result = getAverageRating(base.course.id);

      expect(result.average).toBeNull();
      expect(result.count).toBe(0);
    });

    it("returns correct average and count", () => {
      const user2 = testDb
        .insert(schema.users)
        .values({ name: "User 2", email: "user2@test.com", role: schema.UserRole.Student })
        .returning()
        .get();

      upsertReview(base.user.id, base.course.id, 4);
      upsertReview(user2.id, base.course.id, 2);

      const result = getAverageRating(base.course.id);

      expect(result.average).toBe(3);
      expect(result.count).toBe(2);
    });
  });

  describe("getAverageRatingsForCourses", () => {
    it("returns ratings for multiple courses in a single query", () => {
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "Course 2",
          slug: "course-2",
          description: "desc",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      upsertReview(base.user.id, base.course.id, 5);
      upsertReview(base.user.id, course2.id, 3);

      const map = getAverageRatingsForCourses([base.course.id, course2.id]);

      expect(map.get(base.course.id)?.average).toBe(5);
      expect(map.get(base.course.id)?.count).toBe(1);
      expect(map.get(course2.id)?.average).toBe(3);
      expect(map.get(course2.id)?.count).toBe(1);
    });

    it("returns empty map for empty input", () => {
      const map = getAverageRatingsForCourses([]);
      expect(map.size).toBe(0);
    });
  });

  describe("getUserReview", () => {
    it("returns undefined when no review exists", () => {
      expect(getUserReview(base.user.id, base.course.id)).toBeUndefined();
    });

    it("returns the user review", () => {
      upsertReview(base.user.id, base.course.id, 4);
      const review = getUserReview(base.user.id, base.course.id);

      expect(review).toBeDefined();
      expect(review!.rating).toBe(4);
      expect(review!.userId).toBe(base.user.id);
    });
  });
});
