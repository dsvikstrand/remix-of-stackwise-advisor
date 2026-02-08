import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import Home from "./pages/Home";
import Wall from "./pages/Wall";
import Explore from "./pages/Explore";
import Blueprints from "./pages/Blueprints";
import Auth from "./pages/Auth";
import Settings from "./pages/Settings";
import UserProfile from "./pages/UserProfile";
import Tags from "./pages/Tags";
import PostDetail from "./pages/PostDetail";
import Inventory from "./pages/Inventory";
import InventoryCreate from "./pages/InventoryCreate";
import InventoryDetail from "./pages/InventoryDetail";
import InventoryBuild from "./pages/InventoryBuild";
import BlueprintDetail from "./pages/BlueprintDetail";
import BlueprintRemix from "./pages/BlueprintRemix";
import About from "./pages/About";
import NotFound from "./pages/NotFound";
import { RequireAuth } from "@/components/shared/RequireAuth";
import { config } from "@/config/runtime";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={config.basePath}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/explore" element={<Explore />} />
            <Route path="/blueprints" element={<Blueprints />} />
            <Route path="/wall" element={<Wall />} />
            <Route path="/wall/:postId" element={<RequireAuth><PostDetail /></RequireAuth>} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/inventory" element={<Inventory />} />
            <Route path="/inventory/create" element={<RequireAuth><InventoryCreate /></RequireAuth>} />
            <Route path="/inventory/:inventoryId" element={<InventoryDetail />} />
            <Route path="/inventory/:inventoryId/build" element={<InventoryBuild />} />
            <Route path="/blueprint/:blueprintId/edit" element={<RequireAuth><InventoryBuild /></RequireAuth>} />
            <Route path="/blueprint/:blueprintId" element={<BlueprintDetail />} />
            <Route path="/blueprint/:blueprintId/remix" element={<RequireAuth><BlueprintRemix /></RequireAuth>} />
            <Route path="/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="/u/:userId" element={<UserProfile />} />
            <Route path="/tags" element={<Tags />} />
            <Route path="/about" element={<About />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
