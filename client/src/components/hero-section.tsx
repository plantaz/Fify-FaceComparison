export default function HeroSection() {
  return (
    <div className="bg-gradient-to-b from-primary/10 to-background pt-20 pb-16">
      <div className="container mx-auto px-4 text-center">
        <div className="flex justify-center mb-6">
          <svg className="h-16 w-16 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
            <circle cx="8.5" cy="9.5" r="1.5"/>
            <circle cx="15.5" cy="9.5" r="1.5"/>
            <path d="M12 16c-1.48 0-2.75-.81-3.45-2h6.9c-.7 1.19-1.97 2-3.45 2z"/>
            <path d="M12 7c-2.76 0-5 2.24-5 5h10c0-2.76-2.24-5-5-5z"/>
          </svg>
        </div>
        
        <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent mb-4">
          Found It For You
        </h1>
        
        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Search in public directory of multiple images for specific faces using AI Recognition! 
          First, provide a link from Google Drive or Microsoft OneDrive.
        </p>
      </div>
    </div>
  );
}
