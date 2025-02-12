import { useState } from "react";
import HeroSection from "@/components/hero-section";
import UrlForm from "@/components/url-form";
import FaceUpload from "@/components/face-upload";
import ResultsDisplay from "@/components/results-display";
import { type ScanJob } from "@shared/schema";

export default function Home() {
  const [scanJob, setScanJob] = useState<ScanJob | null>(null);
  const [analysisComplete, setAnalysisComplete] = useState(false);

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
          />
        )}

        {scanJob && analysisComplete && scanJob.results && (
          <ResultsDisplay results={scanJob.results as any[]} />
        )}
      </main>
    </div>
  );
}