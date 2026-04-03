import { eq, and, sql, inArray } from "drizzle-orm";
import { db } from "~/db";
import { courseReviews } from "~/db/schema";

export function getAverageRating(courseId: number) {
  const result = db
    .select({
      average: sql<number | null>`avg(${courseReviews.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseReviews)
    .where(eq(courseReviews.courseId, courseId))
    .get();

  return {
    average: result?.average ? Math.round(result.average * 10) / 10 : null,
    count: result?.count ?? 0,
  };
}

export function getAverageRatingsForCourses(courseIds: number[]) {
  if (courseIds.length === 0) return new Map<number, { average: number | null; count: number }>();

  const results = db
    .select({
      courseId: courseReviews.courseId,
      average: sql<number | null>`avg(${courseReviews.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseReviews)
    .where(inArray(courseReviews.courseId, courseIds))
    .groupBy(courseReviews.courseId)
    .all();

  const map = new Map<number, { average: number | null; count: number }>();
  for (const row of results) {
    map.set(row.courseId, {
      average: row.average ? Math.round(row.average * 10) / 10 : null,
      count: row.count,
    });
  }
  return map;
}

export function getUserReview(userId: number, courseId: number) {
  return db
    .select()
    .from(courseReviews)
    .where(
      and(eq(courseReviews.userId, userId), eq(courseReviews.courseId, courseId))
    )
    .get();
}

export function upsertReview(userId: number, courseId: number, rating: number) {
  const existing = getUserReview(userId, courseId);

  if (existing) {
    return db
      .update(courseReviews)
      .set({ rating, updatedAt: new Date().toISOString() })
      .where(eq(courseReviews.id, existing.id))
      .returning()
      .get();
  }

  return db
    .insert(courseReviews)
    .values({ userId, courseId, rating })
    .returning()
    .get();
}
