import { useLanguage } from "@/lib/language-context";
import { getTranslation } from "@shared/translations";

export default function HeroSection() {
  const { language } = useLanguage();

  return (
    <div className="bg-gradient-to-b from-primary/10 to-background pt-16 sm:pt-20 pb-12 sm:pb-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="flex justify-center mb-6">
          <svg className="h-12 w-12 sm:h-16 sm:w-16 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
            <circle cx="8.5" cy="9.5" r="1.5"/>
            <circle cx="15.5" cy="9.5" r="1.5"/>
            <path d="M12 16c-1.48 0-2.75-.81-3.45-2h6.9c-.7 1.19-1.97 2-3.45 2z"/>
            <path d="M12 7c-2.76 0-5 2.24-5 5h10c0-2.76-2.24-5-5-5z"/>
          </svg>
        </div>

        <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent mb-4">
          Found It For You
        </h1>

        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          {getTranslation("hero.title", language)}
        </p>
        <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mt-2">
          {getTranslation("hero.subtitle", language)}
        </p>
      </div>
    </div>
  );
}