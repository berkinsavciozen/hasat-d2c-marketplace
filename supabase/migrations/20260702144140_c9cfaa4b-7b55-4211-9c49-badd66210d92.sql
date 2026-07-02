ALTER TABLE public.community_posts
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.community_posts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_community_posts_parent
  ON public.community_posts(parent_id) WHERE parent_id IS NOT NULL;