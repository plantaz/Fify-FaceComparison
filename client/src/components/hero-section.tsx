
import { useLanguage } from "@/lib/language-context";
import { getTranslation } from "@shared/translations";

export default function HeroSection() {
  const { language } = useLanguage();

  return (
    <div className="py-12 text-center">
      <h1 className="text-4xl font-bold tracking-tight">
        {getTranslation("hero.title", language)}
      </h1>
      <p className="mt-4 text-lg text-muted-foreground">
        {getTranslation("hero.subtitle", language)}
      </p>
    </div>
  );
}
