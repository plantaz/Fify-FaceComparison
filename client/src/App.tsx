import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { LanguageProvider } from "@/lib/language-context";
import { LanguageSelector } from "@/components/language-selector";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <header className="fixed top-0 right-0 p-4 z-50">
          <LanguageSelector />
        </header>
        <Router />
        <Toaster />
      </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;