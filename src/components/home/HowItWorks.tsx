import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Package, Sparkles, Users } from 'lucide-react';

const STEPS = [
  {
    icon: Package,
    title: 'Pick an Inventory',
    description: 'Collections of ingredients for any topic—supplements, recipes, routines. Pick one to start building.',
    color: 'bg-primary/10 text-primary',
  },
  {
    icon: Sparkles,
    title: 'Build & Review',
    description: 'Tap items you use, hit Review, and get instant AI feedback on your setup.',
    color: 'bg-accent/15 text-accent-foreground',
  },
  {
    icon: Users,
    title: 'Share & Remix',
    description: "Post to the Wall, comment on others, or remix what they've built.",
    color: 'bg-secondary/15 text-secondary-foreground',
    link: '/wall',
    linkText: 'See the Wall →',
  },
];

export function HowItWorks() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight">How It Works</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {STEPS.map((step, i) => (
          <Card
            key={step.title}
            className="bg-card/60 backdrop-blur-sm animate-fade-in"
            style={{ animationDelay: `${i * 0.1}s` }}
          >
            <CardContent className="p-5 space-y-3">
              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${step.color}`}>
                <step.icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {step.description}
              </p>
              {'link' in step && step.link && (
                <Link
                  to={step.link}
                  className="inline-block text-sm text-primary hover:underline font-medium"
                >
                  {step.linkText}
                </Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
