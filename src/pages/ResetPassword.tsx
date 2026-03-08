import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookOpen, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

function hasRecoverySignal(locationLike: Location): boolean {
  const search = new URLSearchParams(locationLike.search);
  const hash = new URLSearchParams(locationLike.hash.replace(/^#/, ''));
  const params = [search, hash];
  return params.some((value) => {
    const type = value.get('type');
    return (
      type === 'recovery' ||
      value.has('token_hash') ||
      value.has('access_token') ||
      value.has('refresh_token')
    );
  });
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, session, isLoading, updatePassword } = useAuth();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasRecoveryContext, setHasRecoveryContext] = useState(() => hasRecoverySignal(window.location));

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, currentSession) => {
      if (event === 'PASSWORD_RECOVERY' || currentSession) {
        setHasRecoveryContext(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const canResetPassword = Boolean(session);
  const isReady = !isLoading;

  const invalidMessage = useMemo(() => {
    if (hasRecoveryContext) {
      return 'This reset link is invalid or has expired. Request a new reset email and try again.';
    }
    return 'Open a password reset link from your email, or sign in before setting a new password.';
  }, [hasRecoveryContext]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      toast({
        title: 'Password too short',
        description: 'Use at least 6 characters.',
        variant: 'destructive',
      });
      return;
    }

    if (password !== confirmPassword) {
      toast({
        title: 'Passwords do not match',
        description: 'Re-enter the same password in both fields.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    const { error } = await updatePassword(password);

    if (error) {
      toast({
        title: 'Password update failed',
        description: error.message,
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }

    toast({
      title: 'Password updated',
      description: 'Your new password is ready to use.',
    });
    navigate('/wall', { replace: true });
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background px-[calc(0.75rem+var(--bleup-app-safe-left))] pr-[calc(0.75rem+var(--bleup-app-safe-right))] pt-[calc(0.75rem+var(--bleup-app-safe-top))] pb-[calc(0.75rem+var(--bleup-app-safe-bottom))] sm:px-[calc(1rem+var(--bleup-app-safe-left))] sm:pr-[calc(1rem+var(--bleup-app-safe-right))] sm:pt-[calc(1rem+var(--bleup-app-safe-top))] sm:pb-[calc(1rem+var(--bleup-app-safe-bottom))]">
      <Card className="w-full max-w-md border-border/40 shadow-none">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center gap-2 mb-2">
            <div className="w-9 h-9 rounded-xl border border-primary/25 bg-gradient-to-br from-primary/90 to-primary/60 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold">Bleup</span>
          </div>
          <CardTitle>Set a new password</CardTitle>
          <CardDescription>
            {user?.email
              ? `Update the password for ${user.email}.`
              : 'Finish recovery by choosing a new password.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!isReady ? (
            <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking your recovery session...
            </div>
          ) : canResetPassword ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-password">New password</Label>
                <Input
                  id="reset-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-password-confirm">Confirm password</Label>
                <Input
                  id="reset-password-confirm"
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  disabled={isSubmitting}
                />
              </div>
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating password...
                  </>
                ) : (
                  'Save new password'
                )}
              </Button>
            </form>
          ) : (
            <div className="space-y-4">
              <Alert variant="destructive">
                <AlertTitle>Recovery link unavailable</AlertTitle>
                <AlertDescription>{invalidMessage}</AlertDescription>
              </Alert>
              <div className="flex flex-col gap-2">
                <Button asChild>
                  <Link to="/auth">Back to sign in</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/auth">Request another reset email</Link>
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
