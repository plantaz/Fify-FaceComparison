import { ScanSearch } from "lucide-react";

export default function HeroSection() {
  return (
    <div className="bg-gradient-to-b from-primary/10 to-background pt-20 pb-16">
      <div className="container mx-auto px-4 text-center">
        <div className="flex justify-center mb-6">
          <ScanSearch className="h-16 w-16 text-primary" />
        </div>
        
        <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent mb-4">
          Found It For You
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Search your cloud storage for specific faces using advanced AI recognition. 
          Simply provide your drive link and a reference photo.
        </p>
      </div>
    </div>
  );
}
