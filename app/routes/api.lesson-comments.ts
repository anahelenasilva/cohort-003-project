import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.lesson-comments";
import { getCurrentUserId } from "~/lib/session";
import { isUserEnrolled } from "~/services/enrollmentService";
import { getUserById } from "~/services/userService";
import { getLessonById } from "~/services/lessonService";
import { getModuleById } from "~/services/moduleService";
import { getCourseById } from "~/services/courseService";
import {
  getCommentsForLesson,
  createComment,
  hideComment,
  restoreComment,
  getCommentById,
} from "~/services/commentService";
import { parseJsonBody } from "~/lib/validation";
import { UserRole } from "~/db/schema";

const createSchema = z.object({
  intent: z.literal("create"),
  lessonId: z.number().int(),
  content: z.string().min(1).max(2000),
  parentId: z.number().int().optional(),
});

const hideSchema = z.object({
  intent: z.literal("hide"),
  commentId: z.number().int(),
});

const restoreSchema = z.object({
  intent: z.literal("restore"),
  commentId: z.number().int(),
});

const requestSchema = z.discriminatedUnion("intent", [
  createSchema,
  hideSchema,
  restoreSchema,
]);

function getLessonCourseInstructorId(lessonId: number): number | null {
  const lesson = getLessonById(lessonId);
  if (!lesson) return null;
  const mod = getModuleById(lesson.moduleId);
  if (!mod) return null;
  const course = getCourseById(mod.courseId);
  if (!course) return null;
  return course.instructorId;
}

function getCourseIdForLesson(lessonId: number): number | null {
  const lesson = getLessonById(lessonId);
  if (!lesson) return null;
  const mod = getModuleById(lesson.moduleId);
  if (!mod) return null;
  return mod.courseId;
}

function isModerator(userId: number, lessonId: number): boolean {
  const user = getUserById(userId);
  if (!user) return false;
  if (user.role === UserRole.Admin) return true;
  const instructorId = getLessonCourseInstructorId(lessonId);
  return instructorId === userId;
}

function canPost(userId: number, lessonId: number): boolean {
  const user = getUserById(userId);
  if (!user) return false;
  if (user.role === UserRole.Admin) return true;
  const instructorId = getLessonCourseInstructorId(lessonId);
  if (instructorId === userId) return true;
  const courseId = getCourseIdForLesson(lessonId);
  if (!courseId) return false;
  return isUserEnrolled(userId, courseId);
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const lessonId = Number(url.searchParams.get("lessonId"));
  const offset = Number(url.searchParams.get("offset") ?? "0");
  const limit = Number(url.searchParams.get("limit") ?? "50");

  if (isNaN(lessonId) || lessonId <= 0) {
    throw data("lessonId is required", { status: 400 });
  }

  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  if (!canPost(currentUserId, lessonId)) {
    throw data("Not authorized to view comments for this lesson", {
      status: 403,
    });
  }

  const includeHidden = isModerator(currentUserId, lessonId);
  const comments = getCommentsForLesson(lessonId, includeHidden, limit, offset);

  return { comments };
}

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const parsed = await parseJsonBody(request, requestSchema);
  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const body = parsed.data;

  if (body.intent === "create") {
    if (!canPost(currentUserId, body.lessonId)) {
      throw data("Not authorized to comment on this lesson", { status: 403 });
    }

    const comment = createComment(
      currentUserId,
      body.lessonId,
      body.content,
      body.parentId
    );

    return { success: true, comment };
  }

  if (body.intent === "hide") {
    const comment = getCommentById(body.commentId);
    if (!comment) {
      throw data("Comment not found", { status: 404 });
    }
    if (!isModerator(currentUserId, comment.lessonId)) {
      throw data("Not authorized to moderate this comment", { status: 403 });
    }

    hideComment(body.commentId, currentUserId);
    return { success: true };
  }

  if (body.intent === "restore") {
    const comment = getCommentById(body.commentId);
    if (!comment) {
      throw data("Comment not found", { status: 404 });
    }
    if (!isModerator(currentUserId, comment.lessonId)) {
      throw data("Not authorized to moderate this comment", { status: 403 });
    }

    restoreComment(body.commentId);
    return { success: true };
  }

  throw data("Invalid intent", { status: 400 });
}
