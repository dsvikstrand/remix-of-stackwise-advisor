import { Link } from 'react-router-dom';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { listBlueprintTagRows } from '@/lib/blueprintTagsApi';
import { supabase } from '@/integrations/supabase/client';
import { FALLBACK_PROOF_BLUEPRINT } from '@/lib/landingFallbacks';

interface LandingProofCardProps {
  onOpenExample?: (kind: 'live' | 'fallback') => void;
}

interface ProofBlueprint {
  id: string;
  title: string;
  banner_url: string | null;
  llm_review: string | null;
  creator_user_id: string;
  tags: string[];
  creator_name: string | null;
}

function reviewPreview(text: string | null): string {
  const cleaned = (text || '').trim();
  if (!cleaned) return '';

  const lines = cleaned
    .replace(/\*\*/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('##') && !line.startsWith('###'));

  return lines.slice(0, 2).join(' ').slice(0, 220);
}

export function LandingProofCard({ onOpenExample }: LandingProofCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['landing-proof-blueprint'],
    staleTime: 60_000,
    queryFn: async (): Promise<ProofBlueprint | null> => {
      const { data: blueprint, error } = await supabase
        .from('blueprints')
        .select('id, title, banner_url, llm_review, creator_user_id, likes_count')
        .eq('is_public', true)
        .order('likes_count', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!blueprint) return null;

      const [{ data: tagsRows }, { data: profile }] = await Promise.all([
        Promise.resolve(listBlueprintTagRows({ blueprintIds: [blueprint.id] })),
        supabase
          .from('profiles')
          .select('display_name')
          .eq('user_id', blueprint.creator_user_id)
          .maybeSingle(),
      ]);

      const tags = (tagsRows || [])
        .map((row: any) => row.tag_slug)
        .filter((slug: unknown): slug is string => typeof slug === 'string')
        .slice(0, 4);

      return {
        id: blueprint.id,
        title: blueprint.title,
        banner_url: blueprint.banner_url,
        llm_review: blueprint.llm_review,
        creator_user_id: blueprint.creator_user_id,
        creator_name: profile?.display_name || null,
        tags,
      };
    },
  });

  const previewText = useMemo(() => reviewPreview(data?.llm_review || null), [data?.llm_review]);

  if (isLoading) {
    return (
      <section id="landing-proof" className="space-y-3">
        <Skeleton className="h-6 w-40" />
        <Card className="border-border/40 overflow-hidden">
          <Skeleton className="h-28 w-full" />
          <CardContent className="p-4 space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-12 w-full" />
            <div className="flex gap-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-14" />
            </div>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!data) {
    return (
      <section id="landing-proof" className="space-y-3 animate-fade-in">
        <h2 className="text-xl font-semibold tracking-tight">What you get</h2>
        <Card className="border-border/40 overflow-hidden">
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <Badge variant="outline" className="text-xs">Example output</Badge>
              <span className="text-xs text-muted-foreground">{FALLBACK_PROOF_BLUEPRINT.channel}</span>
            </div>
            <h3 className="text-lg font-semibold leading-tight">{FALLBACK_PROOF_BLUEPRINT.title}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">{FALLBACK_PROOF_BLUEPRINT.summary}</p>
            <div className="flex flex-wrap gap-1.5">
              {FALLBACK_PROOF_BLUEPRINT.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
            <Button asChild size="sm" onClick={() => onOpenExample?.('fallback')}>
              <Link to={FALLBACK_PROOF_BLUEPRINT.href}>
                Try your own example
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section id="landing-proof" className="space-y-3 animate-fade-in">
      <h2 className="text-xl font-semibold tracking-tight">What a blueprint looks like</h2>
      <Card className="border-border/40 overflow-hidden">
        {data.banner_url ? (
          <div className="aspect-[5/1] w-full bg-muted/20">
            <img src={data.banner_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          </div>
        ) : null}
        <CardContent className="p-5 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <Badge variant="outline" className="text-xs">Live example</Badge>
            <span className="text-xs text-muted-foreground">
              {data.creator_name ? `By ${data.creator_name}` : 'Community blueprint'}
            </span>
          </div>
          <h3 className="text-lg font-semibold leading-tight line-clamp-2">{data.title}</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {previewText || 'Step-by-step structure with practical actions, timing cues, and reusable tags.'}
          </p>
          {data.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
          ) : null}
          <Button asChild size="sm" onClick={() => onOpenExample?.('live')}>
            <Link to={`/blueprint/${data.id}`}>
              Open example blueprint
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
