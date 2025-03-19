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
        <div className="relative min-h-screen">
          <header className="absolute top-0 right-0 p-2 sm:p-4 z-50">
            <LanguageSelector />
          </header>
          <main className="flex flex-col min-h-screen">
            <Router />
          </main>
          <Toaster />
        </div>
      </QueryClientProvider>
    </LanguageProvider>
  );
}

export default App;