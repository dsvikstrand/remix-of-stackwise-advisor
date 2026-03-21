import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Home from "./pages/Home";
import Wall from "./pages/Wall";
import Explore from "./pages/Explore";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import Settings from "./pages/Settings";
import UserProfile from "./pages/UserProfile";
import Channels from "./pages/Channels";
import ChannelPage from "./pages/ChannelPage";
import PostDetail from "./pages/PostDetail";
import SearchPage from "./pages/Search";
import Subscriptions from "./pages/Subscriptions";
import SourcePage from "./pages/SourcePage";
import BlueprintDetail from "./pages/BlueprintDetail";
import YouTubeToBlueprint from "./pages/YouTubeToBlueprint";
import GenerationQueue from "./pages/GenerationQueue";
import About from "./pages/About";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import { RequireAuth } from "@/components/shared/RequireAuth";
import { BleupPwaRuntime } from "@/components/pwa/BleupPwaRuntime";
import { config } from "@/config/runtime";
import { YouTubeOnboardingRedirectGate } from "@/components/onboarding/YouTubeOnboardingRedirectGate";
import WelcomeOnboarding from "./pages/WelcomeOnboarding";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
const DevBlueprintPreview = lazy(() => import("./pages/DevBlueprintPreview"));

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        {config.developerMode && <Toaster />}
        {config.developerMode && <Sonner />}
        <BrowserRouter basename={config.basePath}>
          <BleupPwaRuntime>
            <YouTubeOnboardingRedirectGate />
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/blueprints" element={<Navigate to="/wall" replace />} />
              <Route path="/youtube" element={<YouTubeToBlueprint />} />
              <Route path="/generation-queue" element={<RequireAuth><GenerationQueue /></RequireAuth>} />
              <Route path="/channels" element={<Channels />} />
              <Route path="/search" element={<RequireAuth><SearchPage /></RequireAuth>} />
              <Route path="/b/:channelSlug" element={<ChannelPage />} />
              <Route path="/my-feed" element={<RequireAuth><Navigate to="/wall" replace /></RequireAuth>} />
              {config.features.myFeedV1 && (
                <Route path="/subscriptions" element={<RequireAuth><Subscriptions /></RequireAuth>} />
              )}
              <Route path="/s/:platform/:externalId" element={<SourcePage />} />
              <Route path="/welcome" element={<RequireAuth><WelcomeOnboarding /></RequireAuth>} />
              <Route path="/wall" element={<Wall />} />
              <Route path="/wall/:postId" element={<RequireAuth><PostDetail /></RequireAuth>} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/auth/reset-password" element={<ResetPassword />} />
              <Route path="/inventory" element={<Navigate to="/wall" replace />} />
              <Route path="/inventory/create" element={<Navigate to="/wall" replace />} />
              <Route path="/inventory/:inventoryId" element={<Navigate to="/wall" replace />} />
              <Route path="/inventory/:inventoryId/build" element={<Navigate to="/wall" replace />} />
              <Route path="/blueprint/:blueprintId/edit" element={<Navigate to=".." replace />} />
              <Route path="/blueprint/:blueprintId" element={<BlueprintDetail />} />
              <Route path="/blueprint/:blueprintId/remix" element={<Navigate to=".." replace />} />
              <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
              <Route path="/u/:userId" element={<UserProfile />} />
              <Route path="/tags" element={<Navigate to="/channels" replace />} />
              <Route path="/about" element={<About />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              {(import.meta.env.DEV || config.developerMode) && (
                <Route
                  path="/dev/blueprint-preview"
                  element={(
                    <Suspense fallback={null}>
                      <DevBlueprintPreview />
                    </Suspense>
                  )}
                />
              )}
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BleupPwaRuntime>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
