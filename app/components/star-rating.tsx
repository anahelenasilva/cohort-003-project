import { useState } from "react";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

interface StarRatingProps {
  average?: number | null;
  count?: number;
  userRating?: number | null;
  interactive?: boolean;
  onChange?: (rating: number) => void;
  size?: "sm" | "md";
}

export function StarRating({
  average,
  count,
  userRating,
  interactive = false,
  onChange,
  size = "sm",
}: StarRatingProps) {
  const [hoverRating, setHoverRating] = useState(0);
  const displayRating = interactive
    ? hoverRating || userRating || 0
    : average || 0;

  const starSize = size === "sm" ? "size-3.5" : "size-5";

  return (
    <div className="flex items-center gap-1.5">
      <div
        className={cn("flex gap-0.5", interactive && "cursor-pointer")}
        onMouseLeave={() => interactive && setHoverRating(0)}
      >
        {[1, 2, 3, 4, 5].map((star) => {
          const filled = displayRating >= star;
          const halfFilled =
            !filled && displayRating >= star - 0.5;

          return (
            <button
              key={star}
              type="button"
              disabled={!interactive}
              className={cn(
                "p-0 border-0 bg-transparent",
                interactive && "hover:scale-110 transition-transform"
              )}
              onMouseEnter={() => interactive && setHoverRating(star)}
              onClick={() => interactive && onChange?.(star)}
            >
              <Star
                className={cn(
                  starSize,
                  filled || halfFilled
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-muted-foreground/40"
                )}
              />
            </button>
          );
        })}
      </div>
      {!interactive && average != null && (
        <span className="text-xs text-muted-foreground">
          {average.toFixed(1)}
          {count != null && count > 0 && ` (${count})`}
        </span>
      )}
      {interactive && userRating != null && userRating > 0 && (
        <span className="text-xs text-muted-foreground">
          Your rating: {userRating}/5
        </span>
      )}
    </div>
  );
}
