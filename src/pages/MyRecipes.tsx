import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRecipes, RecipeType } from '@/hooks/useRecipes';
import { AppNavigation } from '@/components/shared/AppNavigation';
import { UserMenu } from '@/components/shared/UserMenu';
import { ThemeToggle } from '@/components/blend/ThemeToggle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Beaker, FlaskConical, Dumbbell, Trash2, Share2, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const RECIPE_ICONS = {
  blend: FlaskConical,
  protein: Dumbbell,
  stack: Beaker,
};

const RECIPE_COLORS = {
  blend: 'bg-purple-500/10 text-purple-500',
  protein: 'bg-green-500/10 text-green-500',
  stack: 'bg-blue-500/10 text-blue-500',
};

const RECIPE_PATHS = {
  blend: '/blend',
  protein: '/protein',
  stack: '/',
};

export default function MyRecipes() {
  const { user, isLoading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<RecipeType | 'all'>('all');
  const { recipes, isLoading, deleteRecipe, shareToWall, isSharing } = useRecipes(
    activeTab === 'all' ? undefined : activeTab
  );

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Ambient background */}
      <div className="fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-glass border-b border-border/50 bg-background/80">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2">
              <Beaker className="h-6 w-6 text-primary" />
              <span className="font-semibold">My Recipes</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="max-w-4xl mx-auto px-4 py-4">
        <AppNavigation />
      </div>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-4 pb-24">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RecipeType | 'all')}>
          <TabsList className="mb-6">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="blend">Blends</TabsTrigger>
            <TabsTrigger value="protein">Protein</TabsTrigger>
            <TabsTrigger value="stack">Stacks</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-0">
            {isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-5 w-32" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-4 w-24 mb-2" />
                      <Skeleton className="h-3 w-16" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : recipes.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {recipes.map((recipe) => {
                  const Icon = RECIPE_ICONS[recipe.recipe_type];
                  const colorClass = RECIPE_COLORS[recipe.recipe_type];
                  const itemCount = Array.isArray(recipe.items) ? recipe.items.length : 0;

                  return (
                    <Card key={recipe.id} className="group relative">
                      <CardHeader className="flex flex-row items-start justify-between pb-2">
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg truncate">{recipe.name}</CardTitle>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className={colorClass}>
                              <Icon className="h-3 w-3 mr-1" />
                              {recipe.recipe_type}
                            </Badge>
                            {recipe.is_public && (
                              <Badge variant="outline" className="text-xs">
                                Public
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          {itemCount} ingredient{itemCount !== 1 ? 's' : ''}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Updated {formatDistanceToNow(new Date(recipe.updated_at), { addSuffix: true })}
                        </p>

                        <div className="flex items-center gap-2 mt-4">
                          <Link to={RECIPE_PATHS[recipe.recipe_type]}>
                            <Button variant="outline" size="sm" className="gap-1">
                              <ExternalLink className="h-3 w-3" />
                              Open
                            </Button>
                          </Link>
                          
                          {!recipe.is_public && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1"
                              onClick={() => shareToWall({ recipeId: recipe.id })}
                              disabled={isSharing}
                            >
                              <Share2 className="h-3 w-3" />
                              Share
                            </Button>
                          )}

                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive ml-auto">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete recipe?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This will permanently delete "{recipe.name}" and remove it from the wall if shared.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteRecipe(recipe.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <Card className="text-center py-12">
                <CardContent>
                  <div className="flex flex-col items-center gap-4">
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                      <Beaker className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold">No recipes yet</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Create your first blend or protein shake to get started!
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Link to="/blend">
                        <Button variant="outline">Create Blend</Button>
                      </Link>
                      <Link to="/protein">
                        <Button>Create Shake</Button>
                      </Link>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Floating nav */}
      <AppNavigation variant="floating" />
    </div>
  );
}
