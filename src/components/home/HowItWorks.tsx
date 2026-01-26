import { Card, CardContent } from '@/components/ui/card';
import { Layers, Sparkles, Users } from 'lucide-react';

const STEPS = [
  {
    icon: Layers,
    title: 'Pick an Inventory',
    description: 'Start with a shared collection of items—supplements, foods, routines, or create your own.',
    color: 'bg-primary/10 text-primary',
  },
  {
    icon: Sparkles,
    title: 'Build & Review',
    description: 'Select what you use, add context, and get an AI-powered analysis of your setup.',
    color: 'bg-accent/15 text-accent-foreground',
  },
  {
    icon: Users,
    title: 'Share & Remix',
    description: 'Post your blueprint, get feedback, and remix what others have built.',
    color: 'bg-secondary/15 text-secondary-foreground',
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
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
