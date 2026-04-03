import { eq, and, sql, isNull, isNotNull, asc } from "drizzle-orm";
import { db } from "~/db";
import { lessonComments, users } from "~/db/schema";

type CommentUser = {
  id: number;
  name: string;
  avatarUrl: string | null;
};

type CommentRow = {
  id: number;
  lessonId: number;
  userId: number;
  parentId: number | null;
  content: string;
  hiddenAt: string | null;
  hiddenByUserId: number | null;
  createdAt: string;
  updatedAt: string;
  user: CommentUser;
};

export type CommentThread = {
  id: number;
  lessonId: number;
  content: string | null;
  hidden: boolean;
  removed: boolean;
  createdAt: string;
  user: CommentUser | null;
  replies: CommentReply[];
};

export type CommentReply = {
  id: number;
  content: string;
  hidden: boolean;
  createdAt: string;
  user: CommentUser;
};

function selectCommentsWithUser() {
  return db
    .select({
      id: lessonComments.id,
      lessonId: lessonComments.lessonId,
      userId: lessonComments.userId,
      parentId: lessonComments.parentId,
      content: lessonComments.content,
      hiddenAt: lessonComments.hiddenAt,
      hiddenByUserId: lessonComments.hiddenByUserId,
      createdAt: lessonComments.createdAt,
      updatedAt: lessonComments.updatedAt,
      userName: users.name,
      userAvatarUrl: users.avatarUrl,
    })
    .from(lessonComments)
    .innerJoin(users, eq(lessonComments.userId, users.id));
}

function toCommentRow(row: ReturnType<typeof selectCommentsWithUser>["_"]["result"][number]): CommentRow {
  return {
    id: row.id,
    lessonId: row.lessonId,
    userId: row.userId,
    parentId: row.parentId,
    content: row.content,
    hiddenAt: row.hiddenAt,
    hiddenByUserId: row.hiddenByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    user: { id: row.userId, name: row.userName, avatarUrl: row.userAvatarUrl },
  };
}

export function getCommentsForLesson(
  lessonId: number,
  includeHidden: boolean,
  limit: number,
  offset: number
): CommentThread[] {
  const topLevelRows = selectCommentsWithUser()
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        isNull(lessonComments.parentId)
      )
    )
    .orderBy(asc(lessonComments.createdAt))
    .limit(limit)
    .offset(offset)
    .all()
    .map(toCommentRow);

  if (topLevelRows.length === 0) return [];

  const topLevelIds = topLevelRows.map((r) => r.id);

  const replyRows = selectCommentsWithUser()
    .where(
      and(
        eq(lessonComments.lessonId, lessonId),
        isNotNull(lessonComments.parentId)
      )
    )
    .orderBy(asc(lessonComments.createdAt))
    .all()
    .map(toCommentRow)
    .filter((r) => r.parentId !== null && topLevelIds.includes(r.parentId));

  const repliesByParent = new Map<number, CommentRow[]>();
  for (const reply of replyRows) {
    const parentId = reply.parentId as number;
    const existing = repliesByParent.get(parentId) ?? [];
    existing.push(reply);
    repliesByParent.set(parentId, existing);
  }

  return buildThreads(topLevelRows, repliesByParent, includeHidden);
}

function buildThreads(
  topLevel: CommentRow[],
  repliesByParent: Map<number, CommentRow[]>,
  includeHidden: boolean
): CommentThread[] {
  const threads: CommentThread[] = [];

  for (const parent of topLevel) {
    const rawReplies = repliesByParent.get(parent.id) ?? [];
    const parentIsHidden = parent.hiddenAt !== null;

    const visibleReplies = includeHidden
      ? rawReplies
      : rawReplies.filter((r) => r.hiddenAt === null);

    if (!includeHidden && parentIsHidden && visibleReplies.length === 0) {
      continue;
    }

    const replies: CommentReply[] = visibleReplies.map((r) => ({
      id: r.id,
      content: r.content,
      hidden: r.hiddenAt !== null,
      createdAt: r.createdAt,
      user: r.user,
    }));

    if (!includeHidden && parentIsHidden) {
      threads.push({
        id: parent.id,
        lessonId: parent.lessonId,
        content: null,
        hidden: true,
        removed: true,
        createdAt: parent.createdAt,
        user: null,
        replies,
      });
    } else {
      threads.push({
        id: parent.id,
        lessonId: parent.lessonId,
        content: parent.content,
        hidden: parentIsHidden,
        removed: false,
        createdAt: parent.createdAt,
        user: parent.user,
        replies,
      });
    }
  }

  return threads;
}

export function getCommentCount(lessonId: number, includeHidden: boolean) {
  const conditions = [
    eq(lessonComments.lessonId, lessonId),
    isNull(lessonComments.parentId),
  ];

  if (!includeHidden) {
    conditions.push(isNull(lessonComments.hiddenAt));
  }

  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(lessonComments)
    .where(and(...conditions))
    .get();

  return result?.count ?? 0;
}

export function getCommentById(commentId: number) {
  return db
    .select()
    .from(lessonComments)
    .where(eq(lessonComments.id, commentId))
    .get();
}

export function createComment(
  userId: number,
  lessonId: number,
  content: string,
  parentId?: number
) {
  if (parentId !== undefined) {
    const parent = getCommentById(parentId);
    if (!parent) {
      throw new Error("Parent comment not found");
    }
    if (parent.parentId !== null) {
      throw new Error("Cannot reply to a reply");
    }
    if (parent.lessonId !== lessonId) {
      throw new Error("Parent comment belongs to a different lesson");
    }
  }

  return db
    .insert(lessonComments)
    .values({
      userId,
      lessonId,
      content,
      parentId: parentId ?? null,
    })
    .returning()
    .get();
}

export function hideComment(commentId: number, hiddenByUserId: number) {
  return db
    .update(lessonComments)
    .set({
      hiddenAt: new Date().toISOString(),
      hiddenByUserId,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}

export function restoreComment(commentId: number) {
  return db
    .update(lessonComments)
    .set({
      hiddenAt: null,
      hiddenByUserId: null,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(lessonComments.id, commentId))
    .returning()
    .get();
}
