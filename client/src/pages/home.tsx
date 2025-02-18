import { useState } from "react";
import { useLanguage } from "@/lib/language-context";
import { getTranslation } from "@shared/translations";
import HeroSection from "@/components/hero-section";
import UrlForm from "@/components/url-form";
import FaceUpload from "@/components/face-upload";
import ResultsDisplay from "@/components/results-display";
import { type ScanJob } from "@shared/schema";

export default function Home() {
  const [scanJob, setScanJob] = useState<ScanJob | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const { language } = useLanguage();

  return (
    <div className="min-h-screen bg-background">
      <HeroSection />

      <main className="container mx-auto px-4 py-8">
        {!scanJob && (
          <UrlForm onScanComplete={setScanJob} />
        )}

        {scanJob && !analysisComplete && (
          <FaceUpload 
            jobId={scanJob.id} 
            imageCount={scanJob.imageCount}
            onAnalysisComplete={() => setAnalysisComplete(true)}
            setScanJob={setScanJob}
          />
        )}

        {scanJob && analysisComplete && (
          <ResultsDisplay 
            results={scanJob.results as Array<{
              imageId: number;
              similarity: number;
              matched: boolean;
              url: string;
              driveUrl: string;
            }>} 
          />
        )}
      </main>
    </div>
  );
}