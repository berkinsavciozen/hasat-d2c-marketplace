import { useState } from "react";
import { Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ReviewModal({
  open,
  onOpenChange,
  title,
  subtitle,
  pending,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  title: string;
  subtitle?: string;
  pending: boolean;
  onSubmit: (input: { rating: number; comment?: string }) => void;
}) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v && pending) return;
        if (!v) {
          setRating(0);
          setHover(0);
          setComment("");
        }
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {subtitle && <p className="text-sm text-hmuted">{subtitle}</p>}
        <div className="flex items-center gap-1.5 py-2" role="radiogroup" aria-label="Puan">
          {[1, 2, 3, 4, 5].map((n) => {
            const active = (hover || rating) >= n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={rating === n}
                aria-label={`${n} yıldız`}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                onClick={() => setRating(n)}
                className="p-1 min-h-[48px] min-w-[48px] grid place-items-center"
              >
                <Star
                  className="h-8 w-8"
                  style={{
                    color: active ? "var(--gold)" : "var(--hmuted)",
                    fill: active ? "var(--gold)" : "transparent",
                  }}
                />
              </button>
            );
          })}
        </div>
        <Textarea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Yorumunuz (opsiyonel)"
        />
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button
            onClick={() => onSubmit({ rating, comment: comment.trim() || undefined })}
            disabled={rating < 1}
            loading={pending}
            loadingLabel="Değerlendirme gönderiliyor"
          >
            Gönder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RatingStars({ rating, size = 14 }: { rating: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          style={{
            width: size,
            height: size,
            color: n <= rating ? "var(--gold)" : "var(--hmuted)",
            fill: n <= rating ? "var(--gold)" : "transparent",
          }}
        />
      ))}
    </span>
  );
}
