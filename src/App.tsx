import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import Blend from "./pages/Blend";
import Protein from "./pages/Protein";
import Wall from "./pages/Wall";
import Auth from "./pages/Auth";
import MyRecipes from "./pages/MyRecipes";
import Profile from "./pages/Profile";
import Tags from "./pages/Tags";
import PostDetail from "./pages/PostDetail";
import NotFound from "./pages/NotFound";
import { RequireAuth } from "@/components/shared/RequireAuth";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/blend" element={<Blend />} />
            <Route path="/protein" element={<Protein />} />
            <Route path="/wall" element={<RequireAuth><Wall /></RequireAuth>} />
            <Route path="/wall/:postId" element={<RequireAuth><PostDetail /></RequireAuth>} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/my-recipes" element={<RequireAuth><MyRecipes /></RequireAuth>} />
            <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
            <Route path="/tags" element={<RequireAuth><Tags /></RequireAuth>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
