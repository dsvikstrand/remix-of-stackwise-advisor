import { useParams } from 'react-router-dom';
import { AppHeader } from '@/components/shared/AppHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useInventory } from '@/hooks/useInventories';
import { BlueprintBuilder } from '@/components/blueprint/BlueprintBuilder';

export default function InventoryBuild() {
  const { inventoryId } = useParams();
  const { data: inventory, isLoading } = useInventory(inventoryId);

  return (
    <div className="min-h-screen relative overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none -z-10">
        <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-primary/8 rounded-full blur-3xl animate-drift" />
        <div className="absolute top-1/2 -left-32 w-96 h-96 bg-accent/15 rounded-full blur-3xl animate-float" />
        <div className="absolute -bottom-20 right-1/4 w-80 h-80 bg-secondary/10 rounded-full blur-3xl animate-pulse-soft" />
        <div className="absolute top-20 right-20 w-4 h-4 bg-primary/20 rounded-full blur-sm animate-float-delayed" />
        <div className="absolute top-40 right-40 w-2 h-2 bg-accent/30 rounded-full blur-sm animate-float-slow" />
        <div className="absolute bottom-40 left-20 w-3 h-3 bg-primary/15 rounded-full blur-sm animate-drift" />
      </div>

      <AppHeader />

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="text-center mb-12 pt-16 animate-fade-in">
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight mb-4 relative inline-block">
            <span
              className="relative inline-block"
              style={{
                fontFamily: "'Impact', 'Haettenschweiler', 'Franklin Gothic Bold', 'Charcoal', 'Helvetica Inserat', sans-serif",
                letterSpacing: '0.06em',
              }}
            >
              <span
                className="absolute inset-0 text-border/40"
                style={{ transform: 'translate(4px, 4px)' }}
                aria-hidden="true"
              >
                BUILD BLUEPRINT
              </span>
              <span
                className="absolute inset-0 text-border/60"
                style={{ transform: 'translate(2px, 2px)' }}
                aria-hidden="true"
              >
                BUILD BLUEPRINT
              </span>
              <span className="text-gradient-themed animate-shimmer bg-[length:200%_auto] relative">
                BUILD BLUEPRINT
              </span>
            </span>
            <span className="absolute -inset-4 bg-primary/10 blur-2xl rounded-full animate-pulse-soft -z-10" />
          </h1>
          <p className="text-lg text-muted-foreground max-w-md mx-auto">
            Craft a blueprint from your inventory
          </p>
        </div>

        {isLoading ? (
          <Card className="bg-card/60 backdrop-blur-glass border-border/50">
            <CardContent className="p-6">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-24 w-full mt-4" />
            </CardContent>
          </Card>
        ) : inventory ? (
          <>
            <section className="mb-6 animate-fade-in" style={{ animationDelay: '0.05s' }}>
              <Card className="bg-card/60 backdrop-blur-glass border-border/50">
                <CardContent className="p-6 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Selected inventory</p>
                    <h2 className="text-2xl font-semibold">{inventory.title}</h2>
                  </div>
                  <Button variant="outline">Switch Inventory</Button>
                </CardContent>
              </Card>
            </section>
            <BlueprintBuilder inventory={inventory} />
          </>
        ) : (
          <Card className="bg-card/60 backdrop-blur-glass border-border/50">
            <CardContent className="py-12 text-center">Inventory not found.</CardContent>
          </Card>
        )}
      </main>
    </div>
      </main>
    </div>
  );
}
