import { Button } from "@/components/ui/button";
import { useLanguage } from "@/lib/language-context";
import ReactCountryFlag from "react-country-flag";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function LanguageSelector() {
  const { language, setLanguage } = useLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="w-9 px-0" aria-label="Select language">
          <ReactCountryFlag 
            countryCode={language === 'pt-BR' ? 'BR' : 'US'} 
            svg 
            style={{
              width: '1.5em',
              height: '1.5em'
            }}
            title={language === 'pt-BR' ? 'Brazilian Portuguese' : 'English'}
            alt={language === 'pt-BR' ? 'Brazilian flag' : 'United States flag'}
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => setLanguage("en")}
          className={language === "en" ? "bg-accent" : ""}
        >
          <span className="mr-2">🇺🇸</span> English
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => setLanguage("pt-BR")}
          className={language === "pt-BR" ? "bg-accent" : ""}
        >
          <span className="mr-2">🇧🇷</span> Português
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}