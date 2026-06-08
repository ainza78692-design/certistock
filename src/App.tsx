import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import LiveStock from "./pages/LiveStock";
import ReviewExtraction from "./pages/ReviewExtraction";
import Certificates from "./pages/Certificates";
import StockLots from "./pages/StockLots";
import StockLotDetail from "./pages/StockLotDetail";
import Consumption from "./pages/Consumption";
import NewConsumption from "./pages/NewConsumption";
import BulkUploadConsumption from "./pages/BulkUploadConsumption";
import { Customers, Suppliers } from "./pages/Entities";
import Products from "./pages/Products";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import NotFound from "./pages/NotFound";
import DesktopUpdatePrompt from "@/components/DesktopUpdatePrompt";

const queryClient = new QueryClient();
const Router = "certistockDesktop" in window ? HashRouter : BrowserRouter;

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <DesktopUpdatePrompt />
      <Router>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/live-stock" element={<LiveStock />} />
              <Route path="/review/:fileId" element={<ReviewExtraction />} />
              <Route path="/certificates" element={<Certificates />} />
              <Route path="/lots" element={<StockLots />} />
              <Route path="/lots/:id" element={<StockLotDetail />} />
              <Route path="/consumption" element={<Consumption />} />
              <Route path="/consumption/new" element={<NewConsumption />} />
              <Route path="/consumption/bulk" element={<BulkUploadConsumption />} />
              <Route path="/customers" element={<Customers />} />
              <Route path="/suppliers" element={<Suppliers />} />
              <Route path="/products" element={<Products />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </Router>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
