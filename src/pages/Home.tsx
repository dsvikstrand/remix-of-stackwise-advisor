import { Link } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { Button } from '@/components/ui/button';
import { CommunityStats } from '@/components/home/CommunityStats';
import { TopBlueprints } from '@/components/home/TopBlueprints';
import { FeaturedTags } from '@/components/home/FeaturedTags';
import { DemoInventory } from '@/components/home/DemoInventory';
import { HowItWorks } from '@/components/home/HowItWorks';
import { ArrowRight, Sparkles } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Ambient background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -right-40 w-[520px] h-[520px] bg-primary/10 rounded-full blur-3xl animate-drift" />
        <div className="absolute top-1/2 -left-32 w-96 h-96 bg-accent/20 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-20 right-1/4 w-80 h-80 bg-secondary/10 rounded-full blur-3xl animate-pulse-soft" />
      </div>

      <AppHeader />

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-12">
        {/* Hero - simplified, community-first */}
        <section className="text-center space-y-5 animate-fade-in">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight">
            <span
              className="text-gradient-themed"
              style={{
                fontFamily: "'Impact', 'Haettenschweiler', 'Franklin Gothic Bold', 'Charcoal', sans-serif",
                letterSpacing: '0.06em',
              }}
            >
              BLUEPRINTS
            </span>
          </h1>
          <p className="text-sm uppercase tracking-widest text-primary/80 font-medium">
            Create & share recipes for life routines
          </p>
          <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
            Build routines from shared inventories, get AI reviews, and remix what others have made.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link to="/explore">
              <Button size="lg" className="gap-2">
                Start Exploring
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/wall">
              <Button size="lg" variant="outline" className="gap-2">
                Browse the Wall
                <Sparkles className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </section>

        {/* Community stats bar */}
        <CommunityStats />

        {/* Demo section - moved up for immediate interaction */}
        <DemoInventory />

        {/* How it works */}
        <HowItWorks />

        {/* Top blueprints */}
        <TopBlueprints />

        {/* Featured tags */}
        <FeaturedTags />

        {/* Footer-ish links */}
        <footer className="pt-8 border-t border-border/40 text-center space-y-4">
          <nav className="flex flex-wrap items-center justify-center gap-4 text-sm text-muted-foreground">
            <Link to="/wall" className="hover:text-foreground transition-colors">Wall</Link>
            <span className="text-border">&middot;</span>
            <Link to="/inventory" className="hover:text-foreground transition-colors">Inventories</Link>
            <span className="text-border">&middot;</span>
            <Link to="/tags" className="hover:text-foreground transition-colors">Tags</Link>
            <span className="text-border">&middot;</span>
            <Link to="/auth" className="hover:text-foreground transition-colors">Sign In</Link>
          </nav>
          <p className="text-xs text-muted-foreground/70">
            Built with curiosity. Share what works.
          </p>
        </footer>
      </main>
    </div>
  );
}
